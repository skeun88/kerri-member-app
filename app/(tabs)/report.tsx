import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Alert, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import {
  getMyCreditInfo, unlockReport,
  REPORT_CREDIT_COST, CreditInfo,
} from '../../lib/reportCredits';
import { IS_BETA } from '../../lib/beta';
import { ReportSkeleton } from '../../components/Skeleton';

// ── Design tokens ──────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

const BRONZE_COLOR = '#CD7F32';
const SILVER_COLOR = '#A0A0A0';
const GOLD_COLOR = '#C0755A';

// ── Grade system ───────────────────────────────────────────────
type GradeLevel = 'bronze' | 'silver' | 'gold';

const GRADE_CONFIG = {
  bronze: { label: '브론즈', emoji: '🥉', color: BRONZE_COLOR, min: 0, max: 99 },
  silver: { label: '실버', emoji: '🥈', color: SILVER_COLOR, min: 100, max: 199 },
  gold:   { label: '골드', emoji: '🥇', color: GOLD_COLOR, min: 200, max: 300 },
};

function getGrade(total: number): GradeLevel {
  if (total >= 200) return 'gold';
  if (total >= 100) return 'silver';
  return 'bronze';
}

function getPointsToNextGrade(total: number): number | null {
  if (total >= 200) return null;
  if (total >= 100) return 200 - total;
  return 100 - total;
}

function getGradeProgress(total: number): number {
  if (total >= 200) return 1;
  if (total >= 100) return (total - 100) / 100;
  return total / 100;
}

// ── Score calculation ──────────────────────────────────────────
type ChangeStatus = 'improved' | 'maintained' | 'same' | 'needs_work' | 'regressed' | null;

function deriveChangeStatus(
  comparison: LessonComparison[] | null
): ChangeStatus {
  if (!comparison || comparison.length === 0) return null;
  if (comparison.some(c => c.status === 'improved')) return 'improved';
  if (comparison.some(c => c.status === 'same')) return 'same';
  if (comparison.some(c => c.status === 'needs_work')) return 'needs_work';
  if (comparison.some(c => c.status === 'regressed')) return 'regressed';
  return null;
}

function calculateScore(status: ChangeStatus, hasRecord: boolean): number {
  if (!hasRecord) return 0;
  switch (status) {
    case 'improved':   return 5;
    case 'maintained':
    case 'same':       return 3;
    case 'needs_work': return 2;
    case 'regressed':  return 1;
    default:           return 1;
  }
}

function getStatusMessage(status: ChangeStatus): string {
  switch (status) {
    case 'improved':   return '이전보다 실력이 향상됐어요 ↑';
    case 'maintained':
    case 'same':       return '꾸준히 유지하고 있어요 →';
    case 'needs_work': return '집중 연습이 필요한 부분이 있어요';
    case 'regressed':  return '이번엔 조금 어려웠어요, 다음 레슨에서 도전해요';
    default:           return '레슨 기록을 쌓고 있어요';
  }
}

function getStatusBadge(status: ChangeStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '향상', bg: '#ECFDF5', text: '#059669' };
    case 'maintained':
    case 'same':       return { label: '유지', bg: '#F4F6F9', text: TEXT_MUTED };
    case 'needs_work': return { label: '집중 연습', bg: GOAL_BG, text: TERRA };
    case 'regressed':  return { label: '재도전', bg: '#FFF3F0', text: '#E05C3A' };
    default:           return { label: '기록중', bg: BG, text: TEXT_MUTED };
  }
}

// ── Interfaces ─────────────────────────────────────────────────
interface LessonComparison {
  point: string;
  status: 'improved' | 'same' | 'regressed' | 'needs_work';
  reason?: string;
}

interface CoachReport {
  plan_id: string;
  member_id: string;
  created_at: string;
  summary: string;
  achievements: string[];
  improvement_points_raw: string[] | string | null;
  next_goals_raw: string[] | string | null;
  lesson_comparison: LessonComparison[] | null;
  court_type: string | null;
  session_goals: string | null;
  duration_minutes: number | null;
  report_id: string | null;
  is_read: boolean;
  credit_unlocked: boolean;
}

// ── Helpers ────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

function toLines(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

// ── Charge modal ───────────────────────────────────────────────
function ChargeModal({
  visible, creditInfo, onClose,
}: { visible: boolean; creditInfo: CreditInfo; onClose: () => void }) {
  const router = useRouter();
  const handleCharge = () => {
    onClose();
    router.push({ pathname: '/credit-charge' });
  };
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={cs.overlay}>
        <View style={cs.sheet}>
          <View style={cs.handle} />
          <View style={cs.balanceRow}>
            <Text style={cs.balanceLabel}>현재 잔액</Text>
            <Text style={cs.balanceAmount}>{creditInfo.balance.toLocaleString()}원</Text>
          </View>
          <Text style={cs.sheetTitle}>크레딧 충전</Text>
          <Text style={cs.sheetSub}>리포트 1건당 {REPORT_CREDIT_COST.toLocaleString()}원</Text>
          <TouchableOpacity style={cs.chargeBtn} onPress={handleCharge}>
            <Ionicons name="bag-handle-outline" size={20} color="#fff" />
            <Text style={cs.chargeBtnText}>인앱결제로 충전하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.cancelBtn} onPress={onClose}>
            <Text style={cs.cancelBtnText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Grade card ─────────────────────────────────────────────────
function GradeCard({ totalScore }: { totalScore: number }) {
  const grade = getGrade(totalScore);
  const cfg = GRADE_CONFIG[grade];
  const toNext = getPointsToNextGrade(totalScore);
  const progress = getGradeProgress(totalScore);
  const nextGrade = grade === 'bronze' ? '실버' : grade === 'silver' ? '골드' : null;

  return (
    <View style={gs.card}>
      <View style={gs.topRow}>
        <View style={gs.gradeLeft}>
          <Text style={gs.gradeEmoji}>{cfg.emoji}</Text>
          <View>
            <Text style={[gs.gradeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={gs.totalScore}>총 {totalScore}점</Text>
          </View>
        </View>
        {toNext === null ? (
          <View style={gs.maxBadge}>
            <Text style={gs.maxBadgeText}>최고 등급 🏆</Text>
          </View>
        ) : (
          <Text style={gs.toNextText}>다음 등급까지 {toNext}점</Text>
        )}
      </View>

      <View style={gs.progressBg}>
        <View style={[gs.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: cfg.color }]} />
      </View>

      {toNext !== null && nextGrade && (
        <Text style={gs.nextGradeHint}>{nextGrade}까지 {toNext}점 남았어요</Text>
      )}
    </View>
  );
}

// ── Growth chart (SVG) ─────────────────────────────────────────
function GrowthChart({ cumulativeScores }: { cumulativeScores: number[] }) {
  const CHART_W = 300;
  const CHART_H = 100;
  const PAD_L = 32;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 20;
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;

  const maxScore = Math.max(300, ...cumulativeScores);
  const n = cumulativeScores.length;

  const toX = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const toY = (v: number) => PAD_T + innerH - (v / maxScore) * innerH;

  const points = cumulativeScores.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  const yLabels = [0, Math.round(maxScore / 2), maxScore];

  return (
    <View style={chart.wrap}>
      <Svg width={CHART_W} height={CHART_H}>
        {yLabels.map(v => (
          <Line
            key={v}
            x1={PAD_L} y1={toY(v)}
            x2={CHART_W - PAD_R} y2={toY(v)}
            stroke={DIVIDER} strokeWidth={1}
          />
        ))}
        {yLabels.map(v => (
          <SvgText
            key={`l${v}`}
            x={PAD_L - 4}
            y={toY(v) + 4}
            textAnchor="end"
            fontSize={9}
            fill={TEXT_MUTED}
          >{v}</SvgText>
        ))}
        <Polyline
          points={points}
          fill="none"
          stroke={TERRA}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {cumulativeScores.map((v, i) => (
          <Circle key={i} cx={toX(i)} cy={toY(v)} r={3} fill={TERRA} />
        ))}
      </Svg>
      <Text style={chart.xLabel}>레슨 회차</Text>
    </View>
  );
}

function GrowthChartCard({ reports }: { reports: CoachReport[] }) {
  const unlockedReports = [...reports].reverse();
  const cumulativeScores: number[] = [];
  let running = 0;
  for (const r of unlockedReports) {
    const status = deriveChangeStatus(r.lesson_comparison);
    const score = calculateScore(status, true);
    running += score;
    cumulativeScores.push(running);
  }

  return (
    <View style={gs.card}>
      <Text style={gs.chartTitle}>성장 그래프</Text>
      {cumulativeScores.length < 2 ? (
        <Text style={gs.chartEmpty}>레슨을 더 진행하면 성장 그래프가 나타나요</Text>
      ) : (
        <GrowthChart cumulativeScores={cumulativeScores} />
      )}
    </View>
  );
}

// ── Insights card ──────────────────────────────────────────────
function InsightsCard({ reports }: { reports: CoachReport[] }) {
  const latest = reports[0];
  if (!latest) return null;

  const status = deriveChangeStatus(latest.lesson_comparison);
  const badge = getStatusBadge(status);
  const nextGoals = toLines(latest.next_goals_raw);

  return (
    <View style={[gs.card, { backgroundColor: GOAL_BG }]}>
      <Text style={gs.insightTitle}>핵심 인사이트</Text>

      <View style={gs.insightSection}>
        <Text style={gs.insightLabel}>이전 대비 변화</Text>
        <View style={gs.insightRow}>
          <Text style={gs.insightMsg}>{getStatusMessage(status)}</Text>
          <View style={[gs.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[gs.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
      </View>

      {nextGoals.length > 0 && (
        <View style={gs.insightSection}>
          <Text style={gs.insightLabel}>다음 레슨 포인트</Text>
          <Text style={gs.insightGoal}>{nextGoals[0]}</Text>
        </View>
      )}
    </View>
  );
}

// ── Growth changes preview ─────────────────────────────────────
interface FlatChangeItem {
  date: string;
  point: string;
  status: 'improved' | 'same' | 'needs_work' | 'regressed';
  reason?: string;
}

function getChangeBadge(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '좋아졌어요',        bg: '#E8F5E9', text: '#2E7D32' };
    case 'maintained':
    case 'same':       return { label: '잘 유지하고 있어요', bg: '#E3F2FD', text: '#1565C0' };
    case 'needs_work': return { label: '연습이 필요해요',    bg: '#FFF3E0', text: '#E65100' };
    case 'regressed':  return { label: '다시 점검해요',      bg: '#FFEBEE', text: '#C62828' };
    default:           return { label: '기록중',             bg: BG,        text: TEXT_MUTED };
  }
}

function GrowthChangesPreview({ reports }: { reports: CoachReport[] }) {
  const router = useRouter();

  const items: FlatChangeItem[] = [];
  for (const r of reports) {
    if (!r.lesson_comparison || r.lesson_comparison.length === 0) continue;
    for (const c of r.lesson_comparison) {
      items.push({ date: r.created_at, point: c.point, status: c.status, reason: c.reason });
      if (items.length >= 2) break;
    }
    if (items.length >= 2) break;
  }

  if (items.length === 0) return null;

  return (
    <View style={pv.card}>
      <View style={pv.headerRow}>
        <Text style={pv.title}>이전 대비 변화</Text>
        <TouchableOpacity onPress={() => router.push('/growth-changes' as never)}>
          <Text style={pv.linkText}>전체 변화 기록 보기 →</Text>
        </TouchableOpacity>
      </View>
      {items.map((item, i) => {
        const badge = getChangeBadge(item.status);
        return (
          <View key={i} style={[pv.item, i < items.length - 1 && pv.itemBorder]}>
            <Text style={pv.itemDate}>{formatDate(item.date)}</Text>
            <View style={pv.itemRow}>
              <Text style={pv.itemPoint} numberOfLines={2}>{item.point}</Text>
              <View style={[pv.badge, { backgroundColor: badge.bg }]}>
                <Text style={[pv.badgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>
            {!!item.reason && (
              <Text style={pv.itemReason} numberOfLines={2}>{item.reason}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function ReportScreen() {
  const router = useRouter();
  const { charged } = useLocalSearchParams<{ charged?: string }>();
  const [reports, setReports] = useState<CoachReport[]>([]);
  const [creditInfo, setCreditInfo] = useState<CreditInfo>({
    balance: 0, total_charged: 0, total_used: 0, free_report_used: false,
  });
  const [coachName, setCoachName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [pendingUnlockId, setPendingUnlockId] = useState<string | null>(null);
  const [memberIdForRt, setMemberIdForRt] = useState<string | null>(null);

  async function loadData() {
    const member = await getMyMemberRow();
    if (!member) { setLoading(false); return; }
    setMemberIdForRt(member.id);

    const [{ data: planData }, coachRes] = await Promise.all([
      supabase
        .from('member_lesson_plan_view')
        .select('id, member_id, created_at, summary, achievements, improvement_points, next_goals, court_type, session_goals, duration_minutes, lesson_comparison')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('coach_profiles')
        .select('display_name')
        .eq('coach_id', member.coach_id)
        .maybeSingle(),
    ]);

    setCoachName(coachRes.data?.display_name ?? null);

    if (!planData || planData.length === 0) {
      setReports([]);
      const credit = await getMyCreditInfo();
      setCreditInfo(credit);
      setLoading(false);
      return;
    }

    const planIds = planData.map(p => p.id);

    const [{ data: reportData }, credit] = await Promise.all([
      supabase
        .from('member_lesson_reports')
        .select('id, lesson_plan_id, is_read, credit_unlocked, sent_to_member')
        .in('lesson_plan_id', planIds)
        .eq('sent_to_member', true),
      getMyCreditInfo(),
    ]);

    const reportMap = new Map(
      (reportData ?? []).map(r => [r.lesson_plan_id, r])
    );

    const merged: CoachReport[] = planData
      .filter(plan => reportMap.has(plan.id))
      .map(plan => {
        const report = reportMap.get(plan.id);
        return {
          plan_id: plan.id,
          member_id: plan.member_id,
          created_at: plan.created_at,
          summary: plan.summary,
          achievements: plan.achievements ?? [],
          improvement_points_raw: plan.improvement_points ?? null,
          next_goals_raw: plan.next_goals ?? null,
          court_type: plan.court_type ?? null,
          session_goals: plan.session_goals ?? null,
          duration_minutes: plan.duration_minutes ?? null,
          lesson_comparison: Array.isArray(plan.lesson_comparison) ? plan.lesson_comparison : null,
          report_id: report?.id ?? null,
          is_read: report?.is_read ?? false,
          credit_unlocked: report?.credit_unlocked ?? false,
        };
      });

    setReports(merged);
    setCreditInfo(credit);
    setLoading(false);
  }

  const totalScore = reports.reduce((sum, r) => {
    const status = deriveChangeStatus(r.lesson_comparison);
    return sum + calculateScore(status, true);
  }, 0);

  async function markRead(reportId: string) {
    await supabase.from('member_lesson_reports').update({ is_read: true }).eq('id', reportId);
    setReports(prev => prev.map(r => r.report_id === reportId ? { ...r, is_read: true } : r));
  }

  async function handleOpen(report: CoachReport) {
    if (IS_BETA || report.credit_unlocked) {
      setExpandedId(prev => prev === report.plan_id ? null : report.plan_id);
      if (!report.is_read && report.report_id) markRead(report.report_id);
      return;
    }

    if (!report.report_id) {
      Alert.alert('오류', '리포트 정보를 불러올 수 없습니다.');
      return;
    }

    setUnlockingId(report.plan_id);
    const result = await unlockReport(report.report_id);
    setUnlockingId(null);

    if (result.success) {
      const credit = await getMyCreditInfo();
      setCreditInfo(credit);
      setReports(prev => prev.map(r =>
        r.plan_id === report.plan_id ? { ...r, credit_unlocked: true, is_read: true } : r
      ));
      setExpandedId(report.plan_id);
    } else if (result.reason === 'insufficient_credit') {
      setPendingUnlockId(report.plan_id);
      setShowChargeModal(true);
    } else {
      Alert.alert('오류', result.error || '리포트를 열 수 없습니다.');
    }
  }

  useEffect(() => {
    if (!charged) return;
    const newBalance = parseInt(charged, 10);
    setCreditInfo(prev => ({ ...prev, balance: newBalance }));
    if (pendingUnlockId) {
      const targetId = pendingUnlockId;
      setPendingUnlockId(null);
      (async () => {
        const target = reports.find(r => r.plan_id === targetId);
        if (!target?.report_id) return;
        setUnlockingId(targetId);
        const result = await unlockReport(target.report_id);
        setUnlockingId(null);
        if (result.success) {
          const credit = await getMyCreditInfo();
          setCreditInfo(credit);
          setReports(prev => prev.map(r =>
            r.plan_id === targetId ? { ...r, credit_unlocked: true, is_read: true } : r
          ));
          setExpandedId(targetId);
        }
      })();
    }
  }, [charged]);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  useEffect(() => {
    if (!memberIdForRt) return;
    const ch = supabase.channel('report_rt_' + memberIdForRt)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'member_lesson_reports',
        filter: `member_id=eq.${memberIdForRt}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [memberIdForRt]);

  if (loading) return <ReportSkeleton />;

  return (
    <View style={styles.container}>
      <ChargeModal
        visible={showChargeModal && !IS_BETA}
        creditInfo={creditInfo}
        onClose={() => { setShowChargeModal(false); setPendingUnlockId(null); }}
      />

      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>레슨 기록</Text>
            <Text style={styles.headerSub}>코치와 함께 쌓아가는 나의 변화</Text>
          </View>
          {!IS_BETA && (
            <TouchableOpacity style={styles.creditChip} onPress={() => setShowChargeModal(true)}>
              <Ionicons name="wallet-outline" size={14} color={TERRA} />
              <Text style={styles.creditChipText}>{creditInfo.balance.toLocaleString()}원</Text>
              <Ionicons name="add" size={14} color={TERRA} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {!creditInfo.free_report_used && reports.length > 0 && (
        <View style={styles.freeBanner}>
          <Ionicons name="gift-outline" size={15} color={TERRA} />
          <Text style={styles.freeBannerText}>
            첫 레슨 기록 <Text style={{ fontWeight: '700' }}>무료 체험</Text> — 지금 바로 열어보세요!
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
            tintColor={TERRA}
          />
        }
      >
        {reports.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={52} color={DIVIDER} />
            <Text style={styles.emptyTitle}>아직 공유된 레슨 기록이 없어요</Text>
            <Text style={styles.emptySub}>코치가 레슨을 분석하면{'\n'}여기에 기록이 자동으로 도착해요 🎾</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {/* ① 등급 카드 */}
            <GradeCard totalScore={totalScore} />

            {/* ② 성장 그래프 */}
            <GrowthChartCard reports={reports} />

            {/* ③ 이전 대비 변화 미리보기 */}
            <GrowthChangesPreview reports={reports} />

            {/* ④ 핵심 인사이트 */}
            <InsightsCard reports={reports} />

            {/* ④ 레슨 기록 목록 */}
            {reports.map((report) => {
              const isUnlocked = IS_BETA || report.credit_unlocked;
              const isExpanded = expandedId === report.plan_id;
              const achievements = report.achievements ?? [];
              const improvements = toLines(report.improvement_points_raw);
              const nextGoals = toLines(report.next_goals_raw);

              return (
                <TouchableOpacity
                  key={report.plan_id}
                  style={[
                    styles.card,
                    !report.is_read && isUnlocked && styles.cardUnread,
                  ]}
                  onPress={() => handleOpen(report)}
                  activeOpacity={0.85}
                  disabled={unlockingId === report.plan_id}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.metaRow}>
                        <Text style={styles.cardDate}>{formatDate(report.created_at)}</Text>
                        {!report.is_read && isUnlocked && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                          </View>
                        )}
                      </View>

                      {coachName && (
                        <Text style={styles.coachName}>{coachName} 코치</Text>
                      )}

                      {report.session_goals ? (
                        <View style={styles.topicChip}>
                          <Text style={styles.topicChipText} numberOfLines={1}>{report.session_goals}</Text>
                        </View>
                      ) : null}

                      {!isExpanded && (
                        <Text style={styles.cardPreview} numberOfLines={2}>
                          {isUnlocked
                            ? (report.summary || '')
                            : '레슨 기록을 열어보려면 탭하세요'}
                        </Text>
                      )}
                    </View>

                    {unlockingId === report.plan_id ? (
                      <ActivityIndicator size="small" color={TERRA} />
                    ) : isUnlocked ? (
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20} color={TEXT_MUTED}
                      />
                    ) : (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={13} color={TERRA} />
                        <Text style={styles.lockBadgeText}>
                          {creditInfo.free_report_used ? `${REPORT_CREDIT_COST.toLocaleString()}원` : '무료'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isExpanded && isUnlocked && (
                    <View style={styles.detail}>
                      <View style={styles.divider} />

                      {!!report.summary && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>오늘 레슨 요약</Text>
                          <Text style={styles.bodyText}>{report.summary}</Text>
                        </View>
                      )}

                      {report.lesson_comparison && report.lesson_comparison.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>이전 레슨 대비 변화</Text>
                          {report.lesson_comparison.slice(0, 3).map((c, i) => {
                            const isImproved = c.status === 'improved';
                            const isNeedsWork = c.status === 'needs_work' || c.status === 'regressed';
                            const badgeLabel = isImproved ? '좋아졌어요' : isNeedsWork ? '더 연습해요' : '유지';
                            return (
                              <View key={i} style={[styles.compRow, i < report.lesson_comparison!.length - 1 && styles.compRowBorder]}>
                                <View style={styles.compTopRow}>
                                  <Text style={styles.compPoint}>{c.point}</Text>
                                  <View style={[styles.compBadge, isImproved ? styles.compBadgeImproved : isNeedsWork ? styles.compBadgeNeeds : styles.compBadgeNeutral]}>
                                    <Text style={[styles.compBadgeText, isImproved ? styles.compBadgeTextImproved : isNeedsWork ? styles.compBadgeTextNeeds : styles.compBadgeTextNeutral]}>{badgeLabel}</Text>
                                  </View>
                                </View>
                                {!!c.reason && <Text style={styles.compReason}>{c.reason}</Text>}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {achievements.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>오늘 잘한 점</Text>
                          {achievements.map((item, i) => (
                            <View key={i} style={styles.listRow}>
                              <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                              <Text style={styles.listText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {improvements.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>교정 포인트</Text>
                          {improvements.map((item, i) => (
                            <View key={i} style={styles.listRow}>
                              <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                              <Text style={styles.listText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {nextGoals.length > 0 && (
                        <View style={styles.goalSection}>
                          <View style={styles.goalHeader}>
                            <Ionicons name="locate-outline" size={14} color={TERRA} />
                            <Text style={styles.goalTitle}>다음 레슨 목표</Text>
                          </View>
                          {nextGoals.map((item, i) => (
                            <View key={i} style={styles.listRow}>
                              <Text style={[styles.listNum, { color: TERRA }]}>{String(i + 1).padStart(2, '0')}</Text>
                              <Text style={styles.goalText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const cs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44 },
  handle: { width: 44, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: GOAL_BG, borderRadius: 14, padding: 16, marginBottom: 24 },
  balanceLabel: { fontSize: 15, color: TEXT_MUTED, fontWeight: '600' },
  balanceAmount: { fontSize: 24, fontWeight: '800', color: TERRA },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 6 },
  sheetSub: { fontSize: 15, color: TEXT_MUTED, marginBottom: 24 },
  chargeBtn: { backgroundColor: TERRA, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chargeBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', padding: 14 },
  cancelBtnText: { color: TEXT_MUTED, fontSize: 16 },
});

const gs = StyleSheet.create({
  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    marginBottom: 0,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  gradeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gradeEmoji: { fontSize: 28 },
  gradeLabel: { fontSize: 16, fontWeight: '800' },
  totalScore: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  toNextText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  maxBadge: { backgroundColor: GOAL_BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  maxBadgeText: { fontSize: 13, fontWeight: '700', color: TERRA },
  progressBg: { height: 8, backgroundColor: DIVIDER, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  nextGradeHint: { fontSize: 12, color: TEXT_MUTED },

  chartTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 12 },
  chartEmpty: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', paddingVertical: 20 },

  insightTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 12 },
  insightSection: { marginBottom: 12 },
  insightLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  insightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  insightMsg: { fontSize: 14, color: TEXT_PRIMARY, flex: 1, lineHeight: 20 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  insightGoal: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 20 },
});

const chart = StyleSheet.create({
  wrap: { alignItems: 'center' },
  xLabel: { fontSize: 10, color: TEXT_MUTED, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  headerSafe: { backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 3 },
  creditChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: CARD_WHITE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: DIVIDER,
  },
  creditChipText: { fontSize: 13, fontWeight: '700', color: TERRA },

  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GOAL_BG, paddingHorizontal: 20, paddingVertical: 10,
    marginBottom: 4,
  },
  freeBannerText: { fontSize: 13, color: TERRA },

  emptyBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  emptySub: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },

  list: { padding: 20, gap: 12 },

  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: TERRA },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardDate: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  newBadge: { backgroundColor: GOAL_BG, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: TERRA },
  coachName: { fontSize: 13, color: TEXT_MUTED, marginBottom: 6 },
  topicChip: {
    alignSelf: 'flex-start', backgroundColor: BG, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
    borderWidth: 1, borderColor: DIVIDER,
  },
  topicChipText: { fontSize: 12, color: TEXT_MUTED },
  cardPreview: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20, marginTop: 2 },

  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GOAL_BG, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  lockBadgeText: { fontSize: 12, fontWeight: '700', color: TERRA },

  detail: { marginTop: 4 },
  divider: { height: 1, backgroundColor: DIVIDER, marginVertical: 16 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  bodyText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24 },

  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  listNum: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, width: 20, marginTop: 4 },
  listText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24, flex: 1 },

  goalSection: {
    backgroundColor: GOAL_BG, borderRadius: 16,
    padding: 16, marginBottom: 4,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  goalTitle: { fontSize: 13, fontWeight: '700', color: TERRA, textTransform: 'uppercase', letterSpacing: 0.5 },
  goalText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24, flex: 1 },

  compRow: { paddingVertical: 10 },
  compRowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  compTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  compPoint: { fontSize: 14, color: TEXT_PRIMARY, fontWeight: '600', flex: 1, lineHeight: 20 },
  compBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  compBadgeImproved: { backgroundColor: '#ECFDF5' },
  compBadgeNeeds: { backgroundColor: GOAL_BG },
  compBadgeNeutral: { backgroundColor: '#F4F6F9' },
  compBadgeText: { fontSize: 11, fontWeight: '700' },
  compBadgeTextImproved: { color: '#059669' },
  compBadgeTextNeeds: { color: TERRA },
  compBadgeTextNeutral: { color: TEXT_MUTED },
  compReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, marginTop: 4 },
});

const pv = StyleSheet.create({
  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  linkText: { fontSize: 13, color: TERRA, fontWeight: '600' },
  item: { paddingVertical: 10 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  itemDate: { fontSize: 12, color: TEXT_MUTED, marginBottom: 6 },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8,
  },
  itemPoint: {
    fontSize: 14, color: TEXT_PRIMARY, fontWeight: '600',
    flex: 1, lineHeight: 20,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  itemReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, marginTop: 4 },
});
