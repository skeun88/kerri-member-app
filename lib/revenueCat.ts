import { Platform } from 'react-native';

const RC_API_KEY_IOS = 'appl_ZhygbWObQrWKqWnaBasIVAIJtfD';
const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_REAL_ANDROID_KEY';

export const ENTITLEMENT_PRO = 'pro';
export const ENTITLEMENT_BASIC = 'basic';

function getPurchases() {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
}

export function configureRevenueCat(appUserId: string) {
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    const { LOG_LEVEL } = require('react-native-purchases');
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({
      apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
      appUserID: appUserId,
    });
  } catch {}
}

/**
 * KST 기준으로 두 날짜의 날짜 차이(일)를 계산합니다.
 * expirationDate UTC → KST 자정까지 남은 일수를 반환합니다.
 * UTC+9 오프셋을 직접 적용해 타임존 변환 없이 일관된 값을 보장합니다.
 */
export function calcTrialDaysLeft(expirationDateIso: string | null): number {
  if (!expirationDateIso) return 0;
  const expMs = new Date(expirationDateIso).getTime();
  // KST 기준 오늘 자정 (UTC+9)
  const nowUtcMs = Date.now();
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const nowKstMs = nowUtcMs + kstOffsetMs;
  const todayKstMidnightMs = nowKstMs - (nowKstMs % (24 * 60 * 60 * 1000));
  // expirationDate를 KST 기준 날짜로 변환
  const expKstMs = expMs + kstOffsetMs;
  const expKstMidnightMs = expKstMs - (expKstMs % (24 * 60 * 60 * 1000));
  const diffDays = Math.round((expKstMidnightMs - todayKstMidnightMs) / (24 * 60 * 60 * 1000));
  return diffDays; // 음수이면 이미 만료
}

/**
 * expirationDate (UTC ISO)를 KST 기준 날짜 문자열로 변환합니다.
 * 예: "2026-10-23T14:59:59Z" → "10월 23일"
 */
export function formatKstDate(dateIso: string | null | undefined, format: 'dot' | 'korean' = 'dot'): string | null {
  if (!dateIso) return null;
  try {
    const ms = new Date(dateIso).getTime();
    const kstMs = ms + 9 * 60 * 60 * 1000;
    const d = new Date(kstMs);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if (format === 'korean') return `${month}월 ${day}일`;
    const year = d.getUTCFullYear();
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  } catch { return null; }
}

export async function getSubscriptionStatus(): Promise<{
  isActive: boolean;
  isTrial: boolean;
  willRenew: boolean;
  daysLeft: number;        // KST 기준 남은 날짜 (음수=이미 만료)
  expirationDate: string | null; // UTC ISO 원본
  customerInfo: any | null;
}> {
  const fallback = { isActive: false, isTrial: false, willRenew: false, daysLeft: 0, expirationDate: null, customerInfo: null };
  try {
    const Purchases = getPurchases();
    if (!Purchases) return fallback;
    const customerInfo = await Purchases.getCustomerInfo();
    const active = customerInfo.entitlements.active;
    const entitlement = active[ENTITLEMENT_PRO] ?? active[ENTITLEMENT_BASIC] ?? null;
    if (!entitlement) return fallback;
    // periodType: 'TRIAL' | 'INTRO' | 'NORMAL' | 'PREPAID'
    const isTrial = entitlement.periodType === 'TRIAL' || entitlement.periodType === 'INTRO';
    const willRenew: boolean = entitlement.willRenew ?? false;
    const expirationDate: string | null = entitlement.expirationDate ?? null;
    const daysLeft = calcTrialDaysLeft(expirationDate);
    // entitlement.expirationDate: ISO UTC 문자열 (ex. "2026-11-20T00:00:00Z")
    return {
      isActive: true,
      isTrial,
      willRenew,
      daysLeft,
      expirationDate,
      customerInfo,
    };
  } catch {
    return fallback;
  }
}
