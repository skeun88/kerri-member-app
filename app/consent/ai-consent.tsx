import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../lib/theme';

export const AI_CONSENT_VERSION = '1.0';

const INFO_ITEMS = [
  { icon: 'mic-outline' as const, text: '코치님이 레슨 내용을 녹음하면 KERRI가 텍스트로 변환해요' },
  { icon: 'sparkles-outline' as const, text: 'AI가 레슨 핵심 내용과 다음 연습 방향을 정리해드려요' },
  { icon: 'send-outline' as const, text: '코치님이 확인하고 수정한 후 회원에게 보내요' },
  { icon: 'shield-checkmark-outline' as const, text: '레슨과 관계없는 사적인 대화는 기록에서 제외돼요' },
  { icon: 'trash-outline' as const, text: '원본 음성은 처리 후 최대 7일 이내 삭제돼요' },
];

export default function AiConsentScreen() {
  const router = useRouter();
  const [isMinor, setIsMinor] = useState<boolean | null>(null);
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const canAgree = check1 && check2 && isMinor === false;

  async function handleAgree() {
    if (!canAgree || loading) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      // members.auth_user_id = user.id 로 member_id 조회
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!member) throw new Error('회원 정보를 찾을 수 없습니다.');

      await supabase.from('ai_consents').insert({
        member_id: member.id,
        consent_type: 'member',
        consent_status: 'agreed',
        consent_version: AI_CONSENT_VERSION,
        source: 'member_app',
        agreed_at: new Date().toISOString(),
        is_minor: false,
      });

      Alert.alert(
        '동의가 완료됐어요',
        '이제 코치님의 AI 레슨 기록을 받아볼 수 있어요.',
        [{ text: '확인', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('오류', e.message || '동의 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function handleMinorSelected() {
    router.push('/consent/guardian-consent' as any);
  }

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>AI 레슨 기록을{'\n'}받아볼까요?</Text>
          <Text style={styles.desc}>코치님의 레슨을 KERRI가 정리해서 보내드려요.</Text>

          {/* 핵심 안내 5개 */}
          <View style={styles.infoBox}>
            {INFO_ITEMS.map((item, i) => (
              <View key={i} style={[styles.infoRow, i < INFO_ITEMS.length - 1 && styles.infoRowBorder]}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name={item.icon} size={16} color={Colors.primary} />
                </View>
                <Text style={styles.infoText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* 연령 선택 */}
          <Text style={styles.sectionLabel}>연령 확인</Text>
          <View style={styles.ageRow}>
            <TouchableOpacity
              style={[styles.ageBtn, isMinor === false && styles.ageBtnSelected]}
              onPress={() => setIsMinor(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.ageBtnText, isMinor === false && styles.ageBtnTextSelected]}>
                만 14세 이상입니다
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ageBtn, isMinor === true && styles.ageBtnSelected]}
              onPress={() => { setIsMinor(true); handleMinorSelected(); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.ageBtnText, isMinor === true && styles.ageBtnTextSelected]}>
                만 14세 미만입니다
              </Text>
            </TouchableOpacity>
          </View>
          {isMinor === true && (
            <Text style={styles.minorNote}>보호자 동의 화면으로 이동합니다.</Text>
          )}

          {/* 체크박스 */}
          <View style={styles.checkboxSection}>
            <CheckRow
              checked={check1}
              onToggle={() => setCheck1(v => !v)}
              label="[필수] 음성 녹음 및 AI 처리에 동의합니다."
            />
            <CheckRow
              checked={check2}
              onToggle={() => setCheck2(v => !v)}
              label="[필수] 개인정보 국외 이전 및 외부 AI 서비스 처리에 동의합니다."
            />
          </View>

          {/* 자세히 보기 */}
          <TouchableOpacity onPress={() => setDetailVisible(true)} style={styles.detailLink}>
            <Text style={styles.detailLinkText}>자세히 보기</Text>
            <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
          </TouchableOpacity>
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={styles.btnArea}>
          <TouchableOpacity
            style={[styles.agreeBtn, !canAgree && styles.agreeBtnDisabled]}
            onPress={canAgree ? handleAgree : undefined}
            activeOpacity={canAgree ? 0.85 : 1}
          >
            <Text style={[styles.agreeBtnText, !canAgree && styles.agreeBtnTextDisabled]}>
              {loading ? '처리 중...' : '동의하고 계속하기'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.declineBtnText}>동의하지 않기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* 동의서 전문 */}
      <Modal visible={detailVisible} animationType="slide" transparent onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.overlay}>
          <SafeAreaView style={styles.detailSheet}>
            <View style={styles.handle} />
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>AI 레슨 기록 동의서</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.mutedFg} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailBody}>{CONSENT_FULL_TEXT}</Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const CONSENT_FULL_TEXT = `AI 레슨 기록 서비스 동의서 (버전 ${AI_CONSENT_VERSION})

1. 수집 및 이용 목적
KERRI는 레슨 중 녹음된 음성을 텍스트로 변환하고, AI를 통해 레슨 내용을 분석하여 코치와 회원에게 레슨 기록을 제공합니다.

2. 수집 항목
• 레슨 중 녹음된 음성 파일 (코치가 녹음)
• 음성에서 변환된 텍스트(전사본)
• AI 분석 결과(요약, 개선 포인트, 다음 목표 등)

3. 보유 및 이용 기간
• 원본 음성 파일: 처리 완료 후 최대 7일 이내 삭제
• 텍스트 전사본 및 분석 결과: 서비스 이용 기간 동안 보관

4. 개인정보 국외 이전
음성 처리 과정에서 일부 데이터가 국외(미국 등) 서버로 이전될 수 있습니다.
• OpenAI (음성→텍스트 변환)
• Anthropic (AI 분석)

5. 동의 거부 권리
동의를 거부하실 수 있으나, 이 경우 AI 레슨 기록 기능을 이용하실 수 없습니다.

6. 동의 철회
설정 > AI 레슨 기록 동의에서 언제든지 철회할 수 있습니다.`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 4 : 16,
    paddingHorizontal: 16, paddingBottom: 4,
  },
  backBtn: { padding: 4, alignSelf: 'flex-start' },
  content: { padding: 24, paddingBottom: 16 },
  title: {
    fontSize: 24, fontWeight: '800', color: Colors.foreground,
    lineHeight: 32, marginBottom: 10,
  },
  desc: {
    fontSize: 14, color: Colors.mutedFg, lineHeight: 22, marginBottom: 24,
  },
  infoBox: {
    backgroundColor: '#F7F0E9',
    borderRadius: 20, overflow: 'hidden', marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.foreground, lineHeight: 20 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.mutedFg,
    marginBottom: 10, letterSpacing: 0.3,
  },
  ageRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  ageBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center',
  },
  ageBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  ageBtnText: { fontSize: 14, color: Colors.mutedFg, fontWeight: '600' },
  ageBtnTextSelected: { color: Colors.primary },
  minorNote: { fontSize: 12, color: Colors.mutedFg, marginBottom: 8 },
  checkboxSection: { gap: 12, marginTop: 20, marginBottom: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkLabel: { flex: 1, fontSize: 13, color: Colors.foreground, lineHeight: 20 },
  detailLink: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    alignSelf: 'flex-end', marginTop: 4,
  },
  detailLinkText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  btnArea: { padding: 20, paddingTop: 8, gap: 8 },
  agreeBtn: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  agreeBtnDisabled: { backgroundColor: Colors.border },
  agreeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  agreeBtnTextDisabled: { color: Colors.mutedFg },
  declineBtn: { alignItems: 'center', paddingVertical: 10 },
  declineBtnText: { fontSize: 15, color: Colors.mutedFg },
  // 전문 모달
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground },
  detailContent: { padding: 20 },
  detailBody: { fontSize: 13, color: Colors.foreground, lineHeight: 22 },
});
