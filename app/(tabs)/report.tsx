import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors } from '../../lib/theme';
import { getMyCoachSubscription, coachCanProvide, CoachSubscriptionInfo } from '../../lib/coachSubscription';

interface PracticeItem {
  title: string;
  description: string;
  duration: string;
  frequency: string;
  tip: string;
}

interface MemberReport {
  id: string;
  lesson_date: string;
  summary: string;
  achievements: string[];
  improvement_points: string[];
  practice_plan: PracticeItem[];
  is_read: boolean;
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

export default function ReportScreen() {
  const [coachSub, setCoachSub] = useState<CoachSubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getMyCoachSubscription().then((sub) => {
        setCoachSub(sub);
        setSubLoading(false);
      });
    }, [])
  );

    const [reports, setReports] = useState<MemberReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [memberIdForRt, setMemberIdForRt] = useState<string | null>(null);

  async function loadReports() {
    const member = await getMyMemberRow();
    if (!member) { setLoading(false); return; }
    setMemberIdForRt(member.id);

    const { data } = await supabase
      .from('member_lesson_reports')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const list = (data ?? []) as MemberReport[];
    setReports(list);
    setUnreadCount(list.filter(r => !r.is_read).length);

    // 최신 리포트 자동 펼침
    if (list.length > 0 && !expandedId) {
      setExpandedId(list[0].id);
      if (!list[0].is_read) markRead(list[0].id);
    }
    setLoading(false);
  }

  async function markRead(reportId: string) {
    await supabase
      .from('member_lesson_reports')
      .update({ is_read: true })
      .eq('id', reportId);
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, is_read: true } : r));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  function toggleExpand(report: MemberReport) {
    if (expandedId === report.id) {
      setExpandedId(null);
    } else {
      setExpandedId(report.id);
      if (!report.is_read) markRead(report.id);
    }
  }

  useFocusEffect(useCallback(() => { loadReports(); }, []));

  // ── Realtime: 코치가 AI 리포트 작성 시 즉시 반영 ────────────────
  useEffect(() => {
    if (!memberIdForRt) return;
    const ch = supabase.channel('report_rt_' + memberIdForRt)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'member_lesson_reports', filter: `member_id=eq.${memberIdForRt}` }, () => loadReports())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'member_lesson_reports', filter: `member_id=eq.${memberIdForRt}` }, () => loadReports())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [memberIdForRt]);

  if (loading) {
    if (!subLoading && !coachCanProvide(coachSub, 'reports')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f8f9fa' }}>
        <Ionicons name="document-lock-outline" size={64} color="#ccc" style={{ marginBottom: 20 }} />
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 12, textAlign: 'center' }}>
          리포트를 확인하려면
        </Text>
        <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 }}>
          코치가 Pro 플랜을 사용할 때{`\n`}레슨 리포트를 받아볼 수 있어요.
        </Text>
      </View>
    );
  }

  return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>레슨 리포트</Text>
          <Text style={styles.headerSub}>AI가 분석한 나만의 레슨 기록</Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>NEW {unreadCount}</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadReports(); setRefreshing(false); }} tintColor={Colors.primary} />
        }
      >
        {reports.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>아직 리포트가 없어요</Text>
            <Text style={styles.emptySub}>코치가 레슨을 녹음하고 분석하면{'\n'}여기에 리포트가 자동으로 도착해요 🎾</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => (
              <TouchableOpacity
                key={report.id}
                style={[styles.card, !report.is_read && styles.cardUnread]}
                onPress={() => toggleExpand(report)}
                activeOpacity={0.85}
              >
                {/* 카드 헤더 */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardDate}>{formatDate(report.lesson_date || report.created_at)}</Text>
                      {!report.is_read && (
                        <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                      )}
                    </View>
                    <Text style={styles.cardPreview} numberOfLines={2}>
                      {report.summary || '레슨 리포트'}
                    </Text>
                  </View>
                  <Ionicons
                    name={expandedId === report.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={Colors.mutedFg}
                  />
                </View>

                {/* 확장 내용 */}
                {expandedId === report.id && (
                  <View style={styles.detail}>
                    <View style={styles.divider} />

                    {/* 1. 오늘 레슨 요약 */}
                    <View style={styles.section}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionIcon}>📋</Text>
                        <Text style={styles.sectionTitle}>오늘 레슨 요약</Text>
                      </View>
                      <View style={styles.summaryBox}>
                        <Text style={styles.summaryText}>{report.summary}</Text>
                      </View>
                    </View>

                    {/* 2. 오늘의 중요 성과 */}
                    {report.achievements?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>🏆</Text>
                          <Text style={styles.sectionTitle}>오늘의 중요 성과</Text>
                        </View>
                        {report.achievements.map((item, i) => (
                          <View key={i} style={styles.achievementRow}>
                            <View style={styles.achievementDot} />
                            <Text style={styles.achievementText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 3. 개선 및 보완 포인트 */}
                    {report.improvement_points?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>💡</Text>
                          <Text style={styles.sectionTitle}>개선 및 보완 포인트</Text>
                        </View>
                        {report.improvement_points.map((item, i) => (
                          <View key={i} style={styles.improveRow}>
                            <Text style={styles.improveNum}>{i + 1}</Text>
                            <Text style={styles.improveText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 4. 맞춤 개인 연습 플랜 */}
                    {report.practice_plan?.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionIcon}>🎯</Text>
                          <Text style={styles.sectionTitle}>맞춤 개인 연습 플랜</Text>
                        </View>
                        {report.practice_plan.map((item, i) => (
                          <View key={i} style={styles.practiceCard}>
                            <View style={styles.practiceHeader}>
                              <View style={styles.practiceIdx}>
                                <Text style={styles.practiceIdxText}>{i + 1}</Text>
                              </View>
                              <Text style={styles.practiceTitle}>{item.title}</Text>
                            </View>
                            <Text style={styles.practiceDesc}>{item.description}</Text>
                            <View style={styles.practiceMeta}>
                              <View style={styles.metaChip}>
                                <Ionicons name="time-outline" size={12} color={Colors.primary} />
                                <Text style={styles.metaText}>{item.duration}</Text>
                              </View>
                              <View style={styles.metaChip}>
                                <Ionicons name="repeat-outline" size={12} color={Colors.primary} />
                                <Text style={styles.metaText}>{item.frequency}</Text>
                              </View>
                            </View>
                            {!!item.tip && (
                              <View style={styles.tipBox}>
                                <Text style={styles.tipLabel}>💬 TIP</Text>
                                <Text style={styles.tipText}>{item.tip}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: Colors.primary,
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  unreadBadge: { backgroundColor: Colors.accentWarm, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  unreadText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  emptyBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.foreground },
  emptySub: { fontSize: 14, color: Colors.mutedFg, textAlign: 'center', lineHeight: 22 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.accentWarm },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardDate: { fontSize: 12, color: Colors.mutedFg, fontWeight: '600' },
  newBadge: { backgroundColor: Colors.accentWarm, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  cardPreview: { fontSize: 14, color: Colors.foreground, lineHeight: 20 },

  detail: { marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },

  section: { marginBottom: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary },

  summaryBox: {
    backgroundColor: Colors.primaryLight || '#EEF4FF',
    borderRadius: 10,
    padding: 14,
  },
  summaryText: { fontSize: 14, color: Colors.foreground, lineHeight: 22 },

  achievementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  achievementDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentWarm, marginTop: 7, flexShrink: 0 },
  achievementText: { fontSize: 14, color: Colors.foreground, lineHeight: 22, flex: 1 },

  improveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  improveNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FEF3C7',
    textAlign: 'center', lineHeight: 22,
    fontSize: 12, fontWeight: '800', color: '#92400E',
    flexShrink: 0,
  },
  improveText: { fontSize: 14, color: Colors.foreground, lineHeight: 22, flex: 1 },

  practiceCard: {
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  practiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  practiceIdx: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  practiceIdxText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  practiceTitle: { fontSize: 15, fontWeight: '800', color: Colors.foreground, flex: 1 },
  practiceDesc: { fontSize: 14, color: Colors.foreground, lineHeight: 22, marginBottom: 10 },
  practiceMeta: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E0F2FE', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tipBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  tipLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  tipText: { fontSize: 13, color: '#78350F', lineHeight: 20 },
});
