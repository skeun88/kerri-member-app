import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

type MainTab = 'schedule' | 'makeup' | 'payment' | 'report';

interface Lesson {
  id: string; date: string; start_time: string; end_time: string;
  title: string; report?: string; location?: string;
}
interface Payment {
  id: string; amount: number; paid_amount: number; due_date: string;
  paid_date?: string; status: string; description: string; payment_method?: string;
}
interface MemberInfo {
  id: string; name: string; remaining_credits: number; total_credits: number;
  fixed_schedule_days?: number[]; fixed_schedule_times?: Record<string, string[]>;
  fixed_schedule_time?: string; lesson_package_id?: string; coach_id: string;
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

          <MakeupTab memberId={member?.id ?? null} coachId={member?.coach_id ?? null} lessonDuration={member?.fixed_lesson_duration ?? 60} />
// ── 커스텀 달력 ──────────────────────────────────────────
function CalendarView({
  year, month, selectedDate, lessonDates,
  onSelectDate, onPrevMonth, onNextMonth,
}: {
  year: number; month: number; selectedDate: string;
  lessonDates: Set<string>;
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
          <Ionicons name="chevron-back" size={20} color={Colors.navy} />
        </TouchableOpacity>
        <Text style={cal.title}>{year}년 {MONTHS[month]}</Text>
        <TouchableOpacity onPress={onNextMonth} style={cal.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.navy} />
        </TouchableOpacity>
      </View>
      <View style={cal.dayRow}>
        {DAYS_KR.map((d, i) => (
          <Text key={i} style={[cal.dayLabel, i === 0 && { color: Colors.destructive }, i === 6 && { color: Colors.info }]}>{d}</Text>
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
          return (
            <TouchableOpacity key={i} style={cal.cell} onPress={() => onSelectDate(dateStr)}>
              <View style={[cal.dayCircle, isSelected && cal.dayCircleSelected, isToday && !isSelected && cal.dayCircleToday]}>
                <Text style={[
                  cal.dayNum,
                  dow === 0 && { color: Colors.destructive },
                  dow === 6 && { color: Colors.info },
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
  title: { fontSize: 16, fontWeight: '800', color: Colors.navy },
  dayRow: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: Colors.mutedFg, paddingVertical: 4 },
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
  const [packageTitle, setPackageTitle] = useState('');

  const today = todayKST();
  const [selectedDate, setSelectedDate] = useState(today);
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });

  // 레슨 상세 모달
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [reportModal, setReportModal] = useState(false);

  async function loadData() {
    const mem = await getMyMemberRow();
    if (!mem) { setLoading(false); return; }
    setMember(mem);

    // 패키지명
    if (mem.lesson_package_id) {
      const { data: pkg } = await supabase.from('lesson_packages').select('title').eq('id', mem.lesson_package_id).maybeSingle();
      if (pkg) setPackageTitle(pkg.title);
    }

    // 레슨 (3개월 전부터)
    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const { data: lm } = await supabase.from('lesson_members').select('lesson_id').eq('member_id', mem.id);
    const ids = (lm ?? []).map((l: any) => l.lesson_id);
    if (ids.length > 0) {
      const { data: ld } = await supabase.from('lessons').select('*')
        .in('id', ids).gte('date', toKSTDateStr(threeMonthsAgo))
        .order('date', { ascending: false }).order('start_time', { ascending: false });
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }} tintColor={Colors.navy} />}
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
            <View style={s.progressBtnRow}>
              <TouchableOpacity style={s.progressBtn}>
                <Text style={s.progressBtnText}>보강 신청</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.progressBtn, s.progressBtnOutline]}>
                <Text style={[s.progressBtnText, { color: Colors.navy }]}>일정 변경 요청</Text>
              </TouchableOpacity>
            </View>
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

        {/* ── 보강 탭 ── */}
        {tab === 'makeup' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>보강 가능 시간</Text>
            <MakeupTab memberId={member?.id ?? null} coachId={member?.coach_id ?? null} lessonDuration={member?.fixed_lesson_duration ?? 60} />
          </View>
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
                    <View style={[s.statusBadge, { backgroundColor: Colors.successLight ?? '#e6f9f0' }]}>
                      <Text style={[s.statusText, { color: Colors.success }]}>납부완료</Text>
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
                    {l.report ? (
                      <Text style={s.reportPreview} numberOfLines={1}>📋 {l.report}</Text>
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
                    {selectedLesson.report || '아직 리포트가 작성되지 않았어요.\n다음 레슨 후 코치가 작성해드릴게요 🎾'}
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
        {lesson.report && <Text style={[s.lessonTime, { color: Colors.primary, marginTop:3 }]} numberOfLines={1}>📋 {lesson.report}</Text>}
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
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.mutedFg },
  tabTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: Colors.destructive, borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  progressCard: { backgroundColor: '#fff', borderRadius: Radius.xl, margin: 16, marginBottom: 0, padding: 16, ...Shadow.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '800', color: Colors.navy },
  progressSub: { fontSize: 12, color: Colors.mutedFg, marginTop: 2 },
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
  legendText: { fontSize: 12, color: Colors.mutedFg },

  section: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.navy, marginBottom: 12 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.placeholder, textAlign: 'center' },

  lessonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm },
  lessonCardPast: { backgroundColor: Colors.mutedBg },
  lessonDateBox: { borderRadius: Radius.md, padding: 10, alignItems: 'center', marginRight: 14, minWidth: 48 },
  lessonDow: { fontSize: 10, fontWeight: '700' },
  lessonDay: { fontSize: 20, fontWeight: '900', color: Colors.navy },
  lessonMon: { fontSize: 10, color: Colors.mutedFg },
  lessonBody: { flex: 1 },
  lessonTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy, flex: 1 },
  lessonTime: { fontSize: 12, color: Colors.mutedFg },
  todayBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  upcomingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm, gap: 10 },
  upcomingBar: { width: 4, height: 40, borderRadius: 2, backgroundColor: Colors.primary },
  upcomingInfo: { flex: 1 },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  upcomingDate: { fontSize: 12, color: Colors.mutedFg, marginTop: 2 },

  creditBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navy, margin: 16, marginBottom: 8, borderRadius: Radius.lg, padding: 14, gap: 8 },
  creditBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  creditBannerNum: { fontWeight: '900', fontSize: 17 },
  lowBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  lowBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  payCard: { backgroundColor: '#fff', borderRadius: Radius.xl, marginBottom: 10, padding: 16, borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm },
  payCardUrgent: { borderColor: Colors.destructive, backgroundColor: '#fff5f5' },
  payCardDone: { backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, borderWidth: 1, borderColor: Colors.border },
  payCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  payCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payDesc: { fontSize: 15, fontWeight: '700', color: Colors.navy, marginBottom: 2 },
  payDate: { fontSize: 12, color: Colors.mutedFg },
  payAmount: { fontSize: 20, fontWeight: '900', color: Colors.navy },
  payNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 9 },
  payNowText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  ddayText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },

  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.lg, marginBottom: 8, padding: 14, ...Shadow.sm },
  reportLeft: { alignItems: 'center', minWidth: 44, marginRight: 14 },
  reportDow: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  reportDay: { fontSize: 20, fontWeight: '900', color: Colors.navy },
  reportMon: { fontSize: 10, color: Colors.mutedFg },
  reportBody: { flex: 1 },
  reportTitle: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  reportTime: { fontSize: 12, color: Colors.mutedFg, marginTop: 1 },
  reportPreview: { fontSize: 12, color: Colors.primary, marginTop: 3 },
  reportStatus: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  reportStatusText: { fontSize: 11, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.navy, marginBottom: 6 },
  modalDate: { fontSize: 13, color: Colors.mutedFg, marginBottom: 16 },
  reportBox: { backgroundColor: Colors.mutedBg, borderRadius: Radius.lg, padding: 14, marginBottom: 16 },
  reportBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reportBoxTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  reportBoxContent: { fontSize: 14, color: Colors.foreground, lineHeight: 22 },
  modalCloseBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
