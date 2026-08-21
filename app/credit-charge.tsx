import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator,
  Alert, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Shadow } from '../lib/theme';
import { CHARGE_OPTIONS, REPORT_CREDIT_COST } from '../lib/reportCredits';

// App Store Connect / Play Console에 등록된 소비형 제품 ID
const CREDIT_PRODUCT_IDS: Record<number, string> = {
  10000: 'kerri_credit_10000',
  20000: 'kerri_credit_20000',
  30000: 'kerri_credit_30000',
};

async function purchaseCreditIAP(productId: string): Promise<{
  status: 'success' | 'cancelled' | 'not_found' | 'error';
  transactionId?: string;
  error?: string;
}> {
  try {
    const Purchases = require('react-native-purchases').default;
    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages ?? [];

    const pkg = packages.find((p: any) =>
      p.product.identifier === productId ||
      p.product.identifier.toLowerCase().includes(productId.split('_').pop()!)
    );
    if (!pkg) return { status: 'not_found' };

    const { customerInfo } = await Purchases.purchasePackage(pkg);

    const tx = customerInfo.nonSubscriptionTransactions?.find(
      (t: any) => t.productIdentifier === productId
    );
    return { status: 'success', transactionId: tx?.transactionIdentifier };
  } catch (e: any) {
    if (e?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', error: e?.message ?? '구매 중 오류 발생' };
  }
}

async function creditViaEdgeFunction(productId: string, transactionId?: string): Promise<{
  success: boolean;
  balance?: number;
  error?: string;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('charge-member-credit', {
    body: { source: 'iap', productId, transactionId },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (error || !data?.success) {
    return { success: false, error: data?.error || error?.message || '충전 실패' };
  }
  return { success: true, balance: data.balance };
}

export default function CreditChargeScreen() {
  const router = useRouter();
  const [selectedAmount, setSelectedAmount] = useState(10000);
  const [purchasing, setPurchasing] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [availableProductIds, setAvailableProductIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const Purchases = require('react-native-purchases').default;
        const offerings = await Purchases.getOfferings();
        const ids = (offerings?.current?.availablePackages ?? []).map(
          (p: any) => p.product.identifier as string
        );
        setAvailableProductIds(ids);
      } catch {}
      setLoadingOfferings(false);
    })();
  }, []);

  async function handlePurchase() {
    const productId = CREDIT_PRODUCT_IDS[selectedAmount];
    if (!productId) return;

    setPurchasing(true);
    const result = await purchaseCreditIAP(productId);

    if (result.status === 'cancelled') {
      setPurchasing(false);
      return;
    }
    if (result.status === 'not_found') {
      setPurchasing(false);
      Alert.alert('준비 중', '해당 충전권이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (result.status === 'error') {
      setPurchasing(false);
      Alert.alert('구매 실패', result.error || '다시 시도해주세요.');
      return;
    }

    const charge = await creditViaEdgeFunction(productId, result.transactionId);
    setPurchasing(false);

    if (!charge.success) {
      Alert.alert('충전 오류', charge.error || '결제는 완료됐지만 크레딧 충전에 실패했습니다. 고객센터에 문의해주세요.');
      return;
    }

    router.replace({ pathname: '/(tabs)/report', params: { charged: String(charge.balance) } });
  }

  const selectedOpt = CHARGE_OPTIONS.find(o => o.amount === selectedAmount)!;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>크레딧 충전</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>충전 금액 선택</Text>
        <Text style={styles.sectionSub}>리포트 1건당 {REPORT_CREDIT_COST.toLocaleString()}원</Text>

        <View style={styles.optionList}>
          {CHARGE_OPTIONS.map(opt => {
            const pid = CREDIT_PRODUCT_IDS[opt.amount];
            const unavailable = !loadingOfferings && availableProductIds.length > 0 &&
              !availableProductIds.some(id => id === pid || id.includes(String(opt.amount)));
            return (
              <TouchableOpacity
                key={opt.amount}
                style={[
                  styles.optionCard,
                  selectedAmount === opt.amount && styles.optionSelected,
                  unavailable && styles.optionDisabled,
                ]}
                onPress={() => !unavailable && setSelectedAmount(opt.amount)}
                disabled={unavailable}
              >
                <Text style={[styles.optionAmount, selectedAmount === opt.amount && styles.optionAmountSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionReports}>{opt.description}</Text>
                {selectedAmount === opt.amount && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>충전 금액</Text>
            <Text style={styles.summaryValue}>{selectedOpt.label}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>사용 가능 리포트</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>{selectedOpt.reports}건</Text>
          </View>
        </View>

        <View style={styles.iapNotice}>
          <Ionicons name="shield-checkmark-outline" size={14} color={Colors.mutedFg} />
          <Text style={styles.iapNoticeText}>Apple 인앱결제로 안전하게 처리됩니다</Text>
        </View>

        <TouchableOpacity
          style={[styles.buyBtn, purchasing && styles.buyBtnDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || loadingOfferings}
        >
          {purchasing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="bag-handle-outline" size={20} color="#fff" />
              <Text style={styles.buyBtnText}>{selectedOpt.label} 충전하기</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.foreground },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.foreground, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: Colors.mutedFg, marginBottom: 24 },
  optionList: { gap: 12, marginBottom: 28 },
  optionCard: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, padding: 20,
    borderWidth: 2, borderColor: Colors.border, ...Shadow.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: '#EEF4FF' },
  optionDisabled: { opacity: 0.4 },
  optionAmount: { fontSize: 20, fontWeight: '800', color: Colors.foreground },
  optionAmountSelected: { color: Colors.primary },
  optionReports: { fontSize: 13, color: Colors.mutedFg },
  checkBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  summaryCard: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 16, ...Shadow.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  summaryLabel: { fontSize: 14, color: Colors.mutedFg },
  summaryValue: { fontSize: 14, fontWeight: '700', color: Colors.foreground },
  summaryDivider: { height: 1, backgroundColor: Colors.borderLight },
  iapNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', marginBottom: 24,
  },
  iapNoticeText: { fontSize: 12, color: Colors.mutedFg },
  buyBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  buyBtnDisabled: { opacity: 0.6 },
  buyBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
