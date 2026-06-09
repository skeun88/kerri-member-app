import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

interface MemberInfo {
  id: string; name: string; level: string; remaining_credits: number; coach_id: string;
}

interface CoachProfile {
  display_name: string | null;
  avatar_url: string | null;
  center_name: string | null;
  region_city: string | null;
  region_district: string | null;
  coaching_years: number | null;
  bio: string | null;
  career_details: string | null;
  certifications: string | null;
  specialties: string[] | null;
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
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [upcomingLessons, setUpcomingLessons] = useState<UpcomingLesson[]>([]);
  const [paymentAlert, setPaymentAlert] = useState<PaymentAlert | null>(null);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [linkingCode, setLinkingCode] = useState(false);

  async function handleLinkInviteCode() {
    if (!inviteCode.trim()) return;
    setLinkingCode(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLinkingCode(false); return; }
    const { data: found } = await supabase
      .from('members').select('*')
      .eq('invite_code', inviteCode.trim().toUpperCase()).maybeSingle();
    if (!found) {
      Alert.alert('코드 오류', '올바른 초대 코드를 입력해주세요.');
      setLinkingCode(false); return;
    }
    await supabase.from('members').update({ auth_user_id: user.id }).eq('id', found.id);
    setLinkingCode(false); setInviteCode('');
    await loadData();
    Alert.alert('연결 완료! 🎾', `${found.name}님, 코치와 연결됐어요!`);
  }

  async function loadData() {
    const myMember = await getMyMemberRow();
    if (!myMember) return;
    setMember(myMember);

    const today = new Date().toISOString().split('T')[0];

    // 코치 프로필
    const { data: cp } = await supabase
      .from('coach_profiles').select(
        'display_name, avatar_url, center_name, region_city, region_district, coaching_years, bio, career_details, certifications, specialties'
      ).eq('coach_id', myMember.coach_id).maybeSingle();
    setCoachProfile(cp ?? null);

    // 안읽은 메시지 수
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', myMember.id)
      .eq('sender_type', 'coach')
      .is('read_at', null);
    setUnreadMsgCount(count ?? 0);

    // 다가오는 레슨
    const { data: lm } = await supabase
      .from('lesson_members').select('lesson_id').eq('member_id', myMember.id);
    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    if (lessonIds.length > 0) {
      const { data: lessons } = await supabase.from('lessons').select('*')
        .in('id', lessonIds).gte('date', today)
        .order('date').order('start_time').limit(3);
      setUpcomingLessons(lessons ?? []);
    }

    // 미납 결제
    const { data: payments } = await supabase.from('payments').select('*')
      .eq('member_id', myMember.id).neq('status', '납부완료')
      .order('due_date').limit(1);
    setPaymentAlert(payments?.[0] ?? null);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // Realtime
  useEffect(() => {
    if (!member?.id) return;
    const ch = supabase.channel('home_rt_' + member.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `member_id=eq.${member.id}` }, () => loadData())
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
  const coachInitials = (coachProfile?.display_name ?? '코').charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.container}
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

      {/* 초대 코드 연결 (미연결 상태) */}
      {!member && (
        <View style={styles.inviteBox}>
          <Ionicons name="link-outline" size={32} color={Colors.primary} style={{ marginBottom: 10 }} />
          <Text style={styles.inviteTitle}>코치가 보낸 초대 코드를 입력해주세요</Text>
          <Text style={styles.inviteDesc}>코치에게 받은 6자리 초대 코드를 입력하면{'\n'}레슨 정보와 자동으로 연결됩니다</Text>
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
              : <Text style={styles.inviteBtnText}>코치와 연결하기</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* ── 담당 코치 카드 ─────────────────────────────────── */}
      {member && (
        <View style={styles.coachCard}>
          {/* 코치 기본 정보 */}
          <View style={styles.coachTop}>
            {/* 아바타 */}
            <View style={styles.avatarWrap}>
              {coachProfile?.avatar_url && coachProfile.avatar_url.startsWith('http') ? (
                <Image source={{ uri: coachProfile.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{coachInitials}</Text>
                </View>
              )}
              <View style={styles.coachBadge}>
                <Ionicons name="school" size={10} color="#fff" />
              </View>
            </View>

            {/* 이름 + 경력 + 위치 */}
            <View style={{ flex: 1 }}>
              <View style={styles.coachNameRow}>
                <Text style={styles.coachName}>
                  {coachProfile?.display_name ?? '담당 코치'}
                </Text>
                {coachProfile?.coaching_years != null && (
                  <Text style={styles.coachExp}>경력 {coachProfile.coaching_years}년</Text>
                )}
              </View>
              {(coachProfile?.region_city || coachProfile?.center_name) && (
                <View style={styles.coachLocRow}>
                  <Ionicons name="location-outline" size={12} color={Colors.mutedFg} />
                  <Text style={styles.coachLoc}>
                    {[coachProfile.center_name, coachProfile.region_city, coachProfile.region_district]
                      .filter(Boolean).join(' · ')}
                  </Text>
                </View>
              )}

              {/* 담당 레이블 */}
              <View style={styles.myCoachBadge}>
                <Text style={styles.myCoachBadgeText}>담당 코치</Text>
              </View>
            </View>
          </View>

          {/* 전문 분야 태그 */}
          {coachProfile?.specialties && coachProfile.specialties.length > 0 && (
            <View style={styles.tagsRow}>
              {coachProfile.specialties.map((s, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 한 줄 소개 */}
          {coachProfile?.bio && (
            <Text style={styles.coachBio} numberOfLines={2}>{coachProfile.bio}</Text>
          )}

          {/* 경력 */}
          {coachProfile?.career_details && (
            <View style={styles.careerRow}>
              <Ionicons name="trophy-outline" size={13} color={Colors.primary} />
              <Text style={styles.careerText} numberOfLines={2}>{coachProfile.career_details}</Text>
            </View>
          )}

          {/* 하단: 메시지 버튼 + 일정 버튼 */}
          <View style={styles.coachActions}>
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={() => router.push('/coach-chat')}
            >
              <Ionicons name="chatbubble-outline" size={15} color={Colors.primary} />
              <Text style={styles.msgBtnText}>메시지</Text>
              {unreadMsgCount > 0 && (
                <View style={styles.msgBadge}>
                  <Text style={styles.msgBadgeText}>{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scheduleBtn}
              onPress={() => router.push('/(tabs)/schedule')}
            >
              <Ionicons name="calendar-outline" size={15} color="#fff" />
              <Text style={styles.scheduleBtnText}>레슨 일정</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 결제 알림 배너 */}
      {paymentAlert && (() => {
        const dday = getDDay(paymentAlert.due_date);
        return (
          <TouchableOpacity
            style={[styles.paymentBanner, dday.urgent && styles.paymentBannerUrgent]}
            onPress={() => router.push('/(tabs)/schedule')}
            activeOpacity={0.85}
          >
            <View style={styles.paymentBannerLeft}>
              <Ionicons name="card-outline" size={20} color={dday.urgent ? Colors.destructive : Colors.navy} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.paymentBannerTitle, dday.urgent && { color: Colors.destructive }]}>결제 예정</Text>
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
      {member && (
        <>
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
        </>
      )}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary, padding: 20, paddingTop: 30, paddingBottom: 24,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  greeting: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  levelBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
  },
  levelEmoji: { fontSize: 16 },
  levelText: { fontSize: 11, fontWeight: '700', color: '#fff', marginTop: 2 },

  // ── 담당 코치 카드 ──────────────────────────────────────────
  coachCard: {
    backgroundColor: '#fff', borderRadius: Radius.xl,
    margin: 16, marginBottom: 8, padding: 16, ...Shadow.md,
  },
  coachTop: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 26, fontWeight: '900', color: '#fff' },
  coachBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#F59E0B',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  coachName: { fontSize: 17, fontWeight: '800', color: Colors.navy },
  coachExp: { fontSize: 12, color: Colors.mutedFg },
  coachLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  coachLoc: { fontSize: 12, color: Colors.mutedFg },
  myCoachBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '18', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  myCoachBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  tag: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 12, color: Colors.mutedFg },

  coachBio: { fontSize: 13, color: Colors.mutedFg, lineHeight: 20, marginBottom: 8 },

  careerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 12 },
  careerText: { fontSize: 12, color: Colors.navy, lineHeight: 18, flex: 1 },

  coachActions: {
    flexDirection: 'row', gap: 8,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  msgBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    position: 'relative',
  },
  msgBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  msgBadge: {
    position: 'absolute', top: -8, right: 8,
    backgroundColor: Colors.destructive, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  msgBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  scheduleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: Colors.navy,
  },
  scheduleBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── 결제 배너 ─────────────────────────────────────────────
  paymentBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: Radius.lg,
    marginHorizontal: 16, marginBottom: 8, padding: 14,
    borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm,
  },
  paymentBannerUrgent: { borderColor: Colors.destructive, backgroundColor: '#fff5f5' },
  paymentBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  paymentBannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.navy },
  paymentBannerSub: { fontSize: 12, color: Colors.mutedFg, marginTop: 1 },
  ddayBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  ddayText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // ── 다가오는 레슨 ─────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 16, marginTop: 8, marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.navy },
  seeAll: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  emptyCard: {
    alignItems: 'center', backgroundColor: '#fff',
    borderRadius: Radius.lg, marginHorizontal: 16, padding: 32, ...Shadow.sm,
  },
  emptyText: { fontSize: 14, color: Colors.placeholder, marginTop: 8 },

  lessonCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 8, padding: 14, ...Shadow.sm,
  },
  lessonCardToday: { backgroundColor: Colors.primary + '10', borderWidth: 1.5, borderColor: Colors.primary },
  lessonDateBox: { alignItems: 'center', minWidth: 44, marginRight: 14 },
  lessonMon: { fontSize: 10, color: Colors.mutedFg, fontWeight: '600' },
  lessonDay: { fontSize: 22, fontWeight: '900', color: Colors.navy },
  lessonDow: { fontSize: 11, color: Colors.mutedFg, fontWeight: '600' },
  lessonInfo: { flex: 1 },
  lessonTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  lessonTime: { fontSize: 13, color: Colors.mutedFg, marginTop: 2 },
  todayBadge: {
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  todayBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // ── 초대 코드 ─────────────────────────────────────────────
  inviteBox: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16,
    padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.primary + '40',
    ...Shadow.sm,
  },
  inviteTitle: { fontSize: 16, fontWeight: '700', color: Colors.navy, marginBottom: 8, textAlign: 'center' },
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
