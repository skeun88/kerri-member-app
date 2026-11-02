import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../lib/supabase';

// ── Design tokens ──────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

// ── Types ──────────────────────────────────────────────────────
type CompStatus = 'improved' | 'same' | 'maintained' | 'needs_work' | 'regressed';

interface LessonComparison {
  point: string;
  status: CompStatus;
  reason?: string;
}

interface LessonRecord {
  plan_id: string;
  lesson_id: string | null;
  created_at: string;
  lesson_comparison: LessonComparison[];
}

type FilterKey = 'all' | 'improved' | 'maintained' | 'needs_work' | 'regressed';

// ── Helpers ────────────────────────────────────────────────────
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',        label: '전체' },
  { key: 'improved',   label: '좋아졌어요' },
  { key: 'maintained', label: '잘 유지하고 있어요' },
  { key: 'needs_work', label: '연습이 필요해요' },
  { key: 'regressed',  label: '다시 점검해요' },
];

function getChangeBadge(status: CompStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '좋아졌어요',        bg: '#E8F5E9', text: '#2E7D32' };
    case 'maintained':
    case 'same':       return { label: '잘 유지하고 있어요', bg: '#E3F2FD', text: '#1565C0' };
    case 'needs_work': return { label: '연습이 필요해요',    bg: '#FFF3E0', text: '#E65100' };
    case 'regressed':  return { label: '다시 점검해요',      bg: '#FFEBEE', text: '#C62828' };
    default:           return { label: '기록중',             bg: BG,        text: TEXT_MUTED };
  }
}

function matchesFilter(status: CompStatus, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'maintained') return status === 'maintained' || status === 'same';
  return status === filter;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

// ── Main screen ────────────────────────────────────────────────
export default function GrowthChangesScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<LessonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  async function loadData() {
    setError(false);
    try {
      const member = await getMyMemberRow();
      if (!member) { setLoading(false); return; }

      const { data, error: dbErr } = await supabase
        .from('lesson_plans')
        .select('id, lesson_id, created_at, lesson_comparison')
        .eq('member_id', member.id)
        .eq('status', 'completed')
        .not('lesson_comparison', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (dbErr) { setError(true); setLoading(false); return; }

      const rows: LessonRecord[] = (data ?? [])
        .filter(r => Array.isArray(r.lesson_comparison) && (r.lesson_comparison as unknown[]).length > 0)
        .map(r => ({
          plan_id: r.id as string,
          lesson_id: (r.lesson_id as string) ?? null,
          created_at: r.created_at as string,
          lesson_comparison: r.lesson_comparison as LessonComparison[],
        }));

      setRecords(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const filtered = filter === 'all'
    ? records
    : records.filter(r => r.lesson_comparison.some(c => matchesFilter(c.status, filter)));

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>이전 대비 변화</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={TERRA} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>데이터를 불러올 수 없어요</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setLoading(true); loadData(); }}
          >
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="analytics-outline" size={52} color={DIVIDER} />
          <Text style={styles.emptyTitle}>아직 변화 기록이 없어요</Text>
          <Text style={styles.emptySub}>레슨을 진행하면{'\n'}변화 기록이 여기 나타나요</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.plan_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const visibleItems = filter === 'all'
              ? item.lesson_comparison.slice(0, 3)
              : item.lesson_comparison
                  .filter(c => matchesFilter(c.status, filter))
                  .slice(0, 3);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => item.lesson_id
                  ? router.push({ pathname: '/lesson-detail', params: { id: item.lesson_id } } as never)
                  : router.push('/(tabs)/report' as never)
                }
                activeOpacity={0.85}
              >
                <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
                {visibleItems.map((c, i) => {
                  const badge = getChangeBadge(c.status);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.compRow,
                        i < visibleItems.length - 1 && styles.compRowBorder,
                      ]}
                    >
                      <View style={styles.compTopRow}>
                        <Text style={styles.compPoint} numberOfLines={2}>{c.point}</Text>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeText, { color: badge.text }]}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>
                      {!!c.reason && (
                        <Text style={styles.compReason} numberOfLines={3}>{c.reason}</Text>
                      )}
                    </View>
                  );
                })}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  headerSafe: { backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.3 },

  filterScroll: { flexGrow: 0 },
  filterContent: {
    paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4,
    flexDirection: 'row', gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: CARD_WHITE, borderRadius: 20,
    borderWidth: 1, borderColor: DIVIDER,
  },
  filterTabActive: { backgroundColor: TERRA, borderColor: TERRA },
  filterTabText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  filterTabTextActive: { color: '#fff' },

  centerBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 32,
  },
  errorText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: {
    backgroundColor: TERRA, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginTop: 4 },
  emptySub: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },

  list: { paddingHorizontal: 20, paddingTop: 8 },
  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardDate: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, marginBottom: 12 },
  compRow: { paddingVertical: 10 },
  compRowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  compTopRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8,
  },
  compPoint: {
    fontSize: 14, color: TEXT_PRIMARY, fontWeight: '600',
    flex: 1, lineHeight: 20,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  compReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, marginTop: 6 },
});
