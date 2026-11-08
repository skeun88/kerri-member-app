import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, ActivityIndicator,
  SafeAreaView, Image, Linking, Modal, Dimensions,
  TouchableWithoutFeedback, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { HomeSkeleton, FadeInView } from '../../components/Skeleton';
import AiConsentScreen from '../consent/ai-consent';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ── Design tokens ──────────────────────────────────────────────
const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const LESSON_CARD_BG = '#F4E5DC';
const GOAL_BG = '#F8EEE9';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';
const STAT_BG = '#FDFAF8';
const SCREEN_W = Dimensions.get('window').width;

// ── Interfaces ─────────────────────────────────────────────────
interface MemberInfo {
  id: string; name: string; level: string;
  remaining_credits: number; total_credits: number;
  coach_id: string;
  fixed_schedule_days?: number[];
  fixed_schedule_times?: Record<string, string[]>;
  fixed_schedule_time?: string;
}

interface CoachProfile {
  display_name: string | null;
  avatar_url: string | null;
  center_name: string | null;
  academy_name: string | null;
  sport: string | null;
  region_city: string | null;
  region_district: string | null;
  public_slug: string | null;
  is_public: boolean | null;
}

interface UpcomingLesson {
  id: string; date: string; start_time: string; end_time: string; title: string;
}

interface PaymentAlert {
  id: string; amount: number; paid_amount: number; due_date: string; status: string;
}

interface LatestReport {
  plan_id: string;
  created_at: string;
  lesson_date: string | null;
  improvement_points_raw: string | string[] | null;
  next_goals_raw: string[] | string | null;
  coach_name: string | null;
}

interface DateLesson {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  location: string | null;
  attendance_status: string | null;
}

interface MemberNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface PopoverAnchor {
  x: number;   // center x of anchor element
  y: number;   // bottom y of anchor element
}

// ── Helpers ────────────────────────────────────────────────────
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];

function getWeekDatesForOffset(offset: number): Date[] {
  const today = new Date();
  const dow = today.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthYearLabel(weekDates: Date[]): string {
  const mid = weekDates[3];
  return `${mid.getFullYear()}년 ${mid.getMonth() + 1}월`;
}

function toLines(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
  } catch {}
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

function getDDay(dueDateStr: string): { label: string; urgent: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'D-Day', urgent: true };
  if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 3 };
  return { label: `D+${Math.abs(diff)}`, urgent: true };
}

function getLessonDDay(lesson: UpcomingLesson): { label: string; urgent: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lessonDate = new Date(lesson.date + 'T00:00:00');
  const diff = Math.round((lessonDate.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: '완료', urgent: false };
  if (diff === 0) {
    // check if lesson is currently ongoing
    const now = new Date();
    const startParts = lesson.start_time.split(':');
    const endParts = lesson.end_time.split(':');
    const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= startMin && nowMin < endMin) return { label: '진행 중', urgent: true };
    return { label: '오늘', urgent: true };
  }
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

function formatNextLesson(lesson: UpcomingLesson): string {
  const d = new Date(lesson.date + 'T00:00:00');
  const mon = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DOW_KR[d.getDay()];
  const time = lesson.start_time.slice(0, 5);
  return `${mon}월 ${day}일 (${dow}) ${time}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_KR[d.getDay()]}요일`;
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? '오전' : '오후';
    const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${ap} ${hh}:${String(m).padStart(2, '0')}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatAttendanceStatus(status: string | null, date: string): string {
  if (!status) {
    const lessonDate = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (lessonDate >= today) return '출석 확인 전';
    return '미기록';
  }
  const map: Record<string, string> = {
    attended: '출석',
    absent: '결석',
    late: '지각',
    cancelled: '취소',
    excused: '공결',
  };
  return map[status] ?? status;
}

function formatNotifTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ── Component ──────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [upcomingLessons, setUpcomingLessons] = useState<UpcomingLesson[]>([]);
  const [weekLessonDates, setWeekLessonDates] = useState<Set<string>>(new Set());
  const [allMemberLessonIds, setAllMemberLessonIds] = useState<string[]>([]);
  const [paymentAlert, setPaymentAlert] = useState<PaymentAlert | null>(null);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [hasPendingConsent, setHasPendingConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [reportCount, setReportCount] = useState(0);
  const [latestReport, setLatestReport] = useState<LatestReport | null>(null);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialLoaded = useRef(false);

  // Calendar state
  const [weekOffset, setWeekOffset] = useState(0);

  // Date popover state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [datePopoverVisible, setDatePopoverVisible] = useState(false);
  const [datePopoverAnchor, setDatePopoverAnchor] = useState<PopoverAnchor | null>(null);
  const [selectedDateLessons, setSelectedDateLessons] = useState<DateLesson[]>([]);
  const [selectedDateLoading, setSelectedDateLoading] = useState(false);

  // Notification popover state
  const [notifPopoverVisible, setNotifPopoverVisible] = useState(false);
  const [notifPopoverAnchor, setNotifPopoverAnchor] = useState<PopoverAnchor | null>(null);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  // Invite code state
  const [inviteCode, setInviteCode] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [linkingCode, setLinkingCode] = useState(false);
  const isConnectCode = inviteCode.length === 8;

  // Notification swipe state
  const [deletingNotifIds, setDeletingNotifIds] = useState<Set<string>>(new Set());
  const [myHomeReviewId, setMyHomeReviewId] = useState<string | null>(null);
  const [homeCanReview, setHomeCanReview] = useState(false);
  const notifSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const openNotifSwipeableId = useRef<string | null>(null);

  // Refs
  const bellBtnRef = useRef<View>(null);
  const dateViewRefs = useRef<{ [key: string]: View | null }>({});
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);

  const calendarWeekDates = useMemo(() => getWeekDatesForOffset(weekOffset), [weekOffset]);
  const todayStr = new Date().toISOString().split('T')[0];

  // ── Data loading ────────────────────────────────────────────
  async function loadData() {
    const myMember = await getMyMemberRow();
    if (!myMember) { initialLoaded.current = true; setLoading(false); return; }
    setMember(myMember as MemberInfo);

    const today = new Date().toISOString().split('T')[0];
    const weekDates = getWeekDatesForOffset(weekOffset);
    const weekStart = toDateStr(weekDates[0]);
    const weekEnd = toDateStr(weekDates[6]);

    const [
      { data: cp },
      { count: msgCount },
      { data: lm },
      { data: payments },
      { count: rCount },
    ] = await Promise.all([
      supabase.from('coach_profiles')
        .select('display_name, avatar_url, center_name, academy_name, sport, region_city, region_district, public_slug, is_public')
        .eq('coach_id', (myMember as MemberInfo).coach_id).maybeSingle(),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('member_id', (myMember as MemberInfo).id).eq('sender_type', 'coach').is('read_at', null),
      supabase.from('lesson_members').select('lesson_id').eq('member_id', (myMember as MemberInfo).id),
      supabase.from('payments').select('*')
        .eq('member_id', (myMember as MemberInfo).id).neq('status', '납부완료')
        .order('due_date').limit(1),
      supabase.from('member_lesson_reports').select('*', { count: 'exact', head: true })
        .eq('member_id', (myMember as MemberInfo).id).eq('sent_to_member', true),
    ]);

    setCoachProfile(cp ?? null);
    setUnreadMsgCount(msgCount ?? 0);
    setPaymentAlert(payments?.[0] ?? null);
    setReportCount(rCount ?? 0);

    const lessonIds = (lm ?? []).map((l: any) => l.lesson_id);
    setAllMemberLessonIds(lessonIds);

    if (lessonIds.length > 0) {
      const [{ data: upcoming }, { data: weekLessons }] = await Promise.all([
        supabase.from('lessons').select('*')
          .in('id', lessonIds).gte('date', today)
          .order('date').order('start_time').limit(3),
        supabase.from('lessons').select('date')
          .in('id', lessonIds)
          .gte('date', weekStart).lte('date', weekEnd),
      ]);
      setUpcomingLessons(upcoming ?? []);
      setWeekLessonDates(new Set((weekLessons ?? []).map((l: any) => l.date)));
    } else {
      setUpcomingLessons([]);
      setWeekLessonDates(new Set());
    }

    // Latest report (브리핑)
    const { data: planData } = await supabase
      .from('member_lesson_plan_view')
      .select('id, created_at, improvement_points, next_goals')
      .eq('member_id', (myMember as MemberInfo).id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (planData && planData.length > 0) {
      const planIds = planData.map((p: any) => p.id);
      const { data: reportRows } = await supabase
        .from('member_lesson_reports')
        .select('lesson_plan_id, lesson_date')
        .in('lesson_plan_id', planIds)
        .eq('sent_to_member', true);
      const sentReportMap = new Map((reportRows ?? []).map((r: any) => [r.lesson_plan_id, r]));
      const latest = planData.find((p: any) => sentReportMap.has(p.id));
      if (latest) {
        const matchedReport = sentReportMap.get(latest.id);
        setLatestReport({
          plan_id: latest.id,
          created_at: latest.created_at,
          lesson_date: matchedReport?.lesson_date ?? null,
          improvement_points_raw: latest.improvement_points ?? null,
          next_goals_raw: latest.next_goals ?? null,
          coach_name: null, // resolved via coachProfile later
        });
      } else {
        setLatestReport(null);
      }
    } else {
      setLatestReport(null);
    }

    // AI consent — agreed 없으면 최초 진입 시 모달로 표시
    const { data: agreed } = await supabase.from('ai_consents').select('id')
      .eq('member_id', (myMember as MemberInfo).id).eq('consent_type', 'member').eq('consent_status', 'agreed').maybeSingle();
    if (!agreed) {
      setHasPendingConsent(true);
    } else {
      setHasPendingConsent(false);
    }

    // Unread notification count (requires RLS policy for members)
    const { count: notifUnread } = await supabase
      .from('member_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', (myMember as MemberInfo).id)
      .eq('is_read', false);
    setUnreadNotifCount(notifUnread ?? 0);

    // Review CTA: check existing review + attendance eligibility
    if ((myMember as MemberInfo).coach_id) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const [{ data: existingReview }, { count: attendedCount }] = await Promise.all([
          supabase.from('coach_reviews')
            .select('id')
            .eq('coach_id', (myMember as MemberInfo).coach_id)
            .eq('member_id', authUser.id)
            .eq('is_deleted', false)
            .maybeSingle(),
          supabase.from('attendance')
            .select('id', { count: 'exact', head: true })
            .in('lesson_id', lessonIds)
            .eq('member_id', (myMember as MemberInfo).id)
            .in('status', ['출석', '지각', '조퇴', 'attended', 'completed']),
        ]);
        setMyHomeReviewId(existingReview?.id ?? null);
        setHomeCanReview((attendedCount ?? 0) >= 1);
      }
    }

    initialLoaded.current = true;
    setLoading(false);
  }

  async function loadWeekLessonDates(lessonIds: string[], offset: number) {
    if (lessonIds.length === 0) {
      setWeekLessonDates(new Set());
      return;
    }
    const weekDates = getWeekDatesForOffset(offset);
    const weekStart = toDateStr(weekDates[0]);
    const weekEnd = toDateStr(weekDates[6]);
    const { data } = await supabase.from('lessons').select('date')
      .in('id', lessonIds)
      .gte('date', weekStart).lte('date', weekEnd);
    setWeekLessonDates(new Set((data ?? []).map((l: any) => l.date)));
  }

  async function loadDateLessons(dateStr: string) {
    if (!member || allMemberLessonIds.length === 0) {
      setSelectedDateLessons([]);
      setSelectedDateLoading(false);
      return;
    }
    setSelectedDateLoading(true);
    const { data: lessonsData } = await supabase.from('lessons')
      .select('id, date, start_time, end_time, title, location')
      .in('id', allMemberLessonIds)
      .eq('date', dateStr)
      .order('start_time');

    const lessonIds = (lessonsData ?? []).map((l: any) => l.id);
    let attendanceMap: Record<string, string> = {};

    if (lessonIds.length > 0) {
      const { data: attData } = await supabase.from('attendance')
        .select('lesson_id, status')
        .in('lesson_id', lessonIds)
        .eq('member_id', member.id);
      (attData ?? []).forEach((a: any) => {
        attendanceMap[a.lesson_id] = a.status;
      });
    }

    setSelectedDateLessons((lessonsData ?? []).map((l: any) => ({
      ...l,
      attendance_status: attendanceMap[l.id] ?? null,
    })));
    setSelectedDateLoading(false);
  }

  async function loadNotifications() {
    if (!member) return;
    setNotifLoading(true);
    const { data } = await supabase.from('member_notifications')
      .select('id, title, body, type, is_read, created_at')
      .eq('member_id', member.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
    setNotifLoading(false);
  }

  function closeOpenNotifSwipeable(exceptId?: string) {
    const currentId = openNotifSwipeableId.current;
    if (currentId && currentId !== exceptId) {
      notifSwipeableRefs.current.get(currentId)?.close();
    }
  }

  function closeAllNotifSwipeables() {
    notifSwipeableRefs.current.forEach(s => s.close());
    openNotifSwipeableId.current = null;
  }

  async function deletePopupNotification(id: string) {
    if (deletingNotifIds.has(id)) return;
    notifSwipeableRefs.current.get(id)?.close();

    const snapshot = [...notifications];
    const wasUnread = snapshot.find(n => n.id === id)?.is_read === false;
    setDeletingNotifIds(prev => new Set([...prev, id]));
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadNotifCount(prev => Math.max(0, prev - 1));

    try {
      const { error } = await supabase
        .from('member_notifications')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
    } catch {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotifications(snapshot);
      if (wasUnread) setUnreadNotifCount(prev => prev + 1);
      Alert.alert('', '삭제하지 못했어요. 다시 시도해주세요.');
    } finally {
      setDeletingNotifIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function markNotifRead(notifId: string) {
    await supabase.from('member_notifications')
      .update({ is_read: true })
      .eq('id', notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadNotifCount(prev => Math.max(0, prev - 1));
  }

  // ── Event handlers ──────────────────────────────────────────
  function handleDateTap(dateStr: string) {
    if (selectedDate === dateStr && datePopoverVisible) {
      setDatePopoverVisible(false);
      setSelectedDate(null);
      return;
    }
    const ref = dateViewRefs.current[dateStr];
    if (ref) {
      ref.measure((_fx, _fy, width, height, pageX, pageY) => {
        setDatePopoverAnchor({ x: pageX + width / 2, y: pageY + height + 4 });
      });
    }
    setSelectedDate(dateStr);
    setDatePopoverVisible(true);
    setNotifPopoverVisible(false);
    loadDateLessons(dateStr);
  }

  function handleBellTap() {
    if (notifPopoverVisible) {
      closeAllNotifSwipeables();
      setNotifPopoverVisible(false);
      return;
    }
    const ref = bellBtnRef.current;
    if (ref) {
      ref.measure((_fx, _fy, width, height, pageX, pageY) => {
        setNotifPopoverAnchor({ x: pageX + width, y: pageY + height + 4 });
      });
    }
    setNotifPopoverVisible(true);
    setDatePopoverVisible(false);
    loadNotifications();
  }

  function handleNotifTap(notif: MemberNotification) {
    if (openNotifSwipeableId.current === notif.id) {
      notifSwipeableRefs.current.get(notif.id)?.close();
      return;
    }
    if (!notif.is_read) markNotifRead(notif.id);
    closeAllNotifSwipeables();
    setNotifPopoverVisible(false);
    switch (notif.type) {
      case 'lesson_report': router.push('/(tabs)/report'); break;
      case 'message':
      case 'chat_message': router.push('/coach-chat'); break;
      case 'lesson_reminder':
      case 'lesson_update':
      case 'reregister': router.push('/(tabs)/schedule'); break;
      case 'payment': router.push('/(tabs)/payment' as any); break;
      default: break;
    }
  }

  function handleCalendarSwipe(startX: number, endX: number, startY: number, endY: number) {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const newOffset = weekOffset + (dx < 0 ? 1 : -1);
      setWeekOffset(newOffset);
      if (datePopoverVisible) setDatePopoverVisible(false);
    }
  }

  function handleLinkInviteCode() {
    if (!inviteCode.trim()) return;
    if (isConnectCode) { handleRequestConnection(); return; }
    setLinkingCode(true);
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const code = inviteCode.trim().toUpperCase();
    fetch(`${SUPABASE_URL}/functions/v1/verify-invite-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ invite_code: code }),
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) { Alert.alert('코드 오류', '올바른 초대 코드를 입력해주세요.'); return; }
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      Alert.alert('연결 완료! 🎾', `${data.member_name ?? ''}님, 코치와 연결됐어요!`);
      setInviteCode('');
      await loadData();
    }).catch(() => {
      Alert.alert('오류', '네트워크 오류가 발생했습니다.');
    }).finally(() => setLinkingCode(false));
  }

  async function handleRequestConnection() {
    if (!inviteCode.trim() || !memberName.trim() || !memberPhone.trim()) return;
    setLinkingCode(true);
    try {
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connect_code: inviteCode.trim().toUpperCase(),
          name: memberName.trim(),
          phone: memberPhone.trim(),
          request_id: crypto.randomUUID(),
          source: 'connect_code',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'rate_limited') Alert.alert('요청 제한', '잠시 후 다시 시도해주세요.');
        else Alert.alert('코드 오류', '올바른 연결 코드를 입력해주세요.');
        return;
      }
      Alert.alert('요청 완료!', '연결 요청이 전송됐어요! 코치가 수락하면 연결됩니다.');
      setInviteCode(''); setMemberName(''); setMemberPhone('');
    } catch {
      Alert.alert('오류', '네트워크 오류가 발생했습니다.');
    } finally {
      setLinkingCode(false);
    }
  }

  function openCoachProfile() {
    if (member?.coach_id) {
      router.push(`/coach-profile?coachId=${member.coach_id}`);
    }
  }

  // ── Effects ─────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    if (!initialLoaded.current) setLoading(true);
    loadData();
  }, []));

  // Reload weekly lesson dots when navigating weeks
  useEffect(() => {
    if (allMemberLessonIds.length > 0) {
      loadWeekLessonDates(allMemberLessonIds, weekOffset);
    }
  }, [weekOffset, allMemberLessonIds]);

  useEffect(() => {
    if (!member?.id) return;
    const ch = supabase.channel('home_rt_' + member.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lesson_members', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `coach_id=eq.${member.coach_id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `member_id=eq.${member.id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'member_notifications', filter: `member_id=eq.${member.id}` }, () => {
        setUnreadNotifCount(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [member?.id]);

  // ── Derived ─────────────────────────────────────────────────
  const nextLesson = upcomingLessons[0] ?? null;
  const coachInitials = (coachProfile?.display_name ?? '코').charAt(0).toUpperCase();
  const locationStr = [coachProfile?.center_name, coachProfile?.region_city]
    .filter(Boolean).join(' · ') || null;
  const coachInfoStr = [
    coachProfile?.center_name ?? coachProfile?.academy_name,
    coachProfile?.sport,
    coachProfile?.region_city,
  ].filter(Boolean).join(' · ') || null;

  const monthYearLabel = getMonthYearLabel(calendarWeekDates);

  // ── Popover helpers ─────────────────────────────────────────
  function getDatePopoverLeft(anchor: PopoverAnchor): number {
    const popW = Math.min(SCREEN_W - 32, 260);
    let left = anchor.x - popW / 2;
    if (left < 16) left = 16;
    if (left + popW > SCREEN_W - 16) left = SCREEN_W - 16 - popW;
    return left;
  }

  function getDatePopoverArrowLeft(anchor: PopoverAnchor, left: number): number {
    return anchor.x - left - 8;
  }

  function getNotifPopoverLeft(anchor: PopoverAnchor): number {
    const popW = Math.min(SCREEN_W - 32, 320);
    let left = anchor.x - popW;
    if (left < 16) left = 16;
    return left;
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return <HomeSkeleton />;
  }

  return (
    <FadeInView>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
            tintColor={TERRA}
          />
        }
      >
        {/* ── KERRI Header ─────────────────────────────────────── */}
        <View style={styles.appHeader}>
          <Text style={styles.appLogoText}>KERRI</Text>
          <View
            ref={bellBtnRef}
            collapsable={false}
          >
            <TouchableOpacity
              onPress={handleBellTap}
              style={styles.bellBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="notifications-outline" size={22} color={TEXT_PRIMARY} />
              {unreadNotifCount > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Greeting ─────────────────────────────────────────── */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingName}>
            {member ? `${member.name}님 반가워요 👋` : '안녕하세요 👋'}
          </Text>
          <Text style={styles.greetingSub}>오늘도 즐거운 레슨</Text>
        </View>

        {/* ── Banners ───────────────────────────────────────────── */}
        {paymentAlert && (() => {
          const dday = getDDay(paymentAlert.due_date);
          return (
            <TouchableOpacity
              style={[styles.paymentBanner, dday.urgent && styles.paymentBannerUrgent]}
              onPress={() => router.push('/(tabs)/schedule')}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={18} color={dday.urgent ? '#E53E3E' : TERRA} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.bannerTitle, dday.urgent && { color: '#E53E3E' }]}>결제 예정</Text>
                <Text style={styles.bannerSub}>
                  {(paymentAlert.amount - paymentAlert.paid_amount).toLocaleString()}원 · 기한 {paymentAlert.due_date}
                </Text>
              </View>
              <View style={[styles.ddayBadge, { backgroundColor: dday.urgent ? '#E53E3E' : TERRA }]}>
                <Text style={styles.ddayText}>{dday.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* ── Not connected: invite code ────────────────────────── */}
        {!member && (
          <View style={styles.inviteBox}>
            <Ionicons name="link-outline" size={32} color={TERRA} style={{ marginBottom: 10 }} />
            <Text style={styles.inviteTitle}>코치가 보낸 초대 코드를 입력해주세요</Text>
            <Text style={styles.inviteDesc}>코치에게 받은 초대 코드를 입력하면{'\n'}레슨 정보와 자동으로 연결됩니다</Text>
            <TextInput
              style={styles.inviteInput}
              value={inviteCode}
              onChangeText={v => setInviteCode(v.toUpperCase())}
              placeholder="초대 코드 입력"
              placeholderTextColor={TEXT_MUTED}
              autoCapitalize="characters"
              maxLength={8}
            />
            {isConnectCode && (
              <>
                <TextInput
                  style={[styles.inviteInput, { letterSpacing: 0, fontSize: 16, marginTop: 8 }]}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="이름"
                  placeholderTextColor={TEXT_MUTED}
                  autoCapitalize="words"
                  maxLength={60}
                />
                <TextInput
                  style={[styles.inviteInput, { letterSpacing: 0, fontSize: 16, marginTop: 8 }]}
                  value={memberPhone}
                  onChangeText={setMemberPhone}
                  placeholder="전화번호"
                  placeholderTextColor={TEXT_MUTED}
                  keyboardType="phone-pad"
                  maxLength={32}
                />
              </>
            )}
            <TouchableOpacity
              style={[
                styles.inviteBtn,
                ((!inviteCode.trim() || linkingCode) ||
                  (isConnectCode && (!memberName.trim() || !memberPhone.trim()))) && { opacity: 0.5 },
              ]}
              onPress={handleLinkInviteCode}
              disabled={!inviteCode.trim() || linkingCode || (isConnectCode && (!memberName.trim() || !memberPhone.trim()))}
            >
              {linkingCode
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.inviteBtnText}>코치와 연결하기</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Swipeable Weekly Calendar ─────────────────────────── */}
        {member && (
          <View style={styles.calendarSection}>
            {/* Month/year header + prev/next week buttons */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => { setWeekOffset(prev => prev - 1); setDatePopoverVisible(false); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-back" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
              <View style={styles.calHeaderCenter}>
                <Text style={styles.calendarMonthLabel}>{monthYearLabel}</Text>
                {weekOffset !== 0 && (
                  <TouchableOpacity
                    style={styles.todayBtn}
                    onPress={() => { setWeekOffset(0); setDatePopoverVisible(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.todayBtnText}>오늘</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={() => { setWeekOffset(prev => prev + 1); setDatePopoverVisible(false); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            {/* Calendar strip with swipe */}
            <View
              style={styles.calendarStrip}
              onTouchStart={(e) => {
                swipeStartX.current = e.nativeEvent.pageX;
                swipeStartY.current = e.nativeEvent.pageY;
              }}
              onTouchEnd={(e) => {
                if (swipeStartX.current === null || swipeStartY.current === null) return;
                handleCalendarSwipe(
                  swipeStartX.current, e.nativeEvent.pageX,
                  swipeStartY.current, e.nativeEvent.pageY,
                );
                swipeStartX.current = null;
                swipeStartY.current = null;
              }}
            >
              {calendarWeekDates.map((d) => {
                const ds = toDateStr(d);
                const isToday = ds === todayStr;
                const hasLesson = weekLessonDates.has(ds);
                const isSelected = ds === selectedDate && datePopoverVisible;
                return (
                  <TouchableOpacity
                    key={ds}
                    style={styles.calDay}
                    onPress={() => handleDateTap(ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.calDowLabel,
                      isToday && styles.calDowLabelToday,
                      isSelected && styles.calDowLabelSelected,
                    ]}>
                      {DOW_KR[d.getDay()]}
                    </Text>
                    <View
                      ref={ref => { dateViewRefs.current[ds] = ref; }}
                      collapsable={false}
                      style={[
                        styles.calDateCapsule,
                        isToday && !isSelected && styles.calDateCapsuleToday,
                        isSelected && styles.calDateCapsuleSelected,
                      ]}
                    >
                      <Text style={[
                        styles.calDateNum,
                        isToday && !isSelected && styles.calDateNumToday,
                        isSelected && styles.calDateNumSelected,
                      ]}>
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={[styles.calDot, hasLesson && styles.calDotActive]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Next lesson card (BELOW calendar) ────────────────── */}
        {member && nextLesson && (() => {
          const dday = getLessonDDay(nextLesson);
          return (
            <View style={[styles.nextLessonCard, { overflow: 'hidden' }]}>
              <View style={styles.nextLessonTopRow}>
                <View style={[styles.ddayChip, dday.urgent && styles.ddayChipUrgent]}>
                  <Text style={[styles.ddayChipText, dday.urgent && styles.ddayChipTextUrgent]}>
                    {dday.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.nextLessonDateTime}>{formatNextLesson(nextLesson)}</Text>
              <Text style={styles.nextLessonMeta}>
                {[locationStr, coachProfile?.display_name ? `${coachProfile.display_name} 코치` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
              <TouchableOpacity
                style={styles.nextLessonBtn}
                onPress={() => router.push('/(tabs)/schedule')}
                activeOpacity={0.85}
              >
                <Text style={styles.nextLessonBtnText}>일정 확인하기</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {member && !nextLesson && (
          <View style={styles.noLessonCard}>
            <Ionicons name="calendar-outline" size={28} color={TEXT_MUTED} />
            <Text style={styles.noLessonText}>예정된 레슨이 없어요</Text>
            <Text style={styles.noLessonSub}>새 일정이 등록되면 여기에서 확인할 수 있어요</Text>
          </View>
        )}

        {/* ── Stat cards ───────────────────────────────────────── */}
        {member && (
          <View style={styles.statRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => router.push('/(tabs)/schedule')}
              activeOpacity={0.85}
            >
              <Text style={styles.statValue}>{member.remaining_credits}회</Text>
              <Text style={styles.statLabel}>남은 레슨</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => router.push('/(tabs)/report')}
              activeOpacity={0.85}
            >
              <Text style={styles.statValue}>{reportCount}개</Text>
              <Text style={styles.statLabel}>받은 기록</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 지난 레슨 브리핑 ─────────────────────────────────── */}
        {member && latestReport && (() => {
          const keyPoints = toLines(latestReport.improvement_points_raw);
          const nextGoals = toLines(latestReport.next_goals_raw);
          const PREVIEW_COUNT = 2;
          const showExpand = keyPoints.length > PREVIEW_COUNT;
          const displayPoints = (briefingExpanded || !showExpand)
            ? keyPoints : keyPoints.slice(0, PREVIEW_COUNT);
          const lessonDateLabel = latestReport.lesson_date
            ? (() => {
                const d = new Date(latestReport.lesson_date + 'T00:00:00');
                return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
              })()
            : (() => {
                const d = new Date(latestReport.created_at);
                return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
              })();
          const coachDisplayName = coachProfile?.display_name ?? '코치';
          return (
            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>지난 레슨 브리핑</Text>
              <View style={styles.reportCard}>
                {/* 카드 상단: 날짜 + 코치 */}
                <View style={styles.briefingHeader}>
                  <View style={styles.briefingHeaderLeft}>
                    <Ionicons name="calendar-outline" size={13} color={TEXT_MUTED} />
                    <Text style={styles.briefingDateText}>{lessonDateLabel}</Text>
                  </View>
                  <View style={styles.briefingHeaderRight}>
                    <Text style={styles.coachNameSmall}>{coachDisplayName} 코치</Text>
                  </View>
                </View>

                {/* 지난 레슨 핵심 */}
                {displayPoints.length > 0 && (
                  <View style={styles.briefingKeySection}>
                    <Text style={styles.briefingKeyLabel}>지난 레슨 핵심</Text>
                    {displayPoints.map((pt, i) => (
                      <View key={i} style={styles.briefingKeyRow}>
                        <Text style={styles.briefingBullet}>•</Text>
                        <Text style={styles.briefingKeyText}>{pt}</Text>
                      </View>
                    ))}
                    {showExpand && (
                      <TouchableOpacity
                        onPress={() => setBriefingExpanded(prev => !prev)}
                        style={styles.briefingExpandBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.briefingExpandText}>
                          {briefingExpanded ? '접기' : `더보기 (${keyPoints.length - PREVIEW_COUNT}개 더)`}
                        </Text>
                        <Ionicons
                          name={briefingExpanded ? 'chevron-up' : 'chevron-down'}
                          size={12} color={TERRA}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* 다음 레슨 목표 */}
                {nextGoals.length > 0 && (
                  <View style={styles.nextGoalBox}>
                    <Text style={styles.nextGoalLabel}>다음 레슨 목표</Text>
                    <Text style={styles.nextGoalText}>{nextGoals[0]}</Text>
                  </View>
                )}

                {/* 하단 버튼 */}
                <TouchableOpacity
                  style={styles.briefingViewBtn}
                  onPress={() => router.push('/(tabs)/report')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.briefingViewBtnText}>지난 레슨 기록 보기</Text>
                  <Ionicons name="chevron-forward" size={13} color={TERRA} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* ── Coach Card ───────────────────────────────────────── */}
        {member && coachProfile && (
          <View style={styles.coachCardSection}>
            <Text style={styles.coachCardSectionLabel}>담당 코치</Text>
            <View style={styles.coachCard}>
              <TouchableOpacity
                style={styles.coachCardTop}
                onPress={openCoachProfile}
                activeOpacity={0.85}
              >
                {coachProfile.avatar_url ? (
                  <Image source={{ uri: coachProfile.avatar_url }} style={styles.coachCardAvatar} />
                ) : (
                  <View style={styles.coachCardAvatarFallback}>
                    <Text style={styles.coachCardAvatarText}>{coachInitials}</Text>
                  </View>
                )}
                <View style={styles.coachCardInfo}>
                  <Text style={styles.coachCardName}>
                    {coachProfile.display_name ?? '코치'} 코치
                  </Text>
                  {coachInfoStr && (
                    <Text style={styles.coachCardMeta} numberOfLines={1}>{coachInfoStr}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
              </TouchableOpacity>
              <View style={styles.coachCardDivider} />
              <View style={styles.coachCardBtns}>
                <TouchableOpacity
                  style={styles.coachCardBtnOutline}
                  onPress={() => router.push('/coach-chat')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble-outline" size={15} color={TERRA} />
                  <Text style={styles.coachCardBtnOutlineText}>메시지</Text>
                  {unreadMsgCount > 0 && (
                    <View style={styles.msgBadge}>
                      <Text style={styles.msgBadgeText}>
                        {unreadMsgCount > 99 ? '99+' : String(unreadMsgCount)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.coachCardBtnFill}
                  onPress={openCoachProfile}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person-outline" size={15} color="#fff" />
                  <Text style={styles.coachCardBtnFillText}>프로필 상세 보기</Text>
                </TouchableOpacity>
              </View>
              {homeCanReview && (
                <>
                  <View style={styles.coachCardDivider} />
                  <TouchableOpacity
                    style={styles.coachCardBtnReview}
                    onPress={() => router.push(`/write-review?coachId=${member!.coach_id}&coachName=${encodeURIComponent(coachProfile.display_name ?? '')}`)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="star-outline" size={15} color={TERRA} />
                    <Text style={styles.coachCardBtnReviewText}>
                      {myHomeReviewId ? '내 리뷰 보기' : '리뷰 작성하기'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Date Popover ─────────────────────────────────────────── */}
      <Modal
        visible={datePopoverVisible && !!datePopoverAnchor}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setDatePopoverVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDatePopoverVisible(false)}>
          <View style={styles.popoverOverlay}>
            {datePopoverAnchor && (() => {
              const popW = Math.min(SCREEN_W - 32, 260);
              const left = getDatePopoverLeft(datePopoverAnchor);
              const arrowLeft = getDatePopoverArrowLeft(datePopoverAnchor, left);
              return (
                <TouchableWithoutFeedback>
                  <View style={[styles.datePopover, { top: datePopoverAnchor.y, left, width: popW }]}>
                    {/* Arrow */}
                    <View style={[styles.popoverArrow, { left: Math.max(8, Math.min(arrowLeft, popW - 24)) }]} />

                    {selectedDateLoading ? (
                      <View style={styles.popoverLoading}>
                        <ActivityIndicator size="small" color={TERRA} />
                      </View>
                    ) : selectedDate ? (
                      <>
                        <Text style={styles.popoverDateLabel}>{formatDateLabel(selectedDate)}</Text>
                        {selectedDateLessons.length === 0 ? (
                          <Text style={styles.popoverNoLesson}>
                            {selectedDate === todayStr ? '오늘은 수업이 없어요' : '이날은 수업이 없어요'}
                          </Text>
                        ) : (
                          <ScrollView style={styles.popoverLessonsScroll} nestedScrollEnabled>
                            {selectedDateLessons.map((lesson, idx) => {
                              const attStatus = formatAttendanceStatus(lesson.attendance_status, lesson.date);
                              const attColor = lesson.attendance_status === 'attended' ? '#3A7D44'
                                : lesson.attendance_status === 'absent' ? '#E53E3E'
                                : lesson.attendance_status === 'late' ? '#D97706'
                                : TEXT_MUTED;
                              return (
                                <View key={lesson.id} style={[styles.popoverLessonItem, idx > 0 && styles.popoverLessonDivider]}>
                                  <Text style={styles.popoverLessonTime}>
                                    {formatTimeRange(lesson.start_time, lesson.end_time)}
                                  </Text>
                                  {coachProfile?.display_name && (
                                    <Text style={styles.popoverLessonCoach}>
                                      {coachProfile.display_name} 코치
                                    </Text>
                                  )}
                                  {member && (
                                    <Text style={styles.popoverLessonCredits}>
                                      현재 남은 레슨 {member.remaining_credits}회
                                    </Text>
                                  )}
                                  <View style={[styles.popoverAttBadge, { backgroundColor: attColor + '18' }]}>
                                    <Text style={[styles.popoverAttText, { color: attColor }]}>{attStatus}</Text>
                                  </View>
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </>
                    ) : null}
                  </View>
                </TouchableWithoutFeedback>
              );
            })()}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Notification Popover ──────────────────────────────────── */}
      <Modal
        visible={notifPopoverVisible && !!notifPopoverAnchor}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setNotifPopoverVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => { closeAllNotifSwipeables(); setNotifPopoverVisible(false); }}>
          <View style={styles.popoverOverlay}>
            {notifPopoverAnchor && (() => {
              const popW = Math.min(SCREEN_W - 32, 320);
              const left = getNotifPopoverLeft(notifPopoverAnchor);
              return (
                <TouchableWithoutFeedback>
                  <View style={[styles.notifPopover, { top: notifPopoverAnchor.y, left, width: popW }]}>
                    {/* Arrow top-right */}
                    <View style={[styles.popoverArrow, { left: popW - 28 }]} />

                    <View style={styles.notifPopoverHeader}>
                      <Text style={styles.notifPopoverTitle}>알림</Text>
                      {unreadNotifCount > 0 && (
                        <View style={styles.notifBadge}>
                          <Text style={styles.notifBadgeText}>{unreadNotifCount}</Text>
                        </View>
                      )}
                    </View>

                    {notifLoading ? (
                      <View style={styles.popoverLoading}>
                        <ActivityIndicator size="small" color={TERRA} />
                      </View>
                    ) : notifications.length === 0 ? (
                      <Text style={styles.notifEmpty}>아직 도착한 알림이 없어요</Text>
                    ) : (
                      <ScrollView style={styles.notifScroll} nestedScrollEnabled>
                        {notifications.map((notif, idx) => (
                          <Swipeable
                            key={notif.id}
                            ref={ref => {
                              if (ref) notifSwipeableRefs.current.set(notif.id, ref);
                              else notifSwipeableRefs.current.delete(notif.id);
                            }}
                            renderLeftActions={() => (
                              <TouchableOpacity
                                style={styles.notifDeleteAction}
                                onPress={() => deletePopupNotification(notif.id)}
                                accessibilityLabel="알림 삭제"
                              >
                                <Ionicons name="trash-outline" size={16} color="#fff" />
                                <Text style={styles.notifDeleteActionText}>삭제</Text>
                              </TouchableOpacity>
                            )}
                            friction={2}
                            leftThreshold={60}
                            overshootLeft={false}
                            onSwipeableWillOpen={() => {
                              closeOpenNotifSwipeable(notif.id);
                              openNotifSwipeableId.current = notif.id;
                            }}
                            onSwipeableClose={() => {
                              if (openNotifSwipeableId.current === notif.id) {
                                openNotifSwipeableId.current = null;
                              }
                            }}
                          >
                            <TouchableOpacity
                              style={[styles.notifItem, idx > 0 && styles.notifItemDivider, !notif.is_read && styles.notifItemUnread]}
                              onPress={() => handleNotifTap(notif)}
                              activeOpacity={0.8}
                            >
                              {!notif.is_read && <View style={styles.notifUnreadDot} />}
                              <View style={styles.notifItemContent}>
                                <Text style={styles.notifItemTitle} numberOfLines={1}>{notif.title}</Text>
                                <Text style={styles.notifItemBody} numberOfLines={2}>{notif.body}</Text>
                                <Text style={styles.notifItemTime}>{formatNotifTime(notif.created_at)}</Text>
                              </View>
                            </TouchableOpacity>
                          </Swipeable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </TouchableWithoutFeedback>
              );
            })()}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>

    {/* AI 동의 모달 — 최초 로그인 시 표시 */}
    <Modal
      visible={showConsentModal}
      animationType="slide"
      onRequestClose={() => setShowConsentModal(false)}
    >
      <AiConsentScreen
        onComplete={() => { setShowConsentModal(false); setHasPendingConsent(false); }}
        onDecline={() => setShowConsentModal(false)}
      />
    </Modal>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  appHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  appLogoText: {
    fontSize: 22, fontWeight: '900', color: TERRA, letterSpacing: 2,
  },
  bellBtn: { position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bellDot: {
    position: 'absolute', top: 4, right: 4,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#E53E3E', borderWidth: 1.5, borderColor: BG,
  },

  // Greeting
  greetingSection: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 },
  greetingName: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  greetingSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 3 },

  // Banners
  consentBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LESSON_CARD_BG,
    borderRadius: 12, marginHorizontal: 16, marginBottom: 10, padding: 14,
  },
  paymentBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_WHITE, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 10, padding: 14,
    borderWidth: 1, borderColor: DIVIDER,
  },
  paymentBannerUrgent: { borderColor: '#E53E3E', backgroundColor: '#FFF5F5' },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
  bannerSub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  ddayBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  ddayText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Invite box
  inviteBox: {
    margin: 16, backgroundColor: CARD_WHITE, borderRadius: 16,
    padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: TERRA + '30',
  },
  inviteTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 8, textAlign: 'center' },
  inviteDesc: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  inviteInput: {
    width: '100%', backgroundColor: BG, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 20, fontWeight: '800', color: TERRA,
    textAlign: 'center', letterSpacing: 4,
    borderWidth: 1.5, borderColor: DIVIDER, marginBottom: 12,
  },
  inviteBtn: {
    width: '100%', backgroundColor: TERRA, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  inviteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Next lesson card (peach) — now ABOVE calendar
  nextLessonCard: {
    backgroundColor: LESSON_CARD_BG,
    borderRadius: 20, marginHorizontal: 16, marginBottom: 12, padding: 20,
  },
  nextLessonTopRow: { flexDirection: 'row', marginBottom: 10 },
  ddayChip: {
    backgroundColor: TERRA + '20', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  ddayChipUrgent: { backgroundColor: '#E53E3E' },
  ddayChipText: { fontSize: 12, fontWeight: '700', color: TERRA },
  ddayChipTextUrgent: { color: '#fff' },
  nextLessonDateTime: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 4 },
  nextLessonMeta: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16 },
  nextLessonBtn: {
    backgroundColor: CARD_WHITE, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  nextLessonBtnText: { fontSize: 14, fontWeight: '700', color: TERRA },

  // No lesson
  noLessonCard: {
    backgroundColor: CARD_WHITE, borderRadius: 20,
    marginHorizontal: 16, marginBottom: 12, padding: 28,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: DIVIDER,
  },
  noLessonText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  noLessonSub: { fontSize: 12, color: TEXT_MUTED, textAlign: 'center' },

  // Calendar section (now below next lesson card)
  calendarSection: {
    marginHorizontal: 16, marginBottom: 12,
  },
  calendarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, paddingHorizontal: 4,
  },
  calHeaderCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center',
  },
  calNavBtn: {
    padding: 4,
  },
  calendarMonthLabel: {
    fontSize: 13, fontWeight: '700', color: TEXT_MUTED,
  },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: TERRA + '18', borderRadius: 8,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: TERRA },

  calendarStrip: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 8, paddingVertical: 12,
    backgroundColor: CARD_WHITE, borderRadius: 16,
  },
  calDay: { alignItems: 'center', gap: 4, flex: 1 },
  calDowLabel: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED },
  calDowLabelToday: { color: TERRA },
  calDowLabelSelected: { color: TERRA },
  calDateCapsule: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  calDateCapsuleToday: { backgroundColor: TERRA + '20' },
  calDateCapsuleSelected: { backgroundColor: TERRA },
  calDateNum: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
  calDateNumToday: { color: TERRA },
  calDateNumSelected: { color: '#FFFFFF' },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  calDotActive: { backgroundColor: TERRA },

  // Stat cards
  statRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: STAT_BG, borderRadius: 16,
    padding: 18, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: DIVIDER,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: TERRA },
  statLabel: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },

  // Report section
  reportSection: { marginHorizontal: 16, marginBottom: 12 },
  reportSectionTitle: {
    fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY,
    marginBottom: 10, paddingHorizontal: 2,
  },
  reportCard: {
    backgroundColor: CARD_WHITE, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: DIVIDER,
  },
  // 브리핑 헤더
  briefingHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  briefingHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  briefingHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  briefingDateText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },
  // 지난 레슨 핵심
  briefingKeySection: {
    backgroundColor: '#F3F4F6', borderRadius: 10,
    padding: 12, marginBottom: 10, gap: 4,
  },
  briefingKeyLabel: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 0.3, marginBottom: 6,
  },
  briefingKeyRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  briefingBullet: { fontSize: 13, color: TERRA, lineHeight: 20, marginTop: 1 },
  briefingKeyText: { fontSize: 13, color: TEXT_PRIMARY, lineHeight: 20, flex: 1 },
  briefingExpandBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
  },
  briefingExpandText: { fontSize: 12, fontWeight: '600', color: TERRA },
  // 다음 레슨 목표
  nextGoalBox: {
    backgroundColor: GOAL_BG, borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  nextGoalLabel: { fontSize: 11, fontWeight: '700', color: TERRA, marginBottom: 4 },
  nextGoalText: { fontSize: 13, color: TEXT_PRIMARY, lineHeight: 19 },
  // 하단 버튼
  briefingViewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F5F5F5', marginTop: 4,
  },
  briefingViewBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  coachAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: TERRA, alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  coachNameSmall: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },

  // Coach card
  coachCardSection: { marginHorizontal: 16, marginBottom: 8 },
  coachCardSectionLabel: {
    fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY,
    marginBottom: 10, paddingHorizontal: 2,
  },
  coachCard: {
    backgroundColor: CARD_WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: DIVIDER, overflow: 'hidden',
  },
  coachCardTop: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  coachCardAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: DIVIDER,
  },
  coachCardAvatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: TERRA, alignItems: 'center', justifyContent: 'center',
  },
  coachCardAvatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  coachCardInfo: { flex: 1, gap: 3 },
  coachCardName: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  coachCardMeta: { fontSize: 12, color: TEXT_MUTED },
  coachCardDivider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 16 },
  coachCardBtns: {
    flexDirection: 'row', gap: 10, padding: 14,
  },
  coachCardBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11,
    borderRadius: 12, borderWidth: 1.5, borderColor: TERRA,
  },
  coachCardBtnOutlineText: { fontSize: 13, fontWeight: '700', color: TERRA },
  msgBadge: {
    backgroundColor: TERRA, borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    marginLeft: 4,
  },
  msgBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  coachCardBtnFill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11,
    borderRadius: 12, backgroundColor: TERRA,
  },
  coachCardBtnFillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  coachCardBtnReview: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13,
  },
  coachCardBtnReviewText: { fontSize: 13, fontWeight: '700', color: TERRA },

  // Popover overlay
  popoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  // Date popover
  datePopover: {
    position: 'absolute',
    backgroundColor: CARD_WHITE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 280,
  },
  popoverArrow: {
    position: 'absolute',
    top: -8,
    width: 16, height: 16,
    backgroundColor: CARD_WHITE,
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    zIndex: -1,
  },
  popoverLoading: { paddingVertical: 20, alignItems: 'center' },
  popoverDateLabel: {
    fontSize: 13, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 10,
  },
  popoverNoLesson: {
    fontSize: 13, color: TEXT_MUTED, paddingVertical: 4,
  },
  popoverLessonsScroll: { maxHeight: 180 },
  popoverLessonItem: { paddingVertical: 10 },
  popoverLessonDivider: { borderTopWidth: 1, borderTopColor: DIVIDER },
  popoverLessonTime: {
    fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 3,
  },
  popoverLessonCoach: {
    fontSize: 12, color: TEXT_MUTED, marginBottom: 2,
  },
  popoverLessonCredits: {
    fontSize: 12, color: TEXT_MUTED, marginBottom: 6,
  },
  popoverAttBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  popoverAttText: { fontSize: 11, fontWeight: '700' },

  // Notification popover
  notifPopover: {
    position: 'absolute',
    backgroundColor: CARD_WHITE,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 360,
    overflow: 'hidden',
  },
  notifDeleteAction: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 68,
    gap: 3,
  },
  notifDeleteActionText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  notifPopoverHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  notifPopoverTitle: { fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY },
  notifBadge: {
    backgroundColor: '#E53E3E', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  notifBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  notifEmpty: {
    fontSize: 13, color: TEXT_MUTED,
    paddingHorizontal: 16, paddingVertical: 20, textAlign: 'center',
  },
  notifScroll: { maxHeight: 280 },
  notifItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: CARD_WHITE,
  },
  notifItemDivider: { borderTopWidth: 1, borderTopColor: DIVIDER },
  notifItemUnread: { backgroundColor: LESSON_CARD_BG + '80' },
  notifUnreadDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: TERRA, marginTop: 5, marginRight: 8, flexShrink: 0,
  },
  notifItemContent: { flex: 1 },
  notifItemTitle: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 2 },
  notifItemBody: { fontSize: 12, color: TEXT_MUTED, lineHeight: 17, marginBottom: 4 },
  notifItemTime: { fontSize: 11, color: TEXT_MUTED + 'CC' },
});
