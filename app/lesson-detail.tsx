import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
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

function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
function todayKST() { return toKSTDateStr(new Date()); }

interface LessonData {
  id: string; date: string; start_time: string; end_time: string;
  title: string; location?: string; notes?: string;
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
  const [attendanceStatus, setAttendanceStatus] = useState<string | null>(null);
  const [coachName, setCoachName] = useState('');
  const [sentReport, setSentReport] = useState<SentReport | null>(null);
  const [prevGoals, setPrevGoals] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const mem = await getMyMemberRow();
    if (!mem) { setLoading(false); return; }

    const [lessonRes, attendanceRes, coachRes, reportsRes] = await Promise.all([
      supabase.from('lessons').select('id, date, start_time, end_time, title, location, notes').eq('id', id).maybeSingle(),
      supabase.from('attendance').select('status, absence_reason').eq('lesson_id', id).eq('member_id', mem.id).maybeSingle(),
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
    setAttendanceStatus(attendanceRes.data?.status ?? null);
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

  const isPast = lesson.date < today;
  const isToday = lesson.date === today;
  const statusLabel = attendanceStatus === '출석' || attendanceStatus === '지각' || attendanceStatus === '조퇴'
    ? '완료'
    : attendanceStatus === '결석' ? '결석'
    : isToday ? '오늘'
    : isPast ? '완료'
    : '예정';
  const statusColor = statusLabel === '결석' ? '#EF4444'
    : statusLabel === '오늘' ? TERRA
    : statusLabel === '예정' ? '#22C55E'
    : TEXT_MUTED;
  const statusBg = statusLabel === '결석' ? '#FEE2E2'
    : statusLabel === '오늘' ? LESSON_CARD_BG
    : statusLabel === '예정' ? '#ECFDF5'
    : '#F4F6F9';

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
            <View style={[ds.statusBadge, { backgroundColor: statusBg }]}>
              <Text style={[ds.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <Text style={ds.timeText}>{lesson.start_time.slice(0, 5)} ~ {lesson.end_time.slice(0, 5)}</Text>
          </View>
          <Text style={ds.title}>{lesson.title}</Text>
          <Text style={ds.dateText}>{dateStr}</Text>

          {(lesson.location || coachName || (attendanceStatus && attendanceStatus !== '출석')) && (
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
              {attendanceStatus && attendanceStatus !== '출석' && (
                <View style={ds.metaRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={TEXT_MUTED} />
                  <Text style={ds.metaText}>{attendanceStatus}</Text>
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

        <View style={{ height: 100 }} />
      </ScrollView>
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
});
