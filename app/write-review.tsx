import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, SafeAreaView,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../lib/supabase';

const BG = '#FAFAFA';
const CARD = '#FFFFFF';
const TERRA = '#C0755A';
const TERRA_LIGHT = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

interface ReviewKeyword {
  code: string;
  label: string;
  sort_order: number;
}

interface ExistingReview {
  id: string;
  rating: number;
  keyword_codes: string[];
  comment: string | null;
}

export default function WriteReviewScreen() {
  const router = useRouter();
  const { coachId, coachName } = useLocalSearchParams<{ coachId: string; coachName?: string }>();

  const [keywords, setKeywords] = useState<ReviewKeyword[]>([]);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [rating, setRating] = useState(0);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberAuthUid, setMemberAuthUid] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [coachId]);

  async function loadData() {
    setLoading(true);
    const [{ data: kws }, member, { data: { user } }] = await Promise.all([
      supabase.from('review_keywords').select('code, label, sort_order').order('sort_order'),
      getMyMemberRow(),
      supabase.auth.getUser(),
    ]);

    setKeywords(kws ?? []);

    if (user) setMemberAuthUid(user.id);
    if (member) setMemberId(member.id);

    if (user && coachId) {
      const { data: existing } = await supabase
        .from('coach_reviews')
        .select('id, rating, keyword_codes, comment')
        .eq('coach_id', coachId)
        .eq('member_id', user.id)
        .eq('is_deleted', false)
        .maybeSingle();

      if (existing) {
        setExistingReview(existing);
        setRating(existing.rating);
        setSelectedKeywords(existing.keyword_codes ?? []);
        setComment(existing.comment ?? '');
      }
    }

    setLoading(false);
  }

  function toggleKeyword(code: string) {
    setSelectedKeywords(prev => {
      if (prev.includes(code)) return prev.filter(k => k !== code);
      if (prev.length >= 5) {
        Alert.alert('', '최대 5개까지 선택할 수 있어요');
        return prev;
      }
      return [...prev, code];
    });
  }

  async function handleSubmit() {
    if (rating === 0 || submitting) return;
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !coachId) throw new Error('인증 오류');

      const reviewData = {
        coach_id: coachId,
        member_id: user.id,
        rating,
        keyword_codes: selectedKeywords,
        comment: comment.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (existingReview) {
        const { error } = await supabase
          .from('coach_reviews')
          .update({
            rating: reviewData.rating,
            keyword_codes: reviewData.keyword_codes,
            comment: reviewData.comment,
            updated_at: reviewData.updated_at,
          })
          .eq('id', existingReview.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('coach_reviews')
          .insert(reviewData);
        if (error) throw error;

        // 최초 등록 시에만 코치에게 푸시 알림
        try {
          const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
          const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                recipient_type: 'coach',
                recipient_id: coachId,
                title: '새로운 리뷰가 도착했어요',
                body: '회원이 레슨 리뷰를 남겼어요',
                notif_id: 'PN-18',
                data: { type: 'review' },
              }),
            });
          }
        } catch {}
      }

      Alert.alert(
        existingReview ? '수정 완료' : '등록 완료',
        existingReview ? '리뷰가 수정됐어요.' : '리뷰가 등록됐어요.',
        [{ text: '확인', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingReview) return;
    Alert.alert(
      '리뷰 삭제',
      '작성한 리뷰를 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('coach_reviews')
                .update({ is_deleted: true, updated_at: new Date().toISOString() })
                .eq('id', existingReview.id);
              if (error) throw error;
              router.back();
            } catch {
              Alert.alert('오류', '삭제하지 못했어요. 다시 시도해주세요.');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={TERRA} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {existingReview ? '리뷰 수정' : '리뷰 작성'}
          </Text>
          {existingReview ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>삭제</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerRight} />
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 질문 */}
          <Text style={styles.mainQuestion}>코치님과의 레슨은 어떠셨나요?</Text>
          {coachName && (
            <Text style={styles.coachNameLabel}>{coachName} 코치</Text>
          )}

          {/* 별점 */}
          <View style={styles.ratingSection}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= rating ? TERRA : DIVIDER}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingLabel}>
                {['', '별로예요', '아쉬워요', '보통이에요', '좋아요', '최고예요'][rating]}
              </Text>
            )}
          </View>

          {/* 키워드 */}
          <View style={styles.section}>
            <View style={styles.keywordHeader}>
              <Text style={styles.sectionTitle}>어떤 점이 좋았나요?</Text>
              <Text style={styles.keywordCount}>{selectedKeywords.length}/5</Text>
            </View>
            <Text style={styles.keywordHint}>최대 5개까지 선택해주세요</Text>
            <View style={styles.keywordWrap}>
              {keywords.map(kw => {
                const selected = selectedKeywords.includes(kw.code);
                return (
                  <TouchableOpacity
                    key={kw.code}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleKeyword(kw.code)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {kw.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 후기 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>후기</Text>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={t => t.length <= 300 && setComment(t)}
              placeholder="직접 경험한 레슨 이야기를 자유롭게 남겨주세요"
              placeholderTextColor={TEXT_MUTED}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{comment.length}/300</Text>
          </View>

          {/* 공개 안내 */}
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={15} color={TEXT_MUTED} style={{ marginTop: 1 }} />
            <Text style={styles.noticeText}>
              리뷰는 익명으로 코치 프로필에 공개돼요. 내용에 이름이나 연락처를 적지 않도록 주의해주세요.
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* 하단 등록 버튼 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, (rating === 0 || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {existingReview ? '리뷰 수정하기' : '리뷰 등록하기'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 4 : 12,
    paddingBottom: 8, backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY },
  headerRight: { width: 40 },
  deleteBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, color: '#E53E3E', fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  mainQuestion: {
    fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY,
    textAlign: 'center', marginTop: 8, marginBottom: 4,
  },
  coachNameLabel: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center', marginBottom: 24,
  },

  // 별점
  ratingSection: { alignItems: 'center', marginBottom: 28 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ratingLabel: { fontSize: 15, fontWeight: '600', color: TERRA },

  // 섹션
  section: {
    backgroundColor: CARD, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: DIVIDER,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 4 },

  // 키워드
  keywordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  keywordCount: { fontSize: 13, fontWeight: '600', color: TERRA },
  keywordHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 12 },
  keywordWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: DIVIDER,
    backgroundColor: '#F5F5F5',
  },
  chipSelected: {
    backgroundColor: TERRA_LIGHT,
    borderColor: TERRA,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: TEXT_MUTED },
  chipTextSelected: { color: TERRA, fontWeight: '700' },

  // 후기
  commentInput: {
    minHeight: 100, fontSize: 14, color: TEXT_PRIMARY,
    lineHeight: 22, paddingTop: 8,
  },
  charCount: { fontSize: 11, color: TEXT_MUTED, textAlign: 'right', marginTop: 4 },

  // 안내
  noticeBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#F3F4F6', borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  noticeText: { flex: 1, fontSize: 12, color: TEXT_MUTED, lineHeight: 18 },

  // 하단 버튼
  footer: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: BG, borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  submitBtn: {
    backgroundColor: TERRA, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
