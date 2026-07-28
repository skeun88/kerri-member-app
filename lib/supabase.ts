import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('Missing env: EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseAnonKey) throw new Error('Missing env: EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
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
 */
export async function getMyMemberRow() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1순위: auth_user_id 직접 매칭
  const { data: byAuthId } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (byAuthId) return byAuthId;

  // 2순위: member.id = auth uid
  const { data: byId } = await supabase
    .from('members')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (byId) {
    await supabase.from('members').update({ auth_user_id: user.id }).eq('id', byId.id);
    return { ...byId, auth_user_id: user.id };
  }

  // 3순위: SECURITY DEFINER RPC로 이메일 매칭 → auth_user_id 자동 링크 (RLS 우회)
  const { data: linkedId } = await supabase.rpc('get_my_member_id_by_email');
  if (linkedId) {
    const { data: linked } = await supabase
      .from('members')
      .select('*')
      .eq('id', linkedId)
      .maybeSingle();
    if (linked) return linked;
  }

  return null;
}
