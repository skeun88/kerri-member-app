import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Alert, ActivityIndicator } from 'react-native';
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

interface CoachMessage {
  id: string;
  content: string;
  created_at: string;
  read_at: string | null;
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
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [linkingCode, setLinkingCode] = useState(false);

  async function handleLinkInviteCode() {
    if (!inviteCode.trim()) return;
    setLinkingCode(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLinkingCode(false); return; }

    const { data: found } = await supabase
      .from('members')
      .select('*')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (!found) {
      Alert.alert('코드 오류', '올바른 초대 코드를 입력해주세요.');
      setLinkingCode(false);
      return;
    }

    // auth_user_id 연결
    await supabase.from('members').update({ auth_user_id: user.id }).eq('id', found.id);
    setLinkingCode(false);
    setInviteCode('');
    await loadData();
    Alert.alert('연결 완료! 🎾', `${found.name}님, 코치와 연결됐어요!`);
  }

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

      // 코치 메시지 최근 3개
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, content, created_at, read_at')
        .eq('member_id', myMember.id)
        .eq('sender_type', 'coach')
        .order('created_at', { ascending: false })
        .limit(3);
      setCoachMessages(msgs ?? []);

      // 미납 결제 (가장 가까운 due_date 기준)
      const { data: payments } = await supabase.from('payments').select('*')
        .eq('member_id', myMember.id).neq('status', '납부완료')
        .order('due_date').limit(1);
      setPaymentAlert(payments?.[0] ?? null);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // ── Realtime: 코치가 레슨/메시지/결제 변경 시 홈화면 즉시 갱신 ────
  useEffect(() => {
    if (!member?.id) return;
    const ch = supabase.channel('home_rt_' + member.id)
      // 레슨 할당/해제
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      // 레슨 시간/정보 변경
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      // 코치 메시지
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `member_id=eq.${member.id}` }, () => loadData())
      // 결제 상태
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `member_id=eq.${member.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [member?.id]);

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

      {/* 초대 코드 연결 (회원 미연결 상태) */}
      {!member && (
        <View style={styles.inviteBox}>
          <Ionicons name="link-outline" size={32} color={Colors.primary} style={{ marginBottom: 10 }} />
          <Text style={styles.inviteTitle}>코치가 보낸 초대 코드를 입력해주세요</Text>
          <Text style={styles.inviteDesc}>코치에게 받은 6자리 초대 코드를 입력하면
레슨 정보와 자동으로 연결됩니다</Text>
          <TextInput
            style={styles.inviteInput}
            value={inviteCode}
            onChangeText={v => setInviteCode(v.toUpperCase())}
            placeholder="초대 코드 입력 (예: AB1C2D)"
            placeholderTextColor={Colors.placeholder}
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.inviteBtn, (!inviteCode.trim() || linkingCode) && { opacity: 0.5 }]}
            onPress={handleLinkInviteCode}
            disabled={!inviteCode.trim() || linkingCode}
          >
            {linkingCode
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.inviteBtnText}>코치와 연결하기</Text>
            }
          </TouchableOpacity>
        </View>
      )}

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

      {/* 코치 메시지 */}
      {member && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>코치 메시지</Text>
            <TouchableOpacity onPress={() => router.push('/coach-chat')}>
              <Text style={styles.seeAll}>전체보기</Text>
            </TouchableOpacity>
          </View>
          {coachMessages.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubble-outline" size={36} color={Colors.iconMuted} />
              <Text style={styles.emptyText}>코치 메시지가 없어요</Text>
            </View>
          ) : (
            coachMessages.map(msg => {
              const isUnread = !msg.read_at;
              const date = new Date(msg.created_at);
              const dateStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
              const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              return (
                <TouchableOpacity
                  key={msg.id}
                  style={[styles.msgCard, isUnread && styles.msgCardUnread]}
                  onPress={() => router.push('/coach-chat')}
                  activeOpacity={0.8}
                >
                  <View style={styles.msgLeft}>
                    <View style={styles.msgAvatar}>
                      <Ionicons name="person" size={16} color={Colors.primary} />
                    </View>
                    <View style={styles.msgBody}>
                      <Text style={styles.msgCoach}>{coachName} 코치</Text>
                      <Text style={styles.msgContent} numberOfLines={2}>{msg.content}</Text>
                    </View>
                  </View>
                  <View style={styles.msgRight}>
                    <Text style={styles.msgDate}>{dateStr}</Text>
                    <Text style={styles.msgTime}>{timeStr}</Text>
                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </>
      )}

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
  msgCard: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, ...Shadow.sm },
  msgCardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  msgLeft: { flexDirection: 'row', flex: 1, gap: 10 },
  msgAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + '18', justifyContent: 'center', alignItems: 'center' },
  msgBody: { flex: 1 },
  msgCoach: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 3 },
  msgContent: { fontSize: 14, color: Colors.navy, lineHeight: 20 },
  msgRight: { alignItems: 'flex-end', gap: 2, marginLeft: 8 },
  msgDate: { fontSize: 11, color: Colors.mutedFg },
  msgTime: { fontSize: 11, color: Colors.mutedFg },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 2 },

  inviteBox: {
    margin: 16, backgroundColor: Colors.card, borderRadius: 16,
    padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.primaryLight,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  inviteTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground, marginBottom: 8, textAlign: 'center' },
  inviteDesc: { fontSize: 13, color: Colors.mutedFg, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  inviteInput: {
    width: '100%', backgroundColor: Colors.mutedBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 20, fontWeight: '800', color: Colors.navy,
    textAlign: 'center', letterSpacing: 4,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 12,
  },
  inviteBtn: {
    width: '100%', backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  inviteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
