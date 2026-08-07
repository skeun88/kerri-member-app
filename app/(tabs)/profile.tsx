import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Modal, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

interface MemberProfile {
  id: string; name: string; level: string; phone: string;
  remaining_credits: number; is_active: boolean;
  lesson_count?: number; // 코치앱에서 process-lesson 실행 시 자동 증가됨
}

const LEVEL_ORDER = ['입문','초급','중급','상급','선수'];

export default function ProfileScreen() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalLessons, setTotalLessons] = useState(0);
  const [attendedLessons, setAttendedLessons] = useState(0);
  const [attendanceDots, setAttendanceDots] = useState<boolean[]>([]);

  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? '');

    // auth_user_id 기준으로 먼저 조회
    let { data: mem } = await supabase.from('members').select('*')
      .eq('auth_user_id', user.id).maybeSingle();

    // auth_user_id로 못 찾으면 user_metadata의 member_id로 fallback
    // (verify-invite-code가 user_metadata: { member_id }를 세팅함)
    if (!mem) {
      const memberId = user.user_metadata?.member_id;
      if (memberId) {
        const { data: memByMeta } = await supabase.from('members').select('*')
          .eq('id', memberId).maybeSingle();
        mem = memByMeta;
      }
    }
    if (!mem) return;
    setProfile(mem);
    setEditName(mem.name);
    setPhotoUrl((mem as any).photo_url ?? null);

    // 총 레슨 수: lesson_members 기준 (회원이 SELECT 가능한 RLS)
    const { data: lm } = await supabase.from('lesson_members').select('lesson_id').eq('member_id', mem.id);
    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    setTotalLessons(lessonIds.length);

    // 출석 횟수: attendance 테이블은 회원 RLS 미지원 → members.lesson_count 사용
    // (process-lesson Edge Function에서 AI 분석 완료 시 자동 증가)
    const attended = mem.lesson_count ?? 0;
    setAttendedLessons(attended);

    // 최근 8회 레슨 출석 도트: lesson_id 기준으로 lesson_count와 비교
    if (lessonIds.length > 0) {
      const { data: lessons } = await supabase.from('lessons').select('id, date')
        .in('id', lessonIds).order('date', { ascending: false }).limit(8);
      // lesson_count만큼 최신 레슨을 출석으로 표시 (근사치)
      const sortedLessons = (lessons ?? []);
      const dots = sortedLessons.map((_, i) => i < attended);
      setAttendanceDots(dots);
    }
  }

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  async function handleSaveName() {
    if (!profile) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('입력 오류', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      // members_self_update RLS 정책으로 auth_user_id/email 기준 UPDATE 가능
      // RLS 조건(auth_user_id = auth.uid())과 일치하도록 auth_user_id로 필터
      // .eq('id', profile.id)는 RLS를 통과해도 rows=0일 수 있음
      const { data: updated, error } = await supabase
        .from('members')
        .update({ name: trimmed })
        .eq('id', profile.id)
        .select('id');
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error('이름 변경 권한이 없습니다. 앱을 재시작 후 다시 시도해주세요.');
      setProfile(prev => prev ? { ...prev, name: trimmed } : prev);
      setEditName(trimmed);
      setEditModal(false);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message || '이름 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    if (!profile) return;

    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `member-${profile.id}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('members')
        .update({ photo_url: publicUrl })
        .eq('id', profile.id);
      if (updateError) throw updateError;

      setPhotoUrl(publicUrl + '?t=' + Date.now());
    } catch (e: any) {
      Alert.alert('업로드 실패', e.message || '사진 업로드에 실패했습니다.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const level = profile?.level ?? '입문';
  const initial = (profile?.name ?? email).slice(0, 1).toUpperCase();
  const attendRate = totalLessons > 0 ? Math.round((attendedLessons / totalLessons) * 100) : 0;

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadProfile(); setRefreshing(false); }} tintColor={Colors.primary} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>내 정보</Text>
            <TouchableOpacity onPress={handleSignOut} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={handlePhotoUpload} disabled={uploadingPhoto}>
              <View style={styles.avatar}>
                {uploadingPhoto ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </View>
              <View style={styles.editIcon}>
                <Ionicons name={uploadingPhoto ? 'hourglass-outline' : 'camera'} size={12} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{profile?.name ?? '회원'}</Text>
              <Text style={styles.heroEmail}>{email}</Text>
              <View style={styles.levelBadge}>
                <Ionicons name="trophy-outline" size={12} color={Colors.primary} />
                <Text style={styles.levelText}>{level}</Text>
              </View>
            </View>
          </View>


        </View>

        <View style={styles.body}>
          {/* 통계 카드 */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{totalLessons}</Text>
              <Text style={styles.statLabel}>총 레슨</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{attendedLessons}</Text>
              <Text style={styles.statLabel}>출석</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{attendRate}%</Text>
              <Text style={styles.statLabel}>출석률</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{profile?.remaining_credits ?? 0}</Text>
              <Text style={styles.statLabel}>잔여 레슨</Text>
            </View>
          </View>

          {/* 계정 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정</Text>
            <View style={styles.card}>
              <TouchableOpacity style={[styles.menuRow, styles.missionBorder]} onPress={() => setEditModal(true)}>
                <Ionicons name="person-outline" size={18} color={Colors.mutedFg} />
                <Text style={styles.menuLabel}>이름 변경</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
                <Text style={[styles.menuLabel, { color: Colors.destructive }]}>로그아웃</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>이름 변경</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName}
              placeholder="이름" placeholderTextColor={Colors.placeholder} autoFocus />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveName} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalSaveBtnText}>저장</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModal(false)}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  hero: { backgroundColor: Colors.primary, paddingBottom: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 54, paddingBottom: 16 },
  heroTitle: { fontSize: 18, fontWeight: '700', color: Colors.white },
  logoutBtn: { padding: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', marginRight: 14, overflow: 'hidden' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { fontSize: 26, fontWeight: '900', color: Colors.primary },
  editIcon: { position: 'absolute', bottom: 0, right: 10, backgroundColor: Colors.primary, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: Colors.white },
  heroEmail: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 6 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.white, alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  levelText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  body: { paddingTop: 16 },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.white, marginHorizontal: 16, borderRadius: Radius.xl, padding: 16, ...Shadow.sm, marginBottom: 16 },
  statCard: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statNum: { fontSize: 20, fontWeight: '900', color: Colors.primary },
  statLabel: { fontSize: 12, color: Colors.mutedFg, marginTop: 2 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginBottom: 10 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  missionRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  missionBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  missionCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  missionCheckDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  missionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.foreground },

  growthCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  growthRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  growthBorder: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.borderLight },
  growthLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.foreground },
  growthValue: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.foreground },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginBottom: 16 },
  modalInput: { backgroundColor: Colors.mutedBg, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: Colors.foreground, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  modalSaveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  modalSaveBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { fontSize: 15, color: Colors.mutedFg },
});
