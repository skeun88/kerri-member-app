import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal, ScrollView } from 'react-native';
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

export const BASE_SCORE = 20; // 모든 기술의 기본 포인트
const CX = 160;
const CY = 142;
const R = 84;
const SVG_W = 320;
const SVG_H = 290;
const LABEL_R = R + 24;
const SEEN_KEY = '@growth_seen_plans_v2'; // v2: 0-100 scale

// ── Types ──────────────────────────────────────────────────────
export interface SkillScoreResult {
  skill: SkillName;
  current: number | null; // null = never evaluated
  previous: number | null;
  delta: number;
  rated: boolean;
  status: string | null;
  reason: string | null;
  planId: string | null;
  lessonId: string | null;
}

export interface SkillChangeEvent {
  date: string;
  skill: SkillName;
  status: string;
  delta: number;
  reason: string | null;
  planId: string;
  lessonId: string | null;
}

// ── Score helpers ──────────────────────────────────────────────
const SKILL_EN_TO_KO: Record<string, SkillName> = {
  forehand: '포핸드', backhand: '백핸드',
  serve: '서브', volley: '발리',
  footwork: '풋워크', rally: '랠리',
};

function detectSkill(c: { point: string; skill?: string | null }): SkillName | null {
  if (c.skill && SKILL_EN_TO_KO[c.skill]) return SKILL_EN_TO_KO[c.skill];
  for (const s of SKILLS) {
    if (c.point.includes(s)) return s;
  }
  return null;
}

function getDelta(score: number, status: string): number {
  if (status === 'improved') {
    if (score < 40) return 3;
    if (score < 60) return 2;
    if (score < 80) return 1;
    return 0.5;
  }
  if (status === 'needs_work' || status === 'regressed') {
    return score < 80 ? -1 : -0.5;
  }
  return 0;
}

function accumulate(reports: GrowthReport[]): Partial<Record<SkillName, number>> {
  const scores: Partial<Record<SkillName, number>> = {};
  for (const r of reports) {
    if (!r.lesson_comparison) continue;
    const seenThisLesson = new Set<SkillName>();
    for (const c of r.lesson_comparison) {
      const skill = detectSkill(c as any);
      if (!skill || seenThisLesson.has(skill)) continue;
      seenThisLesson.add(skill);
      const base = scores[skill] ?? BASE_SCORE;
      const delta = getDelta(base, c.status);
      scores[skill] = Math.max(0, Math.min(100, base + delta));
    }
  }
  return scores;
}

export function computeSkillScores(reports: GrowthReport[]): SkillScoreResult[] {
  const oldest = [...reports].reverse();
  const all = accumulate(oldest);
  const prev = oldest.length > 1 ? accumulate(oldest.slice(0, -1)) : {};

  const latest = reports[0];
  const latestInfo: Partial<Record<SkillName, { status: string; reason?: string; planId: string; lessonId: string | null }>> = {};
  if (latest?.lesson_comparison) {
    for (const c of latest.lesson_comparison) {
      const skill = detectSkill(c as any);
      if (skill && !latestInfo[skill]) {
        latestInfo[skill] = { status: c.status, reason: c.reason, planId: latest.plan_id, lessonId: latest.lesson_id ?? null };
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
      : current !== null
      ? current - BASE_SCORE
      : 0;
    return {
      skill, current, previous, delta, rated,
      status: info?.status ?? null,
      reason: info?.reason ?? null,
      planId: info?.planId ?? null,
      lessonId: info?.lessonId ?? null,
    };
  });
}

export function computeChangeEvents(reports: GrowthReport[]): SkillChangeEvent[] {
  const events: SkillChangeEvent[] = [];
  const oldest = [...reports].reverse();
  const running: Partial<Record<SkillName, number>> = {};

  for (const r of oldest) {
    if (!r.lesson_comparison) continue;
    const seenThisLesson = new Set<SkillName>();
    for (const c of r.lesson_comparison) {
      const skill = detectSkill(c as any);
      if (!skill || seenThisLesson.has(skill)) continue;
      seenThisLesson.add(skill);
      const before = running[skill] ?? BASE_SCORE;
      const delta = getDelta(before, c.status);
      running[skill] = Math.max(0, Math.min(100, before + delta));
      if (c.status) {
        events.push({ date: r.created_at, skill, status: c.status, delta, reason: c.reason ?? null, planId: r.plan_id, lessonId: r.lesson_id ?? null });
      }
    }
  }
  return events.reverse();
}

// ── Detailed change types ──────────────────────────────────────
export interface LessonEvalItem {
  point: string;
  status: string;
  reason: string | null;
  isPending: boolean;
}

export interface LessonSkillChange {
  skill: SkillName;
  status: string;
  delta: number;
  scoreBefore: number;
  scoreAfter: number;
  evaluationItems: LessonEvalItem[];
}

export interface LessonChangeGroup {
  date: string;
  lessonId: string | null;
  planId: string;
  skillChanges: LessonSkillChange[];
}

export function computeLessonChangeGroups(reports: GrowthReport[]): LessonChangeGroup[] {
  const groups: LessonChangeGroup[] = [];
  const oldest = [...reports].reverse();
  const running: Partial<Record<SkillName, number>> = {};
  const knownStatuses = ['improved', 'same', 'maintained', 'needs_work', 'regressed'];

  for (const r of oldest) {
    if (!r.lesson_comparison) continue;

    const bySkill = new Map<SkillName, LessonEvalItem[]>();
    for (const c of r.lesson_comparison) {
      const skill = detectSkill(c as any);
      if (!skill) continue;
      const isPending = !knownStatuses.includes(c.status);
      if (!bySkill.has(skill)) bySkill.set(skill, []);
      bySkill.get(skill)!.push({ point: c.point, status: c.status, reason: c.reason ?? null, isPending });
    }

    const skillChanges: LessonSkillChange[] = [];
    for (const [skill, items] of bySkill) {
      const scoreBefore = running[skill] ?? BASE_SCORE;
      const primary = items.find(item => !item.isPending);
      let delta = 0;
      const status = primary?.status ?? 'pending';
      if (primary) delta = getDelta(scoreBefore, primary.status);
      const scoreAfter = Math.max(0, Math.min(100, scoreBefore + delta));
      running[skill] = scoreAfter;
      skillChanges.push({ skill, status, delta, scoreBefore, scoreAfter, evaluationItems: items });
    }

    if (skillChanges.length > 0) {
      groups.push({ date: r.created_at, lessonId: r.lesson_id ?? null, planId: r.plan_id, skillChanges });
    }
  }

  return groups.reverse();
}

// ── SVG helpers ────────────────────────────────────────────────
function skillAngle(i: number) { return -Math.PI / 2 + i * (Math.PI / 3); }

function getPoint(i: number, score: number) {
  const a = skillAngle(i);
  const r = (score / 100) * R; // 0-100 scale
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function hexPath(r: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = skillAngle(i);
    return `${(CX + r * Math.cos(a)).toFixed(1)},${(CY + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join('L')}Z`;
}

function closedDataPath(scores: number[]): string {
  let path = '';
  scores.forEach((score, i) => {
    const pt = getPoint(i, score);
    path += (i === 0 ? 'M' : 'L') + `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  });
  return path + 'Z';
}

// ── Radar Chart ────────────────────────────────────────────────
function HexRadarChart({
  skillScores,
  animPhase,
  hasPrevious,
  onSkillPress,
}: {
  skillScores: SkillScoreResult[];
  animPhase: number;
  hasPrevious: boolean;
  onSkillPress?: (index: number) => void;
}) {
  // All 6 always have a display value (unrated = BASE_SCORE)
  const displayCurrent = skillScores.map(s => {
    const target = s.current ?? BASE_SCORE;
    const from = s.previous ?? BASE_SCORE;
    return from + (target - from) * animPhase;
  });

  const displayPrev = skillScores.map(s => s.previous ?? BASE_SCORE);

  const currentPath = closedDataPath(displayCurrent);
  const prevPath = hasPrevious ? closedDataPath(displayPrev) : '';

  return (
    <Svg width={SVG_W} height={SVG_H}>
      {/* Grid rings at 20/40/60/80/100 */}
      {[20, 40, 60, 80].map(val => (
        <Path key={val} d={hexPath((val / 100) * R)} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      <Path d={hexPath(R)} fill="none" stroke={GRID_COLOR} strokeWidth={1.5} />

      {/* Axis lines */}
      {SKILLS.map((_, i) => {
        const pt = getPoint(i, 100);
        return <Line key={i} x1={CX} y1={CY} x2={pt.x} y2={pt.y} stroke={GRID_COLOR} strokeWidth={1} />;
      })}

      {/* Previous polygon */}
      {prevPath ? (
        <Path d={prevPath} fill={TERRA_PREV} stroke="#bbb" strokeWidth={1.5} strokeDasharray="4,3" />
      ) : null}

      {/* Current polygon */}
      <Path d={currentPath} fill={TERRA_FILL} stroke={TERRA} strokeWidth={2.5} />

      {/* Skill labels with score */}
      {SKILLS.map((name, i) => {
        const a = skillAngle(i);
        const lx = CX + LABEL_R * Math.cos(a);
        const ly = CY + LABEL_R * Math.sin(a);
        const isRated = skillScores[i].rated;
        const align = i === 0 || i === 3 ? 'middle' : i === 1 || i === 2 ? 'start' : 'end';
        const baseY = i === 0 ? ly - 8 : i === 3 ? ly + 8 : ly + 2;
        const displayScore = skillScores[i].current ?? BASE_SCORE;

        return (
          <G key={i} onPress={() => onSkillPress?.(i)}>
            <Circle cx={lx} cy={baseY + 4} r={24} fill="transparent" />
            <SvgText x={lx} y={baseY} textAnchor={align} fontSize={11} fontWeight="600"
              fill={isRated ? TEXT_PRIMARY : TEXT_MUTED}>
              {name}
            </SvgText>
            {isRated ? (
              <SvgText x={lx} y={baseY + 13} textAnchor={align} fontSize={9} fontWeight="600" fill={TERRA}>
                {displayScore}점
              </SvgText>
            ) : (
              <SvgText x={lx} y={baseY + 13} textAnchor={align} fontSize={9} fill={TEXT_MUTED}>기본 20</SvgText>
            )}
          </G>
        );
      })}
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
          모든 기술은 기본 20포인트에서 시작해요.{'\n'}
          코치가 확인한 레슨 기록에 따라{'\n'}향상은 상승, 유지는 그대로,{'\n'}보완 필요는 소폭 하락해요.{'\n'}
          포인트가 높아질수록 상승폭은 작아져요.{'\n\n'}
          {'구간별 향상 포인트:\n'}
          {'0~40점 미만 → +3\n'}
          {'40~60점 미만 → +2\n'}
          {'60~80점 미만 → +1\n'}
          {'80~100점 → +0.5\n\n'}
          공식 실력 등급이나 회원 간 비교가{'\n'}아닌 나의 변화를 기록하는 지표예요.
        </Text>
        <View style={tip.arrow} />
      </View>
    </Pressable>
  );
}

// ── Helpers ────────────────────────────────────────────────────
function getStatusStyle(status: string | null): { label: string; bg: string; text: string } {
  switch (status) {
    case 'improved':  return { label: '향상', bg: '#ECFDF5', text: '#059669' };
    case 'needs_work':
    case 'regressed': return { label: '보완 필요', bg: GOAL_BG, text: TERRA };
    case 'maintained':
    case 'same':      return { label: '유지', bg: '#F4F6F9', text: TEXT_MUTED };
    default:          return { label: '기록중', bg: BG, text: TEXT_MUTED };
  }
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'improved':  return '향상';
    case 'needs_work':
    case 'regressed': return '보완 필요';
    case 'maintained':
    case 'same':      return '유지';
    default:          return '';
  }
}

function formatDelta(delta: number): string {
  if (delta === 0) return '';
  const abs = Math.abs(delta);
  const str = abs % 1 === 0 ? String(abs) : abs.toFixed(1);
  return delta > 0 ? `+${str}` : `-${str}`;
}

function nextTenPoints(score: number): number | null {
  if (score >= 100) return null;
  const next = Math.floor(score / 10) * 10 + 10;
  return next - score;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Skill Detail Sheet ─────────────────────────────────────────
function SkillDetailSheet({
  skillScore,
  onClose,
  onViewLesson,
}: {
  skillScore: SkillScoreResult | null;
  onClose: () => void;
  onViewLesson: (lessonId: string | null, planId: string | null) => void;
}) {
  if (!skillScore) return null;
  const st = getStatusStyle(skillScore.status);
  const dStr = formatDelta(skillScore.delta);
  const displayScore = skillScore.current ?? BASE_SCORE;
  const toNext = skillScore.rated && skillScore.current !== null ? nextTenPoints(skillScore.current) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheet.backdrop} onPress={onClose}>
        <Pressable style={sheet.container} onPress={() => {}}>
          <View style={sheet.handle} />
          <View style={sheet.headerRow}>
            <Text style={sheet.skillName}>{skillScore.skill}</Text>
            {skillScore.rated && skillScore.status && (
              <View style={[sheet.statusBadge, { backgroundColor: st.bg }]}>
                <Text style={[sheet.statusBadgeText, { color: st.text }]}>{st.label}</Text>
              </View>
            )}
          </View>

          <View style={sheet.scoreRow}>
            <Text style={sheet.scoreLabel}>현재 포인트</Text>
            <Text style={sheet.scoreValue}>{displayScore}점</Text>
          </View>

          {dStr ? (
            <View style={sheet.deltaRow}>
              <Text style={sheet.deltaLabel}>최근 변화</Text>
              <Text style={[sheet.deltaValue, { color: skillScore.delta > 0 ? '#059669' : skillScore.delta < 0 ? TERRA : TEXT_MUTED }]}>
                {dStr}점
              </Text>
            </View>
          ) : null}

          {toNext !== null && (
            <Text style={sheet.nextHint}>다음 10포인트 단위까지 {toNext}점 남아 있어요</Text>
          )}

          {skillScore.reason ? (
            <View style={sheet.reasonBox}>
              <Text style={sheet.reasonLabel}>근거</Text>
              <Text style={sheet.reasonText}>{skillScore.reason}</Text>
            </View>
          ) : null}

          {!skillScore.rated && (
            <View style={sheet.unratedBox}>
              <Text style={sheet.unratedText}>아직 이 기술이 포함된 레슨 기록이 없어요.{'\n'}기본 20포인트에서 시작해요.</Text>
            </View>
          )}

          {skillScore.rated && (
            <TouchableOpacity
              style={sheet.lessonBtn}
              onPress={() => { onClose(); onViewLesson(skillScore.lessonId, skillScore.planId); }}
            >
              <Text style={sheet.lessonBtnText}>레슨 기록에서 확인하기</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Detail helpers ─────────────────────────────────────────────
function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function getDetailStatusStyle(status: string, delta: number): { label: string; bg: string; text: string } {
  if (status === 'pending') return { label: '미반영', bg: '#F4F6F9', text: TEXT_MUTED };
  if (status === 'improved') {
    const abs = Math.abs(delta);
    return { label: `향상 +${abs % 1 === 0 ? abs : abs.toFixed(1)}`, bg: '#ECFDF5', text: '#059669' };
  }
  if (status === 'needs_work' || status === 'regressed') return { label: '보완 필요', bg: GOAL_BG, text: TERRA };
  return { label: '유지', bg: '#F4F6F9', text: TEXT_MUTED };
}

function SkillChangeRowItem({ sc }: { sc: LessonSkillChange }) {
  const st = getDetailStatusStyle(sc.status, sc.delta);
  const scoreText = sc.status === 'pending'
    ? ''
    : sc.delta === 0
    ? `변동 없음 · ${sc.scoreBefore} → ${sc.scoreAfter}`
    : `${sc.scoreBefore} → ${sc.scoreAfter}`;

  return (
    <View style={dss.skillRow}>
      <View style={dss.skillRowHeader}>
        <Text style={dss.skillRowName}>{sc.skill}</Text>
        <View style={[dss.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[dss.statusBadgeText, { color: st.text }]}>{st.label}</Text>
        </View>
      </View>
      {scoreText ? <Text style={dss.scoreChange}>{scoreText}</Text> : null}
      {sc.evaluationItems.map((item, idx) => (
        <View key={idx} style={dss.evalItem}>
          <View style={dss.evalItemHeader}>
            <Text style={dss.evalPoint} numberOfLines={2}>{item.point}</Text>
            {item.isPending && (
              <View style={dss.pendingBadge}>
                <Text style={dss.pendingBadgeText}>미반영</Text>
              </View>
            )}
          </View>
          {item.reason ? <Text style={dss.evalReason}>{item.reason}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ── Change Detail Sheet ────────────────────────────────────────
export function ChangeDetailSheet({
  visible,
  onClose,
  groups,
  onViewLesson,
}: {
  visible: boolean;
  onClose: () => void;
  groups: LessonChangeGroup[];
  onViewLesson: (lessonId: string | null, planId: string) => void;
}) {
  const [filter, setFilter] = useState<SkillName | '전체'>('전체');
  const SKILL_FILTERS: Array<SkillName | '전체'> = ['전체', ...SKILLS];

  const filtered = filter === '전체'
    ? groups
    : groups.filter(g => g.skillChanges.some(sc => sc.skill === filter));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dss.backdrop} onPress={onClose}>
        <Pressable style={dss.container} onPress={() => {}}>
          <View style={dss.handle} />
          <Text style={dss.title}>이전 대비 변화</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={dss.filterScroll}
            contentContainerStyle={dss.filterContent}
          >
            {SKILL_FILTERS.map(skill => (
              <TouchableOpacity
                key={skill}
                style={[dss.chip, filter === skill && dss.chipActive]}
                onPress={() => setFilter(skill)}
              >
                <Text style={[dss.chipText, filter === skill && dss.chipTextActive]}>{skill}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} style={dss.scrollView} contentContainerStyle={dss.scrollContent}>
            {filtered.length === 0 ? (
              <View style={dss.empty}>
                <Text style={dss.emptyText}>기록이 없어요</Text>
              </View>
            ) : (
              filtered.map((group, gi) => {
                const visibleChanges = filter === '전체'
                  ? group.skillChanges
                  : group.skillChanges.filter(sc => sc.skill === filter);

                return (
                  <View key={group.planId} style={[dss.group, gi > 0 && dss.groupBorder]}>
                    <View style={dss.groupHeader}>
                      <Text style={dss.groupDate}>{formatGroupDate(group.date)}</Text>
                      <TouchableOpacity onPress={() => { onClose(); onViewLesson(group.lessonId, group.planId); }}>
                        <Text style={dss.lessonLink}>레슨 기록 보기</Text>
                      </TouchableOpacity>
                    </View>
                    {visibleChanges.map((sc, si) => (
                      <SkillChangeRowItem key={si} sc={sc} />
                    ))}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Growth Balance Card ────────────────────────────────────────
export function GrowthBalanceCard({
  skillScores,
  latestPlanId,
}: {
  skillScores: SkillScoreResult[];
  latestPlanId: string | null;
}) {
  const router = useRouter();
  const [animPhase, setAnimPhase] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedSkillIdx, setSelectedSkillIdx] = useState<number | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!latestPlanId) return;
    let cancelled = false;

    AsyncStorage.getItem(SEEN_KEY).then(raw => {
      if (cancelled) return;
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (seen.includes(latestPlanId)) return;

      setAnimPhase(0);
      const startTime = Date.now();
      const duration = 900;

      const step = () => {
        if (cancelled) return;
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        setAnimPhase(1 - Math.pow(1 - t, 3));
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
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

  const ratedCount = skillScores.filter(s => s.rated).length;
  const ratedSkills = skillScores.filter(s => s.rated);
  const hasPrevious = skillScores.some(s => s.previous !== null);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>나의 성장 밸런스</Text>
          {ratedCount > 0 && ratedCount < 6 && (
            <Text style={styles.progressSmall}>{ratedCount}/6 기술 기록 완료</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowInfo(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={TEXT_MUTED} />
          <Text style={styles.infoBtnText}>점수 안내</Text>
        </TouchableOpacity>
      </View>

      <SkillDetailSheet
        skillScore={selectedSkillIdx !== null ? skillScores[selectedSkillIdx] : null}
        onClose={() => setSelectedSkillIdx(null)}
        onViewLesson={(lessonId, planId) => {
          if (lessonId) {
            router.push({ pathname: '/lesson-detail', params: { id: lessonId } } as never);
          } else {
            router.push({ pathname: '/(tabs)/report' } as never);
          }
        }}
      />

      <ScoreInfoTooltip visible={showInfo} onClose={() => setShowInfo(false)} />

      <HexRadarChart
        skillScores={skillScores}
        animPhase={animPhase}
        hasPrevious={hasPrevious}
        onSkillPress={(i) => setSelectedSkillIdx(i)}
      />

      {/* Legend */}
      {hasPrevious && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.legendLineTerra} />
            <Text style={styles.legendText}>현재</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendLinePrev} />
            <Text style={styles.legendText}>이전</Text>
          </View>
        </View>
      )}

      {ratedCount === 0 ? (
        <View style={styles.emptyChart}>
          <Text style={styles.emptyChartText}>
            첫 레슨 기록부터 나의 변화가 쌓여요
          </Text>
        </View>
      ) : (
        <View style={styles.scoreList}>
          {ratedSkills.map((s, idx) => {
            const st = getStatusStyle(s.status);
            const dStr = formatDelta(s.delta);
            const toNext = s.delta > 0 && s.current !== null ? nextTenPoints(s.current) : null;
            const skillIdx = SKILLS.indexOf(s.skill);
            return (
              <TouchableOpacity
                key={s.skill}
                style={styles.scoreListRow}
                onPress={() => setSelectedSkillIdx(skillIdx >= 0 ? skillIdx : null)}
                activeOpacity={0.7}
              >
                <Text style={styles.scoreListSkill}>{s.skill}</Text>
                <View style={styles.scoreListRight}>
                  {dStr ? (
                    <View style={[styles.scoreListBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.scoreListBadgeText, { color: st.text }]}>{dStr}</Text>
                    </View>
                  ) : null}
                  <View>
                    <Text style={styles.scoreListVal}>현재 {s.current}점</Text>
                    {toNext !== null && (
                      <Text style={styles.scoreListHint}>다음 10단위까지 {toNext}점</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {ratedCount < 6 && (
            <View style={styles.unratedHint}>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={15} color={TEXT_MUTED} />
              <Text style={styles.unratedHintText}>아직 기록되지 않은 기술 {6 - ratedCount}개 · 기본 20점</Text>
            </View>
          )}
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
export function RecentChangesCard({
  changeEvents,
  reports,
}: {
  changeEvents: SkillChangeEvent[];
  reports: GrowthReport[];
}) {
  const router = useRouter();
  const [showDetail, setShowDetail] = useState(false);
  const shown = changeEvents.slice(0, 3);

  if (shown.length === 0) return null;

  const latestNextGoals = toLines(reports[0]?.next_goals_raw ?? null);
  const groups = computeLessonChangeGroups(reports);

  return (
    <View style={styles.card}>
      <ChangeDetailSheet
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        groups={groups}
        onViewLesson={(lessonId, planId) => {
          if (lessonId) {
            router.push({ pathname: '/lesson-detail', params: { id: lessonId } } as never);
          } else {
            router.push({ pathname: '/(tabs)/report' } as never);
          }
        }}
      />
      <View style={styles.changeCardHeader}>
        <Text style={styles.cardTitle}>이전 대비 변화</Text>
        <TouchableOpacity onPress={() => setShowDetail(true)}>
          <Text style={styles.seeAllText}>전체 보기 ›</Text>
        </TouchableOpacity>
      </View>

      {shown.map((ev, i) => {
        const st = getStatusStyle(ev.status);
        const dStr = formatDelta(ev.delta);
        const noComparison = ev.status === 'maintained' || ev.status === 'same';
        return (
          <TouchableOpacity
            key={i}
            style={[styles.changeRow, i < shown.length - 1 && styles.changeRowBorder]}
            onPress={() => {
              if (ev.lessonId) {
                router.push({ pathname: '/lesson-detail', params: { id: ev.lessonId } } as never);
              } else {
                router.push({ pathname: '/(tabs)/report' } as never);
              }
            }}
            activeOpacity={0.75}
          >
            <View style={styles.changeMain}>
              <View style={styles.changeTopRow}>
                <Text style={styles.changeDate}>{formatDate(ev.date)}</Text>
                <Text style={styles.changeSkill}>{ev.skill}</Text>
                <View style={[styles.changeBadge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.changeBadgeText, { color: st.text }]}>
                    {statusLabel(ev.status)}{dStr ? ` ${dStr}` : ''}
                  </Text>
                </View>
              </View>
              {ev.reason ? (
                <Text style={styles.changeReason} numberOfLines={1}>{ev.reason}</Text>
              ) : noComparison ? (
                <Text style={styles.motivationText}>배운 감각을 꾸준히 이어가고 있어요</Text>
              ) : ev.status === 'needs_work' || ev.status === 'regressed' ? (
                <Text style={styles.motivationText}>다음 레슨에서 함께 다듬어봐요</Text>
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
          <Text style={styles.nextGoalText} numberOfLines={2}>{latestNextGoals[0]}</Text>
        </View>
      )}
    </View>
  );
}

// Legacy export for any older callers
export function RecentSkillChanges({
  skillScores,
  latestNextGoals,
}: {
  skillScores: SkillScoreResult[];
  latestNextGoals: string[];
}) {
  const router = useRouter();
  const changed = skillScores.filter(s => s.status !== null && s.planId !== null);
  if (changed.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>최근 변화</Text>
      {changed.map((s, i) => {
        const st = getStatusStyle(s.status);
        const dStr = formatDelta(s.delta);
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
                {dStr ? (
                  <View style={[styles.changeBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.changeBadgeText, { color: st.text }]}>{dStr}</Text>
                  </View>
                ) : null}
              </View>
              {s.reason ? <Text style={styles.changeReason} numberOfLines={2}>{s.reason}</Text> : null}
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
          <Text style={styles.nextGoalText} numberOfLines={3}>{latestNextGoals[0]}</Text>
        </View>
      )}
    </View>
  );
}

// ── Insights Card ──────────────────────────────────────────────
export function InsightsCard({ reports }: { reports: GrowthReport[] }) {
  const recent = reports.slice(0, 5);

  // Collect unique insights from recent reports
  const goodPoints: string[] = [];
  const improvePoints: string[] = [];
  const goals: string[] = [];

  for (const r of recent) {
    if (r.achievements) {
      r.achievements.forEach(a => { if (!goodPoints.includes(a)) goodPoints.push(a); });
    }
    const imp = toLines(r.improvement_points_raw ?? null);
    imp.forEach(p => { if (!improvePoints.includes(p)) improvePoints.push(p); });
    const ng = toLines(r.next_goals_raw ?? null);
    ng.forEach(g => { if (!goals.includes(g)) goals.push(g); });
  }

  const hasContent = goodPoints.length > 0 || improvePoints.length > 0 || goals.length > 0;
  if (!hasContent) return null;

  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>핵심 인사이트</Text>

      {goodPoints.length > 0 && (
        <View style={styles.insightSection}>
          <View style={styles.insightSectionHead}>
            <Ionicons name="checkmark-circle-outline" size={14} color={TERRA} />
            <Text style={styles.insightSectionLabel}>최근 좋아진 점</Text>
          </View>
          {goodPoints.slice(0, 2).map((p, i) => (
            <Text key={i} style={styles.insightText} numberOfLines={2}>{p}</Text>
          ))}
        </View>
      )}

      {improvePoints.length > 0 && (
        <View style={styles.insightSection}>
          <View style={styles.insightSectionHead}>
            <Ionicons name="construct-outline" size={14} color={TERRA} />
            <Text style={styles.insightSectionLabel}>이어서 다듬을 점</Text>
          </View>
          {improvePoints.slice(0, 2).map((p, i) => (
            <Text key={i} style={styles.insightText} numberOfLines={2}>{p}</Text>
          ))}
        </View>
      )}

      {goals.length > 0 && (
        <View style={styles.insightSection}>
          <View style={styles.insightSectionHead}>
            <Ionicons name="locate-outline" size={14} color={TERRA} />
            <Text style={styles.insightSectionLabel}>다음 레슨 목표</Text>
          </View>
          <Text style={styles.insightText} numberOfLines={2}>{goals[0]}</Text>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  progressSmall: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, marginTop: 2 },
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

  emptyChart: { alignItems: 'center', paddingVertical: 16 },
  emptyChartText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },

  legendRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLineTerra: { width: 20, height: 2.5, backgroundColor: TERRA, borderRadius: 2 },
  legendLinePrev: {
    width: 20, height: 2, backgroundColor: '#bbb', borderRadius: 2,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#bbb',
  },
  legendText: { fontSize: 11, color: TEXT_MUTED },

  scoreList: { marginTop: 10, gap: 0 },
  scoreListRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  scoreListSkill: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  scoreListRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreListBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  scoreListBadgeText: { fontSize: 11, fontWeight: '700' },
  scoreListVal: { fontSize: 13, fontWeight: '700', color: TERRA, textAlign: 'right' },
  scoreListHint: { fontSize: 10, color: TEXT_MUTED, textAlign: 'right', marginTop: 1 },

  unratedHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 2 },
  unratedHintText: { fontSize: 12, color: TEXT_MUTED },

  guideRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  guideText: { fontSize: 12, color: TEXT_MUTED },

  changeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  seeAllText: { fontSize: 12, color: TERRA, fontWeight: '600' },
  changeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  changeRowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  changeMain: { flex: 1, gap: 4 },
  changeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeDate: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500', minWidth: 32 },
  changeSkill: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY, flex: 1 },
  changeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  changeBadgeText: { fontSize: 11, fontWeight: '700' },
  changeReason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  motivationText: { fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' },

  nextGoalBox: { backgroundColor: GOAL_BG, borderRadius: 12, padding: 14, marginTop: 12, gap: 6 },
  nextGoalHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nextGoalTitle: { fontSize: 12, fontWeight: '700', color: TERRA },
  nextGoalText: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 21 },

  insightCard: {
    backgroundColor: GOAL_BG,
    borderRadius: 20,
    padding: 20,
    gap: 0,
  },
  insightTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 12 },
  insightSection: { marginBottom: 14 },
  insightSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  insightSectionLabel: { fontSize: 13, fontWeight: '600', color: TERRA },
  insightText: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 21, marginBottom: 2 },
});

const tip = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  bubble: {
    position: 'absolute', top: 56, right: 0,
    backgroundColor: TEXT_PRIMARY, borderRadius: 12, padding: 14,
    maxWidth: 260,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 8, zIndex: 20,
  },
  text: { fontSize: 11, color: '#fff', lineHeight: 18 },
  arrow: {
    position: 'absolute', top: -6, right: 36,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: TEXT_PRIMARY,
  },
});

const dss = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 16, paddingBottom: 0,
    maxHeight: '90%',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  handle: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY, paddingHorizontal: 24, marginBottom: 12 },

  filterScroll: { flexGrow: 0, marginBottom: 8 },
  filterContent: { paddingHorizontal: 24, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: BG, borderRadius: 20,
    borderWidth: 1, borderColor: DIVIDER,
  },
  chipActive: { backgroundColor: TERRA, borderColor: TERRA },
  chipText: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
  chipTextActive: { color: '#fff' },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 4 },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: TEXT_MUTED },

  group: { paddingVertical: 16 },
  groupBorder: { borderTopWidth: 1, borderTopColor: DIVIDER },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupDate: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
  lessonLink: { fontSize: 12, color: TERRA, fontWeight: '600' },

  skillRow: { backgroundColor: BG, borderRadius: 14, padding: 14, marginBottom: 8 },
  skillRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  skillRowName: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  scoreChange: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500', marginBottom: 8 },

  evalItem: { paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 4 },
  evalItemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  evalPoint: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY, flex: 1, lineHeight: 20 },
  evalReason: { fontSize: 12, color: TEXT_MUTED, lineHeight: 18, marginTop: 4 },
  pendingBadge: { backgroundColor: '#F4F6F9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: TEXT_MUTED },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  handle: {
    width: 40, height: 5, backgroundColor: '#E0E0E0',
    borderRadius: 3, alignSelf: 'center', marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  skillName: { fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BG, borderRadius: 14, padding: 16, marginBottom: 10,
  },
  scoreLabel: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  scoreValue: { fontSize: 24, fontWeight: '800', color: TERRA },
  deltaRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4, marginBottom: 8,
  },
  deltaLabel: { fontSize: 14, color: TEXT_MUTED },
  deltaValue: { fontSize: 15, fontWeight: '700' },
  nextHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 14, paddingHorizontal: 4 },
  reasonBox: {
    backgroundColor: BG, borderRadius: 12, padding: 14, marginVertical: 10,
  },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, marginBottom: 6 },
  reasonText: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 21 },
  unratedBox: {
    backgroundColor: BG, borderRadius: 12, padding: 14, marginVertical: 10,
  },
  unratedText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 21, textAlign: 'center' },
  lessonBtn: {
    backgroundColor: TERRA, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 16,
  },
  lessonBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
