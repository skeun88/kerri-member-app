import { supabase, getMyMemberRow } from './supabase';

export const REPORT_CREDIT_COST = 700;   // 리포트 1건당 700원
export const MIN_CHARGE_AMOUNT = 10000;  // 최소 충전 단위 10,000원

export interface CreditInfo {
  balance: number;
  total_charged: number;
  total_used: number;
  free_report_used: boolean;
}

/** 현재 회원의 크레딧 정보 조회 */
export async function getMyCreditInfo(): Promise<CreditInfo> {
  const member = await getMyMemberRow();
  if (!member) return { balance: 0, total_charged: 0, total_used: 0, free_report_used: false };

  const { data } = await supabase
    .from('member_report_credits')
    .select('balance, total_charged, total_used, free_report_used')
    .eq('member_id', member.id)
    .maybeSingle();

  if (!data) return { balance: 0, total_charged: 0, total_used: 0, free_report_used: false };
  return data as CreditInfo;
}

/** 리포트 열람 잠금 해제
 * - 첫 1건: 무료 체험
 * - 이후: 크레딧 1,000원 차감
 * Returns: { success, reason, balance }
 */
type UnlockReason = 'already_unlocked' | 'free_trial' | 'credit_used' | 'insufficient_credit' | 'report_not_found' | 'error';

export async function unlockReport(reportId: string): Promise<{
  success: boolean;
  reason: UnlockReason;
  balance?: number;
  error?: string;
}> {
  const member = await getMyMemberRow();
  if (!member) return { success: false, reason: 'error', error: '회원 정보를 찾을 수 없습니다.' };

  const { data, error } = await supabase.rpc('unlock_member_report', {
    p_member_id: member.id,
    p_report_id: reportId,
  });

  if (error) return { success: false, reason: 'error', error: error.message };

  const result = data as { success: boolean; reason: string; balance?: number };
  return {
    success: result.success,
    reason: result.reason as UnlockReason,
    balance: result.balance,
  };
}

/** 크레딧 충전 (만원 단위) */
export async function chargeCredit(amount: number): Promise<{ success: boolean; balance?: number; error?: string }> {
  if (amount % MIN_CHARGE_AMOUNT !== 0 || amount <= 0) {
    return { success: false, error: '충전 금액은 10,000원 단위여야 합니다.' };
  }

  const member = await getMyMemberRow();
  if (!member) return { success: false, error: '회원 정보를 찾을 수 없습니다.' };

  const { data, error } = await supabase.rpc('charge_member_report_credit', {
    p_member_id: member.id,
    p_amount: amount,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, balance: data as number };
}

/** 충전 금액 옵션 목록 */
export const CHARGE_OPTIONS = [
  { amount: 10000, label: '10,000원', reports: 14, description: '리포트 14건' },
  { amount: 20000, label: '20,000원', reports: 28, description: '리포트 28건' },
  { amount: 30000, label: '30,000원', reports: 42, description: '리포트 42건' },
];
