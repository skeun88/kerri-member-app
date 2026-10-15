import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, TextInput, KeyboardAvoidingView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../lib/theme';
import { AI_CONSENT_VERSION } from './ai-consent';

const GUARDIAN_RELATIONS = ['부', '모', '조부', '조모', '법정대리인'];

export default function GuardianConsentScreen() {
  const router = useRouter();
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [checkMinor, setCheckMinor] = useState(false);
  const [loading, setLoading] = useState(false);

  const canAgree = guardianName.trim() !== '' && guardianRelation !== '' &&
    guardianPhone.trim().length >= 10 && check1 && check2 && checkMinor;

  async function handleAgree() {
    if (!canAgree || loading) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!member) throw new Error('회원 정보를 찾을 수 없습니다.');

      await supabase.from('ai_consents').insert({
        member_id: member.id,
        consent_type: 'guardian',
        consent_status: 'agreed',
        consent_version: AI_CONSENT_VERSION,
        source: 'member_app',
        agreed_at: new Date().toISOString(),
        is_minor: true,
        guardian_name: guardianName.trim(),
        guardian_relation: guardianRelation,
        guardian_phone: guardianPhone.trim(),
      });

      Alert.alert(
        '보호자 동의가 완료됐어요',
        '이제 코치님의 AI 레슨 기록을 받아볼 수 있어요.',
        [{ text: '확인', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('오류', e.message || '동의 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>보호자 동의</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>보호자 동의</Text>
          <Text style={styles.desc}>
            만 14세 미만 회원은 법정대리인(부모 또는 후견인)의 동의가 필요합니다.
          </Text>

          {/* 보호자 정보 */}
          <Text style={styles.sectionLabel}>보호자 정보</Text>

          <View style={styles.fieldGroup}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>보호자 이름</Text>
              <TextInput
                style={styles.input}
                value={guardianName}
                onChangeText={setGuardianName}
                placeholder="홍길동"
                placeholderTextColor={Colors.placeholder}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>관계</Text>
              <View style={styles.relationRow}>
                {GUARDIAN_RELATIONS.map(rel => (
                  <TouchableOpacity
                    key={rel}
                    style={[styles.relationBtn, guardianRelation === rel && styles.relationBtnSelected]}
                    onPress={() => setGuardianRelation(rel)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.relationBtnText, guardianRelation === rel && styles.relationBtnTextSelected]}>
                      {rel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>휴대전화번호</Text>
              <TextInput
                style={styles.input}
                value={guardianPhone}
                onChangeText={setGuardianPhone}
                placeholder="01012345678"
                placeholderTextColor={Colors.placeholder}
                keyboardType="phone-pad"
                maxLength={11}
              />
            </View>
          </View>

          {/* 체크박스 */}
          <View style={styles.checkboxSection}>
            <CheckRow
              checked={checkMinor}
              onToggle={() => setCheckMinor(v => !v)}
              label="본인은 해당 회원의 법정대리인입니다."
            />
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
        </ScrollView>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 4 : 16,
    paddingHorizontal: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground },
  content: { padding: 24, paddingBottom: 16 },
  title: {
    fontSize: 22, fontWeight: '800', color: Colors.foreground,
    lineHeight: 30, marginBottom: 10,
  },
  desc: {
    fontSize: 14, color: Colors.mutedFg, lineHeight: 22, marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.mutedFg,
    marginBottom: 12, letterSpacing: 0.3,
  },
  fieldGroup: { gap: 16, marginBottom: 24 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.foreground },
  input: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.foreground,
    backgroundColor: '#fff',
  },
  relationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relationBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
  },
  relationBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  relationBtnText: { fontSize: 13, color: Colors.mutedFg, fontWeight: '600' },
  relationBtnTextSelected: { color: Colors.primary },
  checkboxSection: { gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkLabel: { flex: 1, fontSize: 13, color: Colors.foreground, lineHeight: 20 },
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
});
