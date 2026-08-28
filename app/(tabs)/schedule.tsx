import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, ActivityIndicator, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

type MainTab = 'schedule' | 'makeup' | 'payment' | 'report';

interface Lesson {
  id: string; date: string; start_time: string; end_time: string;
  title: string; notes?: string; location?: string;
}
interface Payment {
  id: string; amount: number; paid_amount: number; due_date: string;
  paid_date?: string; status: string; description: string; payment_method?: string;
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

  const todayStr = todayKST();

  useEffect(() => {
    if (!coachId) return;
    loadBusy();
    loadMyRequests();
  }, [coachId, calMonth.year, calMonth.month]);

  // lesson_requests 상태업데이트 Realtime 구독 (수낙/거절 즉시 반영)
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

    // 코치 가용 시간 로드
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
    setBusySlots((data ?? []).map((l: any) => ({
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
    const { error } = await supabase.from('lesson_requests').insert({
      coach_id: coachId, member_id: memberId,
      requested_date: selectedDate,
      start_time: bookingSlot + ':00',
      end_time: mStr(endMin) + ':00',
      message: bookingMsg.trim() || null,
      status: 'pending',
    });
    setSending(false);
    if (error) { Alert.alert('오류', '예약 요청 실패'); return; }
    setBookingModal(false);
    setBookingSlot(null);
    setBookingMsg('');
    Alert.alert('완료', '코치님께 레슨 예약 요청을 보냈어요! 🎾');
    loadMyRequests();
  }

  const busyDateSet = new Set(busySlots.map(s => s.date));

  return (
    <View>
      <CalendarView
        year={calMonth.year} month={calMonth.month}
        selectedDate={selectedDate ?? ''}
        lessonDates={busyDateSet}
        unavailableDows={coachAvailability ? Array.from({ length: 7 }, (_, i) => i).filter(d => !coachAvailability.days.includes(d)) : undefined}
        onSelectDate={handleDateSelect}
        onPrevMonth={() => setCalMonth(p => {
          const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
        })}
        onNextMonth={() => setCalMonth(p => {
          const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
        })}
      />

      <View style={s.legendRow}>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#aaa' }]} /><Text style={s.legendText}>예약됨</Text></View>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: Colors.primary }]} /><Text style={s.legendText}>예약 가능</Text></View>
      </View>

      {loadingSlots && <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />}

      {selectedDate && !loadingSlots && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            {new Date(selectedDate+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})} 가능한 시간
          </Text>
          {availableSlots.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="time-outline" size={32} color={Colors.iconMuted} />
              <Text style={s.emptyText}>이 날은 빈 시간이 없어요</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availableSlots.map(slot => (
                <TouchableOpacity key={slot}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.primary + '18', borderWidth: 1, borderColor: Colors.primary }}
                  onPress={() => { setBookingSlot(slot); setBookingModal(true); }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>{slot}</Text>
                  <Text style={{ fontSize: 12, color: Colors.primary + 'aa', marginTop: 1 }}>{lessonDuration}분</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {myRequests.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>내 예약 요청</Text>
          {myRequests.slice(0, 5).map(req => (
            <View key={req.id} style={[s.upcomingCard, {
              borderLeftWidth: 4,
              borderLeftColor: req.status === 'pending' ? Colors.warning : req.status === 'accepted' ? Colors.primary : Colors.destructive,
            }]}>
              <View style={s.upcomingInfo}>
                <Text style={s.upcomingTitle}>{req.requested_date} {req.start_time.slice(0,5)}</Text>
                <Text style={s.upcomingDate}>{
                  req.status === 'pending' ? '⏳ 코치 확인 중' :
                  req.status === 'accepted' ? '✅ 수락됨' : '❌ 거절됨'
                }</Text>
                {req.status === 'rejected' && req.reject_message ? (
                  <Text style={{ fontSize: 14, color: Colors.destructive, marginTop: 4, lineHeight: 16 }}>
                    💬 {req.reject_message}
                  </Text>
                ) : null}
              </View>
              <View style={[s.todayBadge, {
                backgroundColor: req.status === 'pending' ? Colors.warning : req.status === 'accepted' ? Colors.primary : Colors.destructive
              }]}>
                <Text style={s.todayText}>{
                  req.status === 'pending' ? '대기' : req.status === 'accepted' ? '수락' : '거절'
                }</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={bookingModal} transparent animationType="slide" onRequestClose={() => setBookingModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>레슨 예약 요청</Text>
            <Text style={s.modalDate}>
              {selectedDate && new Date(selectedDate+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'})}
              {'  '}{bookingSlot} ({lessonDuration}분)
            </Text>
            <Text style={[s.sectionTitle, { fontSize: 13, marginBottom: 6 }]}>전달 메시지 (선택)</Text>
            <TextInput
              style={{ backgroundColor: Colors.mutedBg, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.foreground, minHeight: 80, marginBottom: 16, textAlignVertical: 'top', borderWidth: 1, borderColor: Colors.border }}
              placeholder="코치님께 전달할 내용"
              placeholderTextColor={Colors.placeholder}
              value={bookingMsg}
              onChangeText={setBookingMsg}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.modalCloseBtn, { flex: 1, backgroundColor: Colors.mutedBg }]} onPress={() => setBookingModal(false)}>
                <Text style={[s.modalCloseBtnText, { color: Colors.primary }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalCloseBtn, { flex: 1 }]} onPress={submitRequest} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.modalCloseBtnText}>예약 요청</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── 커스텀 달력 ──────────────────────────────────────────
function CalendarView({
  year, month, selectedDate, lessonDates, unavailableDows,
  onSelectDate, onPrevMonth, onNextMonth,
}: {
  year: number; month: number; selectedDate: string;
  lessonDates: Set<string>;
  unavailableDows?: number[];
  onSelectDate: (d: string) => void;
  onPrevMonth: () => void; onNextMonth: () => void;
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
        <TouchableOpacity onPress={onPrevMonth} style={cal.navBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={cal.title}>{year}년 {MONTHS[month]}</Text>
        <TouchableOpacity onPress={onNextMonth} style={cal.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={cal.dayRow}>
        {DAYS_KR.map((d, i) => (
          <Text key={i} style={[cal.dayLabel, i === 0 && { color: Colors.destructive }, i === 6 && { color: Colors.accentWarm }]}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={cal.cell} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const hasLesson = lessonDates.has(dateStr);
          const dow = i % 7;
          const isUnavailable = unavailableDows ? unavailableDows.includes(dow) : false;
          return (
            <TouchableOpacity key={i} style={[cal.cell, isUnavailable && { opacity: 0.3 }]} onPress={() => onSelectDate(dateStr)}>
              <View style={[cal.dayCircle, isSelected && cal.dayCircleSelected, isToday && !isSelected && cal.dayCircleToday]}>
                <Text style={[
                  cal.dayNum,
                  dow === 0 && { color: Colors.destructive },
                  dow === 6 && { color: Colors.accentWarm },
                  isSelected && { color: '#fff' },
                  isToday && !isSelected && { color: Colors.primary, fontWeight: '800' },
                ]}>{day}</Text>
              </View>
              {hasLesson && <View style={[cal.dot, isSelected && { backgroundColor: '#fff' }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: Radius.xl, marginHorizontal: 16, marginTop: 12, padding: 16, ...Shadow.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  dayRow: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: Colors.mutedFg, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  dayCircleSelected: { backgroundColor: Colors.primary },
  dayCircleToday: { backgroundColor: Colors.primary + '18' },
  dayNum: { fontSize: 14, color: Colors.foreground },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 1 },
});

// ── 메인 ──────────────────────────────────────────────────
export default function ScheduleScreen() {
  const [tab, setTab] = useState<MainTab>('schedule');
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pkgDuration, setPkgDuration] = useState(60);
  const [packageTitle, setPackageTitle] = useState('');

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

  // 레슨 상세 모달
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reportModal, setReportModal] = useState(false);

  async function loadData() {
    const mem = await getMyMemberRow();
    if (!mem) { setLoading(false); return; }
    setMember(mem);

    // 패키지 정보 (duration + title)
    if (mem.lesson_package_id) {
      const { data: pkg } = await supabase.from('lesson_packages').select('title, duration_minutes').eq('id', mem.lesson_package_id).maybeSingle();
      if (pkg) {
        setPackageTitle(pkg.title);
        if (pkg.duration_minutes) setPkgDuration(pkg.duration_minutes);
      }
    }

    // 레슨 (3개월 전부터) - lesson_id 목록 조회 후 lessons 별도 쿼리
    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = toKSTDateStr(threeMonthsAgo);
    const { data: lmRows } = await supabase
      .from('lesson_members')
      .select('lesson_id')
      .eq('member_id', mem.id);
    const ids = (lmRows ?? []).map((r: any) => r.lesson_id).filter(Boolean);
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

    // 결제
    const { data: pd } = await supabase.from('payments').select('*')
      .eq('member_id', mem.id).order('due_date', { ascending: false });
    setPayments(pd ?? []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // ── Realtime 구독: 코치가 레슨 생성/수정/삭제하면 즉시 반영 ──────────
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const mem = await getMyMemberRow();
      if (!mem) return;

      ch = supabase.channel('member_lesson_sync_' + mem.id)
        // 1) lesson_members INSERT/DELETE → 내 레슨 목록 변경
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
        // 2) lessons UPDATE/DELETE (코치 소유) → 시간·정보 변경
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
        // 3) lesson_requests 상태 변경 → MakeupTab 즉시 반영
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'lesson_requests',
          filter: `member_id=eq.${mem.id}`,
        }, () => loadData())
        .subscribe();
    })();

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  const lessonDateSet = new Set(lessons.map(l => l.date));
  const dayLessons = lessons.filter(l => l.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const upcomingLessons = lessons.filter(l => l.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 5);
  const completedCount = lessons.filter(l => l.date < today).length;
  const totalCredits = member?.total_credits ?? 0;
  const progress = totalCredits > 0 ? Math.min(completedCount / totalCredits, 1) : 0;
  const unpaid = payments.filter(p => p.status !== '납부완료');
  const totalUnpaid = unpaid.reduce((s, p) => s + (p.amount - p.paid_amount), 0);

  // 고정 스케줄 텍스트
  const fixedScheduleText = (() => {
    if (!member?.fixed_schedule_days?.length) return null;
    const times = member.fixed_schedule_times;
    return member.fixed_schedule_days.map(d => {
      const t = times?.[String(d)]?.[0] ?? member.fixed_schedule_time?.slice(0, 5) ?? '';
      return `${DAYS_KR[d]}요일 ${t}`;
    }).join(' · ');
  })();

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>;
  }

  return (
    <View style={s.container}>
      {/* 탭 */}
      <View style={s.tabRow}>
        {([['schedule','일정'],['makeup','레슨 가능 시간'],['payment','결제'],['report','성장리포트']] as [MainTab,string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.tabBtn, tab === key && s.tabBtnActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]} numberOfLines={1}>{label}</Text>
            {key === 'payment' && unpaid.length > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unpaid.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }} tintColor={Colors.primary} />}
      >
        {/* ── 레슨 진행률 카드 (일정·보강 탭에서 표시) ── */}
        {(tab === 'schedule' || tab === 'makeup') && member && (
          <View style={s.progressCard}>
            <View style={s.progressTop}>
              <View>
                <Text style={s.progressTitle}>레슨 진행률</Text>
                <Text style={s.progressSub}>{packageTitle || '레슨권'}</Text>
              </View>
              <Text style={s.progressCount}>{completedCount}/{totalCredits}회 완료</Text>
            </View>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            {fixedScheduleText && (
              <View style={s.scheduleChips}>
                <Ionicons name="time-outline" size={14} color={Colors.mutedFg} />
                <Text style={s.scheduleChipText}>{fixedScheduleText}</Text>
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
              onSelectDate={setSelectedDate}
              onPrevMonth={() => setCalMonth(p => {
                const m = p.month - 1; return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
              })}
              onNextMonth={() => setCalMonth(p => {
                const m = p.month + 1; return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
              })}
            />

            {/* 범례 */}
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: Colors.primary }]} /><Text style={s.legendText}>레슨</Text></View>
            </View>

            {/* 선택한 날짜 레슨 */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} 레슨
              </Text>
              {dayLessons.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="calendar-outline" size={32} color={Colors.iconMuted} />
                  <Text style={s.emptyText}>이 날엔 레슨이 없어요</Text>
                </View>
              ) : (
                dayLessons.map(l => <LessonCard key={l.id} lesson={l} today={today}
                  onPress={() => { setSelectedLesson(l); setReportModal(true); }} />)
              )}
            </View>

            {/* 다가오는 일정 */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>다가오는 레슨</Text>
              {upcomingLessons.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyText}>예정된 레슨이 없어요</Text>
                </View>
              ) : (
                upcomingLessons.map(l => (
                  <TouchableOpacity key={l.id} style={s.upcomingCard}
                    onPress={() => { setSelectedDate(l.date); setCalMonth({ year: parseInt(l.date.slice(0,4)), month: parseInt(l.date.slice(5,7)) - 1 }); }}>
                    <View style={s.upcomingBar} />
                    <View style={s.upcomingInfo}>
                      <Text style={s.upcomingTitle}>{l.title}</Text>
                      <Text style={s.upcomingDate}>
                        {new Date(l.date+'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})} · {l.start_time.slice(0,5)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={Colors.iconMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        {/* ── 레슨 가능 시간 탭 ── */}
        {tab === 'makeup' && (
          <MakeupTab memberId={member?.id ?? null} coachId={member?.coach_id ?? null} lessonDuration={pkgDuration} />
        )}

        {/* ── 결제 탭 ── */}
        {tab === 'payment' && (
          <>
            {member && (
              <View style={s.creditBanner}>
                <Ionicons name="layers-outline" size={18} color="#fff" />
                <Text style={s.creditBannerText}>잔여 레슨 <Text style={s.creditBannerNum}>{member.remaining_credits}회</Text></Text>
                {member.remaining_credits <= 3 && <View style={s.lowBadge}><Text style={s.lowBadgeText}>잔여 적음</Text></View>}
              </View>
            )}
            {totalUnpaid > 0 && (
              <View style={[s.creditBanner, { backgroundColor: Colors.destructive, margin: 16, marginTop: 0 }]}>
                <Ionicons name="alert-circle" size={18} color="#fff" />
                <Text style={s.creditBannerText}>미납 금액 <Text style={{ fontWeight: '900' }}>{totalUnpaid.toLocaleString()}원</Text></Text>
              </View>
            )}
            <View style={s.section}>
              {unpaid.map(p => {
                const dday = getDDay(p.due_date);
                return (
                  <View key={p.id} style={[s.payCard, dday.urgent && s.payCardUrgent]}>
                    <View style={s.payCardTop}>
                      <View>
                        <Text style={s.payDesc}>{p.description || '레슨비'}</Text>
                        <Text style={s.payDate}>납부기한: {p.due_date}</Text>
                      </View>
                      <View style={[s.ddayBadge, { backgroundColor: dday.urgent ? Colors.destructive : Colors.warning }]}>
                        <Text style={s.ddayText}>{dday.label}</Text>
                      </View>
                    </View>
                    <View style={s.payCardBottom}>
                      <Text style={[s.payAmount, { color: Colors.destructive }]}>{(p.amount - p.paid_amount).toLocaleString()}원</Text>
                      <TouchableOpacity style={s.payNowBtn}
                        onPress={() => Alert.alert('결제 안내', `${(p.amount - p.paid_amount).toLocaleString()}원\n코치에게 연락해 결제해주세요.`)}>
                        <Ionicons name="card-outline" size={14} color="#fff" />
                        <Text style={s.payNowText}>결제하기</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {payments.filter(p => p.status === '납부완료').map(p => (
                <View key={p.id} style={s.payCardDone}>
                  <View style={s.payCardTop}>
                    <View>
                      <Text style={s.payDesc}>{p.description || '레슨비'}</Text>
                      <Text style={s.payDate}>납부일: {(p as any).paid_date ?? p.due_date}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: Colors.primaryLight ?? '#e6f9f0' }]}>
                      <Text style={[s.statusText, { color: Colors.primary }]}>납부완료</Text>
                    </View>
                  </View>
                  <Text style={s.payAmount}>{p.amount.toLocaleString()}원</Text>
                </View>
              ))}
              {payments.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="card-outline" size={40} color={Colors.iconMuted} />
                  <Text style={s.emptyText}>결제 내역이 없어요</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── 성장 리포트 탭 ── */}
        {tab === 'report' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>레슨 기록</Text>
            {lessons.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="document-text-outline" size={40} color={Colors.iconMuted} />
                <Text style={s.emptyText}>레슨 기록이 없어요</Text>
              </View>
            ) : (
              lessons.sort((a,b) => b.date.localeCompare(a.date)).map(l => (
                <TouchableOpacity key={l.id} style={s.reportCard}
                  onPress={() => { setSelectedLesson(l); setReportModal(true); }}>
                  <View style={s.reportLeft}>
                    <Text style={s.reportDow}>{DAYS_KR[new Date(l.date+'T00:00:00').getDay()]}</Text>
                    <Text style={s.reportDay}>{new Date(l.date+'T00:00:00').getDate()}</Text>
                    <Text style={s.reportMon}>{new Date(l.date+'T00:00:00').getMonth()+1}월</Text>
                  </View>
                  <View style={s.reportBody}>
                    <Text style={s.reportTitle}>{l.title}</Text>
                    <Text style={s.reportTime}>{l.start_time.slice(0,5)} ~ {l.end_time.slice(0,5)}</Text>
                    {l.notes ? (
                      <Text style={s.reportPreview} numberOfLines={1}>📋 {l.notes}</Text>
                    ) : (
                      <Text style={[s.reportPreview, { color: Colors.placeholder }]}>리포트 없음</Text>
                    )}
                  </View>
                  <View style={[s.reportStatus, { backgroundColor: l.date < today ? Colors.mutedBg : Colors.primary + '15' }]}>
                    <Text style={[s.reportStatusText, { color: l.date < today ? Colors.mutedFg : Colors.primary }]}>
                      {l.date < today ? '완료' : l.date === today ? '오늘' : '예정'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* 레슨 상세 모달 */}
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
                    <Ionicons name="location-outline" size={14} color={Colors.mutedFg} />
                    <Text style={{ fontSize:13, color:Colors.mutedFg }}>{selectedLesson.location}</Text>
                  </View>
                )}
                <View style={s.reportBox}>
                  <View style={s.reportBoxHeader}>
                    <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
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
    </View>
  );
}

function LessonCard({ lesson, today, onPress }: { lesson: Lesson; today: string; onPress: () => void }) {
  const d = new Date(lesson.date + 'T00:00:00');
  const isPast = lesson.date < today;
  const isToday = lesson.date === today;
  return (
    <TouchableOpacity style={[s.lessonCard, isPast && s.lessonCardPast]} onPress={onPress}>
      <View style={[s.lessonDateBox, { backgroundColor: isPast ? Colors.mutedBg : Colors.primary + '15' }]}>
        <Text style={[s.lessonDow, { color: isPast ? Colors.mutedFg : Colors.primary }]}>{DAYS_KR[d.getDay()]}</Text>
        <Text style={[s.lessonDay, isPast && { color: Colors.mutedFg }]}>{d.getDate()}</Text>
        <Text style={s.lessonMon}>{d.getMonth()+1}월</Text>
      </View>
      <View style={s.lessonBody}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:3 }}>
          <Text style={[s.lessonTitle, isPast && { color: Colors.mutedFg }]}>{lesson.title}</Text>
          {isToday && <View style={s.todayBadge}><Text style={s.todayText}>오늘</Text></View>}
          {isPast && <View style={[s.todayBadge, { backgroundColor: Colors.mutedBg }]}><Text style={[s.todayText, { color: Colors.mutedFg }]}>완료</Text></View>}
        </View>
        <Text style={s.lessonTime}>{lesson.start_time.slice(0,5)} ~ {lesson.end_time.slice(0,5)}</Text>
        {lesson.notes && <Text style={[s.lessonTime, { color: Colors.primary, marginTop:3 }]} numberOfLines={1}>📋 {lesson.notes}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={15} color={Colors.placeholder} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.md, alignItems: 'center', backgroundColor: Colors.mutedBg, flexDirection:'row', justifyContent:'center', gap:4 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.mutedFg },
  tabTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: Colors.destructive, borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  progressCard: { backgroundColor: '#fff', borderRadius: Radius.xl, margin: 16, marginBottom: 0, padding: 16, ...Shadow.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  progressSub: { fontSize: 14, color: Colors.mutedFg, marginTop: 2 },
  progressCount: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  progressBar: { height: 8, backgroundColor: Colors.mutedBg, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  scheduleChips: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.mutedBg, borderRadius: 8, padding: 8, marginBottom: 10 },
  scheduleChipText: { fontSize: 13, color: Colors.mutedFg },
  progressBtnRow: { flexDirection: 'row', gap: 8 },
  progressBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  progressBtnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border },
  progressBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  legendRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 14, color: Colors.mutedFg },

  section: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginBottom: 12 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.placeholder, textAlign: 'center' },

  lessonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm },
  lessonCardPast: { backgroundColor: Colors.mutedBg },
  lessonDateBox: { borderRadius: Radius.md, padding: 10, alignItems: 'center', marginRight: 14, minWidth: 48 },
  lessonDow: { fontSize: 12, fontWeight: '700' },
  lessonDay: { fontSize: 20, fontWeight: '900', color: Colors.primary },
  lessonMon: { fontSize: 12, color: Colors.mutedFg },
  lessonBody: { flex: 1 },
  lessonTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary, flex: 1 },
  lessonTime: { fontSize: 14, color: Colors.mutedFg },
  todayBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  upcomingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm, gap: 10 },
  upcomingBar: { width: 4, height: 40, borderRadius: 2, backgroundColor: Colors.primary },
  upcomingInfo: { flex: 1 },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  upcomingDate: { fontSize: 14, color: Colors.mutedFg, marginTop: 2 },

  creditBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, margin: 16, marginBottom: 8, borderRadius: Radius.lg, padding: 14, gap: 8 },
  creditBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  creditBannerNum: { fontWeight: '900', fontSize: 17 },
  lowBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  lowBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  payCard: { backgroundColor: '#fff', borderRadius: Radius.xl, marginBottom: 10, padding: 16, borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm },
  payCardUrgent: { borderColor: Colors.destructive, backgroundColor: '#fff5f5' },
  payCardDone: { backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, borderWidth: 1, borderColor: Colors.border },
  payCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  payCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payDesc: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  payDate: { fontSize: 14, color: Colors.mutedFg },
  payAmount: { fontSize: 20, fontWeight: '900', color: Colors.primary },
  payNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 9 },
  payNowText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  ddayText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm },
  reportLeft: { alignItems: 'center', minWidth: 44, marginRight: 14 },
  reportDow: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  reportDay: { fontSize: 20, fontWeight: '900', color: Colors.primary },
  reportMon: { fontSize: 12, color: Colors.mutedFg },
  reportBody: { flex: 1 },
  reportTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  reportTime: { fontSize: 14, color: Colors.mutedFg, marginTop: 1 },
  reportPreview: { fontSize: 14, color: Colors.primary, marginTop: 3 },
  reportStatus: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  reportStatusText: { fontSize: 13, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginBottom: 6 },
  modalDate: { fontSize: 13, color: Colors.mutedFg, marginBottom: 16 },
  reportBox: { backgroundColor: Colors.mutedBg, borderRadius: Radius.lg, padding: 14, marginBottom: 16 },
  reportBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reportBoxTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  reportBoxContent: { fontSize: 14, color: Colors.foreground, lineHeight: 22 },
  modalCloseBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
