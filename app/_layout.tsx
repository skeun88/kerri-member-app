import { useEffect, useState } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../lib/theme';
import { registerMemberPushToken } from '../lib/notifications';
import { Alert } from 'react-native';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  // After router.replace(), track which segment we're waiting to land on
  const [pendingSegment, setPendingSegment] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments() as string[];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] onAuthStateChange:', event, session?.user?.id ?? 'null');
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Lift the overlay once the router.replace() has visually landed
  useEffect(() => {
    if (pendingSegment !== null && segments[0] === pendingSegment) {
      setPendingSegment(null);
      setIsNavigationReady(true);
    }
  }, [segments, pendingSegment]);

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const seg1 = segments[1] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(auth)' && seg1 === 'onboarding';
    const inQrOnboarding = seg0 === 'qr-onboarding';

    if (!session) {
      if (!inAuth && !inQrOnboarding) {
        router.replace('/(auth)/login');
        setPendingSegment('(auth)');
      } else {
        setIsNavigationReady(true);
      }
      return;
    }

    if (!onboardingChecked) {
      if (inOnboarding) {
        setIsNavigationReady(true);
      } else {
        checkOnboarding();
      }
    }
  }, [session, loading, segments]);
useEffect(() => {
    if (!session) return;
    registerMemberPushToken().catch(e => console.error('[PUSH] 등록 실패:', e));
  }, [session]);

  async function checkOnboarding() {
    setOnboardingChecked(true);
    try {
      const member = await getMyMemberRow();
      if (!member) {
        if (segments[0] === '(auth)') {
          router.replace('/(tabs)');
          setPendingSegment('(tabs)');
        } else {
          setIsNavigationReady(true);
        }
        return;
      }

      const needsOnboarding = !member.birth_date;
      const seg0 = segments[0] as string | undefined;
      const seg1 = segments[1] as string | undefined;
      const inOnboarding = seg1 === 'onboarding';

      if (needsOnboarding && !inOnboarding) {
        router.replace('/(auth)/onboarding');
        setPendingSegment('(auth)');
      } else if (!needsOnboarding && seg0 === '(auth)') {
        router.replace('/(tabs)');
        setPendingSegment('(tabs)');
      } else {
        setIsNavigationReady(true);
      }
    } catch {
      if (segments[0] === '(auth)') {
        router.replace('/(tabs)');
        setPendingSegment('(tabs)');
      } else {
        setIsNavigationReady(true);
      }
    }
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="qr-onboarding" />
      </Stack>
      {(loading || !isNavigationReady) && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
});
