import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { registerMemberPushToken } from '../../lib/notifications';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function CrosshairLogo() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      <Circle cx={60} cy={60} r={60} fill="#F8EEE9" />
      <Line x1={18} y1={60} x2={102} y2={60} stroke="#C0755A" strokeWidth={2.5} />
      <Line x1={60} y1={18} x2={60} y2={102} stroke="#C0755A" strokeWidth={2.5} />
      <Circle cx={60} cy={60} r={10} fill="#C0755A" />
      <Path d="M28 40 L28 28 L40 28" stroke="#C0755A" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M80 28 L92 28 L92 40" stroke="#C0755A" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M28 80 L28 92 L40 92" stroke="#C0755A" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M80 92 L92 92 L92 80" stroke="#C0755A" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isReady = inviteCode.trim().length >= 4;

  async function handleLogin() {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setError('초대 코드를 입력해주세요.');
      return;
    }
    if (code.length < 4) {
      setError('초대 코드를 정확히 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
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
        setError(msg);
        return;
      }

      if (!data.session) {
        setError('세션 정보를 받지 못했습니다. 다시 시도해주세요.');
        return;
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (setErr) {
        console.error('[LOGIN] setSession error:', setErr.message);
        setError('세션 설정 실패: ' + setErr.message);
        return;
      }

      const { data: { session: verifiedSession } } = await supabase.auth.getSession();
      console.log('[LOGIN] setSession 후 세션:', verifiedSession?.user?.id ?? 'null');

      if (!verifiedSession) {
        console.error('[LOGIN] setSession 성공했지만 세션 null — onAuthStateChange SIGNED_OUT 가능성');
        setError('세션 초기화 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const member = await getMyMemberRow();
      console.log('[LOGIN] member:', member ? `id=${member.id} birth_date=${member.birth_date}` : 'null');

      registerMemberPushToken().catch(() => {});

      if (member?.onboarding_completed) {
        console.log('[LOGIN] → /(tabs) 이동');
        router.replace('/(tabs)');
      } else {
        console.log('[LOGIN] → /(auth)/onboarding 이동');
        router.replace('/(auth)/onboarding');
      }
    } catch (e) {
      console.error('Login error:', e);
      setError('인터넷 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.heroArea}>
          <CrosshairLogo />
          <Text style={styles.appName}>KERRI</Text>
          <Text style={styles.headline}>레슨의 변화가 쌓이는 곳</Text>
          <Text style={styles.subline}>코치님의 초대 코드로 시작하세요</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.inputLabel}>초대 코드</Text>
          <TextInput
            style={styles.input}
            placeholder="초대 코드 입력"
            placeholderTextColor="#B0B7C3"
            value={inviteCode}
            onChangeText={v => { setInviteCode(v.toUpperCase()); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>

      <SafeAreaView style={styles.bottom}>
        <TouchableOpacity
          style={[styles.startBtn, (!isReady || loading) && styles.startBtnDisabled]}
          onPress={handleLogin}
          disabled={!isReady || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.startBtnText}>시작하기</Text>
          }
        </TouchableOpacity>
        <Text style={styles.helpText}>
          초대 코드가 없다면 담당 코치님께 문의해주세요
        </Text>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F5' },
  container: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  heroArea: { alignItems: 'center', marginBottom: 32 },
  appName: { fontSize: 16, fontWeight: '700', color: '#C0755A', marginTop: 16, letterSpacing: 3 },
  headline: { fontSize: 24, fontWeight: '800', color: '#20242C', marginTop: 12, textAlign: 'center' },
  subline: { fontSize: 14, color: '#667085', marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#20242C', marginBottom: 10 },
  input: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    color: '#20242C',
    borderWidth: 1.5,
    borderColor: '#E5E9F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F7F7F5',
  },
  errorText: { fontSize: 13, color: '#C0755A', marginTop: 8 },
  bottom: { paddingHorizontal: 20, paddingBottom: 8 },
  startBtn: {
    backgroundColor: '#C0755A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.45 },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  helpText: {
    fontSize: 12,
    color: '#667085',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
    lineHeight: 18,
  },
});
