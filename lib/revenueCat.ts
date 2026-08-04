import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat 대시보드에서 발급받은 앱 전용 공개 키 (Secret 아님)
// TODO: 실제 키로 교체 필요 (RevenueCat Dashboard → API Keys)
const RC_API_KEY_IOS = 'appl_REPLACE_WITH_REAL_IOS_KEY';
const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_REAL_ANDROID_KEY';

export function configureRevenueCat(appUserId: string) {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({
    apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
    appUserID: appUserId,
  });
}

// 인앱 상품 ID → 충전 금액(원) 매핑
// Play Console / App Store Connect에 동일한 ID로 소모품(consumable) 등록 필요
export const PRODUCT_CREDIT_MAP: Record<string, number> = {
  kerri_member_credits_10k: 10000,
  kerri_member_credits_20k: 20000,
  kerri_member_credits_30k: 30000,
  kerri_member_credits_50k: 50000,
};
