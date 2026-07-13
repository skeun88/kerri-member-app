import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Platform,
  KeyboardAvoidingView, TextInput, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

type Hand = '오른손' | '왼손';
type Backhand = '양손' | '한손';
type Goal = '취미' | '건강' | '대회출전' | '심화기술';

const GOALS: { value: Goal; label: string; icon: string; desc: string }[] = [
  { value: '취미', label: '취미', icon: '🎾', desc: '즐겁게 치고 싶어요' },
  { value: '건강', label: '건강', icon: '💪', desc: '운동으로 건강 관리' },
  { value: '대회출전', label: '대회 출전', icon: '🏆', desc: '시합에 나가고 싶어요' },
  { value: '심화기술', label: '기술 향상', icon: '🎯', desc: '실력을 더 올리고 싶어요' },
];

const YEARS = Array.from({ length: 100 }, (_, i) => String(new Date().getFullYear() - i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

type PickerField = 'year' | 'month' | 'day';

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // 생년월일
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [pickerOpen, setPickerOpen] = useState<PickerField | null>(null);

  // 주손 / 백핸드 / 목표
  const [hand, setHand] = useState<Hand | null>(null);
  const [backhand, setBackhand] = useState<Backhand | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);

  const birthComplete = year !== '' && month !== '' && day !== '';

  function canNext() {
    if (step === 1) return birthComplete;
    if (step === 2) return hand !== null && backhand !== null;
    if (step === 3) return goal !== null;
    return false;
  }

  function getPickerData() {
    if (pickerOpen === 'year') return YEARS;
    if (pickerOpen === 'month') return MONTHS;
    return DAYS;
  }

  function getPickerTitle() {
    if (pickerOpen === 'year') return '년도 선택';
    if (pickerOpen === 'month') return '월 선택';
    return '일 선택';
  }

  function onPickerSelect(val: string) {
    if (pickerOpen === 'year') setYear(val);
    else if (pickerOpen === 'month') setMonth(val);
    else setDay(val);
    setPickerOpen(null);
  }

  async function handleSubmit() {
    if (!birthComplete || !hand || !backhand || !goal) return;
    setLoading(true);
    try {
      const member = await getMyMemberRow();
      if (!member) {
        Alert.alert('오류', '회원 정보를 찾을 수 없어요. 다시 로그인해주세요.');
        await supabase.auth.signOut();
        return;
      }

      const birthDateStr = `${year}-${month}-${day}`;
      const { error } = await supabase
        .from('members')
        .update({
          birth_date: birthDateStr,
          dominant_hand: hand,
          backhand_type: backhand,
          goal,
        })
        .eq('id', member.id);

      if (error) {
        Alert.alert('저장 실패', error.message);
        return;
      }

      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('오류', '잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>K</Text>
          </View>
          <Text style={styles.title}>프로필 설정</Text>
          <Text style={styles.subtitle}>코치가 맞춤 레슨을 준비할 수 있도록{'\n'}간단하게 알려주세요 😊</Text>
        </View>

        {/* 진행바 */}
        <View style={styles.progressRow}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[styles.progressDot, step >= n && styles.progressDotActive]} />
          ))}
        </View>

        {/* STEP 1: 생년월일 */}
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.stepLabel}>1 / 3</Text>
            <Text style={styles.question}>생년월일이 언제예요?</Text>
            <Text style={styles.questionDesc}>연령대에 맞는 체력 관리와 코칭에 활용돼요.</Text>

            <View style={styles.dateRow}>
              {([
                { field: 'year' as PickerField, value: year, placeholder: '년도' },
                { field: 'month' as PickerField, value: month, placeholder: '월' },
                { field: 'day' as PickerField, value: day, placeholder: '일' },
              ]).map(({ field, value, placeholder }) => (
                <TouchableOpacity
                  key={field}
                  style={[styles.datePart, value && styles.datePartSelected]}
                  onPress={() => setPickerOpen(field)}
                >
                  <Text style={[styles.datePartText, value && styles.datePartTextSelected]}>
                    {value || placeholder}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={value ? Colors.primary : Colors.mutedFg} />
                </TouchableOpacity>
              ))}
            </View>

            {birthComplete && (
              <View style={styles.datePreview}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.datePreviewText}>{year}년 {month}월 {day}일</Text>
              </View>
            )}
          </View>
        )}

        {/* STEP 2: 주손 + 백핸드 */}
        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.stepLabel}>2 / 3</Text>
            <Text style={styles.question}>어느 손으로 치세요?</Text>
            <Text style={styles.questionDesc}>그립과 스윙 교정에 중요한 정보예요.</Text>

            <View style={styles.optionRow}>
              {(['오른손', '왼손'] as Hand[]).map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.optionBtn, hand === h && styles.optionBtnSelected]}
                  onPress={() => setHand(h)}
                >
                  <Text style={styles.optionEmoji}>{h === '오른손' ? '🤜' : '🤛'}</Text>
                  <Text style={[styles.optionLabel, hand === h && styles.optionLabelSelected]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.question, { marginTop: 28 }]}>백핸드 스타일은요?</Text>
            <Text style={styles.questionDesc}>양손/한손 백핸드에 따라 지도 방법이 달라요.</Text>

            <View style={styles.optionRow}>
              {([
                { value: '양손' as Backhand, emoji: '🙌', desc: '두 손으로 치는 방식' },
                { value: '한손' as Backhand, emoji: '✋', desc: '한 손으로 치는 방식' },
              ]).map(b => (
                <TouchableOpacity
                  key={b.value}
                  style={[styles.optionBtn, backhand === b.value && styles.optionBtnSelected]}
                  onPress={() => setBackhand(b.value)}
                >
                  <Text style={styles.optionEmoji}>{b.emoji}</Text>
                  <Text style={[styles.optionLabel, backhand === b.value && styles.optionLabelSelected]}>
                    {b.value} 백핸드
                  </Text>
                  <Text style={styles.optionDesc}>{b.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* STEP 3: 레슨 목표 */}
        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.stepLabel}>3 / 3</Text>
            <Text style={styles.question}>레슨 목표가 뭐예요?</Text>
            <Text style={styles.questionDesc}>코치가 레슨 방향을 잡는 데 가장 중요한 정보예요.</Text>

            <View style={styles.goalGrid}>
              {GOALS.map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.goalBtn, goal === g.value && styles.goalBtnSelected]}
                  onPress={() => setGoal(g.value)}
                >
                  <Text style={styles.goalEmoji}>{g.icon}</Text>
                  <Text style={[styles.goalLabel, goal === g.value && styles.goalLabelSelected]}>{g.label}</Text>
                  <Text style={styles.goalDesc}>{g.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 버튼 */}
        <View style={styles.btnArea}>
          {step < 3 ? (
            <TouchableOpacity
              style={[styles.nextBtn, !canNext() && styles.nextBtnDisabled]}
              onPress={() => setStep(s => s + 1)}
              disabled={!canNext()}
            >
              <Text style={styles.nextBtnText}>다음</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, (!canNext() || loading) && styles.nextBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canNext() || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.nextBtnText}>완료</Text>
                  </>
                )
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.skipBtnText}>나중에 입력할게요</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 드럼롤 스크롤 피커 모달 */}
      <Modal visible={pickerOpen !== null} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerOpen(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{getPickerTitle()}</Text>
            <FlatList
              data={getPickerData()}
              keyExtractor={item => item}
              style={styles.pickerList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected =
                  (pickerOpen === 'year' && item === year) ||
                  (pickerOpen === 'month' && item === month) ||
                  (pickerOpen === 'day' && item === day);
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                    onPress={() => onPickerSelect(item)}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextSelected]}>
                      {item}
                      {pickerOpen === 'year' ? '년' : pickerOpen === 'month' ? '월' : '일'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  logoCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.white,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 26, fontWeight: '900', color: Colors.primary },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 6 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 20 },

  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  progressDotActive: { backgroundColor: Colors.white, width: 24 },

  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 24, ...Shadow.md, marginBottom: 16 },
  stepLabel: { fontSize: 12, fontWeight: '600', color: Colors.mutedFg, marginBottom: 8 },
  question: { fontSize: 18, fontWeight: '800', color: Colors.foreground, marginBottom: 4 },
  questionDesc: { fontSize: 13, color: Colors.mutedFg, marginBottom: 20, lineHeight: 18 },

  // 날짜
  dateRow: { flexDirection: 'row', gap: 8 },
  datePart: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.mutedBg, borderRadius: Radius.md,
    paddingVertical: 14, borderWidth: 1.5, borderColor: Colors.border,
  },
  datePartSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  datePartText: { fontSize: 15, color: Colors.mutedFg, fontWeight: '600' },
  datePartTextSelected: { color: Colors.primary },
  datePreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  datePreviewText: { fontSize: 14, color: Colors.success, fontWeight: '600' },

  // 선택 버튼
  optionRow: { flexDirection: 'row', gap: 12 },
  optionBtn: {
    flex: 1, alignItems: 'center', padding: 16,
    backgroundColor: Colors.mutedBg, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  optionBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionEmoji: { fontSize: 28, marginBottom: 6 },
  optionLabel: { fontSize: 14, fontWeight: '700', color: Colors.foreground },
  optionLabelSelected: { color: Colors.primary },
  optionDesc: { fontSize: 11, color: Colors.mutedFg, marginTop: 2, textAlign: 'center' },

  // 목표
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalBtn: {
    width: '47%', alignItems: 'center', padding: 16,
    backgroundColor: Colors.mutedBg, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  goalBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  goalEmoji: { fontSize: 32, marginBottom: 6 },
  goalLabel: { fontSize: 15, fontWeight: '700', color: Colors.foreground, marginBottom: 2 },
  goalLabelSelected: { color: Colors.primary },
  goalDesc: { fontSize: 11, color: Colors.mutedFg, textAlign: 'center' },

  // 하단 버튼
  btnArea: { gap: 12 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.md,
    paddingVertical: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  // 피커 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '60%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground, marginBottom: 12, textAlign: 'center' },
  pickerList: { maxHeight: 300 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: Radius.md },
  pickerItemSelected: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: 16, color: Colors.foreground, textAlign: 'center' },
  pickerItemTextSelected: { color: Colors.primary, fontWeight: '700' },
});
