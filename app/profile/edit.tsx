import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
  Modal, FlatList, TextInput,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';

// ── Design tokens ──────────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD = '#FFFFFF';
const TERRA = '#C0755A';
const CHIP_SELECTED_BG = '#F4E5DC';
const FG = '#20242C';
const MUTED = '#667085';
const DIVIDER = '#E8EBEF';
const BORDER = '#E8EBEF';

// ── 한국 행정구역 데이터 ─────────────────────────────────────────────
const REGIONS: Record<string, string[]> = {
  '서울특별시': ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '부산광역시': ['강서구','금정구','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구','기장군'],
  '대구광역시': ['남구','달서구','달성군','동구','북구','서구','수성구','중구'],
  '인천광역시': ['계양구','남동구','동구','미추홀구','부평구','서구','연수구','중구','강화군','옹진군'],
  '광주광역시': ['광산구','남구','동구','북구','서구'],
  '대전광역시': ['대덕구','동구','서구','유성구','중구'],
  '울산광역시': ['남구','동구','북구','중구','울주군'],
  '세종특별자치시': ['세종시'],
  '경기도': ['가평군','고양시','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시','수원시','시흥시','안산시','안양시','안성시','양평군','여주시','연천군','오산시','용인시','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시'],
  '강원특별자치도': ['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  '충청북도': ['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시','충주시'],
  '충청남도': ['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시','청양군','태안군','홍성군'],
  '전북특별자치도': ['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시','정읍시','진안군'],
  '전라남도': ['강진군','고흥군','곡성군','광양시','구례군','나주시','담양군','목포시','무안군','보성군','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'],
  '경상북도': ['경산시','경주시','고령군','구미시','군위군','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시'],
  '경상남도': ['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시','통영시','하동군','함안군','함양군','합천군'],
  '제주특별자치도': ['서귀포시','제주시'],
};

const PROVINCES = Object.keys(REGIONS);

type ExperienceType = '처음이에요' | '배워본 적 있어요' | '꾸준히 하고 있어요';
type GoalType = '취미·건강' | '실력 향상' | '대회 준비';
type DateField = 'year' | 'month' | 'day';

const YEARS = Array.from({ length: 80 }, (_, i) => String(new Date().getFullYear() - 10 - i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  // 기본 정보
  const [name, setName] = useState('');

  // 생년월일
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [activeDateField, setActiveDateField] = useState<DateField>('year');

  // 지역
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionStep, setRegionStep] = useState<'province' | 'district'>('province');

  // 운동 경험 / 레슨 목표
  const [experience, setExperience] = useState<ExperienceType | null>(null);
  const [goal, setGoal] = useState<GoalType | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const member = await getMyMemberRow();
      if (!member) { setLoading(false); return; }
      setMemberId(member.id);
      setName(member.name ?? '');

      if (member.birth_date) {
        const parts = member.birth_date.split('-');
        if (parts.length === 3) {
          setYear(parts[0]);
          setMonth(String(parseInt(parts[1], 10)));
          setDay(String(parseInt(parts[2], 10)));
        }
      }
      if (member.province) setProvince(member.province);
      if (member.district) setDistrict(member.district);
      if (member.exercise_experience) setExperience(member.exercise_experience as ExperienceType);
      if (member.lesson_goal) setGoal(member.lesson_goal as GoalType);
    } catch {
      Alert.alert('오류', '프로필을 불러오는 데 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  function openDatePicker(field: DateField) {
    setActiveDateField(field);
    setDatePickerOpen(true);
  }

  function onDateSelect(val: string) {
    if (activeDateField === 'year') setYear(val);
    else if (activeDateField === 'month') setMonth(val);
    else setDay(val);
    setDatePickerOpen(false);
  }

  function onProvinceSelect(p: string) {
    setProvince(p);
    setDistrict('');
    setRegionStep('district');
  }

  function onDistrictSelect(d: string) {
    setDistrict(d);
    setRegionPickerOpen(false);
  }

  async function handleSave() {
    if (!memberId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('입력 오류', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { name: trimmedName };

      if (year && month && day) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        updateData.birth_date = `${year}-${mm}-${dd}`;
      }
      if (province) updateData.province = province;
      if (district) updateData.district = district;
      if (experience) updateData.exercise_experience = experience;
      if (goal) updateData.lesson_goal = goal;

      const { error } = await supabase
        .from('members')
        .update(updateData)
        .eq('id', memberId);

      if (error) throw error;
      router.back();
    } catch (e: any) {
      Alert.alert('저장 실패', e.message || '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  const birthComplete = year !== '' && month !== '' && day !== '';
  const regionComplete = province !== '' && district !== '';

  const birthLabel = birthComplete
    ? `${year}년 ${month}월 ${day}일`
    : '생년월일을 선택해주세요';
  const regionLabel = regionComplete
    ? `${province} ${district}`
    : province
    ? `${province} · 시·군·구 선택`
    : '지역을 선택해주세요';

  const datePickerData = activeDateField === 'year' ? YEARS : activeDateField === 'month' ? MONTHS : DAYS;
  const datePickerTitle = activeDateField === 'year' ? '년도 선택' : activeDateField === 'month' ? '월 선택' : '일 선택';
  const dateSuffix = activeDateField === 'year' ? '년' : activeDateField === 'month' ? '월' : '일';
  const initial = (name.slice(0, 1).toUpperCase()) || '?';

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator style={{ flex: 1 }} color={TERRA} />
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={FG} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 편집</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + Math.max(insets.bottom, 20) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 기본 정보 섹션 */}
        <Text style={styles.sectionHeader}>기본 정보</Text>
        <View style={styles.card}>
          {/* 프로필 아바타 */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* 이름 */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="이름을 입력해주세요"
              placeholderTextColor={MUTED}
            />
          </View>
        </View>

        {/* 나에 대해 섹션 */}
        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>나에 대해</Text>
        <View style={styles.card}>
          {/* 생년월일 */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>생년월일</Text>
            <View style={styles.dateRow}>
              {([
                { field: 'year' as DateField, value: year, placeholder: '년도', suffix: '년' },
                { field: 'month' as DateField, value: month, placeholder: '월', suffix: '월' },
                { field: 'day' as DateField, value: day, placeholder: '일', suffix: '일' },
              ]).map(({ field, value, placeholder, suffix }) => (
                <TouchableOpacity
                  key={field}
                  style={[styles.datePart, value ? styles.datePartActive : null]}
                  onPress={() => openDatePicker(field)}
                >
                  <Text style={[styles.datePartText, value ? styles.datePartTextActive : null]}>
                    {value ? `${value}${suffix}` : placeholder}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {birthComplete && (
              <Text style={styles.datePreview}>{birthLabel}</Text>
            )}
          </View>

          <View style={styles.divider} />

          {/* 사는 지역 */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>사는 지역</Text>
            <TouchableOpacity
              style={[styles.regionBtn, regionComplete ? styles.regionBtnActive : null]}
              onPress={() => { setRegionStep('province'); setRegionPickerOpen(true); }}
            >
              <Text style={[styles.regionBtnText, regionComplete ? styles.regionBtnTextActive : null]}>
                {regionLabel}
              </Text>
              <Text style={[styles.chevron, regionComplete ? styles.chevronActive : null]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* 운동 경험 */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>운동 경험</Text>
            <View style={styles.chipWrap}>
              {(['처음이에요', '배워본 적 있어요', '꾸준히 하고 있어요'] as ExperienceType[]).map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, experience === opt ? styles.chipActive : null]}
                  onPress={() => setExperience(opt)}
                >
                  <Text style={[styles.chipText, experience === opt ? styles.chipTextActive : null]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* 레슨 목표 */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>레슨 목표</Text>
            <View style={styles.chipWrap}>
              {(['취미·건강', '실력 향상', '대회 준비'] as GoalType[]).map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, goal === opt ? styles.chipActive : null]}
                  onPress={() => setGoal(opt)}
                >
                  <Text style={[styles.chipText, goal === opt ? styles.chipTextActive : null]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 저장 버튼 */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>저장하기</Text>
          }
        </TouchableOpacity>
      </View>

      {/* 날짜 피커 바텀시트 */}
      <Modal visible={datePickerOpen} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDatePickerOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{datePickerTitle}</Text>
            <FlatList
              data={datePickerData}
              keyExtractor={item => item}
              style={styles.pickerList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const cur = activeDateField === 'year' ? year : activeDateField === 'month' ? month : day;
                const sel = item === cur;
                return (
                  <TouchableOpacity
                    style={[styles.pickerRow, sel && styles.pickerRowActive]}
                    onPress={() => onDateSelect(item)}
                  >
                    <Text style={[styles.pickerRowText, sel && styles.pickerRowTextActive]}>
                      {item}{dateSuffix}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 지역 피커 바텀시트 */}
      <Modal visible={regionPickerOpen} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setRegionPickerOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              {regionStep === 'district' && (
                <TouchableOpacity onPress={() => setRegionStep('province')} style={styles.sheetBackBtn}>
                  <Text style={styles.sheetBackBtnText}>‹ 시·도</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.sheetTitle}>
                {regionStep === 'province' ? '시·도 선택' : `${province} · 시·군·구 선택`}
              </Text>
            </View>
            <FlatList
              data={regionStep === 'province' ? PROVINCES : (REGIONS[province] ?? [])}
              keyExtractor={item => item}
              style={styles.pickerList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const sel = regionStep === 'province' ? item === province : item === district;
                return (
                  <TouchableOpacity
                    style={[styles.pickerRow, sel && styles.pickerRowActive]}
                    onPress={() => regionStep === 'province' ? onProvinceSelect(item) : onDistrictSelect(item)}
                  >
                    <Text style={[styles.pickerRowText, sel && styles.pickerRowTextActive]}>{item}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: FG },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },

  sectionHeader: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    marginBottom: 10, letterSpacing: 0.2, marginTop: 4,
  },

  card: {
    backgroundColor: CARD, borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    marginBottom: 16,
  },

  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F8EEE9', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: TERRA },

  section: { paddingHorizontal: 20, paddingVertical: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 12, letterSpacing: 0.2 },

  divider: { height: 1, backgroundColor: DIVIDER },

  // 이름 입력
  textInput: {
    backgroundColor: BG, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: FG,
    borderWidth: 1.5, borderColor: BORDER,
  },

  // 날짜
  dateRow: { flexDirection: 'row', gap: 8 },
  datePart: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    backgroundColor: BG, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
  },
  datePartActive: { borderColor: TERRA, backgroundColor: CHIP_SELECTED_BG },
  datePartText: { fontSize: 15, fontWeight: '500', color: MUTED },
  datePartTextActive: { color: TERRA, fontWeight: '700' },
  datePreview: { marginTop: 10, fontSize: 13, color: TERRA, fontWeight: '600' },

  // 지역
  regionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: BG, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
  },
  regionBtnActive: { borderColor: TERRA, backgroundColor: CHIP_SELECTED_BG },
  regionBtnText: { fontSize: 15, fontWeight: '500', color: MUTED, flex: 1 },
  regionBtnTextActive: { color: TERRA, fontWeight: '700' },
  chevron: { fontSize: 20, color: MUTED, marginLeft: 4 },
  chevronActive: { color: TERRA },

  // 칩
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: BG,
  },
  chipActive: { borderColor: TERRA, backgroundColor: CHIP_SELECTED_BG },
  chipText: { fontSize: 14, fontWeight: '500', color: MUTED },
  chipTextActive: { color: TERRA, fontWeight: '700' },

  // 하단 저장 버튼
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  saveBtn: {
    backgroundColor: TERRA, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // 바텀시트 공통
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8,
    maxHeight: '65%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: DIVIDER, alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: { position: 'relative', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: FG, textAlign: 'center', paddingVertical: 4 },
  sheetBackBtn: { position: 'absolute', left: 0, top: 4 },
  sheetBackBtnText: { fontSize: 14, color: TERRA, fontWeight: '600' },
  pickerList: { maxHeight: 320 },
  pickerRow: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  pickerRowActive: { backgroundColor: CHIP_SELECTED_BG },
  pickerRowText: { fontSize: 16, color: FG, textAlign: 'center' },
  pickerRowTextActive: { color: TERRA, fontWeight: '700' },
});
