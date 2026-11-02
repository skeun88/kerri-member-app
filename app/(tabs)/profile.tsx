import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, TextInput, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ProfileSkeleton } from '../../components/Skeleton';

// ── Design tokens (홈·내 일정·레슨 기록과 동일 팔레트) ──────────────
const BG = '#F7F7F5';
const CARD = '#FFFFFF';
const TERRA = '#C0755A';
const PEACH = '#F8EEE9';
const FG = '#20242C';
const MUTED = '#667085';
const DIVIDER = '#E8EBEF';

interface MemberProfile {
  id: string; name: string; level: string; phone: string;
  remaining_credits: number; is_active: boolean;
  lesson_count?: number;
}

function isSystemEmail(email: string): boolean {
  return email.startsWith('invite_') || email.endsWith('@kerri.app');
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [email, setEmail] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalLessons, setTotalLessons] = useState(0);
  const [pastLessons, setPastLessons] = useState(0);
  const [attendedLessons, setAttendedLessons] = useState(0);

  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
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
    if (!mem) { setLoading(false); return; }
    setProfile(mem);
    setEditName(mem.name);

    // lesson_count = AI 분석이 완료된 출석 횟수
    const attended = mem.lesson_count ?? 0;
    setAttendedLessons(attended);

    const { data: lm } = await supabase.from('lesson_members')
      .select('lesson_id').eq('member_id', mem.id);
    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    setTotalLessons(lessonIds.length);

    // 출석률 분모: 오늘 이전(또는 오늘)의 과거 레슨만 포함
    // 미래 예정 레슨은 분모에서 제외해야 104% 등 100% 초과를 방지함
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

    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadProfile();
  }, []));

  async function handleSaveName() {
    if (!profile) return;
    const trimmed = editName.trim();
    if (!trimmed) { Alert.alert('입력 오류', '이름을 입력해주세요.'); return; }
    setSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from('members').update({ name: trimmed }).eq('id', profile.id).select('id');
      if (error) throw error;
      if (!updated || updated.length === 0)
        throw new Error('이름 변경 권한이 없습니다. 앱을 재시작 후 다시 시도해주세요.');
      setProfile(prev => prev ? { ...prev, name: trimmed } : prev);
      setEditName(trimmed);
      setEditModal(false);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message || '이름 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
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
    } catch (e: any) {
      setIsDeleting(false);
      Alert.alert('오류', '삭제 중 문제가 발생했어요. 다시 시도해주세요.');
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
  // 출석률: 과거 레슨 기준, 집계 대상 없으면 '—', 최대 100% 캡
  const attendRate = pastLessons > 0
    ? `${Math.min(100, Math.round((attendedLessons / pastLessons) * 100))}%`
    : '—';

  if (loading) return <ProfileSkeleton />;

  return (
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
        {/* ── Header ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>마이</Text>
        </View>

        {/* ── Profile Card ──────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <TouchableOpacity onPress={() => router.push('/profile/edit')} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.avatarEditBadge}>
                <Ionicons name="pencil" size={10} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{profile?.name ?? '회원'}</Text>
                <TouchableOpacity onPress={() => router.push('/profile/edit')} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>수정</Text>
                </TouchableOpacity>
              </View>
              {!!displayEmail && (
                <Text style={styles.profileEmail} numberOfLines={1}>{displayEmail}</Text>
              )}
              {!!level && (
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>{level}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Lesson Stats Card (2×2 grid) ─────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>나의 레슨 현황</Text>
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

        {/* ── Account Menu Card ─────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>계정 관리</Text>
          <TouchableOpacity style={styles.menuRow} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color="#E53E3E" />
            <Text style={[styles.menuLabel, { color: '#E53E3E' }]}>로그아웃</Text>
            <Ionicons name="chevron-forward" size={16} color="#E53E3E" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
            disabled={isDeleting}
          >
            <Ionicons name="trash-outline" size={18} color="#9E9E9E" />
            <Text style={[styles.menuLabel, { color: '#9E9E9E' }]}>
              {isDeleting ? '삭제 중...' : '계정 삭제'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9E9E9E" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Edit Name Modal ───────────────────────────────────── */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>이름 변경</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="이름"
              placeholderTextColor={MUTED}
              autoFocus
            />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveName} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalSaveBtnText}>저장</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModal(false)}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22, fontWeight: '900', color: FG,
  },

  card: {
    backgroundColor: CARD, borderRadius: 20,
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardSectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    marginBottom: 14, letterSpacing: 0.2,
  },

  // Profile
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PEACH, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '900', color: TERRA },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: TERRA, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: CARD,
  },
  profileInfo: { flex: 1, gap: 5 },
  nameRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileName: { fontSize: 18, fontWeight: '800', color: FG },
  editBtn: {
    backgroundColor: PEACH, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  editBtnText: { fontSize: 12, fontWeight: '700', color: TERRA },
  profileEmail: { fontSize: 13, color: MUTED },
  levelBadge: {
    backgroundColor: PEACH, borderRadius: 20,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
  },
  levelText: { fontSize: 12, fontWeight: '700', color: TERRA },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: {
    width: '50%', paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center',
  },
  cellRight: { borderRightWidth: 1, borderRightColor: DIVIDER },
  cellBottom: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  statNum: { fontSize: 22, fontWeight: '900', color: FG, marginBottom: 4 },
  statLabel: { fontSize: 12, fontWeight: '500', color: MUTED },

  // Menu
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: DIVIDER, marginVertical: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: DIVIDER,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: FG, marginBottom: 16 },
  modalInput: {
    backgroundColor: BG, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: FG,
    borderWidth: 1, borderColor: DIVIDER, marginBottom: 12,
  },
  modalSaveBtn: {
    backgroundColor: TERRA, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { fontSize: 15, color: MUTED },
});
