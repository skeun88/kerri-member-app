import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../lib/theme';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const router = useRouter();
  const segments = useSegments() as string[];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const seg1 = segments[1] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(auth)' && seg1 === 'onboarding';

    if (!session) {
      // 미로그인 → 로그인 화면
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    // 로그인 상태 → 온보딩 완료 여부 체크 (한 번만)
    if (!onboardingChecked) {
      if (inAuth && !inOnboarding) {
        checkOnboarding();
      } else if (!inAuth) {
        checkOnboarding();
      }
    }
  }, [session, loading, segments]);

  async function checkOnboarding() {
    setOnboardingChecked(true);
    try {
      const member = await getMyMemberRow();
      if (!member) return;

      // birth_date 없으면 온보딩 미완료
      const needsOnboarding = !member.birth_date;

      const seg0 = segments[0] as string | undefined;
      const seg1 = segments[1] as string | undefined;
      const inOnboarding = seg1 === 'onboarding';

      if (needsOnboarding && !inOnboarding) {
        router.replace('/(auth)/onboarding');
      } else if (!needsOnboarding && seg0 === '(auth)') {
        router.replace('/(tabs)');
      }
    } catch {
      // 에러 시 그냥 tabs로
      if (segments[0] === '(auth)') router.replace('/(tabs)');
    }
  }

  if (loading) return (
    <GestureHandlerRootView style={styles.flex}>
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    </GestureHandlerRootView>
  );

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
});
