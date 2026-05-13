/**
 * Branch.io 딥링크 처리 유틸
 * ─────────────────────────────────────
 * 설정 방법:
 * 1. https://branch.io 에서 계정 생성
 * 2. 앱 등록 → Live Key 복사
 * 3. app.json의 BRANCH_LIVE_KEY_HERE, BRANCH_APP_LINK_DOMAIN_HERE 교체
 * 4. EAS Build 후 TestFlight 업로드
 */

import branch from 'react-native-branch';
import { supabase } from './supabase';

export async function initBranch(onMemberLinked?: (memberName: string) => void) {
  // Branch 구독: 앱이 딥링크로 열릴 때 (신규 설치 포함)
  const unsubscribe = branch.subscribe({
    onOpenComplete: async ({ error, params }) => {
      if (error) { console.warn('Branch error:', error); return; }
      if (!params || !params['+clicked_branch_link']) return;

      const memberId = params['member_id'] as string | undefined;
      if (!memberId) return;

      // 현재 로그인된 유저에 member_id 연결
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('members')
        .select('id, name, auth_user_id')
        .eq('id', memberId)
        .maybeSingle();

      if (!member) return;
      if (member.auth_user_id === user.id) return; // 이미 연결됨

      await supabase
        .from('members')
        .update({ auth_user_id: user.id })
        .eq('id', memberId);

      onMemberLinked?.(member.name);
    },
  });

  return unsubscribe;
}
