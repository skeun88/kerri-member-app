import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Alert, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import {
  getMyCreditInfo, unlockReport,
  REPORT_CREDIT_COST, CreditInfo,
} from '../../lib/reportCredits';
import { IS_BETA } from '../../lib/beta';
import { ReportSkeleton, FadeInView } from '../../components/Skeleton';
import { LessonComparison, toLines, formatDate } from '../../components/GrowthDashboard';

// ── Design tokens ──────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

// ── Interfaces ─────────────────────────────────────────────────

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
  sequence: number | null;
  coach_name: string | null;
}

// ── Section header with icon ───────────────────────────────────
function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHead}>
      <Ionicons name={icon as any} size={14} color={TERRA} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
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
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [pendingUnlockId, setPendingUnlockId] = useState<string | null>(null);
  const [memberIdForRt, setMemberIdForRt] = useState<string | null>(null);

  async function loadData() {
    const member = await getMyMemberRow();
    if (!member) { setLoading(false); return; }
    setMemberIdForRt(member.id);

    const [{ data: planData }, { data: allSentReports }, credit] = await Promise.all([
      supabase
        .from('member_lesson_plan_view')
        .select('id, member_id, created_at, summary, achievements, improvement_points, next_goals, court_type, session_goals, duration_minutes, lesson_comparison')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(30),
      // Fetch ALL sent reports oldest-first to compute stable sequence numbers
      supabase
        .from('member_lesson_reports')
        .select('id, lesson_plan_id, is_read, credit_unlocked, coach_id, created_at')
        .eq('member_id', member.id)
        .eq('sent_to_member', true)
        .order('created_at', { ascending: true }),
      getMyCreditInfo(),
    ]);

    setCreditInfo(credit);

    if (!planData || planData.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    // Build report map: lesson_plan_id → {seq, coachId, ...}
    type SentInfo = { seq: number; coachId: string | null; reportId: string; isRead: boolean; creditUnlocked: boolean };
    const sentMap = new Map<string, SentInfo>();
    (allSentReports ?? []).forEach((r: any, idx: number) => {
      if (r.lesson_plan_id) {
        sentMap.set(r.lesson_plan_id, {
          seq: idx + 1,
          coachId: r.coach_id ?? null,
          reportId: r.id,
          isRead: r.is_read ?? false,
          creditUnlocked: r.credit_unlocked ?? false,
        });
      }
    });

    // Fetch coach display names for all unique coach_ids in one query
    const coachIds = [...new Set((allSentReports ?? []).map((r: any) => r.coach_id).filter(Boolean))] as string[];
    const coachNameMap = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coachData } = await supabase
        .from('coach_profiles')
        .select('coach_id, display_name')
        .in('coach_id', coachIds);
      (coachData ?? []).forEach((c: any) => {
        if (c.coach_id && c.display_name) coachNameMap.set(c.coach_id, c.display_name);
      });
    }
    // Keep current-coach name for fallback header display
    setCoachName(coachIds.length > 0 ? (coachNameMap.get(coachIds[coachIds.length - 1]) ?? null) : null);

    const merged: CoachReport[] = planData
      .filter((plan: any) => sentMap.has(plan.id))
      .map((plan: any) => {
        const info = sentMap.get(plan.id)!;
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
          report_id: info.reportId,
          is_read: info.isRead,
          credit_unlocked: info.creditUnlocked,
          sequence: info.seq,
          coach_name: info.coachId ? (coachNameMap.get(info.coachId) ?? null) : null,
        };
      });

    setReports(merged);
    setLoading(false);
  }

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

  function toggleSummary(planId: string) {
    setExpandedSummaries(prev => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
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
    <FadeInView>
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
        contentContainerStyle={styles.scrollContent}
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
            <Text style={styles.emptySub}>코치가 레슨을 분석하면{'\n'}여기에 기록이 자동으로 도착해요</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => {
              const isUnlocked = IS_BETA || report.credit_unlocked;
              const isExpanded = expandedId === report.plan_id;
              const isSummaryExpanded = expandedSummaries.has(report.plan_id);
              const achievements = report.achievements ?? [];
              const improvements = toLines(report.improvement_points_raw);
              const nextGoals = toLines(report.next_goals_raw);
              const cardTitle = report.session_goals || formatDate(report.created_at);

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
                      {/* Title + NEW badge */}
                      <View style={styles.metaRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{cardTitle}</Text>
                        {!report.is_read && isUnlocked && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                          </View>
                        )}
                      </View>

                      {/* Date · 순번 · 코치명 */}
                      <Text style={styles.cardMeta} numberOfLines={2}>
                        <Text style={styles.cardMetaMuted}>{formatDate(report.created_at)}</Text>
                        {report.sequence != null && (
                          <Text>
                            <Text style={styles.cardMetaMuted}> · </Text>
                            <Text style={styles.cardMetaTerra}>{report.sequence}번째 기록</Text>
                          </Text>
                        )}
                        {report.coach_name ? (
                          <Text style={styles.cardMetaMuted}> · {report.coach_name} 코치</Text>
                        ) : null}
                      </Text>

                      {/* Divider + preview (collapsed only) */}
                      {!isExpanded && (
                        <>
                          <View style={styles.cardMetaDivider} />
                          <Text style={styles.cardPreview} numberOfLines={2}>
                            {isUnlocked
                              ? (report.summary || '')
                              : '레슨 기록을 열어보려면 탭하세요'}
                          </Text>
                        </>
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
                      {(() => {
                        const secs: Array<{ key: string; node: React.ReactNode }> = [];

                        if (!!report.summary) {
                          secs.push({ key: 'summary', node: (
                            <View style={styles.section}>
                              <SectionHead icon="document-text-outline" title="오늘 레슨 요약" />
                              <Text
                                style={styles.bodyText}
                                numberOfLines={isSummaryExpanded ? undefined : 4}
                              >
                                {report.summary}
                              </Text>
                              <TouchableOpacity
                                style={styles.expandBtn}
                                onPress={(e) => { e.stopPropagation?.(); toggleSummary(report.plan_id); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={styles.expandBtnText}>
                                  {isSummaryExpanded ? '접기' : '전체 내용 보기'}
                                </Text>
                                <Ionicons
                                  name={isSummaryExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={12} color={TERRA}
                                />
                              </TouchableOpacity>
                            </View>
                          ) });
                        }

                        if (report.lesson_comparison && report.lesson_comparison.length > 0) {
                          secs.push({ key: 'comparison', node: (
                            <View style={styles.section}>
                              <SectionHead icon="trending-up-outline" title="이전 레슨 대비 변화" />
                              {report.lesson_comparison.slice(0, 3).map((c, i) => {
                                const isImproved = c.status === 'improved';
                                const isNeedsWork = c.status === 'needs_work' || c.status === 'regressed';
                                const badgeLabel = isImproved ? '향상' : isNeedsWork ? '보완 필요' : '유지';
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
                          ) });
                        }

                        if (achievements.length > 0) {
                          secs.push({ key: 'achievements', node: (
                            <View style={styles.section}>
                              <SectionHead icon="checkmark-circle-outline" title="오늘 잘한 점" />
                              {achievements.map((item, i) => (
                                <View key={i} style={styles.listRow}>
                                  <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                                  <Text style={styles.listText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          ) });
                        }

                        if (improvements.length > 0) {
                          secs.push({ key: 'improvements', node: (
                            <View style={styles.section}>
                              <SectionHead icon="construct-outline" title="교정 포인트" />
                              {improvements.map((item, i) => (
                                <View key={i} style={styles.listRow}>
                                  <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                                  <Text style={styles.listText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          ) });
                        }

                        return (
                          <>
                            {secs.map(({ key, node }, i) => (
                              <React.Fragment key={key}>
                                {i > 0 && <View style={styles.sectionDivider} />}
                                {node}
                              </React.Fragment>
                            ))}
                            {nextGoals.length > 0 && (
                              <View style={[styles.goalSection, secs.length > 0 && { marginTop: 20 }]}>
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
                          </>
                        );
                      })()}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
    </FadeInView>
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

  scrollContent: { paddingBottom: 100 },

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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY, flex: 1 },
  cardMeta: { fontSize: 12, marginBottom: 0, flexWrap: 'wrap' },
  cardMetaMuted: { fontSize: 12, color: TEXT_MUTED },
  cardMetaTerra: { fontSize: 12, color: TERRA, fontWeight: '600' },
  cardMetaDivider: { height: 1, backgroundColor: '#E9ECF1', marginTop: 12, marginBottom: 12 },
  newBadge: { backgroundColor: GOAL_BG, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: TERRA },
  cardPreview: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },

  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GOAL_BG, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  lockBadgeText: { fontSize: 12, fontWeight: '700', color: TERRA },

  detail: { marginTop: 4 },
  divider: { height: 1, backgroundColor: DIVIDER, marginVertical: 16 },
  sectionDivider: { height: 1, backgroundColor: '#E9ECF1', marginVertical: 24 },

  section: { marginBottom: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: TERRA, letterSpacing: 0.3 },
  bodyText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24 },

  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  expandBtnText: { fontSize: 13, color: TERRA, fontWeight: '600' },

  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  listNum: { fontSize: 12, fontWeight: '700', color: TERRA, width: 20, marginTop: 4 },
  listText: { fontSize: 15, color: TEXT_PRIMARY, lineHeight: 24, flex: 1 },

  goalSection: {
    backgroundColor: GOAL_BG, borderRadius: 16,
    padding: 16, marginBottom: 4,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  goalTitle: { fontSize: 13, fontWeight: '700', color: TERRA, letterSpacing: 0.3 },
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
