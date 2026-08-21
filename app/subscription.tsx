import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Radius, Shadow } from '../lib/theme';
import { getSubscriptionStatus } from '../lib/revenueCat';
import { supabase } from '../lib/supabase';

const CREDIT_PRODUCT_ID = 'kerri_credit_4900';

const PLAN_DISPLAY = {
  basic: {
    name: 'Basic',
    monthly: '9,900원/월',
    annual: '109,000원/년',
    annualBenefit: '연간 결제 시 1개월 무료',
    trial: '14일 무료 체험',
  },
  pro: {
    name: 'Pro',
    monthly: '19,000원/월',
    annual: '209,000원/년',
    annualBenefit: '연간 결제 시 1개월 무료',
    trial: '14일 무료 체험',
  },
};

type BillingCycle = 'monthly' | 'annual';
type PlanKey = 'basic' | 'pro';

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

async function purchaseViaRevenueCat(planKey: PlanKey, billingCycle: BillingCycle): Promise<string> {
  try {
    // react-native-purchases가 설치되면 실제 구매 로직이 실행됩니다
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
    return e?.message ?? 'error';
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
    return {
      status: 'success',
      transactionId: tx?.transactionIdentifier,
      productId: creditPackage.product.identifier,
    };
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
  } catch {
    return false;
  }
}

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

function PlanCard({ planKey, billingCycle, onPurchase, purchasing }: {
  planKey: PlanKey; billingCycle: BillingCycle; onPurchase: () => void; purchasing: boolean;
}) {
  const plan = PLAN_DISPLAY[planKey];
  const isPro = planKey === 'pro';
  return (
    <View style={[styles.planCard, isPro && styles.planCardPro]}>
      {isPro && (
        <View style={styles.recommendBadge}>
          <Text style={styles.recommendBadgeText}>추천</Text>
        </View>
      )}
      <Text style={[styles.planCardName, isPro && styles.planCardNamePro]}>{plan.name}</Text>
      <Text style={styles.planCardPrice}>
        {billingCycle === 'annual' ? plan.annual : plan.monthly}
      </Text>
      {billingCycle === 'annual' && (
        <Text style={styles.planCardBenefit}>{plan.annualBenefit}</Text>
      )}
      <View style={styles.trialRow}>
        <Ionicons name="gift-outline" size={13} color={Colors.primary} />
        <Text style={styles.trialText}>{plan.trial}</Text>
      </View>
      <TouchableOpacity
        style={[styles.subscribeBtn, isPro && styles.subscribeBtnPro]}
        onPress={onPurchase}
        disabled={purchasing}
      >
        {purchasing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.subscribeBtnText}>{plan.trial}으로 시작하기</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [currentPlanKey, setCurrentPlanKey] = useState<PlanKey>('pro');
  const [currentBilling, setCurrentBilling] = useState<BillingCycle>('monthly');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function loadData() {
    try {
      const status = await getSubscriptionStatus();
      setIsSubscribed(status.isActive);
      setExpirationDate(status.expirationDate);

      if (status.isActive && status.customerInfo) {
        const active = status.customerInfo.entitlements.active;
        const entitlement = active['pro'] || active['basic'];
        if (entitlement?.productIdentifier) {
          const { planKey, billingCycle: bc } = detectPlanFromProductId(entitlement.productIdentifier);
          setCurrentPlanKey(planKey);
          setCurrentBilling(bc);
        }
      }
    } catch (e) {
      console.error('[Subscription] load error:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function handlePurchase(planKey: PlanKey) {
    setPurchasing(true);
    const result = await purchaseViaRevenueCat(planKey, billingCycle);
    setPurchasing(false);

    if (result === 'success') {
      Alert.alert('구독 시작!', `${PLAN_DISPLAY[planKey].name} 플랜 무료 체험이 시작되었습니다.`);
      loadData();
    } else if (result === 'package_not_found') {
      Alert.alert('오류', '구독 상품 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
    } else if (result !== 'user_cancelled') {
      Alert.alert('구독 실패', result || '구독 중 오류가 발생했습니다.');
    }
  }

  async function handleCreditPurchase() {
    setPurchasing(true);
    const result = await purchaseCreditViaRevenueCat();

    if (result.status === 'user_cancelled') { setPurchasing(false); return; }
    if (result.status === 'package_not_found') {
      setPurchasing(false);
      Alert.alert('준비 중', 'AI 레슨 기록 충전권은 곧 구매 가능합니다.');
      return;
    }
    if (result.status === 'error') {
      setPurchasing(false);
      Alert.alert('구매 실패', result.error || '구매 중 오류가 발생했습니다.');
      return;
    }

    // 구매 성공 → edge function으로 크레딧 적립
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('confirm-iap-credit', {
        body: {
          productId: result.productId ?? CREDIT_PRODUCT_ID,
          transactionId: result.transactionId ?? `${CREDIT_PRODUCT_ID}-${Date.now()}`,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      setPurchasing(false);
      if (error || !data?.success) throw new Error(data?.error || '충전 확인 실패');
      Alert.alert('충전 완료', `AI 레슨 기록 10회가 충전됐어요!\n현재 잔액: ${(data.balance as number).toLocaleString()}원`);
    } catch (err: any) {
      setPurchasing(false);
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
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }

  const currentPlan = PLAN_DISPLAY[currentPlanKey];

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>구독 관리</Text>
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

        {isSubscribed ? (
          /* ── 현재 구독 중 ── */
          <View style={styles.section}>
            <View style={styles.activeBadgeRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.activeBadgeText}>구독 중</Text>
            </View>
            <Text style={styles.currentPlanName}>{currentPlan.name} 플랜</Text>
            <Text style={styles.currentPlanPrice}>
              {currentBilling === 'annual' ? currentPlan.annual : currentPlan.monthly}
            </Text>

            <View style={styles.infoCard}>
              <InfoRow icon="layers-outline" label="이용 플랜" value={currentPlan.name} />
              <View style={styles.infoRowDivider} />
              <InfoRow
                icon="calendar-outline"
                label="결제 주기"
                value={currentBilling === 'annual' ? '연간' : '월간'}
              />
              <View style={styles.infoRowDivider} />
              <InfoRow
                icon="card-outline"
                label="구독 가격"
                value={currentBilling === 'annual' ? currentPlan.annual : currentPlan.monthly}
              />
              {expirationDate && (
                <>
                  <View style={styles.infoRowDivider} />
                  <InfoRow
                    icon="refresh-outline"
                    label="다음 갱신일"
                    value={formatDate(expirationDate) ?? '-'}
                  />
                </>
              )}
              <View style={styles.infoRowDivider} />
              <InfoRow
                icon="shield-checkmark-outline"
                label="구독 상태"
                value="활성"
                valueColor={Colors.success}
              />
            </View>

            <TouchableOpacity style={styles.manageBtn} onPress={handleManageSubscription}>
              <Ionicons name="settings-outline" size={18} color={Colors.primary} />
              <Text style={styles.manageBtnText}>플랜 변경 및 구독 관리</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          /* ── 미구독 — 플랜 선택 ── */
          <View style={styles.section}>
            <Text style={styles.planTitle}>KERRI 구독 플랜</Text>
            <Text style={styles.planSub}>모든 플랜 · 14일 무료 체험 포함</Text>

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
                    <Text style={styles.annualHintText}>1개월 무료</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <PlanCard
              planKey="basic"
              billingCycle={billingCycle}
              onPurchase={() => handlePurchase('basic')}
              purchasing={purchasing}
            />
            <PlanCard
              planKey="pro"
              billingCycle={billingCycle}
              onPurchase={() => handlePurchase('pro')}
              purchasing={purchasing}
            />

            <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
              {restoring ? (
                <ActivityIndicator size="small" color={Colors.mutedFg} />
              ) : (
                <Text style={styles.restoreBtnText}>기존 구독 복원</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── AI 레슨 기록 충전권 (정기구독과 시각적 구분) ── */}
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

          <TouchableOpacity style={styles.creditBtn} onPress={handleCreditPurchase} disabled={purchasing}>
            {purchasing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#fff" />
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

  /* 현재 구독 중 */
  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  activeBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  currentPlanName: { fontSize: 28, fontWeight: '900', color: Colors.foreground, marginBottom: 4 },
  currentPlanPrice: { fontSize: 18, fontWeight: '700', color: Colors.primary, marginBottom: 20 },

  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoRowDivider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 16 },
  infoLabel: { flex: 1, fontSize: 14, color: Colors.mutedFg },
  infoValue: { fontSize: 14, fontWeight: '700', color: Colors.foreground },

  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    ...Shadow.sm,
  },
  manageBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.primary },

  /* 플랜 선택 */
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
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingVertical: 10,
  },
  toggleBtnActive: { backgroundColor: Colors.white, ...Shadow.sm },
  toggleBtnText: { fontSize: 15, fontWeight: '600', color: Colors.mutedFg },
  toggleBtnTextActive: { color: Colors.foreground },
  annualHintBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  planCardName: { fontSize: 20, fontWeight: '900', color: Colors.foreground, marginBottom: 6 },
  planCardNamePro: { color: Colors.primary },
  planCardPrice: { fontSize: 24, fontWeight: '800', color: Colors.foreground, marginBottom: 4 },
  planCardBenefit: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginBottom: 12 },
  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 16, marginTop: 4 },
  trialText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  recommendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  recommendBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },

  subscribeBtn: {
    backgroundColor: Colors.mutedFg,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  subscribeBtnPro: { backgroundColor: Colors.primary },
  subscribeBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  restoreBtn: { alignItems: 'center', paddingVertical: 16 },
  restoreBtnText: { fontSize: 14, color: Colors.mutedFg, textDecorationLine: 'underline' },

  /* AI 충전권 섹션 */
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ddd4f0',
  },
  creditCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.foreground, marginBottom: 3 },
  creditCardSub: { fontSize: 12, color: Colors.mutedFg },
  creditCardPrice: { fontSize: 20, fontWeight: '900', color: '#7d4fb7' },
  creditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9b59b6',
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  creditBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
