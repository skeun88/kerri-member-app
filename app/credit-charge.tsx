import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../lib/theme';

const TOSS_CLIENT_KEY = 'test_ck_XZYkKL4MrjOxJb6G74A180zJwlEW';

export default function CreditChargeScreen() {
  const router = useRouter();
  const { amount } = useLocalSearchParams<{ amount: string }>();
  const chargeAmount = parseInt(amount ?? '10000', 10);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);

  const orderId = `credit-${Date.now()}`;

  const getPaymentHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://js.tosspayments.com/v1/payment"></script>
</head>
<body>
<script>
  const tossPayments = TossPayments('${TOSS_CLIENT_KEY}');
  tossPayments.requestPayment('카드', {
    amount: ${chargeAmount},
    orderId: '${orderId}',
    orderName: '리포트 크레딧 ${chargeAmount.toLocaleString()}원',
    customerName: 'KERRI 회원',
    successUrl: 'kerrimember://credit/success',
    failUrl: 'kerrimember://credit/fail',
  }).catch(function(error) {
    if (error.code !== 'USER_CANCEL') {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error', message: error.message,
      }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cancel' }));
    }
  });
</script>
</body>
</html>
  `;

  const processSuccess = async (url: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    const urlObj = new URL(url.replace('kerrimember://', 'https://'));
    const paymentKey = urlObj.searchParams.get('paymentKey');
    const retOrderId = urlObj.searchParams.get('orderId');
    const retAmount = parseInt(urlObj.searchParams.get('amount') ?? '0', 10);

    if (!paymentKey || !retOrderId) {
      Alert.alert('오류', '결제 정보가 올바르지 않습니다.');
      setProcessing(false);
      processingRef.current = false;
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('charge-member-credit', {
        body: { paymentKey, orderId: retOrderId, amount: retAmount },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error || !data?.success) throw new Error(data?.error || error?.message || '충전 실패');

      router.replace({ pathname: '/(tabs)/report', params: { charged: String(data.balance) } });
    } catch (err: any) {
      Alert.alert('충전 실패', err.message || '다시 시도해 주세요.');
      setProcessing(false);
      processingRef.current = false;
    }
  };

  const handleShouldStartLoad = (request: { url: string }): boolean => {
    const { url } = request;
    if (url.startsWith('kerrimember://credit/success')) {
      processSuccess(url);
      return false;
    }
    if (url.startsWith('kerrimember://credit/fail')) {
      Alert.alert('결제 실패', '다시 시도해 주세요.');
      return false;
    }
    return true;
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'cancel') router.back();
      if (msg.type === 'error') Alert.alert('결제 오류', msg.message);
    } catch {}
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

      <View style={styles.amountBanner}>
        <Text style={styles.amountLabel}>충전 금액</Text>
        <Text style={styles.amountValue}>{chargeAmount.toLocaleString()}원</Text>
      </View>

      {processing ? (
        <View style={styles.processingView}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingText}>크레딧 충전 중...</Text>
        </View>
      ) : (
        <WebView
          source={{ html: getPaymentHtml() }}
          onLoadEnd={() => setLoading(false)}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onMessage={handleMessage}
          style={styles.webview}
          originWhitelist={['*', 'kerrimember://*']}
          javaScriptEnabled
        />
      )}

      {loading && !processing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
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
  amountBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 16, backgroundColor: Colors.primary + '15',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14,
  },
  amountLabel: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  amountValue: { fontSize: 22, color: Colors.primary, fontWeight: '800' },
  webview: { flex: 1 },
  processingView: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  processingText: { fontSize: 16, color: Colors.mutedFg },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
