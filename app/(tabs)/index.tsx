import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

interface MemberInfo {
  id: string; name: string; level: string; remaining_credits: number; coach_id: string;
}

interface UpcomingLesson {
  id: string; date: string; start_time: string; end_time: string; title: string;
}

interface PaymentAlert {
  id: string; amount: number; paid_amount: number; due_date: string; status: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [upcomingLessons, setUpcomingLessons] = useState<UpcomingLesson[]>([]);
  const [paymentAlert, setPaymentAlert] = useState<PaymentAlert | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [coachName, setCoachName] = useState('코치');

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 내 회원 정보 (이메일 → auth id → 코치계정 테스트 순으로 fallback)
    const myMember = await getMyMemberRow();
    if (myMember) {
      setMember(myMember);
      // 코치 정보
      const { data: coachData } = await supabase.auth.admin?.getUserById?.(myMember.coach_id).catch?.(() => ({ data: null })) as any;
      if (coachData?.user?.email) setCoachName(coachData.user.email.split('@')[0]);
    }

    const today = new Date().toISOString().split('T')[0];
    // 다음 레슨 (오늘 포함 이후)
    if (myMember) {
      const { data: lm } = await supabase
        .from('lesson_members').select('lesson_id').eq('member_id', myMember.id);
      const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
      if (lessonIds.length > 0) {
        const { data: lessons } = await supabase.from('lessons').select('*')
          .in('id', lessonIds).gte('date', today).order('date').order('start_time').limit(3);
        setUpcomingLessons(lessons ?? []);
      }

      // 미납 결제 (가장 가까운 due_date 기준)
      const { data: payments } = await supabase.from('payments').select('*')
        .eq('member_id', myMember.id).neq('status', '납부완료')
        .order('due_date').limit(1);
      setPaymentAlert(payments?.[0] ?? null);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  function getDDay(dueDateStr: string) {
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(dueDateStr + 'T00:00:00');
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return { label: 'D-Day', urgent: true };
    if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 3 };
    return { label: `D+${Math.abs(diff)}`, urgent: true };
  }

  const greeting = member ? `안녕하세요, ${member.name}님 👋` : '안녕하세요 👋';
  const levelEmoji: Record<string, string> = { '입문': '🌱', '초급': '🎾', '중급': '⭐', '고급': '🔥', '선수': '🏆' };

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }} tintColor={Colors.navy} />}
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subGreeting}>오늘도 멋진 레슨 되세요 🎾</Text>
        </View>
        {member && (
          <View style={styles.levelBadge}>
            <Text style={styles.levelEmoji}>{levelEmoji[member.level] ?? '🎾'}</Text>
            <Text style={styles.levelText}>{member.level}</Text>
          </View>
        )}
      </View>

      {/* 잔여 크레딧 카드 */}
      {member && (
        <View style={styles.creditCard}>
          <View style={styles.creditLeft}>
            <Text style={styles.creditLabel}>잔여 레슨</Text>
            <Text style={styles.creditNum}>{member.remaining_credits}<Text style={styles.creditUnit}>회</Text></Text>
          </View>
          <View style={styles.creditDivider} />
          <TouchableOpacity style={styles.creditRight} onPress={() => router.push('/(tabs)/schedule')}>
            <Ionicons name="calendar-outline" size={22} color={Colors.navy} />
            <Text style={styles.creditRightText}>일정 확인</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 결제 알림 배너 */}
      {paymentAlert && (() => {
        const dday = getDDay(paymentAlert.due_date);
        return (
          <TouchableOpacity style={[styles.paymentBanner, dday.urgent && styles.paymentBannerUrgent]}
            onPress={() => router.push('/(tabs)/schedule')} activeOpacity={0.85}>
            <View style={styles.paymentBannerLeft}>
              <Ionicons name="card-outline" size={20} color={dday.urgent ? Colors.destructive : Colors.navy} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.paymentBannerTitle, dday.urgent && { color: Colors.destructive }]}>
                  결제 예정
                </Text>
                <Text style={styles.paymentBannerSub}>
                  {(paymentAlert.amount - paymentAlert.paid_amount).toLocaleString()}원 · 기한 {paymentAlert.due_date}
                </Text>
              </View>
            </View>
            <View style={[styles.ddayBadge, { backgroundColor: dday.urgent ? Colors.destructive : Colors.navy }]}>
              <Text style={styles.ddayText}>{dday.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* 다가오는 레슨 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>다가오는 레슨</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
          <Text style={styles.seeAll}>전체보기</Text>
        </TouchableOpacity>
      </View>

      {upcomingLessons.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={36} color={Colors.iconMuted} />
          <Text style={styles.emptyText}>예정된 레슨이 없어요</Text>
        </View>
      ) : (
        upcomingLessons.map(lesson => {
          const d = new Date(lesson.date + 'T00:00:00');
          const isToday = lesson.date === new Date().toISOString().split('T')[0];
          return (
            <View key={lesson.id} style={[styles.lessonCard, isToday && styles.lessonCardToday]}>
              <View style={styles.lessonDateBox}>
                <Text style={styles.lessonMon}>{d.toLocaleDateString('ko-KR', { month: 'short' })}</Text>
                <Text style={styles.lessonDay}>{d.getDate()}</Text>
                <Text style={styles.lessonDow}>{'일월화수목금토'[d.getDay()]}</Text>
              </View>
              <View style={styles.lessonInfo}>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonTime}>{lesson.start_time.slice(0,5)} ~ {lesson.end_time.slice(0,5)}</Text>
                {isToday && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>오늘</Text></View>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
            </View>
          );
        })
      )}

      {/* 퀵 메뉴 그리드 */}
      <Text style={styles.sectionTitle2}>바로가기</Text>
      <View style={styles.quickGrid}>
        {[
          { icon: 'calendar', label: '내 일정', color: Colors.primary, onPress: () => router.push('/(tabs)/schedule') },
          { icon: 'person-circle', label: '내 정보', color: Colors.navy, onPress: () => router.push('/(tabs)/profile') },
          { icon: 'chatbubble-ellipses', label: '코치 메시지', color: Colors.success, onPress: () => {} },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.quickCard} onPress={item.onPress}>
            <View style={[styles.quickIcon, { backgroundColor: item.color + '18' }]}>
              <Ionicons name={item.icon as any} size={26} color={item.color} />
            </View>
            <Text style={styles.quickLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, padding: 20, paddingTop: 30, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.white },
  subGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  levelBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  levelEmoji: { fontSize: 16 },
  levelText: { fontSize: 11, fontWeight: '700', color: Colors.white, marginTop: 2 },
  creditCard: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.xl, margin: 16, marginBottom: 8, ...Shadow.md, overflow: 'hidden' },
  creditLeft: { flex: 1, padding: 18, alignItems: 'center' },
  creditLabel: { fontSize: 12, color: Colors.mutedFg, fontWeight: '600', marginBottom: 4 },
  creditNum: { fontSize: 36, fontWeight: '900', color: Colors.navy },
  creditUnit: { fontSize: 16, fontWeight: '600' },
  creditDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 16 },
  creditRight: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  creditRightText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  paymentBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm },
  paymentBannerUrgent: { borderColor: Colors.destructive, backgroundColor: Colors.destructiveLight },
  paymentBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  paymentBannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  paymentBannerSub: { fontSize: 12, color: Colors.mutedFg, marginTop: 1 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  ddayText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.navy },
  sectionTitle2: { fontSize: 16, fontWeight: '800', color: Colors.navy, marginHorizontal: 16, marginTop: 16, marginBottom: 10 },
  seeAll: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, padding: 32, ...Shadow.sm },
  emptyText: { fontSize: 14, color: Colors.placeholder, marginTop: 8 },
  lessonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, ...Shadow.sm },
  lessonCardToday: { backgroundColor: Colors.primary + '10', borderWidth: 1.5, borderColor: Colors.primary },
  lessonDateBox: { alignItems: 'center', minWidth: 44, marginRight: 14 },
  lessonMon: { fontSize: 10, color: Colors.mutedFg, fontWeight: '600' },
  lessonDay: { fontSize: 22, fontWeight: '900', color: Colors.navy },
  lessonDow: { fontSize: 11, color: Colors.mutedFg, fontWeight: '600' },
  lessonInfo: { flex: 1 },
  lessonTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  lessonTime: { fontSize: 13, color: Colors.mutedFg, marginTop: 2 },
  todayBadge: { marginTop: 4, alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  quickGrid: { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8 },
  quickCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, alignItems: 'center', ...Shadow.sm },
  quickIcon: { width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 12, fontWeight: '700', color: Colors.navy, textAlign: 'center' },
});
