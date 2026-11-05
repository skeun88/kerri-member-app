import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, ActivityIndicator, TextInput,
  SafeAreaView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { notifyCoachBoganRequest, notifyCoachBoganCancel } from '../../lib/notifications';
import { Radius, Shadow } from '../../lib/theme';
import { ScheduleSkeleton, FadeInView } from '../../components/Skeleton';
import {
  GrowthReport,
} from '../../components/GrowthDashboard';
import {
  computeChangeEvents, GrowthBalanceCard, RecentChangesCard, InsightsCard,
} from '../../components/GrowthRadar';

// ── Design tokens (홈 화면과 동일 팔레트) ──────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const LESSON_CARD_BG = '#F4E5DC';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

type MainTab = 'schedule' | 'makeup' | 'payment' | 'report';
type LessonAttendanceStatus = 'scheduled' | 'attended' | 'absent' | 'cancelled' | 'pending';

const ATTENDANCE_STATUS_CONFIG: Record<LessonAttendanceStatus, { bg: string; text: string; label: string; dotColor: string }> = {
  scheduled: { bg: '#FBF2EF', text: '#C0755A', label: '예정', dotColor: '#C0755A' },
  attended:  { bg: '#E8F5E9', text: '#3A7A3A', label: '출석', dotColor: '#3A7A3A' },
  absent:    { bg: '#FFEBEE', text: '#C03030', label: '결석', dotColor: '#C03030' },
  cancelled: { bg: '#F5F5F5', text: '#9A9A9A', label: '취소', dotColor: '#9A9A9A' },
  pending:   { bg: '#FFF3E0', text: '#F57C00', label: '확인 대기', dotColor: '#F57C00' },
};

interface AttendanceData {
  status?: string;
  absence_reporter?: string;
  absence_reported_at?: string;
}

function resolveLessonStatus(
  lesson: { date: string },
  today: string,
  attendance?: AttendanceData,
): LessonAttendanceStatus {
  if (!attendance || !attendance.status) return 'scheduled';
  const s = attendance.status;
  // Korean DB values
  if (s === '출석' || s === '지각' || s === '조퇴') return 'attended';
  if (s === '결석') {
    if (attendance.absence_reporter === 'member') return 'pending';
    return 'absent';
  }
  if (s === '취소') return 'cancelled';
  // English DB values
  if (s === 'attended' || s === 'completed') return 'attended';
  if (s === 'absent' || s === 'missed') return 'absent';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'pending') return 'pending';
  if (s === 'scheduled') return 'scheduled';
  return 'scheduled';
}

interface Lesson {
  id: string; date: string; start_time: string; end_time: string;
  title: string; notes?: string; location?: string;
}
interface Payment {
  id: string; amount: number; paid_amount: number; due_date: string;
  paid_date?: string; status: string; description: string; payment_method?: string; payment_channel?: string;
}
interface MemberInfo {
  id: string; name: string; remaining_credits: number; total_credits: number;
  fixed_schedule_days?: number[]; fixed_schedule_times?: Record<string, string[]>;
  fixed_schedule_time?: string; lesson_package_id?: string; coach_id: string; fixed_lesson_duration?: number;
}

const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
function todayKST() { return toKSTDateStr(new Date()); }

function getDDay(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'D-Day', urgent: true };
  if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 5 };
  return { label: `D+${Math.abs(diff)}`, urgent: true };
}

interface LessonRequest {
  id: string; requested_date: string; start_time: string; end_time: string; status: string; message?: string; reject_message?: string | null;
}

interface MemberReport {
  lesson_date: string;
  improvement_points: string[] | null;
}

function MakeupTab({ memberId, coachId, lessonDuration }: { memberId: string|null; coachId: string|null; lessonDuration: number }) {
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [busySlots, setBusySlots] = useState<{ date: string; startMin: number; endMin: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [myRequests, setMyRequests] = useState<LessonRequest[]>([]);
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [bookingMsg, setBookingMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [coachAvailability, setCoachAvailability] = useState<{ days: number[]; startMin: number; endMin: number } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const todayStr = todayKST();

  useEffect(() => {
    if (!coachId) return;
    loadBusy();
    loadMyRequests();
  }, [coachId, calMonth.year, calMonth.month]);

  useEffect(() => {
    if (!memberId) return;
    const ch = supabase.channel('makeup_requests_' + memberId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'lesson_requests',
        filter: `member_id=eq.${memberId}`,
      }, () => {
        loadMyRequests();
        loadBusy();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'lessons',
        filter: `coach_id=eq.${coachId}`,
      }, () => loadBusy())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [memberId, coachId]);

  async function loadBusy() {
    if (!coachId) return;
    setLoadingSlots(true);

    const { data: avail } = await supabase.from('coach_availability').select('*').eq('coach_id', coachId).maybeSingle();
    if (avail) {
      const [sh, sm] = (avail.available_start ?? '09:00').slice(0, 5).split(':').map(Number);
      const [eh, em] = (avail.available_end ?? '18:00').slice(0, 5).split(':').map(Number);
      setCoachAvailability({ days: avail.available_days ?? [], startMin: sh * 60 + sm, endMin: eh * 60 + em });
    }

    const firstDay = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-01`;
    const lastDay = new Date(calMonth.year, calMonth.month+1, 0);
    const lastDayStr = `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
    const { data } = await supabase.from('lessons').select('date, start_time, end_time')
      .eq('coach_id', coachId).gte('date', firstDay).lte('date', lastDayStr);
    setBusySlots((data ?? []).map((l: { date: string; start_time: string; end_time: string }) => ({
      date: l.date,
      startMin: tMin(l.start_time),
      endMin: tMin(l.end_time),
    })));
    setLoadingSlots(false);
  }

  async function loadMyRequests() {
    if (!memberId) return;
    const { data } = await supabase.from('lesson_requests').select('*, reject_message')
      .eq('member_id', memberId).order('created_at', { ascending: false });
    setMyRequests(data ?? []);
  }

  function tMin(t: string) {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  }
  function mStr(m: number) {
    return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
  }

  function handleDateSelect(dateStr: string) {
    if (dateStr < todayStr) return;
    setSelectedDate(dateStr);
    const dow = new Date(dateStr + 'T12:00:00+09:00').getDay();
    if (coachAvailability && !coachAvailability.days.includes(dow)) {
      setAvailableSlots([]);
      return;
    }
    const rangeStart = coachAvailability ? coachAvailability.startMin : 6 * 60;
    const rangeEnd = coachAvailability ? coachAvailability.endMin : 22 * 60;
    const dayBusy = busySlots.filter(s => s.date === dateStr);
    const slots: string[] = [];
    for (let start = rangeStart; start + lessonDuration <= rangeEnd; start += 30) {
      const end = start + lessonDuration;
      const free = !dayBusy.some(b => start < b.endMin && end > b.startMin);
      if (free) slots.push(mStr(start));
    }
    setAvailableSlots(slots);
  }

  async function submitRequest() {
    if (!bookingSlot || !memberId || !coachId || sending) return;
    setSending(true);
    const startMin = tMin(bookingSlot + ':00');
    const endMin = startMin + lessonDuration;
    const startTimeFull = bookingSlot + ':00';
    const { data: inserted, error } = await supabase.from('lesson_requests').insert({
      coach_id: coachId, member_id: memberId,
      requested_date: selectedDate,
      start_time: startTimeFull,
      end_time: mStr(endMin) + ':00',
      message: bookingMsg.trim() || null,
      status: 'pending',
    }).select('id').single();
    setSending(false);
    if (error || !inserted) { Alert.alert('오류', '예약 요청 실패'); return; }

    // 코치에게 보강 요청 푸시 알림
    const member = await getMyMemberRow();
    if (member && selectedDate) {
      notifyCoachBoganRequest(
        coachId, member.name, inserted.id, selectedDate, startTimeFull, memberId,
      ).catch(() => {});
    }

    setBookingModal(false);
    setBookingSlot(null);
    setBookingMsg('');
    Alert.alert('신청 완료', '코치님께 보강 신청을 보냈어요!\n코치가 확인 후 승인/거절 알림을 보내드립니다.');
    loadMyRequests();
  }

  const busyDateSet = new Set(busySlots.map(s => s.date));

  return (
    <View>
      <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 4 }}>
        <Text style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 20 }}>
          코치의 빈 시간을 확인하고 원하는 시간에 보강을 신청하세요.
        </Text>
      </View>
      <CalendarView
        year={calMonth.year} month={calMonth.month}
        selectedDate={selectedDate ?? ''}
        lessonDates={new Set<string>()}
        unavailableDows={coachAvailability ? Array.from({ length: 7 }, (_, i) => i).filter(d => !coachAvailability!.days.includes(d)) : undefined}
        onSelectDate={handleDateSelect}
        onPrevMonth={() => setCalMonth(p => {
          const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
        })}
        onNextMonth={() => setCalMonth(p => {
          const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
        })}
      />


      {loadingSlots && <ActivityIndicator color={TERRA} style={{ padding: 16 }} />}

      {selectedDate && !loadingSlots && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            {new Date(selectedDate+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})} 가능한 시간
          </Text>
          {availableSlots.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="time-outline" size={32} color={TEXT_MUTED} />
              <Text style={s.emptyText}>이 날은 빈 시간이 없어요</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availableSlots.map(slot => (
                <TouchableOpacity key={slot}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: TERRA + '18', borderWidth: 1, borderColor: TERRA }}
                  onPress={() => { setBookingSlot(slot); setBookingModal(true); }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TERRA }}>{slot}</Text>
                  <Text style={{ fontSize: 12, color: TERRA + 'aa', marginTop: 1 }}>{lessonDuration}분</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {myRequests.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>보강 신청 내역</Text>
          {myRequests.slice(0, 5).map(req => {
            const isPending = req.status === 'pending';
            const isAccepted = req.status === 'accepted';
            const isRejected = req.status === 'rejected';
            const isCancelled = req.status === 'cancelled';
            const badgeColor = isPending ? '#F57C00' : isAccepted ? '#2E7D32' : isCancelled ? '#9E9E9E' : '#C62828';
            const badgeBg = isPending ? '#FFF3E0' : isAccepted ? '#E8F5E9' : isCancelled ? '#F5F5F5' : '#FFEBEE';
            const badgeLabel = isPending ? '승인 대기' : isAccepted ? '예약 확정' : isCancelled ? '신청 취소' : '신청 거절';
            const statusDesc = isPending ? '코치가 신청 내용을 확인하고 있어요.' :
              isAccepted ? '코치가 승인했어요. 내 일정에 반영됐습니다.' :
              isCancelled ? '신청이 취소됐어요.' : '코치가 거절했어요.';
            return (
              <View key={req.id} style={[s.upcomingCard, { borderLeftColor: badgeColor, borderLeftWidth: 4 }]}>
                <View style={s.upcomingInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[s.statusBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[s.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                    </View>
                  </View>
                  <Text style={s.upcomingTitle}>{req.requested_date} {req.start_time.slice(0,5)} ~ {req.end_time.slice(0,5)}</Text>
                  <Text style={[s.upcomingDate, { marginTop: 2 }]}>{statusDesc}</Text>
                  {isRejected && req.reject_message ? (
                    <Text style={{ fontSize: 13, color: '#C62828', marginTop: 4, lineHeight: 18 }}>
                      사유: {req.reject_message}
                    </Text>
                  ) : null}
                  {isPending && (
                    <TouchableOpacity
                      style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F5F5F5', opacity: cancellingId === req.id ? 0.5 : 1 }}
                      disabled={cancellingId !== null}
                      onPress={() => {
                        Alert.alert('신청 취소', '보강 신청을 취소할까요?', [
                          { text: '아니요', style: 'cancel' },
                          { text: '취소하기', style: 'destructive', onPress: async () => {
                            setCancellingId(req.id);
                            const { data: updated, error } = await supabase.from('lesson_requests')
                              .update({ status: 'cancelled' })
                              .eq('id', req.id)
                              .select('id');
                            setCancellingId(null);
                            if (error) {
                              Alert.alert('오류', '신청 취소 중 문제가 발생했어요. 다시 시도해주세요.');
                              return;
                            }
                            if (!updated?.length) {
                              Alert.alert('오류', '신청 취소에 실패했어요. 이미 처리된 신청일 수 있어요.');
                              return;
                            }
                            const member = await getMyMemberRow();
                            if (member && coachId) {
                              notifyCoachBoganCancel(
                                coachId, member.name, req.id,
                                req.requested_date, req.start_time,
                              ).catch(() => {});
                            }
                            await loadMyRequests();
                          }},
                        ]);
                      }}>
                      {cancellingId === req.id
                        ? <ActivityIndicator size="small" color="#9E9E9E" />
                        : <Text style={{ fontSize: 13, fontWeight: '600', color: '#9E9E9E' }}>신청 취소</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={bookingModal} transparent animationType="slide" onRequestClose={() => setBookingModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>보강 신청</Text>
            <Text style={s.modalDate}>
              {selectedDate && new Date(selectedDate+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'})}
              {'  '}{bookingSlot} ({lessonDuration}분)
            </Text>
            <Text style={[s.sectionTitle, { fontSize: 13, marginBottom: 6 }]}>전달 메시지 (선택)</Text>
            <TextInput
              style={{ backgroundColor: '#F4F6F9', borderRadius: Radius.md, padding: 12, fontSize: 14, color: TEXT_PRIMARY, minHeight: 80, marginBottom: 16, textAlignVertical: 'top', borderWidth: 1, borderColor: DIVIDER }}
              placeholder="코치님께 전달할 내용"
              placeholderTextColor={TEXT_MUTED}
              value={bookingMsg}
              onChangeText={setBookingMsg}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.modalCloseBtn, { flex: 1, backgroundColor: '#F4F6F9' }]} onPress={() => setBookingModal(false)}>
                <Text style={[s.modalCloseBtnText, { color: TERRA }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalCloseBtn, { flex: 1 }]} onPress={submitRequest} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.modalCloseBtnText}>보강 신청하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── 커스텀 달력 ──────────────────────────────────────────
function CalendarView({
  year, month, selectedDate, lessonDates, lessonStatusColors, unavailableDows,
  onSelectDate, onPrevMonth, onNextMonth, onTodayPress,
}: {
  year: number; month: number; selectedDate: string;
  lessonDates: Set<string>;
  lessonStatusColors?: Record<string, string[]>;
  unavailableDows?: number[];
  onSelectDate: (d: string) => void;
  onPrevMonth: () => void; onNextMonth: () => void;
  onTodayPress?: () => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = todayKST();

  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <Text style={cal.title}>{year}년 {MONTHS[month]}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity style={cal.todayBtn} onPress={onTodayPress ?? (() => onSelectDate(todayStr))}>
            <Text style={cal.todayBtnText}>오늘</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onPrevMonth} style={cal.navBtn}>
            <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onNextMonth} style={cal.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={TEXT_PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={cal.dayRow}>
        {DAYS_KR.map((d, i) => (
          <Text key={i} style={[cal.dayLabel, i === 0 && { color: '#EF4444' }, i === 6 && { color: '#3B82F6' }]}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={cal.cell} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const hasLesson = lessonDates.has(dateStr);
          const statusColors = lessonStatusColors?.[dateStr];
          const dow = i % 7;
          const isUnavailable = unavailableDows ? unavailableDows.includes(dow) : false;
          return (
            <TouchableOpacity key={i} style={[cal.cell, isUnavailable && { opacity: 0.3 }]} onPress={() => onSelectDate(dateStr)}>
              <View style={[
                cal.dayCircle,
                isSelected && cal.dayCircleSelected,
                isToday && !isSelected && cal.dayCircleToday,
              ]}>
                <Text style={[
                  cal.dayNum,
                  dow === 0 && { color: '#EF4444' },
                  dow === 6 && { color: '#3B82F6' },
                  isSelected && { color: '#fff', fontWeight: '800' },
                  isToday && !isSelected && { color: TERRA, fontWeight: '800' },
                ]}>{day}</Text>
              </View>
              {statusColors && statusColors.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
                  {statusColors.slice(0, 3).map((c, ci) => (
                    <View key={ci} style={[cal.dot, { backgroundColor: isSelected ? '#fff' : c }]} />
                  ))}
                </View>
              ) : hasLesson ? (
                <View style={[cal.dot, isSelected && { backgroundColor: '#fff' }]} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MonthlyLessonSummaryCard({
  year, month, stats,
}: {
  year: number; month: number;
  stats: { scheduled: number; attended: number; absent: number; cancelled: number };
}) {
  const items = [
    { key: 'scheduled', color: '#C0755A', label: '예정', count: stats.scheduled },
    { key: 'attended',  color: '#3A7A3A', label: '출석', count: stats.attended  },
    { key: 'absent',    color: '#C03030', label: '결석', count: stats.absent    },
    { key: 'cancelled', color: '#9A9A9A', label: '취소', count: stats.cancelled },
  ];
  return (
    <View style={mCard.container}>
      <Text style={mCard.title}>{year}년 {month + 1}월 레슨 현황</Text>
      <View style={mCard.statsRow}>
        {items.map(item => (
          <View key={item.key} style={mCard.statItem}>
            <View style={[mCard.dot, { backgroundColor: item.color }]} />
            <Text style={[mCard.count, { color: item.color }]}>{item.count}</Text>
            <Text style={mCard.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const mCard = StyleSheet.create({
  container: {
    backgroundColor: CARD_WHITE,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    ...Shadow.sm,
  },
  title: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: { fontSize: 22, fontWeight: '900' },
  label: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
});

const cal = StyleSheet.create({
  container: { backgroundColor: CARD_WHITE, borderRadius: 20, marginHorizontal: 20, marginTop: 16, padding: 16, ...Shadow.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY },
  todayBtn: { backgroundColor: LESSON_CARD_BG, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: TERRA },
  dayRow: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: TEXT_MUTED, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  dayCircleSelected: { backgroundColor: TERRA },
  dayCircleToday: { borderWidth: 1.5, borderColor: TERRA },
  dayNum: { fontSize: 14, color: TEXT_PRIMARY },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: TERRA, marginTop: 1 },
});

// ── 결제 내역 도우미 ──────────────────────────────────────
function formatDateDot(dateStr: string): string {
  return dateStr.replace(/-/g, '.');
}

function formatMonthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function groupPaymentsByMonth(items: Payment[]): { month: string; items: Payment[] }[] {
  const map: Record<string, Payment[]> = {};
  items.forEach(p => {
    const dateStr = p.paid_date ?? p.due_date;
    const month = dateStr.slice(0, 7);
    if (!map[month]) map[month] = [];
    map[month].push(p);
  });
  return Object.keys(map)
    .sort()
    .reverse()
    .map(month => ({
      month,
      items: map[month].sort((a, b) => {
        const da = a.paid_date ?? a.due_date;
        const db = b.paid_date ?? b.due_date;
        return db.localeCompare(da);
      }),
    }));
}

// ── 메인 ──────────────────────────────────────────────────
export default function ScheduleScreen() {
  const [tab, setTab] = useState<MainTab>('schedule');
  const tabOpacity = useRef(new Animated.Value(1)).current;
  const tabTranslateY = useRef(new Animated.Value(0)).current;
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pkgDuration, setPkgDuration] = useState(60);
  const [packageTitle, setPackageTitle] = useState('');
  const [coachName, setCoachName] = useState('');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceData>>({});
  const [memberReports, setMemberReports] = useState<MemberReport[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [payDetailModal, setPayDetailModal] = useState(false);
  const [growthReports, setGrowthReports] = useState<GrowthReport[]>([]);
  const loadTokenRef = useRef(0);

  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const today = todayKST();
  const [selectedDate, setSelectedDate] = useState(dateParam ?? today);
  const now = new Date();
  const initDate = dateParam ? new Date(dateParam + 'T00:00:00') : now;
  const [calMonth, setCalMonth] = useState({ year: initDate.getFullYear(), month: initDate.getMonth() });

  useEffect(() => {
    if (dateParam) {
      setSelectedDate(dateParam);
      const d = new Date(dateParam + 'T00:00:00');
      setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [dateParam]);

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reportModal, setReportModal] = useState(false);

  async function loadData() {
    const token = ++loadTokenRef.current;
    setGrowthReports([]);
    const mem = await getMyMemberRow();
    if (token !== loadTokenRef.current) return; // stale — newer loadData already running
    if (!mem) { setLoading(false); return; }
    setMember(mem);

    if (mem.lesson_package_id) {
      const { data: pkg } = await supabase.from('lesson_packages').select('title, duration_minutes').eq('id', mem.lesson_package_id).maybeSingle();
      if (pkg) {
        setPackageTitle(pkg.title);
        if (pkg.duration_minutes) setPkgDuration(pkg.duration_minutes);
      }
    }

    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = toKSTDateStr(threeMonthsAgo);
    const { data: lmRows } = await supabase
      .from('lesson_members')
      .select('lesson_id')
      .eq('member_id', mem.id);
    const ids = (lmRows ?? []).map((r: { lesson_id: string }) => r.lesson_id).filter(Boolean);
    if (ids.length > 0) {
      const { data: ld } = await supabase
        .from('lessons')
        .select('id, date, start_time, end_time, title, notes, location')
        .in('id', ids)
        .gte('date', threeMonthsAgoStr)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });
      setLessons(ld ?? []);
    } else {
      setLessons([]);
    }

    const { data: pd } = await supabase.from('payments').select('*')
      .eq('member_id', mem.id).order('due_date', { ascending: false });
    setPayments(pd ?? []);

    const { data: coachProfile } = await supabase.from('coach_profiles').select('display_name').eq('coach_id', mem.coach_id).maybeSingle();
    if (coachProfile?.display_name) setCoachName(coachProfile.display_name);

    const { data: attendanceData } = await supabase.from('attendance').select('lesson_id, status, absence_reporter, absence_reported_at').eq('member_id', mem.id);
    const aMap: Record<string, AttendanceData> = {};
    (attendanceData ?? []).forEach((a: { lesson_id: string; status: string; absence_reporter?: string; absence_reported_at?: string }) => {
      aMap[a.lesson_id] = { status: a.status, absence_reporter: a.absence_reporter, absence_reported_at: a.absence_reported_at };
    });
    setAttendanceMap(aMap);

    const { data: reports } = await supabase.from('member_lesson_reports').select('lesson_date, improvement_points').eq('member_id', mem.id).eq('sent_to_member', true).not('improvement_points', 'is', null).order('lesson_date', { ascending: false });
    setMemberReports(reports ?? []);

    // lesson_id is not in member_lesson_plan_view — do not select it or PostgREST errors
    const { data: planData, error: planError } = await supabase
      .from('member_lesson_plan_view')
      .select('id, created_at, lesson_comparison, next_goals, achievements, improvement_points')
      .eq('member_id', mem.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (planError) {
      if (token !== loadTokenRef.current) return;
      setLoading(false);
      return;
    }

    // Old sent reports that predate the lesson_plan_id system
    const { data: oldSentReports } = await supabase
      .from('member_lesson_reports')
      .select('id, created_at, achievements, improvement_points')
      .eq('member_id', mem.id)
      .is('lesson_plan_id', null)
      .eq('sent_to_member', true)
      .order('created_at', { ascending: false });

    const planReports: GrowthReport[] = [];
    if (planData && planData.length > 0) {
      const planIds = planData.map((p: any) => p.id);
      const { data: sentReports } = await supabase
        .from('member_lesson_reports')
        .select('lesson_plan_id')
        .in('lesson_plan_id', planIds)
        .eq('sent_to_member', true);
      const sentIds = new Set((sentReports ?? []).map((r: any) => r.lesson_plan_id));
      planData
        .filter((p: any) => sentIds.has(p.id))
        .forEach((p: { id: string; created_at: string; lesson_comparison: unknown; next_goals: unknown; achievements: unknown; improvement_points: unknown }) => {
          planReports.push({
            plan_id: p.id,
            created_at: p.created_at,
            lesson_id: null,
            lesson_comparison: Array.isArray(p.lesson_comparison) ? p.lesson_comparison : null,
            next_goals_raw: (p.next_goals as string[] | string | null) ?? null,
            achievements: Array.isArray(p.achievements) ? p.achievements as string[] : null,
            improvement_points_raw: (p.improvement_points as string[] | string | null) ?? null,
          });
        });
    }

    const oldReports: GrowthReport[] = (oldSentReports ?? []).map((r: any) => ({
      plan_id: r.id,
      created_at: r.created_at,
      lesson_id: null,
      lesson_comparison: null,
      next_goals_raw: null,
      achievements: Array.isArray(r.achievements) ? r.achievements as string[] : null,
      improvement_points_raw: Array.isArray(r.improvement_points) ? r.improvement_points as string[] : null,
    }));

    const allReports = [...planReports, ...oldReports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (token !== loadTokenRef.current) return; // stale response — discard
    setGrowthReports(allReports);

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const mem = await getMyMemberRow();
      if (!mem) return;

      ch = supabase.channel('member_lesson_sync_' + mem.id)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'lesson_members',
          filter: `member_id=eq.${mem.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'lesson_members',
          filter: `member_id=eq.${mem.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'lessons',
          filter: `coach_id=eq.${mem.coach_id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'lessons',
          filter: `coach_id=eq.${mem.coach_id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'lesson_requests',
          filter: `member_id=eq.${mem.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `member_id=eq.${mem.id}`,
        }, () => loadData())
        .subscribe();
    })();

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  const lessonDateSet = new Set(lessons.map(l => l.date));
  const lessonStatusColorsMap: Record<string, string[]> = {};
  lessons.forEach(l => {
    const status = resolveLessonStatus(l, today, attendanceMap[l.id]);
    const color = ATTENDANCE_STATUS_CONFIG[status].dotColor;
    if (!lessonStatusColorsMap[l.date]) lessonStatusColorsMap[l.date] = [];
    lessonStatusColorsMap[l.date].push(color);
  });

  const monthlyLessonStats = useMemo(() => {
    const prefix = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}`;
    const monthLessons = lessons.filter(l => l.date.startsWith(prefix));
    let scheduled = 0, attended = 0, absent = 0, cancelled = 0;
    monthLessons.forEach(l => {
      const att = attendanceMap[l.id];
      const s = att?.status;
      if (!s) { scheduled++; return; }
      // Korean: 지각 제외
      if (s === '지각') return;
      if (s === '출석' || s === '조퇴') { attended++; return; }
      if (s === '결석') { if (att?.absence_reporter === 'member') scheduled++; else absent++; return; }
      if (s === '취소') { cancelled++; return; }
      // English
      if (s === 'attended' || s === 'completed') { attended++; return; }
      if (s === 'absent' || s === 'missed') { absent++; return; }
      if (s === 'cancelled' || s === 'canceled') { cancelled++; return; }
      if (s === 'pending') { scheduled++; return; }
      scheduled++;
    });
    return { scheduled, attended, absent, cancelled };
  }, [lessons, attendanceMap, calMonth]);

  const dayLessons = lessons.filter(l => l.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const totalCredits = member?.total_credits ?? 0;
  const remainingCredits = member?.remaining_credits ?? 0;
  const usedCredits = totalCredits - remainingCredits;
  const progress = totalCredits > 0 ? Math.min(usedCredits / totalCredits, 1) : 0;

  function getPrevGoal(lessonDate: string): string[] | null {
    const report = memberReports.find(r => r.lesson_date < lessonDate && r.improvement_points?.length);
    return report?.improvement_points ?? null;
  }
  const unpaid = payments.filter(p => p.status !== '납부완료');
  const totalUnpaid = unpaid.reduce((s, p) => s + (p.amount - p.paid_amount), 0);

  // 고정 스케줄 텍스트
  const fixedScheduleText = (() => {
    if (!member?.fixed_schedule_days?.length) return null;
    const times = member.fixed_schedule_times;
    return member.fixed_schedule_days.map(d => {
      const t = times?.[String(d)]?.[0] ?? member.fixed_schedule_time?.slice(0, 5) ?? '';
      return `${DAYS_KR[d]} ${t}`;
    }).join(' · ');
  })();

  // 가장 최근 완료된 레슨 (지난 레슨 목표)
  const lastPastLesson = lessons.find(l => l.date < today && l.notes);

  useEffect(() => {
    tabOpacity.setValue(0);
    tabTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(tabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(tabTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [tab]);

  const TABS: [MainTab, string][] = [
    ['schedule', '일정'],
    ['makeup', '보강 신청'],
    ['payment', '결제'],
    ['report', '성장 기록'],
  ];

  if (loading) return <ScheduleSkeleton />;

  return (
    <FadeInView>
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      {/* ── 상단 헤더 ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>레슨</Text>
        <TouchableOpacity style={s.headerIconBtn}>
          <Ionicons name="notifications-outline" size={22} color={TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>

      {/* ── 탭 바 ── */}
      <View style={s.tabRow}>
        {TABS.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.tabBtn, tab === key && s.tabBtnActive]}
            onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
            {key === 'payment' && unpaid.length > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unpaid.length}</Text></View>
            )}
            {tab === key && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

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
        <Animated.View style={{ opacity: tabOpacity, transform: [{ translateY: tabTranslateY }] }}>
        {/* ── 레슨권 요약 카드 (일정 탭) ── */}
        {tab === 'schedule' && member && (
          <View style={s.lessonSummaryCard}>
            <Text style={s.lessonSummaryTitle}>{packageTitle || '레슨권'}</Text>
            <View style={s.lessonSummaryRow}>
              <Text style={s.lessonRemaining}>{remainingCredits}회 남았어요</Text>
              <Text style={s.lessonCompletedText}>{usedCredits} / {totalCredits}회 사용</Text>
            </View>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            {fixedScheduleText && (
              <View style={s.scheduleRow}>
                <Ionicons name="time-outline" size={14} color={TERRA} />
                <Text style={s.scheduleText}>{fixedScheduleText}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── 일정 탭 ── */}
        {tab === 'schedule' && (
          <>
            <CalendarView
              year={calMonth.year} month={calMonth.month}
              selectedDate={selectedDate} lessonDates={lessonDateSet}
              lessonStatusColors={lessonStatusColorsMap}
              onSelectDate={(d) => {
                setSelectedDate(d);
                const dt = new Date(d + 'T00:00:00');
                setCalMonth({ year: dt.getFullYear(), month: dt.getMonth() });
              }}
              onTodayPress={() => {
                setSelectedDate(today);
                const now = new Date();
                setCalMonth({ year: now.getFullYear(), month: now.getMonth() });
              }}
              onPrevMonth={() => setCalMonth(p => {
                const newMonth = p.month === 0 ? 11 : p.month - 1;
                const newYear = p.month === 0 ? p.year - 1 : p.year;
                const prefix = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
                setSelectedDate(today.startsWith(prefix) ? today : `${prefix}-01`);
                return { year: newYear, month: newMonth };
              })}
              onNextMonth={() => setCalMonth(p => {
                const newMonth = p.month === 11 ? 0 : p.month + 1;
                const newYear = p.month === 11 ? p.year + 1 : p.year;
                const prefix = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
                setSelectedDate(today.startsWith(prefix) ? today : `${prefix}-01`);
                return { year: newYear, month: newMonth };
              })}
            />

            {/* 이번 달 레슨 현황 */}
            <MonthlyLessonSummaryCard
              year={calMonth.year}
              month={calMonth.month}
              stats={monthlyLessonStats}
            />

            {/* 선택 날짜 레슨 목록 */}
            <View style={s.daySection}>
              <Text style={s.daySectionTitle}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
                {dayLessons.length > 0 ? ` / 레슨 ${dayLessons.length}건` : ''}
              </Text>
              {dayLessons.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="calendar-outline" size={32} color={TEXT_MUTED} />
                  <Text style={s.emptyText}>이날은 예정된 레슨이 없어요</Text>
                </View>
              ) : (
                dayLessons.map(l => (
                  <ScheduleLessonCard
                    key={l.id}
                    lesson={l}
                    today={today}
                    coachName={coachName}
                    attendance={attendanceMap[l.id]}
                    prevGoalTexts={getPrevGoal(l.date) ?? undefined}
                    onPress={() => router.push({ pathname: '/lesson-detail', params: { id: l.id } })}
                  />
                ))
              )}
            </View>

          </>
        )}

        {/* ── 가능 시간 탭 ── */}
        {tab === 'makeup' && (
          <MakeupTab memberId={member?.id ?? null} coachId={member?.coach_id ?? null} lessonDuration={pkgDuration} />
        )}

        {/* ── 결제 탭 ── */}
        {tab === 'payment' && (
          <>
            {totalUnpaid > 0 && (
              <View style={[s.creditBanner, { backgroundColor: '#EF4444', margin: 20, marginBottom: 0 }]}>
                <Ionicons name="alert-circle" size={18} color="#fff" />
                <Text style={s.creditBannerText}>미납 금액 <Text style={{ fontWeight: '900' }}>{totalUnpaid.toLocaleString()}원</Text></Text>
              </View>
            )}
            <View style={s.section}>
              {/* 미납 내역 */}
              {unpaid.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>미납 내역</Text>
                  {unpaid.map(p => {
                    const dday = getDDay(p.due_date);
                    return (
                      <View key={p.id} style={[s.payCard, dday.urgent && s.payCardUrgent]}>
                        <View style={s.payCardTop}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <View style={s.unpaidStatusBadge}>
                                <Text style={s.unpaidStatusBadgeText}>{p.status}</Text>
                              </View>
                            </View>
                            <Text style={s.payDesc}>{p.description || '레슨비'}</Text>
                            <Text style={s.payDate}>납부기한: {formatDateDot(p.due_date)}</Text>
                          </View>
                          <View style={[s.ddayBadge, { backgroundColor: dday.urgent ? '#EF4444' : '#EAB308' }]}>
                            <Text style={s.ddayText}>{dday.label}</Text>
                          </View>
                        </View>
                        <View style={s.payCardBottom}>
                          <Text style={[s.payAmount, { color: '#EF4444' }]}>{(p.amount - p.paid_amount).toLocaleString()}원</Text>
                          <TouchableOpacity style={s.payNowBtn}
                            onPress={() => Alert.alert('결제 안내', `${(p.amount - p.paid_amount).toLocaleString()}원\n코치에게 연락해 결제해주세요.`)}>
                            <Ionicons name="card-outline" size={14} color="#fff" />
                            <Text style={s.payNowText}>결제하기</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {/* 결제 내역 (월별 그룹) */}
              {(() => {
                const paidPayments = payments.filter(p => p.status === '납부완료');
                if (paidPayments.length === 0 && unpaid.length === 0) {
                  return (
                    <View style={s.empty}>
                      <Ionicons name="receipt-outline" size={40} color={TEXT_MUTED} />
                      <Text style={s.emptyText}>아직 결제 내역이 없어요</Text>
                    </View>
                  );
                }
                if (paidPayments.length === 0) return null;
                const groups = groupPaymentsByMonth(paidPayments);
                return (
                  <>
                    <Text style={[s.sectionTitle, { marginTop: unpaid.length > 0 ? 16 : 0 }]}>결제 내역</Text>
                    {groups.map(group => (
                      <View key={group.month}>
                        <Text style={s.monthDivider}>{formatMonthLabel(group.month)}</Text>
                        {group.items.map(p => (
                          <TouchableOpacity
                            key={p.id}
                            style={s.payCardDone}
                            activeOpacity={0.7}
                            onPress={() => { setSelectedPayment(p); setPayDetailModal(true); }}
                          >
                            <View style={s.payCardHistoryRow}>
                              <View style={s.payCardHistoryLeft}>
                                <View style={s.paidBadge}>
                                  <Text style={s.paidBadgeText}>납부완료</Text>
                                </View>
                                <Text style={s.payDesc}>{p.description || '레슨비'}</Text>
                                <Text style={s.payDate}>결제일: {formatDateDot(p.paid_date ?? p.due_date)}</Text>
                              </View>
                              <Text style={s.payAmountRight}>{p.amount.toLocaleString()}원</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </>
                );
              })()}
            </View>
          </>
        )}

        {/* ── 성장 기록 탭 ── */}
        {tab === 'report' && (() => {
          const changeEvents = computeChangeEvents(growthReports);
          return (
            <View style={{ padding: 20, gap: 12 }}>
              <GrowthBalanceCard
                reports={growthReports}
                hasReports={growthReports.length > 0}
              />
              <RecentChangesCard
                changeEvents={changeEvents}
                reports={growthReports}
              />
              <InsightsCard reports={growthReports} />
            </View>
          );
        })()}

        <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>

      {/* ── 결제 상세 모달 ── */}
      <Modal visible={payDetailModal} transparent animationType="slide" onRequestClose={() => setPayDetailModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            {selectedPayment && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <Text style={[s.modalTitle, { flex: 1, marginRight: 8 }]}>{selectedPayment.description || '레슨비'}</Text>
                  <View style={s.paidBadge}>
                    <Text style={s.paidBadgeText}>납부완료</Text>
                  </View>
                </View>
                <View style={{ marginBottom: 24 }}>
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>결제일</Text>
                    <Text style={s.detailValue}>{formatDateDot(selectedPayment.paid_date ?? selectedPayment.due_date)}</Text>
                  </View>
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>결제 금액</Text>
                    <Text style={[s.detailValue, { fontWeight: '800', color: TEXT_PRIMARY }]}>{selectedPayment.amount.toLocaleString()}원</Text>
                  </View>
                  {selectedPayment.payment_method ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>결제 수단</Text>
                      <Text style={s.detailValue}>{selectedPayment.payment_method}</Text>
                    </View>
                  ) : null}
                  {selectedPayment.payment_channel ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>결제 방법</Text>
                      <Text style={s.detailValue}>{selectedPayment.payment_channel === 'online' ? '온라인' : '오프라인'}</Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setPayDetailModal(false)}>
              <Text style={s.modalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 레슨 상세 모달 ── */}
      <Modal visible={reportModal} transparent animationType="slide" onRequestClose={() => setReportModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            {selectedLesson && (
              <>
                <Text style={s.modalTitle}>{selectedLesson.title}</Text>
                <Text style={s.modalDate}>
                  {new Date(selectedLesson.date+'T00:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}
                  {'  '}{selectedLesson.start_time.slice(0,5)} ~ {selectedLesson.end_time.slice(0,5)}
                </Text>
                {selectedLesson.location && (
                  <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginBottom:12 }}>
                    <Ionicons name="location-outline" size={14} color={TEXT_MUTED} />
                    <Text style={{ fontSize:13, color:TEXT_MUTED }}>{selectedLesson.location}</Text>
                  </View>
                )}
                <View style={s.reportBox}>
                  <View style={s.reportBoxHeader}>
                    <Ionicons name="document-text-outline" size={16} color={TERRA} />
                    <Text style={s.reportBoxTitle}>코치 리포트</Text>
                  </View>
                  <Text style={s.reportBoxContent}>
                    {selectedLesson.notes || '아직 리포트가 작성되지 않았어요.\n다음 레슨 후 코치가 작성해드릴게요 🎾'}
                  </Text>
                </View>
              </>
            )}
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setReportModal(false)}>
              <Text style={s.modalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </FadeInView>
  );
}

function ScheduleLessonCard({ lesson, today, coachName, attendance, prevGoalTexts, onPress }: {
  lesson: Lesson; today: string; coachName?: string; attendance?: AttendanceData;
  prevGoalTexts?: string[]; onPress: () => void;
}) {
  const isPast = lesson.date < today;
  const resolvedStatus = resolveLessonStatus(lesson, today, attendance);
  const cfg = ATTENDANCE_STATUS_CONFIG[resolvedStatus];
  const statusLabel = cfg.label;
  const statusColor = cfg.text;
  const statusBg = cfg.bg;

  return (
    <TouchableOpacity style={s.scheduleLessonCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.lessonLeftBorder, { backgroundColor: isPast && resolvedStatus !== 'scheduled' ? DIVIDER : statusColor }]} />
      <View style={s.lessonContent}>
        <View style={s.lessonTopRow}>
          <View style={[s.lessonStatusBadge, { backgroundColor: statusBg }]}>
            <Text style={[s.lessonStatusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={s.lessonTimeText}>{lesson.start_time.slice(0,5)} ~ {lesson.end_time.slice(0,5)}</Text>
        </View>
        <Text style={[s.lessonTitleText, isPast && resolvedStatus === 'scheduled' && { color: TEXT_MUTED }]}>{lesson.title}</Text>
        {lesson.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Ionicons name="location-outline" size={12} color={TEXT_MUTED} />
            <Text style={s.lessonMetaText}>{lesson.location}</Text>
          </View>
        )}
        {coachName && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Ionicons name="person-outline" size={12} color={TEXT_MUTED} />
            <Text style={s.lessonMetaText}>{coachName} 코치</Text>
          </View>
        )}
        {prevGoalTexts?.length ? (
          <View style={s.inlineGoal}>
            <Text style={s.inlineGoalLabel}>지난 레슨에서 이어갈 목표</Text>
            {prevGoalTexts.slice(0, 2).map((g, i) => (
              <Text key={i} style={s.inlineGoalText} numberOfLines={2}>• {g}</Text>
            ))}
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} style={{ marginRight: 14 }} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // ── 헤더 ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    backgroundColor: BG,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  headerIconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  // ── 탭 바 ──
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    marginBottom: 0,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    position: 'relative', flexDirection: 'column', gap: 0,
  },
  tabBtnActive: {},
  tabText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: TERRA, fontWeight: '800' },
  tabBadge: {
    position: 'absolute', top: 6, right: 4,
    backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 8, right: 8,
    height: 2, backgroundColor: TERRA, borderRadius: 1,
  },

  // ── 레슨권 요약 카드 ──
  lessonSummaryCard: {
    backgroundColor: LESSON_CARD_BG,
    borderRadius: 20, marginHorizontal: 20, marginTop: 16,
    padding: 18,
  },
  lessonSummaryTitle: { fontSize: 13, fontWeight: '600', color: TERRA, marginBottom: 8 },
  lessonSummaryRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', marginBottom: 10,
  },
  lessonRemaining: { fontSize: 26, fontWeight: '900', color: TEXT_PRIMARY },
  lessonCompletedText: { fontSize: 13, color: TEXT_MUTED, paddingBottom: 4 },
  progressBar: {
    height: 6, backgroundColor: TERRA + '30', borderRadius: 3,
    overflow: 'hidden', marginBottom: 10,
  },
  progressFill: { height: '100%', backgroundColor: TERRA, borderRadius: 3 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scheduleText: { fontSize: 13, fontWeight: '600', color: TERRA },

  // ── 달력 아래 섹션 ──
  daySection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  daySectionTitle: { fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 12 },

  // ── 일정 레슨 카드 ──
  scheduleLessonCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_WHITE, borderRadius: 16,
    marginBottom: 10, overflow: 'hidden',
    ...Shadow.sm,
  },
  lessonLeftBorder: { width: 4, alignSelf: 'stretch' },
  lessonContent: { flex: 1, padding: 14 },
  lessonTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  lessonStatusBadge: {
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  lessonStatusText: { fontSize: 11, fontWeight: '700' },
  lessonTimeText: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  lessonTitleText: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  lessonMetaText: { fontSize: 12, color: TEXT_MUTED },
  lessonNotesPreview: { fontSize: 12, color: TEXT_MUTED, marginTop: 4 },
  inlineGoal: { backgroundColor: GOAL_BG, borderRadius: 8, padding: 8, marginTop: 8 },
  inlineGoalLabel: { fontSize: 10, fontWeight: '700', color: TERRA, marginBottom: 3 },
  inlineGoalText: { fontSize: 12, color: TEXT_PRIMARY, lineHeight: 16 },

  // ── 목표 카드 ──
  goalCard: {
    backgroundColor: GOAL_BG, borderRadius: 16,
    marginHorizontal: 20, marginTop: 4, marginBottom: 8,
    padding: 16,
  },
  goalLabel: { fontSize: 12, fontWeight: '700', color: TERRA, marginBottom: 6 },
  goalContent: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 20 },

  // ── 범례 ──
  legendRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: TEXT_MUTED },

  // ── 공통 섹션 ──
  section: { paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 12 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },

  // ── 보강 탭 upcoming 카드 ──
  upcomingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_WHITE, borderRadius: 14,
    marginBottom: 8, padding: 14, ...Shadow.sm, gap: 10,
  },
  upcomingInfo: { flex: 1 },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  upcomingDate: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── 결제 탭 ──
  creditBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: TERRA, margin: 20, marginBottom: 8,
    borderRadius: 14, padding: 14, gap: 8,
  },
  creditBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  creditBannerNum: { fontWeight: '900', fontSize: 17 },
  lowBadge: { backgroundColor: '#EAB308', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  lowBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  payCard: {
    backgroundColor: CARD_WHITE, borderRadius: 16,
    marginBottom: 10, padding: 16,
    borderWidth: 1.5, borderColor: DIVIDER, ...Shadow.sm,
  },
  payCardUrgent: { borderColor: '#EF4444', backgroundColor: '#fff5f5' },
  payCardDone: {
    backgroundColor: CARD_WHITE, borderRadius: 18,
    marginBottom: 8, padding: 16,
    borderWidth: 1, borderColor: DIVIDER, ...Shadow.sm,
  },
  payCardHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payCardHistoryLeft: { flex: 1, gap: 4 },
  paidBadge: { alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 2 },
  paidBadgeText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  unpaidStatusBadge: { alignSelf: 'flex-start', backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  unpaidStatusBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  payAmountRight: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY, alignSelf: 'center', marginLeft: 12 },
  monthDivider: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED, marginTop: 8, marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  detailLabel: { fontSize: 14, color: TEXT_MUTED },
  detailValue: { fontSize: 14, color: TEXT_PRIMARY },
  payCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  payCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payDesc: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 2 },
  payDate: { fontSize: 13, color: TEXT_MUTED },
  payAmount: { fontSize: 20, fontWeight: '900', color: TEXT_PRIMARY },
  payNowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: TERRA, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  payNowText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  ddayText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // ── 성장 기록 탭 ──
  reportCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_WHITE, borderRadius: 14,
    marginBottom: 8, padding: 14, ...Shadow.sm,
  },
  reportLeft: { alignItems: 'center', minWidth: 44, marginRight: 14 },
  reportDow: { fontSize: 12, fontWeight: '700', color: TERRA },
  reportDay: { fontSize: 20, fontWeight: '900', color: TEXT_PRIMARY },
  reportMon: { fontSize: 12, color: TEXT_MUTED },
  reportBody: { flex: 1 },
  reportTitle: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  reportTime: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  reportPreview: { fontSize: 13, color: TERRA, marginTop: 3 },
  reportStatus: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  reportStatusText: { fontSize: 12, fontWeight: '700' },

  // ── 모달 ──
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: CARD_WHITE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: DIVIDER,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 6 },
  modalDate: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16 },
  reportBox: { backgroundColor: '#F4F6F9', borderRadius: 14, padding: 14, marginBottom: 16 },
  reportBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reportBoxTitle: { fontSize: 13, fontWeight: '700', color: TERRA },
  reportBoxContent: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22 },
  modalCloseBtn: {
    backgroundColor: TERRA, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
