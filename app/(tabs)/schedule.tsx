import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

interface Lesson {
  id: string; date: string; start_time: string; end_time: string; title: string;
  report?: string;
}
interface Payment {
  id: string; amount: number; paid_amount: number; due_date: string;
  status: string; description: string; payment_method?: string;
}

type Tab = '레슨' | '결제';

const DAYS = ['일','월','화','수','목','금','토'];

function getDDay(dueDateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dueDateStr + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'D-Day', urgent: true };
  if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 5 };
  return { label: `D+${Math.abs(diff)}`, urgent: true };
}

export default function ScheduleScreen() {
  const [tab, setTab] = useState<Tab>('레슨');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reportModal, setReportModal] = useState(false);
  const [remainingCredits, setRemainingCredits] = useState(0);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 내 member row 찾기
    const { data: mem } = await supabase.from('members').select('id, remaining_credits')
      .eq('email', user.email).maybeSingle();
    if (!mem) return;
    setMemberId(mem.id);
    setRemainingCredits(mem.remaining_credits ?? 0);

    // 레슨 (오늘 포함 이후 + 최근 지난 레슨 포함)
    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    const { data: lm } = await supabase.from('lesson_members').select('lesson_id').eq('member_id', mem.id);
    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    if (lessonIds.length > 0) {
      const { data: lessonData } = await supabase.from('lessons').select('*')
        .in('id', lessonIds).gte('date', twoWeeksAgoStr).order('date', { ascending: false }).order('start_time', { ascending: false });
      setLessons(lessonData ?? []);
    }

    // 결제 내역
    const { data: payData } = await supabase.from('payments').select('*')
      .eq('member_id', mem.id).order('due_date', { ascending: false });
    setPayments(payData ?? []);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const today = new Date().toISOString().split('T')[0];
  const unpaidPayments = payments.filter(p => p.status !== '납부완료');
  const totalUnpaid = unpaidPayments.reduce((s, p) => s + (p.amount - p.paid_amount), 0);

  return (
    <View style={styles.container}>
      {/* 탭 */}
      <View style={styles.tabRow}>
        {(['레슨', '결제'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            {t === '결제' && unpaidPayments.length > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{unpaidPayments.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
          tintColor={Colors.navy} />}
      >
        {tab === '레슨' ? (
          <>
            {/* 잔여 크레딧 */}
            <View style={styles.creditBanner}>
              <Ionicons name="layers-outline" size={20} color={Colors.white} />
              <Text style={styles.creditBannerText}>잔여 레슨 <Text style={styles.creditBannerNum}>{remainingCredits}회</Text></Text>
              {remainingCredits <= 3 && (
                <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>잔여 적음</Text></View>
              )}
            </View>

            {/* 레슨 목록 */}
            {lessons.map(lesson => {
              const d = new Date(lesson.date + 'T00:00:00');
              const isPast = lesson.date < today;
              return (
                <TouchableOpacity key={lesson.id} style={[styles.lessonCard, isPast && styles.lessonCardPast]}
                  onPress={() => { setSelectedLesson(lesson); setReportModal(true); }}>
                  <View style={[styles.lessonDateBox, isPast && { backgroundColor: Colors.mutedBg }]}>
                    <Text style={styles.lessonDow}>{DAYS[d.getDay()]}</Text>
                    <Text style={[styles.lessonDay, isPast && { color: Colors.mutedFg }]}>{d.getDate()}</Text>
                    <Text style={styles.lessonMon}>{d.getMonth()+1}월</Text>
                  </View>
                  <View style={styles.lessonBody}>
                    <View style={styles.lessonTitleRow}>
                      <Text style={[styles.lessonTitle, isPast && { color: Colors.mutedFg }]}>{lesson.title}</Text>
                      {lesson.date === today && <View style={styles.todayBadge}><Text style={styles.todayText}>오늘</Text></View>}
                      {isPast && <View style={styles.pastBadge}><Text style={styles.pastText}>완료</Text></View>}
                    </View>
                    <Text style={styles.lessonTime}>{lesson.start_time.slice(0,5)} ~ {lesson.end_time.slice(0,5)}</Text>
                    {lesson.report && <Text style={styles.reportPreview} numberOfLines={1}>📋 {lesson.report}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
                </TouchableOpacity>
              );
            })}
            {lessons.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={40} color={Colors.iconMuted} />
                <Text style={styles.emptyText}>레슨 내역이 없어요</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* 미납 요약 배너 */}
            {totalUnpaid > 0 && (
              <View style={styles.unpaidBanner}>
                <Ionicons name="alert-circle" size={20} color={Colors.white} />
                <Text style={styles.unpaidBannerText}>미납 금액 <Text style={{ fontWeight: '900' }}>{totalUnpaid.toLocaleString()}원</Text></Text>
              </View>
            )}

            {/* 미납 결제 (상단 강조) */}
            {unpaidPayments.map(p => {
              const dday = getDDay(p.due_date);
              const remaining = p.amount - p.paid_amount;
              return (
                <View key={p.id} style={[styles.payCard, dday.urgent && styles.payCardUrgent]}>
                  <View style={styles.payCardTop}>
                    <View style={styles.payCardLeft}>
                      <Text style={styles.payDesc}>{p.description || '레슨비'}</Text>
                      <Text style={styles.payDate}>납부기한: {p.due_date}</Text>
                    </View>
                    <View style={[styles.ddayBadge, { backgroundColor: dday.urgent ? Colors.destructive : Colors.warning }]}>
                      <Text style={styles.ddayText}>{dday.label}</Text>
                    </View>
                  </View>
                  <View style={styles.payCardBottom}>
                    <View>
                      <Text style={styles.payAmountLabel}>납부해야 할 금액</Text>
                      <Text style={[styles.payAmount, { color: Colors.destructive }]}>{remaining.toLocaleString()}원</Text>
                    </View>
                    <TouchableOpacity style={styles.payNowBtn}
                      onPress={() => Alert.alert('결제 안내', `${remaining.toLocaleString()}원\n코치에게 연락해 결제를 진행해주세요.`)}>
                      <Ionicons name="card-outline" size={14} color={Colors.white} />
                      <Text style={styles.payNowText}>결제하기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* 완료된 결제 */}
            {payments.filter(p => p.status === '납부완료').map(p => (
              <View key={p.id} style={styles.payCardDone}>
                <View style={styles.payCardTop}>
                  <View>
                    <Text style={styles.payDesc}>{p.description || '레슨비'}</Text>
                    <Text style={styles.payDate}>납부일: {(p as any).paid_date ?? p.due_date}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: Colors.successLight }]}>
                    <Text style={[styles.statusText, { color: Colors.success }]}>납부완료</Text>
                  </View>
                </View>
                <View style={styles.payCardBottom}>
                  <Text style={styles.payAmount}>{p.amount.toLocaleString()}원</Text>
                  {(p as any).payment_method && (
                    <Text style={styles.payMethod}>{(p as any).payment_method}</Text>
                  )}
                </View>
              </View>
            ))}
            {payments.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="card-outline" size={40} color={Colors.iconMuted} />
                <Text style={styles.emptyText}>결제 내역이 없어요</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* 코치 리포트 모달 */}
      <Modal visible={reportModal} transparent animationType="slide" onRequestClose={() => setReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {selectedLesson && (
              <>
                <Text style={styles.modalTitle}>{selectedLesson.title}</Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedLesson.date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                  {'  '}{selectedLesson.start_time.slice(0,5)} ~ {selectedLesson.end_time.slice(0,5)}
                </Text>
                <View style={styles.reportBox}>
                  <View style={styles.reportHeader}>
                    <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                    <Text style={styles.reportHeaderText}>코치 리포트</Text>
                  </View>
                  <Text style={styles.reportContent}>
                    {selectedLesson.report || '아직 리포트가 작성되지 않았어요.\n다음 레슨 후 코치가 작성해드릴게요 🎾'}
                  </Text>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setReportModal(false)}>
              <Text style={styles.modalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center', backgroundColor: Colors.mutedBg, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.mutedFg },
  tabTextActive: { color: Colors.white },
  tabBadge: { backgroundColor: Colors.destructive, borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  tabBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
  creditBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navy, margin: 16, borderRadius: Radius.lg, padding: 14, gap: 10 },
  creditBannerText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.white },
  creditBannerNum: { fontWeight: '900', fontSize: 18 },
  lowBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  lowBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  lessonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, ...Shadow.sm },
  lessonCardPast: { backgroundColor: Colors.mutedBg },
  lessonDateBox: { backgroundColor: Colors.primary + '15', borderRadius: Radius.md, padding: 10, alignItems: 'center', marginRight: 14, minWidth: 48 },
  lessonDow: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  lessonDay: { fontSize: 20, fontWeight: '900', color: Colors.navy },
  lessonMon: { fontSize: 10, color: Colors.mutedFg },
  lessonBody: { flex: 1 },
  lessonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  lessonTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy, flex: 1 },
  lessonTime: { fontSize: 12, color: Colors.mutedFg },
  todayBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  pastBadge: { backgroundColor: Colors.mutedBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  pastText: { fontSize: 10, fontWeight: '700', color: Colors.mutedFg },
  reportPreview: { fontSize: 11, color: Colors.primary, marginTop: 4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: Colors.placeholder, marginTop: 10 },
  unpaidBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.destructive, margin: 16, borderRadius: Radius.lg, padding: 14, gap: 10 },
  unpaidBannerText: { color: Colors.white, fontSize: 14 },
  payCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, marginHorizontal: 16, marginBottom: 10, padding: 16, borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm },
  payCardUrgent: { borderColor: Colors.destructive, backgroundColor: Colors.destructiveLight },
  payCardDone: { backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, borderWidth: 1, borderColor: Colors.border },
  payCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  payCardLeft: {},
  payCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payDesc: { fontSize: 15, fontWeight: '700', color: Colors.navy, marginBottom: 2 },
  payDate: { fontSize: 12, color: Colors.mutedFg },
  payAmountLabel: { fontSize: 11, color: Colors.mutedFg, marginBottom: 2 },
  payAmount: { fontSize: 20, fontWeight: '900', color: Colors.navy },
  payMethod: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  payNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  payNowText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  ddayText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.navy, marginBottom: 4 },
  modalDate: { fontSize: 13, color: Colors.mutedFg, marginBottom: 20 },
  reportBox: { backgroundColor: Colors.primary + '10', borderRadius: Radius.lg, padding: 16, marginBottom: 20 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  reportHeaderText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  reportContent: { fontSize: 14, color: Colors.foreground, lineHeight: 22 },
  modalCloseBtn: { backgroundColor: Colors.navy, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  modalCloseBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
