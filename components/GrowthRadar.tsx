import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GrowthReport, toLines } from './GrowthDashboard';

// ── Design tokens ──────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const TERRA_FILL = 'rgba(192,117,90,0.18)';
const TERRA_PREV = 'rgba(180,180,180,0.25)';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';
const GRID_COLOR = '#E8EBEF';

// ── Constants ──────────────────────────────────────────────────
export const SKILLS = ['포핸드', '백핸드', '서브', '발리', '풋워크', '랠리'] as const;
export type SkillName = (typeof SKILLS)[number];

const CX = 130;
const CY = 118;
const R = 88;
const SVG_W = 260;
const SVG_H = 250;
const LABEL_R = R + 22;
const SEEN_KEY = '@growth_seen_plans_v1';

// ── Types ──────────────────────────────────────────────────────
export interface SkillScoreResult {
  skill: SkillName;
  current: number | null;
  previous: number | null;
  delta: number;
  rated: boolean;
  status: string | null;
  reason: string | null;
  planId: string | null;
}

// ── Helpers ────────────────────────────────────────────────────
function detectSkill(point: string): SkillName | null {
  for (const s of SKILLS) {
    if (point.includes(s)) return s;
  }
  return null;
}

function accumulate(reports: GrowthReport[]): Partial<Record<SkillName, number>> {
  const scores: Partial<Record<SkillName, number>> = {};
  for (const r of reports) {
    if (!r.lesson_comparison) continue;
    const seenThisLesson = new Set<SkillName>();
    for (const c of r.lesson_comparison) {
      const skill = detectSkill(c.point);
      if (!skill || seenThisLesson.has(skill)) continue;
      seenThisLesson.add(skill);
      const isFirst = scores[skill] === undefined;
      const base = isFirst ? 5 : scores[skill]!;
      const delta =
        c.status === 'improved' ? 1 :
        c.status === 'needs_work' || c.status === 'regressed' ? -1 : 0;
      scores[skill] = Math.max(0, Math.min(10, base + delta));
    }
  }
  return scores;
}

export function computeSkillScores(reports: GrowthReport[]): SkillScoreResult[] {
  const oldest = [...reports].reverse(); // oldest first
  const all = accumulate(oldest);
  const prev = oldest.length > 1 ? accumulate(oldest.slice(0, -1)) : {};

  // Extract latest lesson's per-skill status/reason
  const latest = reports[0];
  const latestInfo: Partial<Record<SkillName, { status: string; reason?: string; planId: string }>> = {};
  if (latest?.lesson_comparison) {
    for (const c of latest.lesson_comparison) {
      const skill = detectSkill(c.point);
      if (skill && !latestInfo[skill]) {
        latestInfo[skill] = { status: c.status, reason: c.reason, planId: latest.plan_id };
      }
    }
  }

  return SKILLS.map(skill => {
    const current = all[skill] ?? null;
    const previous = prev[skill] ?? null;
    const rated = current !== null;
    const info = latestInfo[skill];
    const delta = current !== null && previous !== null
      ? current - previous
      : current !== null && previous === null
      ? current - 5
      : 0;
    return {
      skill,
      current,
      previous,
      delta,
      rated,
      status: info?.status ?? null,
      reason: info?.reason ?? null,
      planId: info?.planId ?? null,
    };
  });
}

// ── SVG Radar Chart Helpers ────────────────────────────────────
function skillAngle(i: number) {
  return -Math.PI / 2 + i * (Math.PI / 3);
}

function getPoint(i: number, score: number) {
  const a = skillAngle(i);
  const r = (score / 10) * R;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function hexPath(r: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = skillAngle(i);
    return `${(CX + r * Math.cos(a)).toFixed(1)},${(CY + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join('L')}Z`;
}

function dataPath(displayScores: (number | null)[]): string {
  const rated = displayScores
    .map((s, i) => (s !== null ? i : -1))
    .filter(i => i >= 0);
  if (rated.length < 2) return '';
  let path = '';
  rated.forEach((i, k) => {
    const pt = getPoint(i, displayScores[i]!);
    path += (k === 0 ? 'M' : 'L') + `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  });
  return path + 'Z';
}

// ── Radar Chart ────────────────────────────────────────────────
function HexRadarChart({
  skillScores,
  animPhase,
}: {
  skillScores: SkillScoreResult[];
  animPhase: number;
}) {
  const displayCurrent = skillScores.map(s => {
    if (s.current === null) return null;
    const from = s.previous ?? 5;
    return from + (s.current - from) * animPhase;
  });

  const displayPrev = skillScores.map(s => s.previous);

  const currentPath = dataPath(displayCurrent);
  const prevPath = dataPath(displayPrev);

  return (
    <Svg width={SVG_W} height={SVG_H}>
      {/* Grid hexagons */}
      {[2, 4, 6, 8, 10].map(val => (
        <Path key={val} d={hexPath((val / 10) * R)} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
      ))}

      {/* Axis lines */}
      {SKILLS.map((_, i) => {
        const pt = getPoint(i, 10);
        return (
          <Line key={i} x1={CX} y1={CY} x2={pt.x} y2={pt.y} stroke={GRID_COLOR} strokeWidth={1} />
        );
      })}

      {/* Previous polygon (gray dashed) */}
      {prevPath ? (
        <Path d={prevPath} fill={TERRA_PREV} stroke="#bbb" strokeWidth={1.5} strokeDasharray="4,3" />
      ) : null}

      {/* Current polygon (terra) */}
      {currentPath ? (
        <Path d={currentPath} fill={TERRA_FILL} stroke={TERRA} strokeWidth={2.5} />
      ) : null}

      {/* Current vertex dots */}
      {skillScores.map((s, i) => {
        if (displayCurrent[i] === null) return null;
        const pt = getPoint(i, displayCurrent[i]!);
        return (
          <G key={i}>
            <Circle cx={pt.x} cy={pt.y} r={5} fill={TERRA} />
            <Circle cx={pt.x} cy={pt.y} r={8} fill="rgba(192,117,90,0.15)" />
          </G>
        );
      })}

      {/* Skill labels */}
      {SKILLS.map((name, i) => {
        const a = skillAngle(i);
        const lx = CX + LABEL_R * Math.cos(a);
        const ly = CY + LABEL_R * Math.sin(a);
        const isRated = skillScores[i].rated;
        const align =
          i === 0 || i === 3 ? 'middle' :
          i === 1 || i === 2 ? 'start' :
          'end';
        const dy = i === 0 ? -6 : i === 3 ? 10 : 4;

        return (
          <G key={i}>
            <SvgText
              x={lx}
              y={ly + dy}
              textAnchor={align}
              fontSize={11}
              fontWeight="600"
              fill={isRated ? TEXT_PRIMARY : TEXT_MUTED}
            >
              {name}
            </SvgText>
            {!isRated && (
              <SvgText
                x={lx}
                y={ly + dy + 13}
                textAnchor={align}
                fontSize={9}
                fill={TEXT_MUTED}
              >
                기록 전
              </SvgText>
            )}
            {isRated && skillScores[i].delta > 0 && animPhase > 0.85 && (
              <SvgText
                x={lx + (i < 3 ? 10 : i > 3 ? -10 : 0)}
                y={ly + dy - 10}
                textAnchor={align}
                fontSize={10}
                fontWeight="700"
                fill={TERRA}
              >
                +1
              </SvgText>
            )}
          </G>
        );
      })}

      {/* Grid value labels */}
      <SvgText x={CX + 3} y={CY - R * 0.4 - 4} textAnchor="start" fontSize={8} fill={TEXT_MUTED}>4</SvgText>
      <SvgText x={CX + 3} y={CY - R * 0.6 - 4} textAnchor="start" fontSize={8} fill={TEXT_MUTED}>6</SvgText>
      <SvgText x={CX + 3} y={CY - R * 0.8 - 4} textAnchor="start" fontSize={8} fill={TEXT_MUTED}>8</SvgText>
    </Svg>
  );
}

// ── Score Info Tooltip ─────────────────────────────────────────
function ScoreInfoTooltip({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <Pressable style={tip.backdrop} onPress={onClose}>
      <View style={tip.bubble}>
        <Text style={tip.text}>
          코치가 확인한 레슨 기록을 바탕으로{'\n'}
          향상 +1, 유지 0, 보완 필요 −1이 반영돼요.{'\n'}
          기술별 첫 기록은 5점에서 시작하며,{'\n'}
          공식 실력 평가나 다른 회원과의{'\n'}비교 점수는 아니에요.
        </Text>
        <View style={tip.arrow} />
      </View>
    </Pressable>
  );
}

// ── Main Balance Card ──────────────────────────────────────────
export function GrowthBalanceCard({
  skillScores,
  latestPlanId,
}: {
  skillScores: SkillScoreResult[];
  latestPlanId: string | null;
}) {
  const [animPhase, setAnimPhase] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!latestPlanId) return;
    let cancelled = false;

    AsyncStorage.getItem(SEEN_KEY).then(raw => {
      if (cancelled) return;
      const seen: string[] = raw ? JSON.parse(raw) : [];
      const isNew = !seen.includes(latestPlanId);

      if (!isNew) return;

      // Animate
      setAnimPhase(0);
      const startTime = Date.now();
      const duration = 900;

      const step = () => {
        if (cancelled) return;
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setAnimPhase(eased);
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          // Mark as seen
          seen.push(latestPlanId);
          if (seen.length > 150) seen.splice(0, seen.length - 150);
          AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen));
        }
      };

      animRef.current = requestAnimationFrame(step);
    });

    return () => {
      cancelled = true;
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [latestPlanId]);

  const hasAnyRated = skillScores.some(s => s.rated);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>나의 성장 밸런스</Text>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowInfo(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={TEXT_MUTED} />
          <Text style={styles.infoBtnText}>점수 안내</Text>
        </TouchableOpacity>
      </View>

      <ScoreInfoTooltip visible={showInfo} onClose={() => setShowInfo(false)} />

      {hasAnyRated ? (
        <>
          <HexRadarChart skillScores={skillScores} animPhase={animPhase} />

          {/* Score chips */}
          <View style={styles.scoreRow}>
            {skillScores.map(s => (
              <View key={s.skill} style={[styles.scoreChip, !s.rated && styles.scoreChipUnrated]}>
                <Text style={[styles.scoreChipLabel, !s.rated && styles.scoreChipLabelMuted]}>
                  {s.skill}
                </Text>
                <Text style={[styles.scoreChipVal, !s.rated && styles.scoreChipValMuted]}>
                  {s.rated ? s.current : '—'}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.emptyChart}>
          <Ionicons name="stats-chart-outline" size={36} color={DIVIDER} />
          <Text style={styles.emptyChartText}>
            첫 레슨 기록을 받으면{'\n'}나의 성장 그래프가 시작돼요
          </Text>
        </View>
      )}

      <View style={styles.guideRow}>
        <Ionicons name="leaf-outline" size={13} color={TEXT_MUTED} />
        <Text style={styles.guideText}>레슨 기록마다 나의 변화를 쌓아가요</Text>
      </View>
    </View>
  );
}

// ── Recent Changes Card ────────────────────────────────────────
function getStatusStyle(status: string | null): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':   return { label: '향상', bg: '#ECFDF5', text: '#059669' };
    case 'needs_work':
    case 'regressed':  return { label: '보완 필요', bg: GOAL_BG, text: TERRA };
    case 'maintained':
    case 'same':       return { label: '유지', bg: '#F4F6F9', text: TEXT_MUTED };
    default:           return { label: '기록중', bg: BG, text: TEXT_MUTED };
  }
}

function getStatusMsg(status: string | null): string {
  switch (status) {
    case 'improved':   return '향상 +1';
    case 'needs_work':
    case 'regressed':  return '보완 필요 −1';
    case 'maintained':
    case 'same':       return '유지 0';
    default:           return '';
  }
}

function getMotivationMsg(status: string | null): string | null {
  switch (status) {
    case 'maintained':
    case 'same':       return '배운 감각을 꾸준히 이어가고 있어요';
    case 'needs_work':
    case 'regressed':  return '다음 레슨에서 함께 다듬어봐요';
    default:           return null;
  }
}

export function RecentSkillChanges({
  skillScores,
  latestNextGoals,
}: {
  skillScores: SkillScoreResult[];
  latestNextGoals: string[];
}) {
  const router = useRouter();

  // Only show skills with a status from the latest lesson
  const changed = skillScores.filter(s => s.status !== null && s.planId !== null);

  if (changed.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>최근 변화</Text>

      {changed.map((s, i) => {
        const style = getStatusStyle(s.status);
        const msg = getStatusMsg(s.status);
        const motivation = getMotivationMsg(s.status);
        return (
          <TouchableOpacity
            key={s.skill}
            style={[styles.changeRow, i < changed.length - 1 && styles.changeRowBorder]}
            onPress={() => s.planId && router.push({ pathname: '/(tabs)/report' } as never)}
            activeOpacity={0.75}
          >
            <View style={styles.changeMain}>
              <View style={styles.changeTopRow}>
                <Text style={styles.changeSkill}>{s.skill}</Text>
                {msg ? (
                  <View style={[styles.changeBadge, { backgroundColor: style.bg }]}>
                    <Text style={[styles.changeBadgeText, { color: style.text }]}>{msg}</Text>
                  </View>
                ) : null}
              </View>
              {s.reason ? (
                <Text style={styles.changeReason} numberOfLines={2}>{s.reason}</Text>
              ) : null}
              {motivation ? (
                <Text style={styles.motivationText}>{motivation}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={15} color={DIVIDER} />
          </TouchableOpacity>
        );
      })}

      {latestNextGoals.length > 0 && (
        <View style={styles.nextGoalBox}>
          <View style={styles.nextGoalHeader}>
            <Ionicons name="locate-outline" size={13} color={TERRA} />
            <Text style={styles.nextGoalTitle}>다음 레슨에서 이어갈 목표</Text>
          </View>
          <Text style={styles.nextGoalText} numberOfLines={3}>
            {latestNextGoals[0]}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_WHITE,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BG,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoBtnText: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },

  emptyChart: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyChartText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 22,
  },

  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    justifyContent: 'center',
  },
  scoreChip: {
    backgroundColor: GOAL_BG,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  scoreChipUnrated: { backgroundColor: BG },
  scoreChipLabel: { fontSize: 11, fontWeight: '600', color: TERRA, marginBottom: 1 },
  scoreChipLabelMuted: { color: TEXT_MUTED },
  scoreChipVal: { fontSize: 15, fontWeight: '800', color: TERRA },
  scoreChipValMuted: { color: TEXT_MUTED },

  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  guideText: { fontSize: 12, color: TEXT_MUTED },

  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  changeRowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  changeMain: { flex: 1, gap: 4 },
  changeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  changeSkill: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  changeBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  changeBadgeText: { fontSize: 11, fontWeight: '700' },
  changeReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  motivationText: { fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic', marginTop: 2 },

  nextGoalBox: {
    backgroundColor: GOAL_BG,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 6,
  },
  nextGoalHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nextGoalTitle: { fontSize: 12, fontWeight: '700', color: TERRA },
  nextGoalText: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 21 },
});

const tip = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
  },
  bubble: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: TEXT_PRIMARY,
    borderRadius: 12,
    padding: 14,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
    zIndex: 20,
  },
  text: { fontSize: 12, color: '#fff', lineHeight: 19 },
  arrow: {
    position: 'absolute',
    top: -6,
    right: 36,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: TEXT_PRIMARY,
  },
});
