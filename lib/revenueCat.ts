import Purchases, { LOG_LEVEL, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY_IOS = 'appl_ZhygbWObQrWKqWnaBasIVAIJtfD';
// TODO: Google Play 인증 완료 후 Android 키로 교체
const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_REAL_ANDROID_KEY';

// RevenueCat 대시보드에서 설정한 Entitlement 식별자
// TODO: 실제 Entitlement 이름으로 교체 (RC 대시보드 → Entitlements)
export const ENTITLEMENT_PRO = 'pro';

export function configureRevenueCat(appUserId: string) {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({
    apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
    appUserID: appUserId,
  });
}

export async function getSubscriptionStatus(): Promise<{
  isActive: boolean;
  expirationDate: string | null;
  customerInfo: CustomerInfo | null;
}> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_PRO];
    return {
      isActive: !!entitlement,
      expirationDate: entitlement?.expirationDate ?? null,
      customerInfo,
    };
  } catch {
    return { isActive: false, expirationDate: null, customerInfo: null };
  }
}
