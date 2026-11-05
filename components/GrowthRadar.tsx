import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Modal,
  FlatList, ScrollView,
} from 'react-native';
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

export const BASE_SCORE = 20;
const CX = 160;
const CY = 142;
const R = 84;
const SVG_W = 320;
const SVG_H = 300;
const LABEL_R = R + 24;
const SEEN_KEY = '@growth_seen_plans_v2';

const SKILL_FILTERS: Array<{ key: SkillName | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  ...SKILLS.map(s => ({ key: s as SkillName, label: s })),
];

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
  lessonId: string | null;
}

export interface SkillChangeEvent {
  date: string;
  skill: SkillName;
  point: string;
  status: string;
  delta: number;
  before: number;
  after: number;
  reason: string | null;
  planId: string;
  lessonId: string | null;
}

interface SheetSkillRow {
  skill: SkillName | null;
  points: string[];
  reasons: string[];
  status: string;
  delta: number;
  before: number;
  after: number;
  isPending: boolean;
}

interface SheetLessonGroup {
  planId: string;
  date: string;
  lessonId: string | null;
  rows: SheetSkillRow[];
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
      const after = Math.max(0, Math.min(100, before + delta));
      running[skill] = after;
      if (c.status) {
        events.push({
          date: r.created_at,
          skill,
          point: c.point,
          status: c.status,
          delta,
          before,
          after,
          reason: c.reason ?? null,
          planId: r.plan_id,
          lessonId: r.lesson_id ?? null,
        });
      }
    }
  }
  return events.reverse();
}

function computeSheetData(reports: GrowthReport[]): SheetLessonGroup[] {
  const oldest = [...reports].reverse();
  const running: Partial<Record<SkillName, number>> = {};
  const groups: SheetLessonGroup[] = [];
  const knownStatuses = new Set(['improved', 'same', 'maintained', 'needs_work', 'regressed']);

  for (const r of oldest) {
    if (!r.lesson_comparison || r.lesson_comparison.length === 0) continue;

    // First pass: accumulate per-skill scores for this lesson
    const skillScoreMap = new Map<SkillName, { before: number; after: number; delta: number; status: string }>();
    const seenFirst = new Set<SkillName>();
    for (const c of r.lesson_comparison) {
      const skill = detectSkill(c as any);
      if (!skill || seenFirst.has(skill)) continue;
      seenFirst.add(skill);
      if (!knownStatuses.has(c.status)) continue;
      const before = running[skill] ?? BASE_SCORE;
      const delta = getDelta(before, c.status);
      const after = Math.max(0, Math.min(100, before + delta));
      skillScoreMap.set(skill, { before, after, delta, status: c.status });
      running[skill] = after;
    }

    // Second pass: build rows, merging reasons for the same skill
    const skillRowMap = new Map<SkillName, SheetSkillRow>();
    const otherRows: SheetSkillRow[] = [];

    for (const c of r.lesson_comparison) {
      const isPending = !c.status || !knownStatuses.has(c.status);
      const skill = detectSkill(c as any);

      if (isPending) {
        otherRows.push({ skill: null, points: [c.point], reasons: c.reason ? [c.reason] : [], status: c.status || '', delta: 0, before: 0, after: 0, isPending: true });
        continue;
      }
      if (!skill) {
        otherRows.push({ skill: null, points: [c.point], reasons: c.reason ? [c.reason] : [], status: c.status, delta: 0, before: 0, after: 0, isPending: false });
        continue;
      }

      const scores = skillScoreMap.get(skill);
      if (skillRowMap.has(skill)) {
        const existing = skillRowMap.get(skill)!;
        if (c.point && !existing.points.includes(c.point)) existing.points.push(c.point);
        if (c.reason) existing.reasons.push(c.reason);
      } else {
        skillRowMap.set(skill, {
          skill,
          points: [c.point],
          reasons: c.reason ? [c.reason] : [],
          status: c.status,
          delta: scores?.delta ?? 0,
          before: scores?.before ?? (running[skill] ?? BASE_SCORE),
          after: scores?.after ?? (running[skill] ?? BASE_SCORE),
          isPending: false,
        });
      }
    }

    const rows: SheetSkillRow[] = [...skillRowMap.values(), ...otherRows];
    if (rows.length > 0) {
      groups.push({ planId: r.plan_id, date: r.created_at, lessonId: r.lesson_id ?? null, rows });
    }
  }

  return groups.reverse();
}

// ── SVG helpers ────────────────────────────────────────────────
function skillAngle(i: number) { return -Math.PI / 2 + i * (Math.PI / 3); }

function getPoint(i: number, score: number) {
  const a = skillAngle(i);
  const r = (score / 100) * R;
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
      {/* Grid rings */}
      {[20, 40, 60, 80].map(val => (
        <Path key={val} d={hexPath((val / 100) * R)} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
      ))}
      <Path d={hexPath(R)} fill="none" stroke={GRID_COLOR} strokeWidth={1.5} />

      {/* Axis lines */}
      {SKILLS.map((_, i) => {
        const pt = getPoint(i, 100);
        return <Line key={i} x1={CX} y1={CY} x2={pt.x} y2={pt.y} stroke={GRID_COLOR} strokeWidth={1} />;
      })}

      {/* Previous polygon (gray dashed) */}
      {prevPath ? (
        <Path d={prevPath} fill={TERRA_PREV} stroke="#bbb" strokeWidth={1.5} strokeDasharray="4,3" />
      ) : null}

      {/* Current polygon */}
      <Path d={currentPath} fill={TERRA_FILL} stroke={TERRA} strokeWidth={2.5} />

      {/* Skill labels with score below */}
      {SKILLS.map((name, i) => {
        const a = skillAngle(i);
        const lx = CX + LABEL_R * Math.cos(a);
        const ly = CY + LABEL_R * Math.sin(a);
        const isRated = skillScores[i].rated;
        const align = i === 0 || i === 3 ? 'middle' : i === 1 || i === 2 ? 'start' : 'end';
        const baseY = i === 0 ? ly - 10 : i === 3 ? ly + 8 : ly + 2;
        const displayScore = isRated ? Math.round(displayCurrent[i]) : BASE_SCORE;

        return (
          <G key={i} onPress={() => onSkillPress?.(i)}>
            <Circle cx={lx} cy={baseY - 2} r={22} fill="transparent" />
            <SvgText
              x={lx} y={baseY}
              textAnchor={align} fontSize={11} fontWeight="600"
              fill={isRated ? TEXT_PRIMARY : TEXT_MUTED}
            >
              {name}
            </SvgText>
            <SvgText
              x={lx} y={baseY + 14}
              textAnchor={align} fontSize={9} fontWeight="600"
              fill={isRated ? TERRA : TEXT_MUTED}
            >
              {isRated ? `/ ${displayScore}` : '기본 20'}
            </SvgText>
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

function formatSheetDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
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

// ── Changes Bottom Sheet ───────────────────────────────────────
function ChangeDetailRow({ row, isLast }: { row: SheetSkillRow; isLast: boolean }) {
  if (row.isPending) {
    return (
      <View style={[bsRow.row, !isLast && bsRow.rowBorder]}>
        <Text style={bsRow.skillLine}>{row.points[0] || '항목'}</Text>
        <View style={bsRow.pendingBadge}>
          <Text style={bsRow.pendingText}>미반영</Text>
        </View>
      </View>
    );
  }

  const isImproved = row.status === 'improved';
  const isNeedsWork = row.status === 'needs_work' || row.status === 'regressed';
  const isNeutral = !isImproved && !isNeedsWork;
  const dStr = formatDelta(row.delta);
  const statusText = isNeutral ? '유지' : isImproved ? '향상' : '보완 필요';
  const scoreLine = isNeutral
    ? `변동 없음 · ${row.before} → ${row.after}`
    : `${statusText} ${dStr} · ${row.before} → ${row.after}`;
  const badgeBg = isImproved ? '#ECFDF5' : isNeedsWork ? GOAL_BG : '#F4F6F9';
  const badgeColor = isImproved ? '#059669' : isNeedsWork ? TERRA : TEXT_MUTED;

  return (
    <View style={[bsRow.row, !isLast && bsRow.rowBorder]}>
      <View style={bsRow.skillLine2Row}>
        {row.skill && <Text style={bsRow.skillName}>{row.skill}</Text>}
        {row.skill && row.points.length > 0 && <Text style={bsRow.dot}> · </Text>}
        <Text style={bsRow.skillPoint} numberOfLines={2}>{row.points[0]}</Text>
      </View>

      <View style={bsRow.scoreRow}>
        <View style={[bsRow.badge, { backgroundColor: badgeBg }]}>
          <Text style={[bsRow.badgeText, { color: badgeColor }]}>{statusText}</Text>
        </View>
        <Text style={bsRow.scoreLine}>{scoreLine}</Text>
      </View>

      {row.before === BASE_SCORE && row.delta !== 0 && (
        <Text style={bsRow.baseNote}>기본 20점에서 첫 변화가 반영됐어요</Text>
      )}

      {row.reasons.map((reason, i) => (
        <Text key={i} style={bsRow.reason}>{reason}</Text>
      ))}
    </View>
  );
}

function ChangesBottomSheet({
  visible,
  reports,
  onClose,
}: {
  visible: boolean;
  reports: GrowthReport[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [skillFilter, setSkillFilter] = useState<SkillName | 'all'>('all');

  const allGroups = useMemo(() => computeSheetData(reports), [reports]);
  const groups = useMemo(() => {
    if (skillFilter === 'all') return allGroups;
    return allGroups
      .map(g => ({ ...g, rows: g.rows.filter(r => r.skill === skillFilter) }))
      .filter(g => g.rows.length > 0);
  }, [allGroups, skillFilter]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={bs.container}>
        <View style={bs.header}>
          <Text style={bs.title}>이전 대비 변화</Text>
          <TouchableOpacity onPress={onClose} style={bs.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={TEXT_PRIMARY} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={bs.filterScroll}
          contentContainerStyle={bs.filterContent}
        >
          {SKILL_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[bs.filterTab, skillFilter === f.key && bs.filterTabActive]}
              onPress={() => setSkillFilter(f.key)}
            >
              <Text style={[bs.filterText, skillFilter === f.key && bs.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {groups.length === 0 ? (
          <View style={bs.empty}>
            <Ionicons name="analytics-outline" size={40} color={DIVIDER} />
            <Text style={bs.emptyText}>기록이 없어요</Text>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={g => g.planId}
            contentContainerStyle={bs.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: group }) => (
              <View style={bs.groupCard}>
                <View style={bs.groupDateRow}>
                  <Text style={bs.groupDate}>{formatSheetDate(group.date)}</Text>
                  <TouchableOpacity
                    style={bs.lessonLink}
                    onPress={() => {
                      onClose();
                      if (group.lessonId) {
                        router.push({ pathname: '/lesson-detail', params: { id: group.lessonId } } as never);
                      } else {
                        router.push('/(tabs)/report' as never);
                      }
                    }}
                  >
                    <Text style={bs.lessonLinkText}>레슨 기록 보기</Text>
                    <Ionicons name="chevron-forward" size={12} color={TERRA} />
                  </TouchableOpacity>
                </View>
                {group.rows.map((row, i) => (
                  <ChangeDetailRow key={i} row={row} isLast={i === group.rows.length - 1} />
                ))}
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListFooterComponent={<View style={{ height: 60 }} />}
          />
        )}
      </View>
    </Modal>
  );
}

// ── Growth Balance Card ────────────────────────────────────────
export function GrowthBalanceCard({
  skillScores,
  latestPlanId,
  hasReports = false,
}: {
  skillScores: SkillScoreResult[];
  latestPlanId: string | null;
  hasReports?: boolean;
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
            {hasReports
              ? '레슨 기록은 도착했어요.\n기술별 비교 근거가 쌓이면 포인트에 반영돼요'
              : '첫 레슨 기록부터 나의 변화가 쌓여요'}
          </Text>
        </View>
      ) : (
        <View style={styles.scoreList}>
          {skillScores.map((s, skillIdx) => {
            const st = getStatusStyle(s.status);
            const dStr = s.rated ? formatDelta(s.delta) : '';
            const displayScore = s.current ?? BASE_SCORE;
            const toNext = s.rated && s.delta > 0 && s.current !== null ? nextTenPoints(s.current) : null;
            return (
              <TouchableOpacity
                key={s.skill}
                style={styles.scoreListRow}
                onPress={() => setSelectedSkillIdx(skillIdx)}
                activeOpacity={0.7}
              >
                <Text style={[styles.scoreListSkill, !s.rated && { color: TEXT_MUTED }]}>{s.skill}</Text>
                <View style={styles.scoreListRight}>
                  {dStr ? (
                    <View style={[styles.scoreListBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.scoreListBadgeText, { color: st.text }]}>{dStr}</Text>
                    </View>
                  ) : null}
                  <View>
                    {s.rated ? (
                      <Text style={styles.scoreListVal}>현재 {displayScore}점</Text>
                    ) : (
                      <Text style={styles.scoreListBase}>기본 20점</Text>
                    )}
                    {toNext !== null && (
                      <Text style={styles.scoreListHint}>다음 10단위까지 {toNext}점</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
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
  const [showSheet, setShowSheet] = useState(false);
  const shown = changeEvents.slice(0, 3);

  if (shown.length === 0) return null;

  const latestNextGoals = toLines(reports[0]?.next_goals_raw ?? null);

  return (
    <View style={styles.card}>
      <View style={styles.changeCardHeader}>
        <Text style={styles.cardTitle}>이전 대비 변화</Text>
        <TouchableOpacity onPress={() => setShowSheet(true)}>
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

      <ChangesBottomSheet
        visible={showSheet}
        reports={reports}
        onClose={() => setShowSheet(false)}
      />
    </View>
  );
}

// Legacy export for older callers
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
    backgroundColor: CARD_WHITE, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  progressSmall: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, marginTop: 2 },
  infoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BG, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  scoreListSkill: { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  scoreListRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreListBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  scoreListBadgeText: { fontSize: 11, fontWeight: '700' },
  scoreListVal: { fontSize: 13, fontWeight: '700', color: TERRA, textAlign: 'right' },
  scoreListBase: { fontSize: 12, color: TEXT_MUTED, textAlign: 'right' },
  scoreListHint: { fontSize: 10, color: TEXT_MUTED, textAlign: 'right', marginTop: 1 },
  guideRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  guideText: { fontSize: 12, color: TEXT_MUTED },
  changeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  seeAllText: { fontSize: 13, color: TERRA, fontWeight: '700' },
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
  insightCard: { backgroundColor: GOAL_BG, borderRadius: 20, padding: 20, gap: 0 },
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
    backgroundColor: TEXT_PRIMARY, borderRadius: 12, padding: 14, maxWidth: 260,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 8, zIndex: 20,
  },
  text: { fontSize: 11, color: '#fff', lineHeight: 18 },
  arrow: {
    position: 'absolute', top: -6, right: 36, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: TEXT_PRIMARY,
  },
});

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  handle: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  skillName: { fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BG, borderRadius: 14, padding: 16, marginBottom: 10,
  },
  scoreLabel: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  scoreValue: { fontSize: 24, fontWeight: '800', color: TERRA },
  deltaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, marginBottom: 8,
  },
  deltaLabel: { fontSize: 14, color: TEXT_MUTED },
  deltaValue: { fontSize: 15, fontWeight: '700' },
  nextHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 14, paddingHorizontal: 4 },
  reasonBox: { backgroundColor: BG, borderRadius: 12, padding: 14, marginVertical: 10 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, marginBottom: 6 },
  reasonText: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 21 },
  unratedBox: { backgroundColor: BG, borderRadius: 12, padding: 14, marginVertical: 10 },
  unratedText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 21, textAlign: 'center' },
  lessonBtn: { backgroundColor: TERRA, borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 16 },
  lessonBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const bs = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    backgroundColor: CARD_WHITE, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  title: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexGrow: 0, backgroundColor: CARD_WHITE },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: BG, borderRadius: 20, borderWidth: 1, borderColor: DIVIDER,
  },
  filterTabActive: { backgroundColor: TERRA, borderColor: TERRA },
  filterText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  filterTextActive: { color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  groupCard: {
    backgroundColor: CARD_WHITE, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  groupDateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  groupDate: { fontSize: 13, fontWeight: '800', color: TEXT_PRIMARY },
  lessonLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  lessonLinkText: { fontSize: 12, fontWeight: '600', color: TERRA },
});

const bsRow = StyleSheet.create({
  row: { paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  skillLine: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED, marginBottom: 4 },
  skillLine2Row: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 },
  skillName: { fontSize: 13, fontWeight: '800', color: TEXT_PRIMARY },
  dot: { fontSize: 13, color: TEXT_MUTED },
  skillPoint: { fontSize: 13, color: TEXT_MUTED, flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  scoreLine: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  baseNote: { fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic', marginBottom: 2 },
  reason: { fontSize: 13, color: TEXT_MUTED, lineHeight: 19, marginTop: 2 },
  pendingBadge: {
    alignSelf: 'flex-start', backgroundColor: '#F4F6F9',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
  },
  pendingText: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED },
});
