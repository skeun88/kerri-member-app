import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, getMyMemberRow } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const EXPO_PROJECT_ID = '7341ba53-a81c-4e21-b4b3-a25cad0c9dd4';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerMemberPushToken() {
  if (Constants.appOwnership === 'expo') return; // Expo Go에서는 스킵

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.error('[PUSH] 알림 권한 거부 또는 미허용. status:', finalStatus);
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'KERRI',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let token: string | undefined;
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    token = tokenResult.data;
  } catch (e) {
    console.error('[PUSH] getExpoPushTokenAsync 실패. projectId:', EXPO_PROJECT_ID, '에러:', e);
    return;
  }

  if (!token) {
    console.error('[PUSH] 토큰 발급 실패 (빈 값)');
    return;
  }
  console.log('[PUSH] 토큰 발급 성공:', token.slice(0, 30) + '...');

  const { data: { user } } = await supabase.auth.getUser();
  console.log('[PUSH] 현재 auth uid:', user?.id ?? 'null');

  const member = await getMyMemberRow();
  if (!member) {
    console.error('[PUSH] 회원 레코드 없음. auth uid:', user?.id ?? 'null');
    return;
  }
  console.log('[PUSH] 회원 id:', member.id);

  const { error } = await supabase.from('member_push_tokens').upsert({
    member_id: member.id,
    push_token: token,
    platform: Platform.OS as 'ios' | 'android',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_id' });

  if (error) {
    console.error('[PUSH] upsert 실패:', error);
  } else {
    console.log('[PUSH] 토큰 등록 완료');
  }
}

// PN-03: 회원 → 코치 메시지 알림
export async function notifyCoachMessage(coachId: string, memberName: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      recipient_type: 'coach',
      recipient_id: coachId,
      title: '회원 메시지',
      body: `${memberName} 회원에게 새로운 메시지가 도착했습니다.`,
      data: { screen: 'messages' },
      notif_id: 'PN-03',
    }),
  }).catch(() => {});
}
