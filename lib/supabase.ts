import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * 로그인한 유저에 해당하는 member row를 찾는 헬퍼.
 * 우선순위:
 *  1. members.email = user.email (회원 이메일 등록된 경우)
 *  2. members.id = user.id (member id가 auth uid와 동일한 경우)
 *  3. 테스트용: coach_id = user.id인 첫 번째 회원 (코치 계정으로 테스트할 때)
 */
export async function getMyMemberRow() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1순위: 이메일 매칭
  const { data: byEmail } = await supabase
    .from('members').select('*').eq('email', user.email).maybeSingle();
  if (byEmail) return byEmail;

  // 2순위: auth uid = member id
  const { data: byId } = await supabase
    .from('members').select('*').eq('id', user.id).maybeSingle();
  if (byId) return byId;

  // 3순위: 코치 계정 테스트용 - 내가 코치인 첫 번째 회원
  const { data: asCoach } = await supabase
    .from('members').select('*').eq('coach_id', user.id)
    .eq('is_active', true).order('created_at').limit(1).maybeSingle();
  return asCoach ?? null;
}
