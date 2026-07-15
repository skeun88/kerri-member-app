import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors } from '../../lib/theme';
import {
  getMyCreditInfo, unlockReport, chargeCredit,
  CHARGE_OPTIONS, REPORT_CREDIT_COST, CreditInfo,
} from '../../lib/reportCredits';

interface PracticeItem {
  title: string;
  description: string;
  duration: string;
  frequency: string;
  tip: string;
}

interface MemberReport {
  id: string;
  lesson_date: string;
  summary: string;
  achievements: string[];
  improvement_points: string[];
  practice_plan: PracticeItem[];
  is_read: boolean;
  credit_unlocked: boolean;
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

/** 크레딧 충전 바텀시트 */
function ChargeModal({
  visible,
  creditInfo,
  onClose,
  onCharged,
}: {
  visible: boolean;
  creditInfo: CreditInfo;
  onClose: () => void;
  onCharged: (newBalance: number) => void;
}) {
  const [charging, setCharging] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(10000);

  const handleCharge = async () => {
    setCharging(true);
    const result = await chargeCredit(selectedAmount);
    setCharging(false);
    if (result.success && result.balance !== undefined) {
      onCharged(result.balance);
    } else {
      Alert.alert('오류', result.error || '충전 중 오류가 발생했습니다.');
    }
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
          <Text style={cs.sheetSub}>리포트 1건당 {REPORT_CREDIT_COST.toLocaleString()}원 · 만원 단위 충전</Text>

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

          <TouchableOpacity
            style={[cs.chargeBtn, charging && cs.chargeBtnDisabled]}
            onPress={handleCharge}
            disabled={charging}
          >
            {charging
              ? <ActivityIndicator color="#fff" />
              : <Text style={cs.chargeBtnText}>{selectedAmount.toLocaleString()}원 충전하기</Text>
            }
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
  const [reports, setReports] = useState<MemberReport[]>([]);
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

    const [{ data: reportData }, credit] = await Promise.all([
      supabase
        .from('member_lesson_reports')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(30),
      getMyCreditInfo(),
    ]);

    setReports((reportData ?? []) as MemberReport[]);
    setCreditInfo(credit);
    setLoading(false);
  }

  async function markRead(reportId: string) {
    await supabase
      .from('member_lesson_reports')
      .update({ is_read: true })
      .eq('id', reportId);
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, is_read: true } : r));
  }

  /** 리포트 열람 — 잠금 해제 또는 이미 열람된 경우 바로 펼침 */
  async function handleOpen(report: MemberReport) {
    // 이미 열람한 리포트 → 그냥 펼침
    if (report.credit_unlocked) {
      setExpandedId(prev => prev === report.id ? null : report.id);
      if (!report.is_read) markRead(report.id);
      return;
    }

    // 잠금 해제 시도
    setUnlockingId(report.id);
    const result = await unlockReport(report.id);
    setUnlockingId(null);

    if (result.success) {
      // 크레딧 잔액 업데이트
      const credit = await getMyCreditInfo();
      setCreditInfo(credit);

      setReports(prev =>
        prev.map(r => r.id === report.id ? { ...r, credit_unlocked: true, is_read: true } : r)
      );
      setExpandedId(report.id);
    } else if (result.reason === 'insufficient_credit') {
      // 잔액 부족 → 충전 모달
      setPendingUnlockId(report.id);
      setShowChargeModal(true);
    } else {
      Alert.alert('오류', result.error || '리포트를 열 수 없습니다.');
    }
  }

  /** 충전 완료 후 자동으로 해당 리포트 다시 열기 */
  async function handleCharged(newBalance: number) {
    setCreditInfo(prev => ({ ...prev, balance: newBalance }));
    setShowChargeModal(false);

    if (pendingUnlockId) {
      const targetId = pendingUnlockId;
      setPendingUnlockId(null);

      setUnlockingId(targetId);
      const result = await unlockReport(targetId);
      setUnlockingId(null);

      if (result.success) {
        const credit = await getMyCreditInfo();
        setCreditInfo(credit);
        setReports(prev =>
          prev.map(r => r.id === targetId ? { ...r, credit_unlocked: true, is_read: true } : r)
        );
        setExpandedId(targetId);
      }
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // Realtime: 새 리포트 도착 시 즉시 반영
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

  const unreadCount = reports.filter(r => !r.is_read && r.credit_unlocked).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChargeModal
        visible={showChargeModal}
        creditInfo={creditInfo}
        onClose={() => { setShowChargeModal(false); setPendingUnlockId(null); }}
        onCharged={handleCharged}
      />

      {/* 헤더 */}
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
          {/* 크레딧 잔액 표시 */}
          <TouchableOpacity
            style={styles.creditChip}
            onPress={() => setShowChargeModal(true)}
          >
            <Ionicons name="wallet-outline" size={14} color={Colors.primary} />
            <Text style={styles.creditChipText}>
              {creditInfo.balance.toLocaleString()}원
            </Text>
            <Ionicons name="add" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 첫 1건 무료 안내 배너 (무료 체험 전) */}
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
            <Text style={styles.emptySub}>
              코치가 레슨을 분석하면{'\n'}여기에 리포트가 자동으로 도착해요 🎾
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => (
              <TouchableOpacity
                key={report.id}
                style={[
                  styles.card,
                  !report.is_read && report.credit_unlocked && styles.cardUnread,
                  !report.credit_unlocked && styles.cardLocked,
                ]}
                onPress={() => handleOpen(report)}
                activeOpacity={0.85}
                disabled={unlockingId === report.id}
              >
                {/* 카드 헤더 */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardDate}>
                        {formatDate(report.lesson_date || report.created_at)}
                      </Text>
                      {!report.is_read && report.credit_unlocked && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardPreview} numberOfLines={2}>
                      {report.credit_unlocked
                        ? (report.summary || '레슨 리포트')
                        : '리포트를 열어보려면 탭하세요'
                      }
                    </Text>
                  </View>

                  {unlockingId === report.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : report.credit_unlocked ? (
                    <Ionicons
                      name={expandedId === report.id ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={Colors.mutedFg}
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

                {/* 확장 내용 (열람된 경우만) */}
                {expandedId === report.id && report.credit_unlocked && (
                  <View style={styles.detail}>
                    <View style={styles.divider} />

                    {/* 1. 오늘 레슨 요약 */}
                    <View style={styles.section}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionIcon}>📋</Text>
                        <Text style={styles.sectionTitle}>오늘 레슨 요약</Text>
                      </View>
                      <View style={styles.summaryBox}>
                        <Text style={styles.summaryText}>{report.summary}</Text>
                      </View>
                    </View>

                    {/* 2. 오늘의 중요 성과 */}
                    {report.achievements?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>🏆</Text>
                          <Text style={styles.sectionTitle}>오늘의 중요 성과</Text>
                        </View>
                        {report.achievements.map((item, i) => (
                          <View key={i} style={styles.achievementRow}>
                            <View style={styles.achievementDot} />
                            <Text style={styles.achievementText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 3. 개선 및 보완 포인트 */}
                    {report.improvement_points?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>💡</Text>
                          <Text style={styles.sectionTitle}>개선 및 보완 포인트</Text>
                        </View>
                        {report.improvement_points.map((item, i) => (
                          <View key={i} style={styles.improveRow}>
                            <Text style={styles.improveNum}>{i + 1}</Text>
                            <Text style={styles.improveText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 4. 맞춤 개인 연습 플랜 */}
                    {report.practice_plan?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>🎯</Text>
                          <Text style={styles.sectionTitle}>맞춤 개인 연습 플랜</Text>
                        </View>
                        {report.practice_plan.map((item, i) => (
                          <View key={i} style={styles.practiceCard}>
                            <View style={styles.practiceHeader}>
                              <View style={styles.practiceIdx}>
                                <Text style={styles.practiceIdxText}>{i + 1}</Text>
                              </View>
                              <Text style={styles.practiceTitle}>{item.title}</Text>
                            </View>
                            <Text style={styles.practiceDesc}>{item.description}</Text>
                            <View style={styles.practiceMeta}>
                              <View style={styles.metaChip}>
                                <Ionicons name="time-outline" size={12} color={Colors.primary} />
                                <Text style={styles.metaText}>{item.duration}</Text>
                              </View>
                              <View style={styles.metaChip}>
                                <Ionicons name="repeat-outline" size={12} color={Colors.primary} />
                                <Text style={styles.metaText}>{item.frequency}</Text>
                              </View>
                            </View>
                            {!!item.tip && (
                              <View style={styles.tipBox}>
                                <Text style={styles.tipLabel}>💬 TIP</Text>
                                <Text style={styles.tipText}>{item.tip}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// 충전 모달 스타일
const cs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF4FF', borderRadius: 12, padding: 14, marginBottom: 20 },
  balanceLabel: { fontSize: 13, color: '#888' },
  balanceAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  optionCard: {
    width: '47%', backgroundColor: '#f8f9fa', borderRadius: 12,
    padding: 14, borderWidth: 2, borderColor: '#e9ecef', alignItems: 'center',
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  optionAmount: { fontSize: 17, fontWeight: '800', color: '#333', marginBottom: 3 },
  optionAmountSelected: { color: Colors.primary },
  optionDesc: { fontSize: 12, color: '#888' },
  chargeBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 10 },
  chargeBtnDisabled: { opacity: 0.7 },
  chargeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelBtnText: { color: '#888', fontSize: 14 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: Colors.primary,
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  unreadBadge: { backgroundColor: Colors.accentWarm, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  unreadText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  creditChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  creditChipText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f5f0fa', paddingHorizontal: 16, paddingVertical: 10,
  },
  freeBannerText: { fontSize: 13, color: '#9b59b6' },

  emptyBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground },
  emptySub: { fontSize: 14, color: Colors.mutedFg, textAlign: 'center', lineHeight: 22 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.accentWarm },
  cardLocked: { borderLeftWidth: 3, borderLeftColor: '#e9ecef' },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardDate: { fontSize: 12, color: Colors.mutedFg, fontWeight: '600' },
  newBadge: { backgroundColor: Colors.accentWarm, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  cardPreview: { fontSize: 14, color: Colors.foreground, lineHeight: 20 },

  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5f0fa', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  lockBadgeText: { fontSize: 12, fontWeight: '700', color: '#9b59b6' },

  detail: { marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },

  section: { marginBottom: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary },

  summaryBox: { backgroundColor: '#EEF4FF', borderRadius: 10, padding: 14 },
  summaryText: { fontSize: 14, color: Colors.foreground, lineHeight: 22 },

  achievementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  achievementDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentWarm, marginTop: 7, flexShrink: 0 },
  achievementText: { fontSize: 14, color: Colors.foreground, lineHeight: 22, flex: 1 },

  improveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  improveNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FEF3C7', textAlign: 'center', lineHeight: 22,
    fontSize: 12, fontWeight: '800', color: '#92400E', flexShrink: 0,
  },
  improveText: { fontSize: 14, color: Colors.foreground, lineHeight: 22, flex: 1 },

  practiceCard: {
    backgroundColor: '#F8FDF9', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#D1FAE5',
  },
  practiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  practiceIdx: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  practiceIdxText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  practiceTitle: { fontSize: 15, fontWeight: '800', color: Colors.foreground, flex: 1 },
  practiceDesc: { fontSize: 14, color: Colors.foreground, lineHeight: 22, marginBottom: 10 },
  practiceMeta: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E0F2FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tipBox: { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  tipLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  tipText: { fontSize: 13, color: '#78350F', lineHeight: 20 },
});
