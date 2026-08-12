import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export default function LoginScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('입력 오류', '초대 코드를 입력해주세요.');
      return;
    }
    if (code.length < 4) {
      Alert.alert('입력 오류', '초대 코드를 정확히 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-invite-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ invite_code: code }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.message ??
          (data?.error === 'invalid_code'
            ? '초대 코드가 올바르지 않습니다.\n코치에게 다시 확인해주세요.'
            : '로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        Alert.alert('로그인 실패', msg);
        return;
      }

      if (!data.session) {
        Alert.alert('오류', '세션 정보를 받지 못했습니다. 다시 시도해주세요.');
        return;
      }

      // Supabase 클라이언트에 세션 주입
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (setErr) {
        console.error('[LOGIN] setSession error:', setErr.message);
        Alert.alert('오류', '세션 설정 실패: ' + setErr.message);
        return;
      }

      // 작업 1: setSession 후 세션 실제 검증
      const { data: { session: verifiedSession } } = await supabase.auth.getSession();
      console.log('[LOGIN] setSession 후 세션:', verifiedSession?.user?.id ?? 'null');

      if (!verifiedSession) {
        // 작업 3: onAuthStateChange 미발화 단서 — 세션이 null로 돌아옴
        console.error('[LOGIN] setSession 성공했지만 세션 null — onAuthStateChange SIGNED_OUT 가능성');
        Alert.alert(
          '로그인 오류',
          '세션 초기화 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.\n(코드: SESSION_NULL)',
        );
        return;
      }

      // 작업 2: 세션 정상 → onAuthStateChange 의존 대신 직접 이동
      console.log('[LOGIN] 세션 정상 → getMyMemberRow() 호출');
      const member = await getMyMemberRow();
      console.log('[LOGIN] member:', member ? `id=${member.id} birth_date=${member.birth_date}` : 'null');

      if (!member || member.birth_date) {
        // 온보딩 완료이거나 member row 없음(기존 회원) → 홈으로
        console.log('[LOGIN] → /(tabs) 이동');
        router.replace('/(tabs)');
      } else {
        // birth_date 없음 → 온보딩 필요
        console.log('[LOGIN] → /(auth)/onboarding 이동');
        router.replace('/(auth)/onboarding');
      }
    } catch (e) {
      console.error('Login error:', e);
      Alert.alert('네트워크 오류', '인터넷 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>K</Text>
          </View>
          <Text style={styles.appName}>KERRI Member</Text>
          <Text style={styles.appSub}>테니스 레슨 관리 앱</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>초대 코드로 시작하기</Text>
          <Text style={styles.cardDesc}>
            코치에게 받은 초대 코드를 입력하면{'\n'}바로 시작할 수 있어요.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>초대 코드</Text>
            <View style={styles.inputRow}>
              <Ionicons name="key-outline" size={18} color={Colors.mutedFg} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="예: ABC123"
                placeholderTextColor={Colors.placeholder}
                value={inviteCode}
                onChangeText={v => setInviteCode(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" />
                  <Text style={styles.loginBtnText}>입장하기</Text>
                </>
              )
            }
          </TouchableOpacity>

          <Text style={styles.helpText}>
            초대 코드가 없다면 담당 코치에게 문의해주세요.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 80 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.white,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 32, fontWeight: '900', color: Colors.primary },
  appName: { fontSize: 26, fontWeight: '800', color: Colors.white },
  appSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    ...Shadow.md,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.primary, marginBottom: 8 },
  cardDesc: {
    fontSize: 14, color: Colors.mutedFg, lineHeight: 20, marginBottom: 20,
  },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.mutedFg, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.mutedBg,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, fontSize: 15, color: Colors.foreground, paddingVertical: 12,
  },
  codeInput: {
    fontSize: 20, fontWeight: '700', letterSpacing: 4,
  },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    marginTop: 4,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  helpText: {
    fontSize: 12, color: Colors.mutedFg, textAlign: 'center', marginTop: 16, lineHeight: 18,
  },
});
