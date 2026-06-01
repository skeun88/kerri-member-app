import { supabase } from './supabase';

export type PlanId = 'basic' | 'pro';

export interface CoachSubscriptionInfo {
  plan_id: PlanId;
  status: string;
  features: {
    member_management: boolean;
    ai_analysis: boolean;
    reports: boolean;
    profile: boolean;
    tagging: boolean;
  };
}

/**
 * 현재 로그인한 회원의 소속 코치 구독 정보 조회
 */
export async function getMyCoachSubscription(): Promise<CoachSubscriptionInfo | null> {
  // 현재 회원의 auth user id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 회원이 속한 레슨의 코치 id 조회
  const { data: memberData } = await supabase
    .from('members')
    .select('coach_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!memberData?.coach_id) return null;

  // 코치 구독 조회 (RLS: 소속 코치만 조회 가능)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, status, subscription_plans(features)')
    .eq('coach_id', memberData.coach_id)
    .single();

  if (!sub) return null;

  return {
    plan_id: sub.plan_id as PlanId,
    status: sub.status,
    features: (sub as any).subscription_plans?.features ?? {
      member_management: true,
      ai_analysis: false,
      reports: false,
      profile: false,
      tagging: false,
    },
  };
}

export function coachCanProvide(
  coachSub: CoachSubscriptionInfo | null,
  feature: keyof CoachSubscriptionInfo['features']
): boolean {
  if (!coachSub) return false;
  if (coachSub.status === 'blocked' || coachSub.status === 'cancelled') return false;
  return coachSub.features[feature] === true;
}
