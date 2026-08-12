import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors } from '../../lib/theme';
import {
  getMyCreditInfo, unlockReport,
  CHARGE_OPTIONS, REPORT_CREDIT_COST, CreditInfo,
} from '../../lib/reportCredits';
import { IS_BETA } from '../../lib/beta';

// DrillSuggestion shape from lesson_plans (Sonnet 생성)
interface DrillSuggestion {
  name: string;
  purpose?: string;
  method?: string;
  reps?: string;
  court_adaptation?: string;
}

interface CoachReport {
  // lesson_plans (via member_lesson_plan_view)
  plan_id: string;
  member_id: string;
  created_at: string;
  summary: string;
  improvement_points_raw: string | null;
  next_goals_raw: string | null;
  court_type: string | null;
  session_goals: string | null;
  drill_suggestions: DrillSuggestion[] | null;
  duration_minutes: number | null;
  // member_lesson_reports (credit system)
  report_id: string | null;
  is_read: boolean;
  credit_unlocked: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

function toLines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

/** 크레딧 충전 바텀시트 */
function ChargeModal({
  visible, creditInfo, onClose,
}: { visible: boolean; creditInfo: CreditInfo; onClose: () => void }) {
  const router = useRouter();
  const [selectedAmount, setSelectedAmount] = useState(10000);
  const handleCharge = () => {
    onClose();
    router.push({ pathname: '/credit-charge', params: { amount: String(selectedAmount) } });
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
          <View style={cs.optionList}>
            {CHARGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.amount}
                style={[cs.optionCard, selectedAmount === opt.amount && cs.optionSelected]}
                onPress={() => setSelectedAmount(opt.amount)}
              >
                <Text style={[cs.optionAmount, selectedAmount === opt.amount && cs.optionAmountSelected]}>
                  {opt.label}
                </Text>
                <Text style={cs.optionDesc}>{opt.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={cs.chargeBtn} onPress={handleCharge}>
            <Ionicons name="card-outline" size={20} color="#fff" />
            <Text style={cs.chargeBtnText}>카드로 {selectedAmount.toLocaleString()}원 충전하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.cancelBtn} onPress={onClose}>
            <Text style={cs.cancelBtnText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ReportScreen() {
  const router = useRouter();
  const { charged } = useLocalSearchParams<{ charged?: string }>();
  const [reports, setReports] = useState<CoachReport[]>([]);
  const [creditInfo, setCreditInfo] = useState<CreditInfo>({
    balance: 0, total_charged: 0, total_used: 0, free_report_used: false,
  });
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

    // 코치용 lesson_plans 조회 (뷰 경유, status='completed' + 안전 컬럼만)
    const { data: planData } = await supabase
      .from('member_lesson_plan_view')
      .select('id, member_id, created_at, summary, improvement_points, next_goals, court_type, session_goals, drill_suggestions, duration_minutes')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!planData || planData.length === 0) {
      setReports([]);
      const credit = await getMyCreditInfo();
      setCreditInfo(credit);
      setLoading(false);
      return;
    }

    const planIds = planData.map(p => p.id);

    // credit/read 상태는 member_lesson_reports에서 (lesson_plan_id 기준)
    const [{ data: reportData }, credit] = await Promise.all([
      supabase
        .from('member_lesson_reports')
        .select('id, lesson_plan_id, is_read, credit_unlocked')
        .in('lesson_plan_id', planIds),
      getMyCreditInfo(),
    ]);

    const reportMap = new Map(
      (reportData ?? []).map(r => [r.lesson_plan_id, r])
    );

    const merged: CoachReport[] = planData.map(plan => {
      const report = reportMap.get(plan.id);
      return {
        plan_id: plan.id,
        member_id: plan.member_id,
        created_at: plan.created_at,
        summary: plan.summary,
        improvement_points_raw: plan.improvement_points ?? null,
        next_goals_raw: plan.next_goals ?? null,
        court_type: plan.court_type ?? null,
        session_goals: plan.session_goals ?? null,
        drill_suggestions: plan.drill_suggestions ?? null,
        duration_minutes: plan.duration_minutes ?? null,
        report_id: report?.id ?? null,
        is_read: report?.is_read ?? false,
        credit_unlocked: report?.credit_unlocked ?? false,
      };
    });

    setReports(merged);
    setCreditInfo(credit);
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

  useEffect(() => {
    if (!charged) return;
    const newBalance = parseInt(charged, 10);
    setCreditInfo(prev => ({ ...prev, balance: newBalance }));
    if (pendingUnlockId) {
      const targetId = pendingUnlockId;
      setPendingUnlockId(null);
      (async () => {
        // pendingUnlockId is plan_id; find the report_id
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

  const unreadCount = reports.filter(r => !r.is_read && (IS_BETA || r.credit_unlocked)).length;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ChargeModal
        visible={showChargeModal}
        creditInfo={creditInfo}
        onClose={() => { setShowChargeModal(false); setPendingUnlockId(null); }}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>레슨 리포트</Text>
          <Text style={styles.headerSub}>AI가 분석한 나만의 레슨 기록</Text>
        </View>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>NEW {unreadCount}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.creditChip} onPress={() => setShowChargeModal(true)}>
            <Ionicons name="wallet-outline" size={14} color={Colors.primary} />
            <Text style={styles.creditChipText}>{creditInfo.balance.toLocaleString()}원</Text>
            <Ionicons name="add" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {!creditInfo.free_report_used && reports.length > 0 && (
        <View style={styles.freeBanner}>
          <Ionicons name="gift-outline" size={16} color="#9b59b6" />
          <Text style={styles.freeBannerText}>
            첫 리포트 <Text style={{ fontWeight: '700' }}>무료 체험</Text> — 지금 바로 열어보세요!
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
            tintColor={Colors.primary}
          />
        }
      >
        {reports.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>아직 리포트가 없어요</Text>
            <Text style={styles.emptySub}>코치가 레슨을 분석하면{'\n'}여기에 리포트가 자동으로 도착해요 🎾</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => {
              const isUnlocked = IS_BETA || report.credit_unlocked;
              const improvements = toLines(report.improvement_points_raw);
              const nextGoals = toLines(report.next_goals_raw);
              const drills = report.drill_suggestions ?? [];

              return (
                <TouchableOpacity
                  key={report.plan_id}
                  style={[
                    styles.card,
                    !report.is_read && isUnlocked && styles.cardUnread,
                    !isUnlocked && styles.cardLocked,
                  ]}
                  onPress={() => handleOpen(report)}
                  activeOpacity={0.85}
                  disabled={unlockingId === report.plan_id}
                >
                  {/* 카드 헤더 */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardMeta}>
                        <Text style={styles.cardDate}>{formatDate(report.created_at)}</Text>
                        {report.court_type && (
                          <View style={styles.courtBadge}>
                            <Text style={styles.courtBadgeText}>{report.court_type}</Text>
                          </View>
                        )}
                        {!report.is_read && isUnlocked && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardPreview} numberOfLines={2}>
                        {isUnlocked ? (report.summary || '레슨 리포트') : '리포트를 열어보려면 탭하세요'}
                      </Text>
                    </View>

                    {unlockingId === report.plan_id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : isUnlocked ? (
                      <Ionicons
                        name={expandedId === report.plan_id ? 'chevron-up' : 'chevron-down'}
                        size={20} color={Colors.mutedFg}
                      />
                    ) : (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={14} color="#9b59b6" />
                        <Text style={styles.lockBadgeText}>
                          {creditInfo.free_report_used ? `${REPORT_CREDIT_COST.toLocaleString()}원` : '무료'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 확장 내용 */}
                  {expandedId === report.plan_id && isUnlocked && (
                    <View style={styles.detail}>
                      <View style={styles.divider} />

                      {/* 1. 오늘 레슨 요약 */}
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>오늘 레슨 요약</Text>
                        <Text style={styles.summaryText}>{report.summary}</Text>
                      </View>

                      {/* 2. 개선 포인트 */}
                      {improvements.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>개선 포인트</Text>
                          {improvements.map((item, i) => (
                            <View key={i} style={styles.listRow}>
                              <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                              <Text style={styles.listText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* 3. 다음 목표 */}
                      {nextGoals.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>다음 목표</Text>
                          {nextGoals.map((item, i) => (
                            <View key={i} style={styles.listRow}>
                              <Text style={styles.listNum}>{String(i + 1).padStart(2, '0')}</Text>
                              <Text style={styles.listText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* 4. 개인 맞춤 연습 플랜 */}
                      {drills.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>개인 맞춤 연습 플랜</Text>
                          {drills.map((drill, i) => (
                            <View key={i} style={styles.drillCard}>
                              <View style={styles.drillHeader}>
                                <Text style={styles.drillName}>{drill.name}</Text>
                              </View>
                              <View style={styles.drillBody}>
                                {!!drill.purpose && (
                                  <View style={styles.drillRow}>
                                    <Text style={styles.drillLabel}>목적</Text>
                                    <Text style={styles.drillValue}>{drill.purpose}</Text>
                                  </View>
                                )}
                                {!!drill.method && (
                                  <View style={styles.drillRow}>
                                    <Text style={styles.drillLabel}>방법</Text>
                                    <Text style={styles.drillValue}>{drill.method}</Text>
                                  </View>
                                )}
                                {!!drill.reps && (
                                  <View style={styles.drillRow}>
                                    <Text style={styles.drillLabel}>반복</Text>
                                    <Text style={styles.drillValue}>{drill.reps}</Text>
                                  </View>
                                )}
                                {!!drill.court_adaptation && (
                                  <View style={styles.drillRow}>
                                    <Text style={styles.drillLabel}>코트 적용</Text>
                                    <Text style={styles.drillValue}>{drill.court_adaptation}</Text>
                                  </View>
                                )}
                              </View>
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

const cs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44 },
  handle: { width: 44, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF4FF', borderRadius: 14, padding: 16, marginBottom: 24 },
  balanceLabel: { fontSize: 15, color: '#666', fontWeight: '600' },
  balanceAmount: { fontSize: 24, fontWeight: '800', color: Colors.primary },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a2e', marginBottom: 6 },
  sheetSub: { fontSize: 15, color: '#888', marginBottom: 24 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  optionCard: { width: '47%', backgroundColor: '#f8f9fa', borderRadius: 14, padding: 18, borderWidth: 2, borderColor: '#e9ecef', alignItems: 'center' },
  optionSelected: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  optionAmount: { fontSize: 20, fontWeight: '800', color: '#333', marginBottom: 4 },
  optionAmountSelected: { color: Colors.primary },
  optionDesc: { fontSize: 14, color: '#888' },
  chargeBtn: { backgroundColor: Colors.primary, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chargeBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', padding: 14 },
  cancelBtnText: { color: '#999', fontSize: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: Colors.primary, paddingTop: 56, paddingBottom: 20,
    paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  unreadBadge: { backgroundColor: Colors.accentWarm, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  unreadText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  creditChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  creditChipText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  freeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5f0fa', paddingHorizontal: 16, paddingVertical: 10 },
  freeBannerText: { fontSize: 13, color: '#9b59b6' },

  emptyBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground },
  emptySub: { fontSize: 14, color: Colors.mutedFg, textAlign: 'center', lineHeight: 22 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.accentWarm },
  cardLocked: { borderLeftWidth: 3, borderLeftColor: '#e9ecef' },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  cardDate: { fontSize: 12, color: Colors.mutedFg, fontWeight: '600' },
  courtBadge: { backgroundColor: '#EEF4FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  courtBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.navy },
  newBadge: { backgroundColor: Colors.accentWarm, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  cardPreview: { fontSize: 14, color: Colors.foreground, lineHeight: 20 },

  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f0fa', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  lockBadgeText: { fontSize: 12, fontWeight: '700', color: '#9b59b6' },

  detail: { marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 16 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: Colors.foreground, marginBottom: 16 },

  summaryText: { fontSize: 16, color: Colors.foreground, lineHeight: 25.6 },

  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  listNum: { fontSize: 13, fontWeight: '600', color: Colors.primary, width: 20, marginTop: 3 },
  listText: { fontSize: 16, color: Colors.foreground, lineHeight: 25.6, flex: 1 },

  drillCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1, padding: 24,
  },
  drillHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  drillName: { fontSize: 17, fontWeight: '600', color: Colors.foreground, flex: 1 },
  drillBody: { gap: 16 },
  drillRow: { flexDirection: 'column' },
  drillLabel: { fontSize: 13, fontWeight: '500', color: Colors.mutedFg },
  drillValue: { fontSize: 16, color: Colors.foreground, lineHeight: 25.6, marginTop: 4 },
});
