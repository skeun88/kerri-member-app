import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

const BRONZE_COLOR = '#CD7F32';
const SILVER_COLOR = '#A0A0A0';
const GOLD_COLOR = '#C0755A';

type GradeLevel = 'bronze' | 'silver' | 'gold';
export type ChangeStatus = 'improved' | 'maintained' | 'same' | 'needs_work' | 'regressed' | null;

const GRADE_CONFIG = {
  bronze: { label: '브론즈', emoji: '🥉', color: BRONZE_COLOR, min: 0, max: 99 },
  silver: { label: '실버', emoji: '🥈', color: SILVER_COLOR, min: 100, max: 199 },
  gold:   { label: '골드', emoji: '🥇', color: GOLD_COLOR, min: 200, max: 300 },
};

export interface LessonComparison {
  point: string;
  status: 'improved' | 'same' | 'regressed' | 'needs_work';
  reason?: string;
}

export interface GrowthReport {
  plan_id: string;
  created_at: string;
  lesson_comparison: LessonComparison[] | null;
  next_goals_raw: string[] | string | null;
  achievements?: string[] | null;
  improvement_points_raw?: string[] | string | null;
  summary?: string | null;
}

function getGrade(total: number): GradeLevel {
  if (total >= 200) return 'gold';
  if (total >= 100) return 'silver';
  return 'bronze';
}

function getPointsToNextGrade(total: number): number | null {
  if (total >= 200) return null;
  if (total >= 100) return 200 - total;
  return 100 - total;
}

function getGradeProgress(total: number): number {
  if (total >= 200) return 1;
  if (total >= 100) return (total - 100) / 100;
  return total / 100;
}

export function deriveChangeStatus(comparison: LessonComparison[] | null): ChangeStatus {
  if (!comparison || comparison.length === 0) return null;
  if (comparison.some(c => c.status === 'improved')) return 'improved';
  if (comparison.some(c => c.status === 'same')) return 'same';
  if (comparison.some(c => c.status === 'needs_work')) return 'needs_work';
  if (comparison.some(c => c.status === 'regressed')) return 'regressed';
  return null;
}

export function calculateScore(status: ChangeStatus, hasRecord: boolean): number {
  if (!hasRecord) return 0;
  switch (status) {
    case 'improved':   return 5;
    case 'maintained':
    case 'same':       return 3;
    case 'needs_work': return 2;
    case 'regressed':  return 1;
    default:           return 1;
  }
}

function getStatusMessage(status: ChangeStatus): string {
  switch (status) {
    case 'improved':   return '이전보다 실력이 향상됐어요 ↑';
    case 'maintained':
    case 'same':       return '꾸준히 유지하고 있어요 →';
    case 'needs_work': return '집중 연습이 필요한 부분이 있어요';
    case 'regressed':  return '이번엔 조금 어려웠어요, 다음 레슨에서 도전해요';
    default:           return '레슨 기록을 쌓고 있어요';
  }
}

function getStatusBadge(status: ChangeStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '향상', bg: '#ECFDF5', text: '#059669' };
    case 'maintained':
    case 'same':       return { label: '유지', bg: '#F4F6F9', text: TEXT_MUTED };
    case 'needs_work': return { label: '집중 연습', bg: GOAL_BG, text: TERRA };
    case 'regressed':  return { label: '재도전', bg: '#FFF3F0', text: '#E05C3A' };
    default:           return { label: '기록중', bg: BG, text: TEXT_MUTED };
  }
}

function getChangeBadge(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '좋아졌어요',        bg: '#E8F5E9', text: '#2E7D32' };
    case 'maintained':
    case 'same':       return { label: '잘 유지하고 있어요', bg: '#E3F2FD', text: '#1565C0' };
    case 'needs_work': return { label: '연습이 필요해요',    bg: '#FFF3E0', text: '#E65100' };
    case 'regressed':  return { label: '다시 점검해요',      bg: '#FFEBEE', text: '#C62828' };
    default:           return { label: '기록중',             bg: BG,        text: TEXT_MUTED };
  }
}

export function toLines(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return (raw as string).split('\n').map(s => s.trim()).filter(Boolean);
}

export function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
}

export function GradeCard({ totalScore }: { totalScore: number }) {
  const grade = getGrade(totalScore);
  const cfg = GRADE_CONFIG[grade];
  const toNext = getPointsToNextGrade(totalScore);
  const progress = getGradeProgress(totalScore);
  const nextGrade = grade === 'bronze' ? '실버' : grade === 'silver' ? '골드' : null;

  return (
    <View style={gs.card}>
      <View style={gs.topRow}>
        <View style={gs.gradeLeft}>
          <Text style={gs.gradeEmoji}>{cfg.emoji}</Text>
          <View>
            <Text style={[gs.gradeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={gs.totalScore}>총 {totalScore}점</Text>
          </View>
        </View>
        {toNext === null ? (
          <View style={gs.maxBadge}>
            <Text style={gs.maxBadgeText}>최고 등급 🏆</Text>
          </View>
        ) : (
          <Text style={gs.toNextText}>다음 등급까지 {toNext}점</Text>
        )}
      </View>
      <View style={gs.progressBg}>
        <View style={[gs.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: cfg.color }]} />
      </View>
      {toNext !== null && nextGrade && (
        <Text style={gs.nextGradeHint}>{nextGrade}까지 {toNext}점 남았어요</Text>
      )}
    </View>
  );
}

function GrowthChart({ cumulativeScores }: { cumulativeScores: number[] }) {
  const CHART_W = 300;
  const CHART_H = 100;
  const PAD_L = 32;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 20;
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;

  const maxScore = Math.max(300, ...cumulativeScores);
  const n = cumulativeScores.length;

  const toX = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const toY = (v: number) => PAD_T + innerH - (v / maxScore) * innerH;

  const points = cumulativeScores.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const yLabels = [0, Math.round(maxScore / 2), maxScore];

  return (
    <View style={chart.wrap}>
      <Svg width={CHART_W} height={CHART_H}>
        {yLabels.map(v => (
          <Line key={v} x1={PAD_L} y1={toY(v)} x2={CHART_W - PAD_R} y2={toY(v)} stroke={DIVIDER} strokeWidth={1} />
        ))}
        {yLabels.map(v => (
          <SvgText key={`l${v}`} x={PAD_L - 4} y={toY(v) + 4} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>{v}</SvgText>
        ))}
        <Polyline points={points} fill="none" stroke={TERRA} strokeWidth={2} strokeLinejoin="round" />
        {cumulativeScores.map((v, i) => (
          <Circle key={i} cx={toX(i)} cy={toY(v)} r={3} fill={TERRA} />
        ))}
      </Svg>
      <Text style={chart.xLabel}>레슨 회차</Text>
    </View>
  );
}

export function GrowthChartCard({ reports }: { reports: GrowthReport[] }) {
  const unlockedReports = [...reports].reverse();
  const cumulativeScores: number[] = [];
  let running = 0;
  for (const r of unlockedReports) {
    const status = deriveChangeStatus(r.lesson_comparison);
    const score = calculateScore(status, true);
    running += score;
    cumulativeScores.push(running);
  }

  return (
    <View style={gs.card}>
      <Text style={gs.chartTitle}>성장 그래프</Text>
      {cumulativeScores.length < 2 ? (
        <Text style={gs.chartEmpty}>레슨을 더 진행하면 성장 그래프가 나타나요</Text>
      ) : (
        <GrowthChart cumulativeScores={cumulativeScores} />
      )}
    </View>
  );
}

export function InsightsCard({ reports }: { reports: GrowthReport[] }) {
  const latest = reports[0];
  if (!latest) return null;

  const status = deriveChangeStatus(latest.lesson_comparison);
  const badge = getStatusBadge(status);
  const nextGoals = toLines(latest.next_goals_raw);

  return (
    <View style={[gs.card, { backgroundColor: GOAL_BG }]}>
      <Text style={gs.insightTitle}>핵심 인사이트</Text>
      <View style={gs.insightSection}>
        <Text style={gs.insightLabel}>이전 대비 변화</Text>
        <View style={gs.insightRow}>
          <Text style={gs.insightMsg}>{getStatusMessage(status)}</Text>
          <View style={[gs.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[gs.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
      </View>
      {nextGoals.length > 0 && (
        <View style={gs.insightSection}>
          <Text style={gs.insightLabel}>다음 레슨 포인트</Text>
          <Text style={gs.insightGoal}>{nextGoals[0]}</Text>
        </View>
      )}
    </View>
  );
}

interface FlatChangeItem {
  date: string;
  point: string;
  status: 'improved' | 'same' | 'needs_work' | 'regressed';
  reason?: string;
}

export function GrowthChangesPreview({ reports }: { reports: GrowthReport[] }) {
  const router = useRouter();

  const items: FlatChangeItem[] = [];
  for (const r of reports) {
    if (!r.lesson_comparison || r.lesson_comparison.length === 0) continue;
    for (const c of r.lesson_comparison) {
      items.push({ date: r.created_at, point: c.point, status: c.status, reason: c.reason });
      if (items.length >= 2) break;
    }
    if (items.length >= 2) break;
  }

  if (items.length === 0) return null;

  return (
    <View style={pv.card}>
      <View style={pv.headerRow}>
        <Text style={pv.title}>이전 대비 변화</Text>
        <TouchableOpacity onPress={() => router.push('/growth-changes' as never)}>
          <Text style={pv.linkText}>전체 변화 기록 보기 →</Text>
        </TouchableOpacity>
      </View>
      {items.map((item, i) => {
        const badge = getChangeBadge(item.status);
        return (
          <View key={i} style={[pv.item, i < items.length - 1 && pv.itemBorder]}>
            <Text style={pv.itemDate}>{formatDate(item.date)}</Text>
            <View style={pv.itemRow}>
              <Text style={pv.itemPoint} numberOfLines={2}>{item.point}</Text>
              <View style={[pv.badge, { backgroundColor: badge.bg }]}>
                <Text style={[pv.badgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>
            {!!item.reason && (
              <Text style={pv.itemReason} numberOfLines={2}>{item.reason}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const gs = StyleSheet.create({
  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    marginBottom: 0,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  gradeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gradeEmoji: { fontSize: 28 },
  gradeLabel: { fontSize: 16, fontWeight: '800' },
  totalScore: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  toNextText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  maxBadge: { backgroundColor: GOAL_BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  maxBadgeText: { fontSize: 13, fontWeight: '700', color: TERRA },
  progressBg: { height: 8, backgroundColor: DIVIDER, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  nextGradeHint: { fontSize: 12, color: TEXT_MUTED },
  chartTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 12 },
  chartEmpty: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', paddingVertical: 20 },
  insightTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 12 },
  insightSection: { marginBottom: 12 },
  insightLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  insightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  insightMsg: { fontSize: 14, color: TEXT_PRIMARY, flex: 1, lineHeight: 20 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  insightGoal: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 20 },
});

const chart = StyleSheet.create({
  wrap: { alignItems: 'center' },
  xLabel: { fontSize: 10, color: TEXT_MUTED, marginTop: 2 },
});

const pv = StyleSheet.create({
  card: {
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  linkText: { fontSize: 13, color: TERRA, fontWeight: '600' },
  item: { paddingVertical: 10 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  itemDate: { fontSize: 12, color: TEXT_MUTED, marginBottom: 6 },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 8,
  },
  itemPoint: {
    fontSize: 14, color: TEXT_PRIMARY, fontWeight: '600',
    flex: 1, lineHeight: 20,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  itemReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, marginTop: 4 },
});
