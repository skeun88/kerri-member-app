import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { Radius, Shadow } from '../lib/theme';

const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const LESSON_CARD_BG = '#F4E5DC';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

type LessonAttendanceStatus = 'scheduled' | 'attended' | 'absent' | 'cancelled' | 'pending';

const ABSENCE_REASONS = ['개인 사정', '몸이 좋지 않아요', '일정이 생겼어요', '기타'];

function resolveAttendanceStatus(
  attendanceStatus: string | null,
  absenceReporter: string | null,
): LessonAttendanceStatus {
  if (!attendanceStatus) return 'scheduled';
  if (attendanceStatus === '출석' || attendanceStatus === '지각' || attendanceStatus === '조퇴') return 'attended';
  if (attendanceStatus === '결석') {
    if (absenceReporter === 'member') return 'pending';
    return 'absent';
  }
  if (attendanceStatus === '취소' || attendanceStatus === 'cancelled' || attendanceStatus === 'canceled') return 'cancelled';
  return 'scheduled';
}

const STATUS_CONFIG: Record<LessonAttendanceStatus, { bg: string; text: string; label: string }> = {
  scheduled: { bg: '#FBF2EF', text: TERRA, label: '예정' },
  attended:  { bg: '#E8F5E9', text: '#2E7D32', label: '출석' },
  absent:    { bg: '#FFEBEE', text: '#C62828', label: '결석' },
  cancelled: { bg: '#F5F5F5', text: '#9E9E9E', label: '취소' },
  pending:   { bg: '#FFF3E0', text: '#F57C00', label: '확인 대기' },
};

function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
function todayKST() { return toKSTDateStr(new Date()); }

interface LessonData {
  id: string; date: string; start_time: string; end_time: string;
  title: string; location?: string; notes?: string; coach_id?: string;
}

interface AttendanceRow {
  status: string | null;
  absence_reason: string | null;
  absence_reporter: string | null;
  absence_reported_at: string | null;
}

interface SentReport {
  lesson_date: string;
  summary?: string;
  improvement_points?: string[];
  achievements?: string[];
}

export default function LessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const today = todayKST();

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [coachId, setCoachId] = useState<string>('');
  const [memberName, setMemberName] = useState<string>('');
  const [attendanceRow, setAttendanceRow] = useState<AttendanceRow | null>(null);
  const [coachName, setCoachName] = useState('');
  const [sentReport, setSentReport] = useState<SentReport | null>(null);
  const [prevGoals, setPrevGoals] = useState<string[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [absenceModal, setAbsenceModal] = useState(false);
  const [absenceReason, setAbsenceReason] = useState<string>('');
  const [reportingAbsence, setReportingAbsence] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const mem = await getMyMemberRow();
    if (!mem) { setLoading(false); return; }
    setMemberId(mem.id);
    setCoachId(mem.coach_id);
    setMemberName(mem.name ?? '');

    const [lessonRes, attendanceRes, coachRes, reportsRes] = await Promise.all([
      supabase.from('lessons').select('id, date, start_time, end_time, title, location, notes, coach_id').eq('id', id).maybeSingle(),
      supabase.from('attendance').select('status, absence_reason, absence_reporter, absence_reported_at').eq('lesson_id', id).eq('member_id', mem.id).maybeSingle(),
      supabase.from('coach_profiles').select('display_name').eq('coach_id', mem.coach_id).maybeSingle(),
      supabase.from('member_lesson_reports')
        .select('lesson_date, summary, improvement_points, achievements')
        .eq('member_id', mem.id)
        .eq('sent_to_member', true)
        .order('lesson_date', { ascending: false })
        .limit(20),
    ]);

    const lessonData = lessonRes.data as LessonData | null;
    setLesson(lessonData);
    setAttendanceRow(attendanceRes.data as AttendanceRow | null);
    setCoachName(coachRes.data?.display_name ?? '');

    if (lessonData && reportsRes.data) {
      const lessonDate = lessonData.date;
      const reports = reportsRes.data as SentReport[];
      const thisReport = reports.find(r => r.lesson_date === lessonDate);
      if (thisReport) setSentReport(thisReport);

      const prevReport = reports.find(r =>
        r.lesson_date < lessonDate && (r.improvement_points?.length || 0) > 0
      );
      if (prevReport) setPrevGoals(prevReport.improvement_points ?? []);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={TERRA} />
      </SafeAreaView>
    );
  }

  const attendanceStatus = resolveAttendanceStatus(
    attendanceRow?.status ?? null,
    attendanceRow?.absence_reporter ?? null,
  );
  const statusCfg = STATUS_CONFIG[attendanceStatus];

  function isCheckInAllowed(): boolean {
    if (!lesson) return false;
    const now = new Date();
    const lessonStart = new Date(`${lesson.date}T${lesson.start_time}`);
    const lessonEnd = new Date(`${lesson.date}T${lesson.end_time}`);
    const windowStart = new Date(lessonStart.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(lessonEnd.getTime() + 60 * 60 * 1000);
    return now >= windowStart && now <= windowEnd;
  }

  async function handleCheckIn() {
    if (!lesson || !memberId || checkingIn) return;
    setCheckingIn(true);
    const { error } = await supabase.from('attendance').upsert({
      lesson_id: lesson.id,
      member_id: memberId,
      status: '출석',
    }, { onConflict: 'lesson_id,member_id' });
    setCheckingIn(false);
    if (error) {
      Alert.alert('오류', '출석 체크에 실패했어요');
      return;
    }
    setAttendanceRow({ status: '출석', absence_reason: null, absence_reporter: null, absence_reported_at: null });
  }

  async function handleReportAbsence() {
    if (!lesson || !memberId || reportingAbsence) return;
    if (!absenceReason) {
      Alert.alert('사유를 선택해주세요');
      return;
    }
    setReportingAbsence(true);

    const now = new Date().toISOString();
    const { error } = await supabase.from('attendance').upsert({
      lesson_id: lesson.id,
      member_id: memberId,
      status: '결석',
      absence_reason: absenceReason,
      absence_reporter: 'member',
      absence_reported_at: now,
    }, { onConflict: 'lesson_id,member_id' });

    if (error) {
      setReportingAbsence(false);
      Alert.alert('오류', '결석 알림에 실패했어요');
      return;
    }

    const targetCoachId = lesson.coach_id ?? coachId;
    if (targetCoachId) {
      const lessonDate = new Date(`${lesson.date}T${lesson.start_time}`);
      const formattedDate = lessonDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      const formattedTime = lesson.start_time.slice(0, 5);
      await supabase.functions.invoke('send-push', {
        body: {
          recipient_type: 'coach',
          recipient_id: targetCoachId,
          title: `${memberName}님이 결석을 알렸어요`,
          body: `${formattedDate} ${formattedTime} 레슨에 결석을 알렸어요.`,
          notif_id: 'PN-12',
          lesson_id: lesson.id,
          data: {
              type: 'lesson_absence',
              lesson_id: lesson.id,
              member_id: memberId,
              coach_id: targetCoachId,
              lesson_date: lesson.date,
            },
        },
      });
    }

    setReportingAbsence(false);
    setAbsenceModal(false);
    setAttendanceRow({ status: '결석', absence_reason: absenceReason, absence_reporter: 'member', absence_reported_at: now });
    Alert.alert('완료', '코치님께 결석을 알렸어요 🙏');
  }

  if (!lesson) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: TEXT_MUTED, fontSize: 15 }}>레슨 정보를 불러올 수 없어요</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: TERRA, fontWeight: '700' }}>돌아가기</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const dateStr = new Date(lesson.date + 'T00:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={ds.header}>
        <TouchableOpacity onPress={() => router.back()} style={ds.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </TouchableOpacity>
        <Text style={ds.headerTitle}>레슨 상세</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={ds.card}>
          <View style={ds.topRow}>
            <View style={[ds.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[ds.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
            </View>
            <Text style={ds.timeText}>{lesson.start_time.slice(0, 5)} ~ {lesson.end_time.slice(0, 5)}</Text>
          </View>
          <Text style={ds.title}>{lesson.title}</Text>
          <Text style={ds.dateText}>{dateStr}</Text>

          {(lesson.location || coachName || attendanceRow?.absence_reason) && (
            <View style={ds.metaSection}>
              {lesson.location && (
                <View style={ds.metaRow}>
                  <Ionicons name="location-outline" size={14} color={TEXT_MUTED} />
                  <Text style={ds.metaText}>{lesson.location}</Text>
                </View>
              )}
              {coachName && (
                <View style={ds.metaRow}>
                  <Ionicons name="person-outline" size={14} color={TEXT_MUTED} />
                  <Text style={ds.metaText}>{coachName} 코치</Text>
                </View>
              )}
              {attendanceRow?.absence_reason && (
                <View style={ds.metaRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={TEXT_MUTED} />
                  <Text style={ds.metaText}>결석 사유: {attendanceRow.absence_reason}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {prevGoals.length > 0 && (
          <View style={ds.goalCard}>
            <Text style={ds.goalLabel}>지난 레슨에서 이어갈 목표</Text>
            {prevGoals.map((g, i) => (
              <Text key={i} style={ds.goalItem}>• {g}</Text>
            ))}
          </View>
        )}

        {sentReport && (sentReport.summary || sentReport.achievements?.length || sentReport.improvement_points?.length) && (
          <View style={ds.reportCard}>
            <View style={ds.reportHeader}>
              <Ionicons name="document-text-outline" size={16} color={TERRA} />
              <Text style={ds.reportTitle}>코치 리포트</Text>
            </View>
            {sentReport.summary ? (
              <Text style={ds.reportContent}>{sentReport.summary}</Text>
            ) : null}
            {(sentReport.achievements?.length ?? 0) > 0 && (
              <View style={{ marginTop: sentReport.summary ? 14 : 0 }}>
                <Text style={ds.reportSubTitle}>이번 레슨 성과</Text>
                {sentReport.achievements!.map((a, i) => (
                  <Text key={i} style={ds.reportItem}>✓ {a}</Text>
                ))}
              </View>
            )}
            {(sentReport.improvement_points?.length ?? 0) > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={ds.reportSubTitle}>개선 포인트</Text>
                {sentReport.improvement_points!.map((p, i) => (
                  <Text key={i} style={ds.reportItem}>→ {p}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── 출결 액션 버튼 ── */}
        <View style={ds.actionSection}>
          {attendanceStatus === 'scheduled' && (
            <>
              <TouchableOpacity
                style={[ds.actionBtn, ds.actionBtnPrimary, !isCheckInAllowed() && ds.actionBtnDisabled]}
                onPress={handleCheckIn}
                disabled={!isCheckInAllowed() || checkingIn}
              >
                {checkingIn ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={ds.actionBtnText}>출석 체크</Text>
                  </>
                )}
              </TouchableOpacity>
              {!isCheckInAllowed() && (
                <Text style={ds.actionHint}>레슨 시작 30분 전부터 종료 후 1시간까지 체크 가능해요</Text>
              )}
              <TouchableOpacity
                style={[ds.actionBtn, ds.actionBtnSecondary]}
                onPress={() => { setAbsenceReason(''); setAbsenceModal(true); }}
              >
                <Ionicons name="close-circle-outline" size={18} color={TERRA} />
                <Text style={[ds.actionBtnText, { color: TERRA }]}>결석 알리기</Text>
              </TouchableOpacity>
            </>
          )}
          {attendanceStatus === 'pending' && (
            <View style={ds.statusInfoBox}>
              <Ionicons name="time-outline" size={18} color="#F57C00" />
              <Text style={[ds.statusInfoText, { color: '#F57C00' }]}>코치님께 결석을 알렸어요. 확인 대기 중이에요.</Text>
            </View>
          )}
          {attendanceStatus === 'attended' && (
            <View style={ds.statusInfoBox}>
              <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
              <Text style={[ds.statusInfoText, { color: '#2E7D32' }]}>출석이 완료되었어요 🎾</Text>
            </View>
          )}
          {attendanceStatus === 'absent' && (
            <View style={ds.statusInfoBox}>
              <Ionicons name="close-circle" size={18} color="#C62828" />
              <Text style={[ds.statusInfoText, { color: '#C62828' }]}>결석 처리된 레슨이에요</Text>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 결석 알리기 모달 ── */}
      <Modal visible={absenceModal} transparent animationType="slide" onRequestClose={() => setAbsenceModal(false)}>
        <View style={ds.modalOverlay}>
          <View style={ds.modalSheet}>
            <View style={ds.modalHandle} />
            <Text style={ds.modalTitle}>레슨에 참석하지 않을 예정인가요?</Text>
            <Text style={ds.modalSubtitle}>코치님께 결석을 알려드릴게요.</Text>
            <Text style={ds.reasonLabel}>결석 사유 (선택)</Text>
            <View style={ds.reasonList}>
              {ABSENCE_REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[ds.reasonChip, absenceReason === r && ds.reasonChipSelected]}
                  onPress={() => setAbsenceReason(absenceReason === r ? '' : r)}
                >
                  <Text style={[ds.reasonChipText, absenceReason === r && ds.reasonChipTextSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={ds.modalBtnRow}>
              <TouchableOpacity style={[ds.modalBtn, ds.modalBtnCancel]} onPress={() => setAbsenceModal(false)}>
                <Text style={[ds.modalBtnText, { color: TERRA }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ds.modalBtn, ds.modalBtnConfirm]}
                onPress={handleReportAbsence}
                disabled={reportingAbsence}
              >
                {reportingAbsence ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={ds.modalBtnText}>결석 알리기</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  card: { backgroundColor: CARD_WHITE, borderRadius: 20, margin: 16, padding: 20, ...Shadow.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  timeText: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 4 },
  dateText: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12 },
  metaSection: { borderTopWidth: 1, borderTopColor: DIVIDER, paddingTop: 12, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: TEXT_MUTED },
  goalCard: {
    backgroundColor: GOAL_BG, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 12, padding: 16,
  },
  goalLabel: { fontSize: 12, fontWeight: '700', color: TERRA, marginBottom: 8 },
  goalItem: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22 },
  reportCard: {
    backgroundColor: CARD_WHITE, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 12, padding: 16, ...Shadow.sm,
  },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  reportTitle: { fontSize: 14, fontWeight: '700', color: TERRA },
  reportSubTitle: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 6 },
  reportContent: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22 },
  reportItem: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22 },

  // ── 출결 액션 버튼 ──
  actionSection: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md, paddingVertical: 14, gap: 8,
  },
  actionBtnPrimary: { backgroundColor: TERRA },
  actionBtnSecondary: { backgroundColor: '#FBF2EF', borderWidth: 1.5, borderColor: TERRA },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionHint: { fontSize: 12, color: TEXT_MUTED, textAlign: 'center', marginTop: -4 },
  statusInfoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9F9F9', borderRadius: Radius.md, padding: 14,
  },
  statusInfoText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },

  // ── 결석 알리기 모달 ──
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
  modalSubtitle: { fontSize: 14, color: TEXT_MUTED, marginBottom: 20 },
  reasonLabel: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 10 },
  reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  reasonChip: {
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F4F6F9', borderWidth: 1, borderColor: DIVIDER,
  },
  reasonChipSelected: { backgroundColor: LESSON_CARD_BG, borderColor: TERRA },
  reasonChipText: { fontSize: 14, color: TEXT_MUTED },
  reasonChipTextSelected: { color: TERRA, fontWeight: '700' },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center',
  },
  modalBtnCancel: { backgroundColor: '#F4F6F9' },
  modalBtnConfirm: { backgroundColor: TERRA },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
