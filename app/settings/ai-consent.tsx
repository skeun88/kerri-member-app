import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../lib/theme';

interface ConsentRecord {
  id: string;
  consent_type: 'member' | 'guardian';
  consent_status: 'agreed' | 'withdrawn' | 'pending';
  consent_version: string;
  agreed_at: string | null;
  withdrawn_at: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
}

export default function AiConsentSettingsScreen() {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    loadConsent();
  }, []);

  async function loadConsent() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!member) return;

      const { data } = await supabase
        .from('ai_consents')
        .select('id, consent_type, consent_status, consent_version, agreed_at, withdrawn_at, guardian_name, guardian_relation')
        .eq('member_id', member.id)
        .in('consent_type', ['member', 'guardian'])
        .order('agreed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setConsent(data ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    Alert.alert(
      '동의 철회',
      '동의를 철회하면 이후 AI 레슨 기록을 받을 수 없게 됩니다.\n기존 레슨 기록은 삭제되지 않아요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '철회하기',
          style: 'destructive',
          onPress: async () => {
            if (!consent) return;
            setWithdrawing(true);
            try {
              await supabase
                .from('ai_consents')
                .update({
                  consent_status: 'withdrawn',
                  withdrawn_at: new Date().toISOString(),
                })
                .eq('id', consent.id);
              await loadConsent();
              Alert.alert('완료', '동의가 철회되었습니다.');
            } catch {
              Alert.alert('오류', '철회 처리 중 오류가 발생했습니다.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  const isAgreed = consent?.consent_status === 'agreed';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 레슨 기록 동의</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : consent ? (
          <>
            {/* 상태 카드 */}
            <View style={[styles.statusCard, isAgreed ? styles.statusCardOk : styles.statusCardOff]}>
              <Ionicons
                name={isAgreed ? 'checkmark-circle' : 'close-circle'}
                size={28}
                color={isAgreed ? '#22C55E' : Colors.mutedFg}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {isAgreed ? 'AI 레슨 기록 동의됨' : '동의 철회됨'}
                </Text>
                <Text style={styles.statusDesc}>
                  {isAgreed
                    ? '코치님의 AI 레슨 기록을 받아볼 수 있어요.'
                    : '현재 AI 레슨 기록을 받을 수 없어요.'}
                </Text>
              </View>
            </View>

            {/* 상세 정보 */}
            <View style={styles.infoCard}>
              <InfoRow label="동의 유형" value={consent.consent_type === 'guardian' ? '보호자 동의' : '본인 동의'} />
              <InfoRow label="동의 날짜" value={formatDate(consent.agreed_at)} />
              <InfoRow label="동의 버전" value={`v${consent.consent_version}`} />
              {consent.consent_type === 'guardian' && (
                <>
                  <InfoRow label="보호자 이름" value={consent.guardian_name ?? '-'} />
                  <InfoRow label="관계" value={consent.guardian_relation ?? '-'} />
                </>
              )}
              {consent.withdrawn_at && (
                <InfoRow label="철회 날짜" value={formatDate(consent.withdrawn_at)} />
              )}
            </View>

            {/* 기존 기록 안내 */}
            {isAgreed && (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.mutedFg} />
                <Text style={styles.noteText}>
                  동의를 철회해도 기존에 만들어진 레슨 기록은 삭제되지 않아요. 기록을 삭제하려면 코치님께 요청하세요.
                </Text>
              </View>
            )}

            {/* 철회 버튼 */}
            {isAgreed && (
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={handleWithdraw}
                activeOpacity={0.85}
                disabled={withdrawing}
              >
                {withdrawing
                  ? <ActivityIndicator color={Colors.destructive} size="small" />
                  : <Text style={styles.withdrawBtnText}>동의 철회</Text>
                }
              </TouchableOpacity>
            )}

            {/* 재동의 버튼 */}
            {!isAgreed && (
              <TouchableOpacity
                style={styles.reagreeBtn}
                onPress={() => router.push('/consent/ai-consent' as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.reagreeBtnText}>다시 동의하기</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          /* 동의 기록 없음 */
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={40} color={Colors.iconMuted} />
            <Text style={styles.emptyTitle}>아직 동의하지 않았어요</Text>
            <Text style={styles.emptyDesc}>
              코치님의 AI 레슨 기록을 받아보려면 동의가 필요해요.
            </Text>
            <TouchableOpacity
              style={styles.reagreeBtn}
              onPress={() => router.push('/consent/ai-consent' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.reagreeBtnText}>동의하러 가기</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: Platform.OS === 'ios' ? 4 : 16,
    paddingHorizontal: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.foreground },
  content: { padding: 20, paddingBottom: 40 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 20, padding: 18, marginBottom: 16,
  },
  statusCardOk: { backgroundColor: '#ECFDF5' },
  statusCardOff: { backgroundColor: Colors.mutedBg },
  statusTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground, marginBottom: 3 },
  statusDesc: { fontSize: 13, color: Colors.mutedFg, lineHeight: 19 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { fontSize: 14, color: Colors.mutedFg },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.foreground },
  noteBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.mutedBg, borderRadius: 14,
    padding: 14, marginBottom: 16,
  },
  noteText: { flex: 1, fontSize: 13, color: Colors.mutedFg, lineHeight: 19 },
  withdrawBtn: {
    borderWidth: 1.5, borderColor: Colors.destructive,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    marginBottom: 10,
  },
  withdrawBtnText: { fontSize: 15, fontWeight: '700', color: Colors.destructive },
  reagreeBtn: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 15, alignItems: 'center',
  },
  reagreeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.foreground, marginTop: 8 },
  emptyDesc: { fontSize: 14, color: Colors.mutedFg, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
});
