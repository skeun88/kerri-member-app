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

  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'KERRI',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
  const token = tokenResult.data;
  if (!token) return;

  const member = await getMyMemberRow();
  if (!member) return;

  await supabase.from('member_push_tokens').upsert({
    member_id: member.id,
    push_token: token,
    platform: Platform.OS as 'ios' | 'android',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_id' });
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
