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

export async function getSubscriptionStatus(): Promise<{
  isActive: boolean;
  expirationDate: string | null;
  customerInfo: any | null;
}> {
  try {
    const Purchases = getPurchases();
    if (!Purchases) return { isActive: false, expirationDate: null, customerInfo: null };
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_PRO]
                     || customerInfo.entitlements.active[ENTITLEMENT_BASIC];
    return {
      isActive: !!entitlement,
      expirationDate: entitlement?.expirationDate ?? null,
      customerInfo,
    };
  } catch {
    return { isActive: false, expirationDate: null, customerInfo: null };
  }
}
