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
 *  1. members.auth_user_id = user.id  (UUID 직접 연결, 가장 정확)
 *  2. members.id = user.id            (member row가 auth UUID와 동일한 케이스)
 *  3. members.email = user.email      (이메일로 연결 — 최초 로그인 시 자동으로 auth_user_id 저장)
 *
 * 3순위로 찾으면 해당 row에 auth_user_id를 저장해두어 다음 로그인부터 1순위로 빠르게 연결.
 */
export async function getMyMemberRow() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1순위: auth_user_id 직접 매칭 (UUID 기반 연결)
  const { data: byAuthId } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (byAuthId) return byAuthId;

  // 2순위: member.id = auth uid (특수 케이스)
  const { data: byId } = await supabase
    .from('members')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (byId) {
    // auth_user_id 자동 저장 (컬럼이 있을 경우)
    supabase.from('members').update({ auth_user_id: user.id }).eq('id', byId.id).then(() => {});
    return byId;
  }

  // 3순위: 이메일 매칭 → auth_user_id 자동 저장
  if (user.email) {
    const { data: byEmail } = await supabase
      .from('members')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();
    if (byEmail) {
      // 최초 연결 시 auth_user_id 저장
      supabase.from('members').update({ auth_user_id: user.id }).eq('id', byEmail.id).then(() => {});
      return byEmail;
    }
  }

  return null;
}
