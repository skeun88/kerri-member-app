/**
 * QR 온보딩 스크린
 * QR 스캔으로 진입 시 (kerri://join?coach_id=xxx) 코치 프로필 + 레슨권 목록 표시
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Shadow } from '../lib/theme';

interface CoachInfo {
  display_name: string | null;
  avatar_url: string | null;
  center_name: string | null;
  region_city: string | null;
  bio: string | null;
  coaching_years: number | null;
}

interface Package {
  id: string;
  title: string;
  total_credits: number;
  duration_minutes: number;
  price: number;
  color: string;
}

export default function QROnboardingScreen() {
  const { coach_id } = useLocalSearchParams<{ coach_id: string }>();
  const router = useRouter();

  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'coach' | 'package' | 'contact' | 'done'>('coach');

  useEffect(() => {
    if (coach_id) {
      AsyncStorage.setItem('pending_coach_id', coach_id);
      loadCoachInfo();
    }
  }, [coach_id]);

  async function loadCoachInfo() {
    setLoading(true);
    const { data: cp } = await supabase
      .from('coach_profiles')
      .select('display_name, avatar_url, center_name, region_city, bio, coaching_years')
      .eq('coach_id', coach_id)
      .maybeSingle();
    setCoach(cp ?? null);

    const { data: pkgs } = await supabase
      .from('lesson_packages')
      .select('id, title, total_credits, duration_minutes, price, color')
      .eq('coach_id', coach_id)
      .eq('is_active', true)
      .order('price', { ascending: true });
    setPackages(pkgs ?? []);
    setLoading(false);
  }

  async function handleSubmit(skipPackage = false) {
    if (!coach_id) return;
    setSubmitting(true);
    const { error } = await supabase.from('member_interest').insert({
      coach_id,
      name: name.trim() || null,
      phone: phone.trim() || null,
      package_id: skipPackage ? null : selectedPkgId,
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('오류', '저장 중 문제가 발생했어요. 다시 시도해주세요.');
    } else {
      setStep('done');
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={s.center}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.primary} />
        <Text style={s.doneTitle}>신청 완료! 🎾</Text>
        <Text style={s.doneSub}>코치님께 연락이 갈 거예요.{'\n'}앱을 계속 사용하려면 회원 가입 후 초대 코드를 입력해주세요.</Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/')}>
          <Text style={s.doneBtnText}>홈으로 이동</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* 코치 프로필 */}
      <View style={s.coachCard}>
        {coach?.avatar_url ? (
          <Image source={{ uri: coach.avatar_url }} style={s.avatar} />
        ) : (
          <View style={s.avatarFallback}>
            <Text style={s.avatarInitial}>{(coach?.display_name ?? '코').charAt(0)}</Text>
          </View>
        )}
        <Text style={s.coachName}>{coach?.display_name ?? '코치'}</Text>
        {coach?.coaching_years != null && (
          <Text style={s.coachSub}>경력 {coach.coaching_years}년</Text>
        )}
        {(coach?.center_name || coach?.region_city) && (
          <View style={s.locRow}>
            <Ionicons name="location-outline" size={13} color={Colors.mutedFg} />
            <Text style={s.locText}>{[coach.center_name, coach.region_city].filter(Boolean).join(' · ')}</Text>
          </View>
        )}
        {coach?.bio && <Text style={s.bio} numberOfLines={3}>{coach.bio}</Text>}
      </View>

      {step === 'coach' && (
        <>
          <Text style={s.sectionTitle}>레슨권 확인하기</Text>
          <Text style={s.sectionSub}>관심 있는 레슨권을 선택해주세요</Text>
          <TouchableOpacity style={s.nextBtn} onPress={() => setStep('package')}>
            <Text style={s.nextBtnText}>레슨권 보기 →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'package' && (
        <>
          <Text style={s.sectionTitle}>레슨권 선택</Text>
          {packages.length === 0 ? (
            <Text style={s.empty}>등록된 레슨권이 없어요</Text>
          ) : (
            packages.map(pkg => (
              <TouchableOpacity
                key={pkg.id}
                style={[s.pkgCard, selectedPkgId === pkg.id && { borderColor: pkg.color ?? Colors.primary, borderWidth: 2 }]}
                onPress={() => setSelectedPkgId(pkg.id)}
                activeOpacity={0.85}
              >
                <View style={[s.pkgColorBar, { backgroundColor: pkg.color ?? Colors.primary }]} />
                <View style={s.pkgBody}>
                  <Text style={s.pkgTitle}>{pkg.title}</Text>
                  <Text style={s.pkgMeta}>{pkg.total_credits}회 · {pkg.duration_minutes}분 레슨</Text>
                  <Text style={[s.pkgPrice, { color: pkg.color ?? Colors.primary }]}>
                    {(pkg.price ?? 0).toLocaleString()}원
                  </Text>
                </View>
                {selectedPkgId === pkg.id && (
                  <Ionicons name="checkmark-circle" size={22} color={pkg.color ?? Colors.primary} />
                )}
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity style={s.nextBtn} onPress={() => setStep('contact')} disabled={!selectedPkgId}>
            <Text style={[s.nextBtnText, !selectedPkgId && { opacity: 0.4 }]}>
              {selectedPkgId ? '다음 →' : '레슨권을 선택해주세요'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setSelectedPkgId(null); setStep('contact'); }} style={s.skipBtn}>
            <Text style={s.skipText}>나중에 결정할게요</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'contact' && (
        <>
          <Text style={s.sectionTitle}>연락처 (선택)</Text>
          <Text style={s.sectionSub}>코치님이 먼저 연락드릴 수 있도록 남겨주세요</Text>
          <TextInput
            style={s.input}
            placeholder="이름"
            placeholderTextColor={Colors.placeholder}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={s.input}
            placeholder="전화번호"
            placeholderTextColor={Colors.placeholder}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity style={s.nextBtn} onPress={() => handleSubmit(false)} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.nextBtnText}>신청 완료</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSubmit(true)} style={s.skipBtn} disabled={submitting}>
            <Text style={s.skipText}>연락처 없이 신청</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  coachCard: { alignItems: 'center', backgroundColor: '#fff', margin: 16, borderRadius: Radius.xl, padding: 24, ...Shadow.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarInitial: { fontSize: 32, fontWeight: '800', color: '#fff' },
  coachName: { fontSize: 20, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  coachSub: { fontSize: 13, color: Colors.mutedFg, marginBottom: 4 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  locText: { fontSize: 12, color: Colors.mutedFg },
  bio: { fontSize: 13, color: Colors.foreground, textAlign: 'center', lineHeight: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.primary, marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: Colors.mutedFg, marginHorizontal: 16, marginBottom: 16 },
  pkgCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  pkgColorBar: { width: 6, alignSelf: 'stretch' },
  pkgBody: { flex: 1, padding: 14 },
  pkgTitle: { fontSize: 15, fontWeight: '700', color: Colors.foreground, marginBottom: 4 },
  pkgMeta: { fontSize: 12, color: Colors.mutedFg, marginBottom: 4 },
  pkgPrice: { fontSize: 16, fontWeight: '800' },
  nextBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, marginHorizontal: 16, marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skipBtn: { alignItems: 'center', marginTop: 12 },
  skipText: { fontSize: 13, color: Colors.mutedFg },
  input: { backgroundColor: '#fff', borderRadius: Radius.lg, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.foreground, borderWidth: 1, borderColor: Colors.border },
  empty: { fontSize: 14, color: Colors.placeholder, textAlign: 'center', margin: 24 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginTop: 16, marginBottom: 8 },
  doneSub: { fontSize: 14, color: Colors.mutedFg, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
