import { useCallback, useEffect, useRef, useState } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { registerMemberPushToken } from '../lib/notifications';
import { LoadingScreen } from '../components/LoadingScreen';
import { configureRevenueCat } from '../lib/revenueCat';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  // After router.replace(), track which segment we're waiting to land on
  const [pendingSegment, setPendingSegment] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments() as string[];
  const segmentsRef = useRef(segments);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  const initSession = useCallback(() => {
    setLoading(true);
    setOnboardingChecked(false);
    setIsNavigationReady(false);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    initSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] onAuthStateChange:', event, session?.user?.id ?? 'null');
      setSession(session);
      if (session?.user) { try { configureRevenueCat(session.user.id); } catch {} }
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
    if (segments.length === 0) return;

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

  // 푸시 알림 탭 → 화면 이동 (앱이 백그라운드/종료 상태에서 열릴 때)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const screen = data?.screen as string | undefined;
      if (!screen) return;
      switch (screen) {
        case 'schedule':  router.push('/(tabs)/schedule'); break;
        case 'report':    router.push('/(tabs)/report');   break;
        case 'chat':      router.push('/coach-chat');      break;
        case 'notifications': router.push('/notifications'); break;
        default: break;
      }
    });
    return () => sub.remove();
  }, []);

  async function checkOnboarding() {
    setOnboardingChecked(true);
    try {
      const member = await getMyMemberRow();
      // await 이후엔 최신 segments를 ref에서 읽음 (stale closure 방지)
      const curSeg0 = segmentsRef.current[0] as string | undefined;
      const curSeg1 = segmentsRef.current[1] as string | undefined;

      if (!member) {
        if (curSeg0 === '(auth)') {
          router.replace('/(tabs)');
          setPendingSegment('(tabs)');
        } else {
          setIsNavigationReady(true);
        }
        return;
      }

      const needsOnboarding = !member.onboarding_completed;
      const inOnboarding = curSeg1 === 'onboarding';

      if (needsOnboarding && !inOnboarding) {
        router.replace('/(auth)/onboarding');
        setPendingSegment('(auth)');
      } else if (!needsOnboarding && curSeg0 === '(auth)') {
        router.replace('/(tabs)');
        setPendingSegment('(tabs)');
      } else {
        setIsNavigationReady(true);
      }
    } catch {
      const curSeg0 = segmentsRef.current[0] as string | undefined;
      if (curSeg0 === '(auth)') {
        router.replace('/(tabs)');
        setPendingSegment('(tabs)');
      } else {
        setIsNavigationReady(true);
      }
    }
  }

  if (loading || !isNavigationReady) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <LoadingScreen onRetry={initSession} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="qr-onboarding" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="write-review" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
