import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

// 토스페이먼츠 테스트 클라이언트 키 (운영 시 플랫폼 키로 교체)
const TOSS_CLIENT_KEY = 'test_ck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const PLATFORM_FEE_RATE = 0.03; // 3%

interface PendingPayment {
  id: string;
  amount: number;
  paid_amount: number;
  description: string;
  due_date: string;
  status: string;
}

interface LessonPackage {
  id: string;
  title: string;
  price: number;
  session_count: number;
}

interface PaymentHistory {
  id: string;
  amount: number;
  paid_amount: number;
  description: string;
  paid_date: string;
  payment_method: string;
  payment_channel: string;
  status: string;
}

function generateOrderId(): string {
  return `kerri-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTossHtml(params: {
  clientKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  customerName: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>결제</title>
  <script src="https://js.tosspayments.com/v1/payment"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #FAFAFA; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: white; border-radius: 16px; padding: 28px 24px; width: 100%; max-width: 400px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h2 { font-size: 18px; font-weight: 800; color: #D2755A; margin-bottom: 6px; }
    .desc { font-size: 13px; color: #8B93A5; margin-bottom: 24px; }
    .amount { font-size: 28px; font-weight: 800; color: #D2755A; margin-bottom: 28px; }
    .amount span { font-size: 14px; color: #8B93A5; font-weight: 400; }
    .btn { width: 100%; padding: 16px; background: #D2755A; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; margin-bottom: 10px; }
    .btn-cancel { width: 100%; padding: 14px; background: transparent; color: #8B93A5; border: 1px solid #E5E9F0; border-radius: 12px; font-size: 14px; cursor: pointer; }
    .loading { display: none; text-align: center; color: #8B93A5; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
<div class="card">
  <h2>${params.orderName}</h2>
  <p class="desc">주문번호: ${params.orderId}</p>
  <p class="amount">${params.amount.toLocaleString()}원 <span>결제 금액</span></p>
  <button class="btn" onclick="requestPayment()">카드로 결제하기</button>
  <button class="btn-cancel" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:'CANCEL'}))">취소</button>
  <p class="loading" id="loading">결제 창을 불러오는 중...</p>
</div>
<script>
  const tossPayments = TossPayments('${params.clientKey}');
  function requestPayment() {
    document.querySelector('.btn').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    tossPayments.requestPayment('카드', {
      amount: ${params.amount},
      orderId: '${params.orderId}',
      orderName: '${params.orderName}',
      customerName: '${params.customerName}',
      successUrl: 'https://success.kerri.app?orderId=${params.orderId}',
      failUrl: 'https://fail.kerri.app?orderId=${params.orderId}',
    }).catch(function(error) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'ERROR', message: error.message}));
    });
  }
</script>
</body>
</html>
`;
}

export default function PaymentScreen() {
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [packages, setPackages] = useState<LessonPackage[]>([]);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [memberName, setMemberName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // 결제 WebView
  const [webViewVisible, setWebViewVisible] = useState(false);
  const [paymentParams, setPaymentParams] = useState<{
    orderId: string; orderName: string; amount: number; targetPaymentId?: string; targetPackageId?: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function loadData() {
    const member = await getMyMemberRow();
    if (!member) { setLoading(false); return; }
    setMemberName(member.name);
    setMemberId(member.id);
    setCoachId(member.coach_id);

    const [pendingRes, packagesRes, historyRes] = await Promise.all([
      supabase.from('payments').select('*')
        .eq('member_id', member.id)
        .in('status', ['미납', '부분납부'])
        .order('due_date'),
      supabase.from('lesson_packages').select('*')
        .eq('coach_id', member.coach_id)
        .order('price'),
      supabase.from('payments').select('*')
        .eq('member_id', member.id)
        .eq('status', '납부완료')
        .order('paid_date', { ascending: false })
        .limit(10),
    ]);

    setPending(pendingRes.data ?? []);
    setPackages(packagesRes.data ?? []);
    setHistory(historyRes.data ?? []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // ── Realtime: 코치가 결제 추가/수정 시 즉시 반영 ───────────────────
  useEffect(() => {
    if (!memberId) return;
    const ch = supabase.channel('payment_rt_' + memberId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `member_id=eq.${memberId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [memberId]);

  function openPayment(params: { orderId: string; orderName: string; amount: number; targetPaymentId?: string; targetPackageId?: string }) {
    setPaymentParams(params);
    setWebViewVisible(true);
  }

  async function handlePaymentSuccess(paymentKey: string, orderId: string, amount: number) {
    setWebViewVisible(false);
    setConfirming(true);

    try {
      // Edge Function으로 결제 승인 요청
      const { data, error } = await supabase.functions.invoke('confirm-toss-payment', {
        body: {
          paymentKey,
          orderId,
          amount,
          memberId,
          coachId,
          targetPaymentId: paymentParams?.targetPaymentId,
          targetPackageId: paymentParams?.targetPackageId,
          platformFeeRate: PLATFORM_FEE_RATE,
        },
      });

      if (error || !data?.success) {
        Alert.alert('결제 오류', '결제 승인 중 오류가 발생했습니다. 고객센터에 문의해주세요.');
      } else {
        Alert.alert('결제 완료 🎾', '결제가 성공적으로 처리됐습니다!');
        await loadData();
      }
    } catch (e) {
      Alert.alert('오류', '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }

    setConfirming(false);
    setPaymentParams(null);
  }

  function handleWebViewMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'CANCEL') {
        setWebViewVisible(false);
        setPaymentParams(null);
      } else if (msg.type === 'ERROR') {
        setWebViewVisible(false);
        setPaymentParams(null);
        if (msg.message && !msg.message.includes('취소')) {
          Alert.alert('결제 실패', msg.message);
        }
      }
    } catch {}
  }

  function handleNavigationChange(url: string) {
    if (url.startsWith('https://success.kerri.app')) {
      const u = new URL(url);
      const paymentKey = u.searchParams.get('paymentKey') ?? '';
      const orderId = u.searchParams.get('orderId') ?? '';
      const amount = parseInt(u.searchParams.get('amount') ?? '0');
      handlePaymentSuccess(paymentKey, orderId, amount);
    } else if (url.startsWith('https://fail.kerri.app')) {
      setWebViewVisible(false);
      setPaymentParams(null);
      Alert.alert('결제 실패', '결제에 실패했습니다. 다시 시도해주세요.');
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const totalPending = pending.reduce((s, p) => s + (p.amount - p.paid_amount), 0);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }} tintColor={Colors.primary} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {/* 미납 배너 */}
        {totalPending > 0 && (
          <View style={styles.alertBanner}>
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={20} color={Colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>미납 금액이 있어요</Text>
              <Text style={styles.alertAmount}>{totalPending.toLocaleString()}원</Text>
            </View>
          </View>
        )}

        {/* 미납 목록 */}
        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>미납 내역</Text>
            {pending.map(p => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.cardTitle}>{p.description}</Text>
                    <Text style={styles.cardSub}>납부기한 {p.due_date}</Text>
                  </View>
                  <View style={styles.unpaidBadge}>
                    <Text style={styles.unpaidBadgeText}>{p.status}</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardAmount}>{(p.amount - p.paid_amount).toLocaleString()}원</Text>
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => openPayment({
                      orderId: generateOrderId(),
                      orderName: p.description,
                      amount: p.amount - p.paid_amount,
                      targetPaymentId: p.id,
                    })}
                  >
                    <Ionicons name="card-outline" size={14} color={Colors.white} />
                    <Text style={styles.payBtnText}>결제하기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 레슨권 구매 */}
        {packages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>레슨권 구매</Text>
            {packages.map(pkg => (
              <TouchableOpacity
                key={pkg.id}
                style={styles.pkgCard}
                onPress={() => openPayment({
                  orderId: generateOrderId(),
                  orderName: pkg.title,
                  amount: pkg.price,
                  targetPackageId: pkg.id,
                })}
              >
                <View style={styles.pkgIcon}>
                  <Ionicons name="tennisball-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pkgTitle}>{pkg.title}</Text>
                  <Text style={styles.pkgSub}>{pkg.session_count}회 레슨</Text>
                </View>
                <View style={styles.pkgRight}>
                  <Text style={styles.pkgPrice}>{pkg.price.toLocaleString()}원</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.mutedFg} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 결제 내역 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>결제 내역</Text>
          {history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={40} color={Colors.placeholder} />
              <Text style={styles.emptyText}>아직 결제 내역이 없어요</Text>
            </View>
          ) : (
            history.map(h => (
              <View key={h.id} style={[styles.card, { marginBottom: 8 }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{h.description}</Text>
                    <Text style={styles.cardSub}>{h.paid_date} · {h.payment_method ?? (h.payment_channel === 'online' ? '카드' : '오프라인')}</Text>
                  </View>
                  <Text style={[styles.cardAmount, { color: Colors.primary }]}>{h.paid_amount.toLocaleString()}원</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 결제 승인 로딩 */}
      {confirming && (
        <View style={styles.confirmingOverlay}>
          <View style={styles.confirmingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.confirmingText}>결제 처리 중...</Text>
          </View>
        </View>
      )}

      {/* Toss 결제 WebView 모달 */}
      <Modal visible={webViewVisible} animationType="slide" onRequestClose={() => { setWebViewVisible(false); setPaymentParams(null); }}>
        <View style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity onPress={() => { setWebViewVisible(false); setPaymentParams(null); }} style={styles.webViewClose}>
              <Ionicons name="close" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.webViewTitle}>결제하기</Text>
            <View style={{ width: 36 }} />
          </View>
          {paymentParams && (
            <WebView
              source={{ html: buildTossHtml({ clientKey: TOSS_CLIENT_KEY, orderId: paymentParams.orderId, orderName: paymentParams.orderName, amount: paymentParams.amount, customerName: memberName }) }}
              onMessage={e => handleWebViewMessage(e.nativeEvent.data)}
              onNavigationStateChange={e => handleNavigationChange(e.url)}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => <View style={styles.webViewLoading}><ActivityIndicator size="large" color={Colors.primary} /></View>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning + '15', borderRadius: Radius.lg, padding: 16, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: Colors.warning + '30' },
  alertIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.warning + '20', justifyContent: 'center', alignItems: 'center' },
  alertTitle: { fontSize: 13, color: Colors.warning, fontWeight: '700', marginBottom: 2 },
  alertAmount: { fontSize: 20, fontWeight: '800', color: Colors.warning },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.primary, marginBottom: 10 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, ...Shadow.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  cardSub: { fontSize: 12, color: Colors.mutedFg, marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  unpaidBadge: { backgroundColor: Colors.destructive + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  unpaidBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.destructive },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  payBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  pkgCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, ...Shadow.sm, gap: 12 },
  pkgIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '10', justifyContent: 'center', alignItems: 'center' },
  pkgTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  pkgSub: { fontSize: 12, color: Colors.mutedFg, marginTop: 2 },
  pkgRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pkgPrice: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.mutedFg },
  confirmingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  confirmingBox: { backgroundColor: Colors.white, borderRadius: 16, padding: 32, alignItems: 'center', gap: 16 },
  confirmingText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  webViewContainer: { flex: 1, backgroundColor: Colors.white },
  webViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  webViewClose: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  webViewTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  webViewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
});
