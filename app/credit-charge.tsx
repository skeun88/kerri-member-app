import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, Alert,
  TouchableOpacity, ActivityIndicator, ScrollView,
} from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../lib/theme';
import { PRODUCT_CREDIT_MAP } from '../lib/revenueCat';

const COST_PER_REPORT = 1000;

export default function CreditChargeScreen() {
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const available = offerings.current?.availablePackages ?? [];
      setPackages(
        [...available].sort((a: PurchasesPackage, b: PurchasesPackage) => a.product.price - b.product.price),
      );
    } catch {
      Alert.alert('오류', '상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg: PurchasesPackage) => {
    const creditAmount = PRODUCT_CREDIT_MAP[pkg.product.identifier];
    if (!creditAmount) return;

    setPurchasingId(pkg.identifier);
    try {
      const { transaction } = await Purchases.purchasePackage(pkg);

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('confirm-iap-credit', {
        body: {
          productId: pkg.product.identifier,
          transactionId: transaction?.transactionIdentifier
            ?? `${pkg.product.identifier}-${Date.now()}`,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });

      if (error || !data?.success) throw new Error(data?.error || '충전 확인 실패');

      Alert.alert(
        '충전 완료 🎉',
        `${creditAmount.toLocaleString()}원이 충전됐어요!\n현재 잔액: ${(data.balance as number).toLocaleString()}원`,
        [{ text: '확인', onPress: () => router.back() }],
      );
    } catch (err: any) {
      if (!err.userCancelled) {
        Alert.alert('구매 실패', err.message || '다시 시도해 주세요.');
      }
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← 취소</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>크레딧 충전</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.subtitle}>충전한 크레딧으로 AI 리포트를 열람할 수 있어요</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : packages.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>상품 정보를 불러올 수 없습니다.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadPackages}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {packages.map((pkg) => {
            const creditAmount = PRODUCT_CREDIT_MAP[pkg.product.identifier];
            if (!creditAmount) return null;
            const reports = Math.floor(creditAmount / COST_PER_REPORT);
            const isPurchasing = purchasingId === pkg.identifier;
            const isDisabled = purchasingId !== null;

            return (
              <TouchableOpacity
                key={pkg.identifier}
                style={[styles.card, isDisabled && styles.cardDisabled]}
                onPress={() => handlePurchase(pkg)}
                disabled={isDisabled}
                activeOpacity={0.75}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardPrice}>{pkg.product.priceString}</Text>
                  <Text style={styles.cardSub}>리포트 {reports}건 열람 가능</Text>
                </View>
                <View style={[styles.buyBtnWrapper, isDisabled && styles.buyBtnDisabled]}>
                  {isPurchasing
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.buyBtnText}>구매</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.notice}>
            결제는 앱스토어 / 구글 플레이 계정으로 처리됩니다.{'\n'}
            미사용 크레딧은 환불 가능합니다.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backText: { fontSize: 16, color: Colors.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.foreground },
  subtitle: {
    fontSize: 14, color: '#888', textAlign: 'center',
    marginTop: 20, marginBottom: 8, paddingHorizontal: 24,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { color: '#999', fontSize: 15 },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  list: { padding: 20, gap: 12, paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderRadius: 14, backgroundColor: '#f9f9f9',
    borderWidth: 1, borderColor: '#ececec',
  },
  cardDisabled: { opacity: 0.6 },
  cardLeft: { flex: 1 },
  cardPrice: { fontSize: 20, fontWeight: '800', color: Colors.foreground },
  cardSub: { fontSize: 13, color: '#888', marginTop: 4 },
  buyBtnWrapper: {
    marginLeft: 12, paddingHorizontal: 22, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: 10, minWidth: 60,
    alignItems: 'center', justifyContent: 'center',
  },
  buyBtnDisabled: { backgroundColor: '#ccc' },
  buyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  notice: {
    fontSize: 12, color: '#bbb', textAlign: 'center',
    marginTop: 8, lineHeight: 18,
  },
});
