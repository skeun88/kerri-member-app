import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
  SafeAreaView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import { KERRI_KAKAO_CHANNEL_URL, KERRI_KAKAO_CHANNEL_APP_URL } from '../../lib/config';
import { ProfileSkeleton, FadeInView } from '../../components/Skeleton';

const BG = '#FAFAFA';
const CARD = '#FFFFFF';
const TERRA = '#C0755A';
const PEACH = '#F8EEE9';
const FG = '#20242C';
const MUTED = '#667085';
const DIVIDER = '#E8EBEF';
const RED = '#E53E3E';
const SECTION_LABEL_COLOR = '#9AA0AC';

interface MemberProfile {
  id: string; name: string; level: string; phone: string;
  remaining_credits: number; is_active: boolean;
  lesson_count?: number;
}

function isSystemEmail(email: string): boolean {
  return email.startsWith('invite_') || email.endsWith('@kerri.app');
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

type MenuRowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
  value?: string;
  disabled?: boolean;
  isLast?: boolean;
};

function MenuRow({ icon, label, onPress, danger, muted, value, disabled, isLast }: MenuRowProps) {
  const color = danger ? RED : muted ? MUTED : FG;
  return (
    <>
      <TouchableOpacity
        style={styles.menuRow}
        onPress={onPress}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Ionicons name={icon} size={18} color={color} style={styles.menuIcon} />
        <Text style={[styles.menuLabel, { color }]}>{label}</Text>
        {value != null
          ? <Text style={styles.menuValue}>{value}</Text>
          : <Ionicons name="chevron-forward" size={16} color={muted ? '#C5CAD3' : MUTED} />
        }
      </TouchableOpacity>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [email, setEmail] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialLoaded = useRef(false);
  const [totalLessons, setTotalLessons] = useState(0);
  const [pastLessons, setPastLessons] = useState(0);
  const [attendedLessons, setAttendedLessons] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { initialLoaded.current = true; setLoading(false); return; }
    setEmail(user.email ?? '');

    let { data: mem } = await supabase.from('members').select('*')
      .eq('auth_user_id', user.id).maybeSingle();

    if (!mem) {
      const memberId = user.user_metadata?.member_id;
      if (memberId) {
        const { data: memByMeta } = await supabase.from('members').select('*')
          .eq('id', memberId).maybeSingle();
        mem = memByMeta;
      }
    }
    if (!mem) { initialLoaded.current = true; setLoading(false); return; }
    setProfile(mem);

    const attended = mem.lesson_count ?? 0;
    setAttendedLessons(attended);

    const { data: lm } = await supabase.from('lesson_members')
      .select('lesson_id').eq('member_id', mem.id);
    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    setTotalLessons(lessonIds.length);

    if (lessonIds.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data: past } = await supabase.from('lessons')
        .select('id')
        .in('id', lessonIds)
        .lte('date', today);
      setPastLessons((past ?? []).length);
    } else {
      setPastLessons(0);
    }

    initialLoaded.current = true;
    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    if (!initialLoaded.current) setLoading(true);
    loadProfile();
  }, []));

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function confirmDelete() {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-member-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || '삭제 실패');
      }
      await supabase.auth.signOut();
    } catch {
      setIsDeleting(false);
      Alert.alert('오류', '삭제 중 문제가 발생했어요. 다시 시도해주세요.');
    }
  }

  async function openKakaoChannel() {
    try {
      await Linking.openURL(KERRI_KAKAO_CHANNEL_APP_URL);
    } catch {
      try {
        await Linking.openURL(KERRI_KAKAO_CHANNEL_URL);
      } catch {
        Alert.alert(
          '카카오톡 채널을 열 수 없어요',
          '잠시 후 다시 시도해주세요.',
          [{ text: '확인' }]
        );
      }
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      '계정을 삭제할까요?',
      '모든 레슨 기록과 계정 정보가 삭제됩니다. 이 작업은 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '정말 삭제할까요?',
              '삭제 후에는 같은 코드로 다시 가입할 수 없어요.',
              [
                { text: '취소', style: 'cancel' },
                { text: '영구 삭제', style: 'destructive', onPress: confirmDelete },
              ]
            );
          },
        },
      ]
    );
  }

  const level = profile?.level ?? '';
  const initial = ((profile?.name ?? email).slice(0, 1).toUpperCase()) || '?';
  const displayEmail = email && !isSystemEmail(email) ? email : null;
  const attendRate = pastLessons > 0
    ? `${Math.min(100, Math.round((attendedLessons / pastLessons) * 100))}%`
    : '—';
  const appVersion = Constants.expoConfig?.version ?? '—';

  if (loading) return <ProfileSkeleton />;

  return (
    <FadeInView>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadProfile(); setRefreshing(false); }}
            tintColor={TERRA}
          />
        }
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>마이</Text>
        </View>

        {/* ── 1. 프로필 섹션 ─────────────────────────────────── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.profileRow}
            onPress={() => router.push('/profile/edit')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.avatarEditBadge}>
                <Ionicons name="pencil" size={10} color="#fff" />
              </View>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile?.name ?? '회원'}</Text>
              {!!displayEmail && (
                <Text style={styles.profileEmail} numberOfLines={1}>{displayEmail}</Text>
              )}
              {!!level && (
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>{level}</Text>
                </View>
              )}
            </View>

            <View style={styles.profileEditBtn}>
              <Text style={styles.profileEditBtnText}>수정</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 2. 나의 레슨 현황 ──────────────────────────────── */}
        <SectionLabel title="나의 레슨 현황" />
        <View style={styles.card}>
          <View style={styles.statsGrid}>
            <View style={[styles.statCell, styles.cellRight, styles.cellBottom]}>
              <Text style={styles.statNum}>{totalLessons}</Text>
              <Text style={styles.statLabel}>누적 레슨</Text>
            </View>
            <View style={[styles.statCell, styles.cellBottom]}>
              <Text style={styles.statNum}>{attendedLessons}</Text>
              <Text style={styles.statLabel}>출석</Text>
            </View>
            <View style={[styles.statCell, styles.cellRight]}>
              <Text style={styles.statNum}>{attendRate}</Text>
              <Text style={styles.statLabel}>출석률</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{profile?.remaining_credits ?? 0}</Text>
              <Text style={styles.statLabel}>남은 레슨</Text>
            </View>
          </View>
        </View>

        {/* ── 3. 설정 ────────────────────────────────────────── */}
        <SectionLabel title="설정" />
        <View style={styles.card}>
          <MenuRow
            icon="notifications-outline"
            label="알림 설정"
            onPress={() => router.push('/notifications')}
          />
          <MenuRow
            icon="document-text-outline"
            label="서비스 이용약관"
            onPress={() => router.push('/settings/terms')}
          />
          <MenuRow
            icon="shield-outline"
            label="개인정보 처리방침"
            onPress={() => router.push('/settings/privacy')}
          />
          <MenuRow
            icon="mic-outline"
            label="AI 음성 분석 동의 관리"
            onPress={() => router.push('/consent/ai-consent')}
            isLast
          />
        </View>

        {/* ── 4. 고객지원 ────────────────────────────────────── */}
        <SectionLabel title="고객지원" />
        <View style={styles.card}>
          <MenuRow
            icon="chatbubble-ellipses-outline"
            label="카카오톡으로 문의하기"
            onPress={openKakaoChannel}
          />
          <MenuRow
            icon="information-circle-outline"
            label="앱 버전"
            onPress={() => {}}
            value={appVersion}
            isLast
          />
        </View>

        {/* ── 5. 계정 관리 ───────────────────────────────────── */}
        <SectionLabel title="계정 관리" />
        <View style={styles.card}>
          <MenuRow
            icon="log-out-outline"
            label="로그아웃"
            onPress={handleSignOut}
            isLast
          />
        </View>

        <TouchableOpacity
          style={styles.deleteAccountRow}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          activeOpacity={0.7}
        >
          {isDeleting
            ? <ActivityIndicator size="small" color={RED} />
            : <Text style={styles.deleteAccountText}>회원 탈퇴 및 개인정보 삭제</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 22, fontWeight: '900', color: FG,
  },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: SECTION_LABEL_COLOR,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: CARD, borderRadius: 18,
    marginHorizontal: 16, marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },

  // Profile
  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 18, gap: 14,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: PEACH, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: TERRA },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: TERRA, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: CARD,
  },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 17, fontWeight: '800', color: FG },
  profileEmail: { fontSize: 13, color: MUTED },
  levelBadge: {
    backgroundColor: PEACH, borderRadius: 20,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
  },
  levelText: { fontSize: 12, fontWeight: '700', color: TERRA },
  profileEditBtn: {
    backgroundColor: PEACH, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  profileEditBtnText: { fontSize: 12, fontWeight: '700', color: TERRA },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: {
    width: '50%', paddingVertical: 16, paddingHorizontal: 8,
    alignItems: 'center',
  },
  cellRight: { borderRightWidth: 1, borderRightColor: DIVIDER },
  cellBottom: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  statNum: { fontSize: 22, fontWeight: '900', color: FG, marginBottom: 4 },
  statLabel: { fontSize: 12, fontWeight: '500', color: MUTED },

  // Menu rows
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 16,
  },
  menuIcon: { marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: FG },
  menuValue: { fontSize: 14, color: MUTED },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: DIVIDER, marginLeft: 46 },

  // Delete account
  deleteAccountRow: {
    alignItems: 'center', paddingVertical: 16, marginTop: 8,
  },
  deleteAccountText: {
    fontSize: 13, color: RED, fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
