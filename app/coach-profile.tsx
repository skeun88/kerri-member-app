import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { Colors } from '../lib/theme';

const TERRA = '#C0755A';
const PEACH = '#F8EEE9';
const DIVIDER = '#E8EBEF';
const TEXT_MUTED = '#667085';

interface JourneySnapshot {
  members_count: number;
  lessons_count: number;
  reports_count: number;
}

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
  show_coaching_journey: boolean | null;
  journey_snapshot: JourneySnapshot | null;
}

interface ReviewSummary {
  avg_rating: number;
  total_count: number;
  top_keywords: { code: string; label: string; count: number }[];
}

interface ReviewItem {
  id: string;
  rating: number;
  keyword_codes: string[];
  comment: string | null;
  submitted_at: string;
  is_mine: boolean;
}

export default function CoachProfileScreen() {
  const router = useRouter();
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const [profile, setProfile] = useState<CoachFullProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 리뷰 관련 state
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [myReviewId, setMyReviewId] = useState<string | null>(null);
  const [canWriteReview, setCanWriteReview] = useState(false);
  const [keywordMap, setKeywordMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    supabase
      .from('coach_profiles')
      .select('display_name, avatar_url, sport, region_city, region_district, center_name, academy_name, bio, coaching_years, has_player_career, career_details, certifications, awards, show_coaching_journey, journey_snapshot')
      .eq('coach_id', coachId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? null);
        setLoading(false);
      });
  }, [coachId]);

  useFocusEffect(useCallback(() => {
    if (coachId) loadReviews();
  }, [coachId]));

  async function loadReviews() {
    setReviewsLoading(true);
    try {
      const [{ data: { user } }, memberData, { data: kws }] = await Promise.all([
        supabase.auth.getUser(),
        getMyMemberRow(),
        supabase.from('review_keywords').select('code, label').order('sort_order'),
      ]);

      const kwMap: Record<string, string> = {};
      (kws ?? []).forEach((k: any) => { kwMap[k.code] = k.label; });
      setKeywordMap(kwMap);

      // 본인 리뷰 존재 여부
      let myId: string | null = null;
      if (user) {
        const { data: myReview } = await supabase
          .from('coach_reviews')
          .select('id')
          .eq('coach_id', coachId)
          .eq('member_id', user.id)
          .eq('is_deleted', false)
          .maybeSingle();
        myId = myReview?.id ?? null;
        setMyReviewId(myId);
      }

      // 출석 완료 레슨 1회 이상 여부 확인 (리뷰 작성 조건)
      if (user && memberData) {
        const { count } = await supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('member_id', memberData.id)
          .eq('status', 'attended');
        setCanWriteReview((count ?? 0) >= 1);
      }

      // 공개 리뷰 목록 (member_id 제외)
      const { data: rawReviews } = await supabase
        .from('coach_reviews')
        .select('id, rating, keyword_codes, comment, submitted_at, member_id')
        .eq('coach_id', coachId)
        .eq('is_deleted', false)
        .order('submitted_at', { ascending: false })
        .limit(50);

      const reviewList: ReviewItem[] = (rawReviews ?? []).map((r: any) => ({
        id: r.id,
        rating: r.rating,
        keyword_codes: r.keyword_codes ?? [],
        comment: r.comment,
        submitted_at: r.submitted_at,
        is_mine: user ? r.member_id === user.id : false,
      }));
      setReviews(reviewList);

      // 집계
      if (reviewList.length > 0) {
        const totalRating = reviewList.reduce((s, r) => s + r.rating, 0);
        const avgRating = Math.round((totalRating / reviewList.length) * 10) / 10;

        // 키워드 카운트
        const kwCount: Record<string, number> = {};
        reviewList.forEach(r => {
          r.keyword_codes.forEach(c => { kwCount[c] = (kwCount[c] ?? 0) + 1; });
        });
        const topKws = Object.entries(kwCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([code, count]) => ({ code, label: kwMap[code] ?? code, count }));

        setReviewSummary({ avg_rating: avgRating, total_count: reviewList.length, top_keywords: topKws });
      } else {
        setReviewSummary(null);
      }
    } finally {
      setReviewsLoading(false);
    }
  }

  async function handleReport(reviewId: string) {
    Alert.alert('신고하기', '신고 사유를 선택해주세요', [
      { text: '취소', style: 'cancel' },
      { text: '부적절한 내용', onPress: () => submitReport(reviewId, 'inappropriate') },
      { text: '개인정보 노출', onPress: () => submitReport(reviewId, 'personal_info') },
      { text: '기타', onPress: () => submitReport(reviewId, 'other') },
    ]);
  }

  async function submitReport(reviewId: string, reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('review_reports').insert({
      review_id: reviewId,
      reporter_id: user.id,
      reason,
    });
    Alert.alert('', '신고가 접수됐어요. 검토 후 처리될 예정이에요.');
  }

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
        <View style={{ width: 36 }} />
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

            {/* 별점 요약 */}
            {reviewSummary && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color={TERRA} />
                <Text style={styles.ratingAvg}>{reviewSummary.avg_rating.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({reviewSummary.total_count}개 리뷰)</Text>
              </View>
            )}
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

          {/* ── 코칭 여정 ── */}
          {profile.show_coaching_journey && profile.journey_snapshot ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>코칭 여정</Text>
              <View style={styles.journeyGrid}>
                <JourneyStat value={`${profile.journey_snapshot.members_count}명`} label="함께한 회원" />
                <View style={styles.journeyDivider} />
                <JourneyStat value={`${profile.journey_snapshot.lessons_count.toLocaleString()}회`} label="진행한 레슨" />
                <View style={styles.journeyDivider} />
                <JourneyStat value={`${profile.journey_snapshot.reports_count}개`} label="레슨 기록" />
              </View>
            </View>
          ) : null}

          {/* ── 리뷰 섹션 ── */}
          <View style={styles.reviewSection}>
            <View style={styles.reviewSectionHeader}>
              <Text style={styles.reviewSectionTitle}>리뷰</Text>
              {reviewSummary && (
                <Text style={styles.reviewSectionCount}>{reviewSummary.total_count}개</Text>
              )}
            </View>

            {/* 리뷰 쓰기 / 내 리뷰 보기 버튼 */}
            {canWriteReview && (
              <TouchableOpacity
                style={[styles.writeReviewBtn, myReviewId ? styles.writeReviewBtnOutline : styles.writeReviewBtnFill]}
                onPress={() => router.push({
                  pathname: '/write-review',
                  params: {
                    coachId: coachId!,
                    coachName: profile.display_name ?? '',
                  },
                })}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={myReviewId ? 'create-outline' : 'star-outline'}
                  size={16}
                  color={myReviewId ? TERRA : '#fff'}
                />
                <Text style={[styles.writeReviewBtnText, myReviewId && styles.writeReviewBtnTextOutline]}>
                  {myReviewId ? '내 리뷰 수정하기' : '리뷰 작성하기'}
                </Text>
              </TouchableOpacity>
            )}

            {/* TOP 키워드 */}
            {reviewSummary && reviewSummary.top_keywords.length > 0 && (
              <View style={styles.topKeywordsBox}>
                {reviewSummary.top_keywords.map(kw => (
                  <View key={kw.code} style={styles.topKeywordRow}>
                    <Ionicons name="checkmark-circle" size={15} color={TERRA} />
                    <Text style={styles.topKeywordLabel}>{kw.label}</Text>
                    <Text style={styles.topKeywordCount}>{kw.count}명</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 리뷰 목록 */}
            {reviewsLoading ? (
              <View style={styles.reviewLoadingBox}>
                <ActivityIndicator color={TERRA} size="small" />
              </View>
            ) : reviews.length === 0 ? (
              <View style={styles.reviewEmptyBox}>
                <Text style={styles.reviewEmptyText}>아직 등록된 리뷰가 없어요</Text>
              </View>
            ) : (
              reviews.map((review, idx) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  keywordMap={keywordMap}
                  onReport={() => handleReport(review.id)}
                  divider={idx > 0}
                />
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ReviewCard({
  review, keywordMap, onReport, divider,
}: {
  review: ReviewItem;
  keywordMap: Record<string, string>;
  onReport: () => void;
  divider: boolean;
}) {
  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  return (
    <View style={[styles.reviewCard, divider && styles.reviewCardDivider]}>
      <View style={styles.reviewCardTop}>
        <View style={styles.reviewerInfo}>
          <View style={styles.reviewerAvatar}>
            <Ionicons name="person" size={14} color={TEXT_MUTED} />
          </View>
          <View>
            <Text style={styles.reviewerName}>
              익명 회원{review.is_mine && <Text style={styles.myReviewBadge}> · 내 리뷰</Text>}
            </Text>
            <View style={styles.reviewMeta}>
              <View style={styles.miniStars}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Ionicons
                    key={s}
                    name={s <= review.rating ? 'star' : 'star-outline'}
                    size={12}
                    color={s <= review.rating ? TERRA : DIVIDER}
                  />
                ))}
              </View>
              <Text style={styles.reviewDate}>{formatDate(review.submitted_at)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onReport} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      {review.keyword_codes.length > 0 && (
        <View style={styles.reviewKeywords}>
          {review.keyword_codes.map(code => (
            <View key={code} style={styles.reviewChip}>
              <Text style={styles.reviewChipText}>{keywordMap[code] ?? code}</Text>
            </View>
          ))}
        </View>
      )}

      {review.comment ? (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      ) : null}
    </View>
  );
}

function JourneyStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.journeyStat}>
      <Text style={styles.journeyStatValue}>{value}</Text>
      <Text style={styles.journeyStatLabel}>{label}</Text>
    </View>
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.foreground, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: Colors.mutedFg },
  content: { padding: 20, paddingTop: 12, paddingBottom: 48 },

  heroCard: {
    backgroundColor: '#fff', borderRadius: 20,
    alignItems: 'center', padding: 28, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 14 },
  avatarFallback: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: PEACH, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: TERRA },
  coachName: { fontSize: 22, fontWeight: '800', color: Colors.foreground, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PEACH, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeGray: { backgroundColor: Colors.mutedBg },
  badgeText: { fontSize: 12, fontWeight: '600', color: TERRA },
  academyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  academyText: { fontSize: 13, color: Colors.mutedFg },
  ratingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: DIVIDER, alignSelf: 'stretch', justifyContent: 'center',
  },
  ratingAvg: { fontSize: 16, fontWeight: '800', color: Colors.foreground },
  ratingCount: { fontSize: 13, color: TEXT_MUTED },

  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12,
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
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { fontSize: 12, color: Colors.mutedFg, marginBottom: 2 },
  infoValue: { fontSize: 14, color: Colors.foreground },

  journeyGrid: { flexDirection: 'row', alignItems: 'center' },
  journeyStat: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  journeyStatValue: { fontSize: 20, fontWeight: '800', color: Colors.foreground, marginBottom: 4 },
  journeyStatLabel: { fontSize: 12, fontWeight: '600', color: Colors.mutedFg, textAlign: 'center' },
  journeyDivider: { width: 1, height: 36, backgroundColor: Colors.borderLight },

  // 리뷰 섹션
  reviewSection: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  reviewSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  reviewSectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.mutedFg,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  reviewSectionCount: { fontSize: 13, fontWeight: '600', color: TERRA },

  writeReviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, marginBottom: 16,
  },
  writeReviewBtnFill: { backgroundColor: TERRA },
  writeReviewBtnOutline: { borderWidth: 1.5, borderColor: TERRA },
  writeReviewBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  writeReviewBtnTextOutline: { color: TERRA },

  topKeywordsBox: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 16, gap: 8,
  },
  topKeywordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topKeywordLabel: { flex: 1, fontSize: 13, color: Colors.foreground },
  topKeywordCount: { fontSize: 13, fontWeight: '700', color: TERRA },

  reviewLoadingBox: { paddingVertical: 20, alignItems: 'center' },
  reviewEmptyBox: { paddingVertical: 20, alignItems: 'center' },
  reviewEmptyText: { fontSize: 14, color: TEXT_MUTED },

  // 리뷰 카드
  reviewCard: { paddingVertical: 14 },
  reviewCardDivider: { borderTopWidth: 1, borderTopColor: DIVIDER },
  reviewCardTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8,
  },
  reviewerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  reviewerName: { fontSize: 13, fontWeight: '700', color: Colors.foreground },
  myReviewBadge: { fontSize: 12, fontWeight: '600', color: TERRA },
  reviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  miniStars: { flexDirection: 'row', gap: 1 },
  reviewDate: { fontSize: 11, color: TEXT_MUTED },

  reviewKeywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  reviewChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: PEACH, borderRadius: 20,
  },
  reviewChipText: { fontSize: 12, fontWeight: '500', color: TERRA },
  reviewComment: { fontSize: 14, color: Colors.foreground, lineHeight: 21 },
});
