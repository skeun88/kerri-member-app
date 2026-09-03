import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Radius, Shadow } from '../lib/theme';
import { getSubscriptionStatus } from '../lib/revenueCat';
import { supabase } from '../lib/supabase';

const CREDIT_PRODUCT_ID = 'kerri_credit_4900';

type BillingCycle = 'monthly' | 'annual';
type PlanKey = 'basic' | 'pro';
type CurrentPlan = 'free' | 'basic' | 'pro';

const PLAN_META = {
  basic: {
    name: 'Basic',
    price: { monthly: '9,900원/월', annual: '109,000원/년' },
    annualMonthly: '월 환산 약 9,083원',
    trialSubtext: {
      monthly: '오늘 결제 0원 · 이후 월 9,900원',
      annual: '오늘 결제 0원 · 이후 연 109,000원',
    },
  },
  pro: {
    name: 'Pro',
    price: { monthly: '19,000원/월', annual: '209,000원/년' },
    annualMonthly: '월 환산 약 17,417원',
    trialSubtext: {
      monthly: '오늘 결제 0원 · 이후 월 19,000원',
      annual: '오늘 결제 0원 · 이후 연 209,000원',
    },
  },
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch { return null; }
}

function detectPlanFromProductId(productId: string): { planKey: PlanKey; billingCycle: BillingCycle } {
  const id = productId.toLowerCase();
  const planKey: PlanKey = id.includes('basic') ? 'basic' : 'pro';
  const billingCycle: BillingCycle = (id.includes('annual') || id.includes('year')) ? 'annual' : 'monthly';
  return { planKey, billingCycle };
}

function getCTAInfo(
  cardPlan: PlanKey,
  selectedCycle: BillingCycle,
  currentPlan: CurrentPlan,
  currentBilling: BillingCycle,
  trialEligible: boolean,
): { label: string; disabled: boolean; showTrialSubtext: boolean } {
  if (currentPlan === cardPlan && selectedCycle === currentBilling) {
    return { label: '현재 플랜', disabled: true, showTrialSubtext: false };
  }
  if (currentPlan === cardPlan && selectedCycle !== currentBilling) {
    return {
      label: selectedCycle === 'annual' ? '연간으로 변경' : '월간으로 변경',
      disabled: false,
      showTrialSubtext: false,
    };
  }
  if (trialEligible && currentPlan === 'free') {
    return { label: '14일 무료로 시작하기', disabled: false, showTrialSubtext: true };
  }
  if (currentPlan === 'free') {
    return {
      label: cardPlan === 'basic' ? 'Basic 구독하기' : 'Pro 구독하기',
      disabled: false,
      showTrialSubtext: false,
    };
  }
  if (cardPlan === 'pro') return { label: 'Pro로 변경', disabled: false, showTrialSubtext: false };
  return { label: 'Basic으로 변경', disabled: false, showTrialSubtext: false };
}

async function purchaseViaRevenueCat(
  planKey: PlanKey,
  billingCycle: BillingCycle,
): Promise<'success' | 'user_cancelled' | 'pending' | 'package_not_found' | string> {
  try {
    const Purchases = require('react-native-purchases').default;
    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages ?? [];

    const targetPackage = packages.find((pkg: any) => {
      const id = pkg.product.identifier.toLowerCase();
      const planMatch = planKey === 'basic' ? id.includes('basic') : id.includes('pro');
      const cycleMatch = billingCycle === 'annual'
        ? (id.includes('annual') || id.includes('year'))
        : (!id.includes('annual') && !id.includes('year'));
      return planMatch && cycleMatch;
    }) ?? packages.find((pkg: any) => {
      const id = pkg.product.identifier.toLowerCase();
      return planKey === 'basic' ? id.includes('basic') : id.includes('pro');
    });

    if (!targetPackage) return 'package_not_found';
    await Purchases.purchasePackage(targetPackage);
    return 'success';
  } catch (e: any) {
    if (e?.userCancelled) return 'user_cancelled';
    if (e?.message?.toLowerCase().includes('pending')) return 'pending';
    return e?.message ?? 'error';
  }
}

async function checkTrialEligibility(): Promise<boolean> {
  try {
    const Purchases = require('react-native-purchases').default;
    if (typeof Purchases.checkTrialOrIntroductoryPriceEligibility !== 'function') return false;
    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages ?? [];
    const productIds: string[] = packages.map((pkg: any) => pkg.product.identifier);
    if (!productIds.length) return false;
    const eligibilityMap = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    return Object.values(eligibilityMap).some((e: any) => e?.status === 3);
  } catch {
    return false;
  }
}

async function purchaseCreditViaRevenueCat(): Promise<{
  status: 'success' | 'user_cancelled' | 'package_not_found' | 'error';
  transactionId?: string;
  productId?: string;
  error?: string;
}> {
  try {
    const Purchases = require('react-native-purchases').default;
    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages ?? [];
    const creditPackage = packages.find((pkg: any) =>
      pkg.product.identifier === CREDIT_PRODUCT_ID ||
      pkg.product.identifier.toLowerCase().includes('credit') ||
      pkg.product.identifier.toLowerCase().includes('lesson')
    );
    if (!creditPackage) return { status: 'package_not_found' };
    const { customerInfo } = await Purchases.purchasePackage(creditPackage);
    const tx = customerInfo.nonSubscriptionTransactions?.find(
      (t: any) => t.productIdentifier === creditPackage.product.identifier
    );
    return { status: 'success', transactionId: tx?.transactionIdentifier, productId: creditPackage.product.identifier };
  } catch (e: any) {
    if (e?.userCancelled) return { status: 'user_cancelled' };
    return { status: 'error', error: e?.message ?? 'error' };
  }
}

async function restoreViaRevenueCat(): Promise<boolean> {
  try {
    const Purchases = require('react-native-purchases').default;
    const info = await Purchases.restorePurchases();
    return Object.keys(info.entitlements.active).length > 0;
  } catch { return false; }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, valueColor }: {
  icon: string; label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={Colors.mutedFg} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function PlanCard({
  planKey, billingCycle, currentPlan, currentBilling, trialEligible,
  onPurchase, purchasingPlan,
}: {
  planKey: PlanKey;
  billingCycle: BillingCycle;
  currentPlan: CurrentPlan;
  currentBilling: BillingCycle;
  trialEligible: boolean;
  onPurchase: (planKey: PlanKey) => void;
  purchasingPlan: PlanKey | null;
}) {
  const meta = PLAN_META[planKey];
  const isPro = planKey === 'pro';
  const isCurrentCard = currentPlan === planKey && billingCycle === currentBilling;
  const isPurchasing = purchasingPlan === planKey;
  const anyPurchasing = purchasingPlan !== null;
  const { label, disabled, showTrialSubtext } = getCTAInfo(planKey, billingCycle, currentPlan, currentBilling, trialEligible);

  return (
    <View style={[
      styles.planCard,
      isPro && !isCurrentCard && styles.planCardPro,
      isCurrentCard && styles.planCardCurrent,
    ]}>
      {isCurrentCard ? (
        <View style={styles.currentBadge}>
          <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
          <Text style={styles.currentBadgeText}>현재 플랜</Text>
        </View>
      ) : isPro ? (
        <View style={styles.recommendBadge}>
          <Text style={styles.recommendBadgeText}>추천</Text>
        </View>
      ) : null}

      {trialEligible && currentPlan === 'free' && (
        <View style={styles.trialBadge}>
          <Text style={styles.trialBadgeText}>첫 구독 14일 무료</Text>
        </View>
      )}

      <Text style={[styles.planCardName, isPro && !isCurrentCard && styles.planCardNamePro]}>
        {meta.name}
      </Text>
      <Text style={styles.planCardPrice}>{meta.price[billingCycle]}</Text>
      {billingCycle === 'annual' && (
        <Text style={styles.planCardMonthly}>{meta.annualMonthly}</Text>
      )}
      {billingCycle === 'annual' && (
        <Text style={styles.planCardBenefit}>연간 결제 시 1개월분 절약</Text>
      )}

      <TouchableOpacity
        style={[
          styles.subscribeBtn,
          isPro && !disabled && !isCurrentCard && styles.subscribeBtnPro,
          disabled && styles.subscribeBtnDisabled,
        ]}
        onPress={() => { if (!disabled && !anyPurchasing) onPurchase(planKey); }}
        disabled={disabled || anyPurchasing}
      >
        {isPurchasing ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={[styles.subscribeBtnText, disabled && styles.subscribeBtnTextDisabled]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>

      {showTrialSubtext && (
        <View style={styles.trialSubtextBox}>
          <Text style={styles.trialSubtextMain}>{meta.trialSubtext[billingCycle]}</Text>
          <Text style={styles.trialSubtextSub}>언제든 구독 취소 가능</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan>('free');
  const [currentBilling, setCurrentBilling] = useState<BillingCycle>('monthly');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [trialEligible, setTrialEligible] = useState(false);
  const [purchasingPlan, setPurchasingPlan] = useState<PlanKey | null>(null);
  const [creditPurchasing, setCreditPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function loadData() {
    try {
      const [status, eligible] = await Promise.all([
        getSubscriptionStatus(),
        checkTrialEligibility(),
      ]);
      setTrialEligible(eligible);
      setIsSubscribed(status.isActive);
      setExpirationDate(status.expirationDate);

      if (status.isActive && status.customerInfo) {
        const active = status.customerInfo.entitlements.active;
        const entitlement = active['pro'] || active['basic'];
        if (entitlement?.productIdentifier) {
          const { planKey, billingCycle: bc } = detectPlanFromProductId(entitlement.productIdentifier);
          setCurrentPlan(planKey);
          setCurrentBilling(bc);
          setBillingCycle(bc);
        }
      } else {
        setCurrentPlan('free');
      }
    } catch (e) {
      console.error('[Subscription] load error:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function handlePurchase(planKey: PlanKey) {
    setPurchasingPlan(planKey);
    const result = await purchaseViaRevenueCat(planKey, billingCycle);
    setPurchasingPlan(null);

    if (result === 'success') {
      Alert.alert('구독이 시작되었습니다', `${PLAN_META[planKey].name} 플랜을 이용할 수 있습니다.`);
      loadData();
    } else if (result === 'pending') {
      Alert.alert('결제 확인 중', '결제 처리 중입니다. 잠시 후 구독 상태가 업데이트됩니다.');
    } else if (result === 'package_not_found') {
      Alert.alert('오류', '구독 상품 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
    } else if (result !== 'user_cancelled') {
      Alert.alert('결제를 완료하지 못했습니다. 다시 시도해주세요.', result || '');
    }
  }

  async function handleCreditPurchase() {
    setCreditPurchasing(true);
    const result = await purchaseCreditViaRevenueCat();

    if (result.status === 'user_cancelled') { setCreditPurchasing(false); return; }
    if (result.status === 'package_not_found') {
      setCreditPurchasing(false);
      Alert.alert('준비 중', 'AI 레슨 기록 충전권은 곧 구매 가능합니다.');
      return;
    }
    if (result.status === 'error') {
      setCreditPurchasing(false);
      Alert.alert('구매 실패', result.error || '구매 중 오류가 발생했습니다.');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('confirm-iap-credit', {
        body: {
          productId: result.productId ?? CREDIT_PRODUCT_ID,
          transactionId: result.transactionId ?? `${CREDIT_PRODUCT_ID}-${Date.now()}`,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setCreditPurchasing(false);
      if (error || !data?.success) throw new Error(data?.error || '충전 확인 실패');
      Alert.alert('충전 완료', `AI 레슨 기록 10회가 충전됐어요!\n현재 잔액: ${(data.balance as number).toLocaleString()}원`);
    } catch {
      setCreditPurchasing(false);
      Alert.alert('충전 오류', '결제는 완료됐지만 크레딧 적립에 실패했습니다. 고객센터에 문의해주세요.');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const hasActive = await restoreViaRevenueCat();
    setRestoring(false);
    Alert.alert('복원 완료', hasActive ? '기존 구독이 복원되었습니다.' : '복원할 구독 정보가 없습니다.');
    if (hasActive) loadData();
  }

  function handleManageSubscription() {
    if (Platform.OS === 'android') {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    } else {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    }
  }

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>요금제</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {Header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {Header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 현재 구독 정보 (유료 구독자) */}
        {isSubscribed && (
          <View style={styles.activeInfoCard}>
            <View style={styles.activeBadgeRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.activeBadgeText}>구독 중</Text>
            </View>
            {expirationDate && (
              <InfoRow icon="refresh-outline" label="다음 갱신일" value={formatDate(expirationDate) ?? '-'} />
            )}
          </View>
        )}

        {/* 플랜 카드 영역 */}
        <View style={styles.section}>
          <Text style={styles.planTitle}>KERRI 요금제</Text>
          {!isSubscribed && trialEligible && (
            <Text style={styles.planSub}>모든 플랜 · 14일 무료 체험 포함</Text>
          )}

          {/* 월간 / 연간 토글 */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, billingCycle === 'monthly' && styles.toggleBtnActive]}
              onPress={() => setBillingCycle('monthly')}
            >
              <Text style={[styles.toggleBtnText, billingCycle === 'monthly' && styles.toggleBtnTextActive]}>
                월간
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, billingCycle === 'annual' && styles.toggleBtnActive]}
              onPress={() => setBillingCycle('annual')}
            >
              <Text style={[styles.toggleBtnText, billingCycle === 'annual' && styles.toggleBtnTextActive]}>
                연간
              </Text>
              {billingCycle !== 'annual' && (
                <View style={styles.annualHintBadge}>
                  <Text style={styles.annualHintText}>1개월분 절약</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Free 카드 (비구독자에게 현재 플랜 표시) */}
          {!isSubscribed && (
            <View style={[styles.planCard, styles.planCardCurrent]}>
              <View style={styles.currentBadge}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                <Text style={styles.currentBadgeText}>현재 플랜</Text>
              </View>
              <Text style={styles.planCardName}>Free</Text>
              <Text style={styles.planCardPrice}>무료</Text>
              <View style={[styles.subscribeBtn, styles.subscribeBtnDisabled]}>
                <Text style={[styles.subscribeBtnText, styles.subscribeBtnTextDisabled]}>현재 플랜</Text>
              </View>
            </View>
          )}

          <PlanCard
            planKey="basic"
            billingCycle={billingCycle}
            currentPlan={currentPlan}
            currentBilling={currentBilling}
            trialEligible={trialEligible}
            onPurchase={handlePurchase}
            purchasingPlan={purchasingPlan}
          />
          <PlanCard
            planKey="pro"
            billingCycle={billingCycle}
            currentPlan={currentPlan}
            currentBilling={currentBilling}
            trialEligible={trialEligible}
            onPurchase={handlePurchase}
            purchasingPlan={purchasingPlan}
          />

          {/* 구독 관리 버튼 (유료 구독자만) */}
          {isSubscribed && (
            <TouchableOpacity style={styles.manageBtn} onPress={handleManageSubscription}>
              <Ionicons name="settings-outline" size={18} color={Colors.primary} />
              <Text style={styles.manageBtnText}>
                {Platform.OS === 'android' ? 'Google Play에서 구독 관리' : 'App Store에서 구독 관리'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
            {restoring ? (
              <ActivityIndicator size="small" color={Colors.mutedFg} />
            ) : (
              <Text style={styles.restoreBtnText}>기존 구독 복원</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 취소 및 환불 안내 */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>언제든 구독 취소 가능</Text>
          <Text style={styles.noticeText}>
            무료 체험은 종료 최소 24시간 전까지 취소하지 않으면 선택한 요금제로 자동 갱신됩니다.
          </Text>
          <Text style={styles.noticeText}>
            {Platform.OS === 'android'
              ? 'Android 구독은 Google Play에서 관리·취소할 수 있습니다.'
              : 'iOS 구독은 Apple App Store에서 관리·취소할 수 있습니다.'}
          </Text>
          <Text style={styles.noticeText}>
            환불은 각 스토어의 정책과 심사 결과에 따라{Platform.OS === 'android' ? ' Google' : ' Apple'}에서 처리됩니다.
          </Text>
        </View>

        {/* AI 레슨 기록 충전권 */}
        <View style={styles.creditSection}>
          <View style={styles.creditSectionHeader}>
            <Ionicons name="sparkles" size={18} color="#9b59b6" />
            <Text style={styles.creditSectionTitle}>AI 레슨 기록 충전권</Text>
          </View>
          <Text style={styles.creditSectionSub}>정기구독과 별도인 1회성 구매 상품</Text>
          <View style={styles.creditCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.creditCardTitle}>AI 레슨 기록 10회 충전</Text>
              <Text style={styles.creditCardSub}>소진 후 재구매 가능 · 구독과 무관</Text>
            </View>
            <Text style={styles.creditCardPrice}>4,900원</Text>
          </View>
          <TouchableOpacity style={styles.creditBtn} onPress={handleCreditPurchase} disabled={creditPurchasing}>
            {creditPurchasing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={Colors.white} />
                <Text style={styles.creditBtnText}>충전권 구매하기</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white },
  scroll: { padding: 16 },
  section: { marginBottom: 20 },

  activeInfoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
    ...Shadow.sm,
  },
  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  activeBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  infoLabel: { flex: 1, fontSize: 14, color: Colors.mutedFg },
  infoValue: { fontSize: 14, fontWeight: '700', color: Colors.foreground },

  planTitle: { fontSize: 22, fontWeight: '900', color: Colors.foreground, marginBottom: 6 },
  planSub: { fontSize: 14, color: Colors.mutedFg, marginBottom: 20 },

  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.mutedBg,
    borderRadius: Radius.full,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, borderRadius: Radius.full, paddingVertical: 10,
  },
  toggleBtnActive: { backgroundColor: Colors.white, ...Shadow.sm },
  toggleBtnText: { fontSize: 15, fontWeight: '600', color: Colors.mutedFg },
  toggleBtnTextActive: { color: Colors.foreground },
  annualHintBadge: {
    backgroundColor: Colors.primary + '20', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  annualHintText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  planCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 12,
    ...Shadow.sm,
  },
  planCardPro: { borderColor: Colors.primary, borderWidth: 2 },
  planCardCurrent: { borderColor: Colors.success, borderWidth: 2 },
  planCardName: { fontSize: 20, fontWeight: '900', color: Colors.foreground, marginBottom: 6 },
  planCardNamePro: { color: Colors.primary },
  planCardPrice: { fontSize: 24, fontWeight: '800', color: Colors.foreground, marginBottom: 4 },
  planCardMonthly: { fontSize: 12, color: Colors.mutedFg, marginBottom: 4 },
  planCardBenefit: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginBottom: 4 },

  recommendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 12,
  },
  recommendBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  currentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.success + '20',
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 12,
  },
  currentBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.success },
  trialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '15',
    borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 8,
  },
  trialBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  subscribeBtn: {
    backgroundColor: Colors.mutedFg,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  subscribeBtnPro: { backgroundColor: Colors.primary },
  subscribeBtnDisabled: { backgroundColor: Colors.borderLight },
  subscribeBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  subscribeBtnTextDisabled: { color: Colors.mutedFg },

  trialSubtextBox: { marginTop: 8, gap: 3, alignItems: 'center' },
  trialSubtextMain: { fontSize: 12, color: Colors.mutedFg },
  trialSubtextSub: { fontSize: 11, color: Colors.mutedFg },

  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginTop: 4, marginBottom: 4,
    ...Shadow.sm,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.primary },

  restoreBtn: { alignItems: 'center', paddingVertical: 16 },
  restoreBtnText: { fontSize: 14, color: Colors.mutedFg, textDecorationLine: 'underline' },

  noticeCard: {
    backgroundColor: Colors.mutedBg,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  noticeTitle: { fontSize: 13, fontWeight: '700', color: Colors.foreground, marginBottom: 2 },
  noticeText: { fontSize: 12, color: Colors.mutedFg, lineHeight: 18 },

  creditSection: {
    backgroundColor: '#f5f0fa',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#ddd4f0',
    padding: 20,
    marginBottom: 8,
  },
  creditSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  creditSectionTitle: { fontSize: 16, fontWeight: '800', color: '#7d4fb7' },
  creditSectionSub: { fontSize: 13, color: '#9b7bbf', marginBottom: 16 },
  creditCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#ddd4f0',
  },
  creditCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.foreground, marginBottom: 3 },
  creditCardSub: { fontSize: 12, color: Colors.mutedFg },
  creditCardPrice: { fontSize: 20, fontWeight: '900', color: '#7d4fb7' },
  creditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#9b59b6',
    borderRadius: Radius.md, paddingVertical: 14,
  },
  creditBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
