import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../lib/theme';

const TERRA = '#C0755A';
const PEACH = '#F8EEE9';

interface CoachFullProfile {
  display_name: string | null;
  avatar_url: string | null;
  sport: string | null;
  region_city: string | null;
  region_district: string | null;
  center_name: string | null;
  academy_name: string | null;
  bio: string | null;
  coaching_years: string | null;
  has_player_career: boolean | null;
  career_details: string | null;
  certifications: string | null;
  awards: string | null;
}

export default function CoachProfileScreen() {
  const router = useRouter();
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const [profile, setProfile] = useState<CoachFullProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    supabase
      .from('coach_profiles')
      .select('display_name, avatar_url, sport, region_city, region_district, center_name, academy_name, bio, coaching_years, has_player_career, career_details, certifications, awards')
      .eq('coach_id', coachId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? null);
        setLoading(false);
      });
  }, [coachId]);

  const initials = (profile?.display_name ?? '코').charAt(0).toUpperCase();
  const locationStr = [profile?.region_district, profile?.region_city].filter(Boolean).join(' · ');
  const academyStr = profile?.center_name ?? profile?.academy_name;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>코치 프로필</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TERRA} />
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>프로필 정보를 불러올 수 없어요.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── 프로필 헤더 ── */}
          <View style={styles.heroCard}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <Text style={styles.coachName}>
              {profile.display_name ?? '코치'} 코치
            </Text>
            <View style={styles.badgeRow}>
              {profile.sport && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{profile.sport}</Text>
                </View>
              )}
              {locationStr ? (
                <View style={[styles.badge, styles.badgeGray]}>
                  <Ionicons name="location-outline" size={12} color={Colors.mutedFg} />
                  <Text style={[styles.badgeText, { color: Colors.mutedFg }]}>{locationStr}</Text>
                </View>
              ) : null}
            </View>
            {academyStr ? (
              <View style={styles.academyRow}>
                <Ionicons name="business-outline" size={14} color={Colors.mutedFg} />
                <Text style={styles.academyText}>{academyStr}</Text>
              </View>
            ) : null}
          </View>

          {/* ── 한 줄 소개 ── */}
          {profile.bio ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>한 줄 소개</Text>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : null}

          {/* ── 코칭 경력 ── */}
          {(profile.coaching_years || profile.has_player_career || profile.career_details) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>코칭 경력</Text>
              {profile.coaching_years ? (
                <InfoRow icon="time-outline" label="코칭 경력" value={`${profile.coaching_years}년`} />
              ) : null}
              {profile.has_player_career ? (
                <InfoRow icon="trophy-outline" label="선수 경력" value="있음" />
              ) : null}
              {profile.career_details ? (
                <InfoRow icon="document-text-outline" label="주요 경력" value={profile.career_details} multiline />
              ) : null}
            </View>
          ) : null}

          {/* ── 자격증 ── */}
          {profile.certifications ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>자격증</Text>
              <InfoRow icon="ribbon-outline" label="자격증" value={profile.certifications} multiline />
            </View>
          ) : null}

          {/* ── 수상 경력 ── */}
          {profile.awards ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>수상 경력</Text>
              <InfoRow icon="medal-outline" label="수상 내역" value={profile.awards} multiline />
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, multiline }: {
  icon: string; label: string; value: string; multiline?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={15} color={TERRA} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, multiline && { lineHeight: 22 }]}>{value}</Text>
      </View>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: Colors.mutedFg },
  content: { padding: 20, paddingTop: 12, paddingBottom: 48 },

  heroCard: {
    backgroundColor: '#fff', borderRadius: 20,
    alignItems: 'center', padding: 28,
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 14 },
  avatarFallback: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: PEACH, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: TERRA },
  coachName: { fontSize: 22, fontWeight: '800', color: Colors.foreground, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PEACH, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeGray: { backgroundColor: Colors.mutedBg },
  badgeText: { fontSize: 12, fontWeight: '600', color: TERRA },
  academyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
  },
  academyText: { fontSize: 13, color: Colors.mutedFg },

  section: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.mutedFg,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  bioText: { fontSize: 15, color: Colors.foreground, lineHeight: 24 },
  infoRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { fontSize: 12, color: Colors.mutedFg, marginBottom: 2 },
  infoValue: { fontSize: 14, color: Colors.foreground },
});
