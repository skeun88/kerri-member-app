import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../lib/supabase';

const BG = '#F7F7F5';
const CARD_WHITE = '#FFFFFF';
const TERRA = '#C0755A';
const LESSON_CARD_BG = '#F4E5DC';
const TEXT_PRIMARY = '#20242C';
const TEXT_MUTED = '#667085';
const DIVIDER = '#E8EBEF';

type NotifIconName = keyof typeof Ionicons.glyphMap;

interface NotifTypeConfig {
  icon: NotifIconName;
  label: string;
  color: string;
}

const NOTIF_CONFIG: Record<string, NotifTypeConfig> = {
  lesson_reminder: { icon: 'alarm-outline', label: '레슨 알림', color: '#3B82F6' },
  lesson_report:   { icon: 'document-text-outline', label: '레슨 기록', color: TERRA },
  chat_message:    { icon: 'chatbubble-outline', label: '메시지', color: '#8B5CF6' },
  message:         { icon: 'chatbubble-outline', label: '메시지', color: '#8B5CF6' },
  reregister:      { icon: 'refresh-circle-outline', label: '재등록 안내', color: '#F59E0B' },
  lesson_update:   { icon: 'calendar-outline', label: '일정 변경', color: '#10B981' },
  payment:         { icon: 'card-outline', label: '결제', color: '#EF4444' },
};

const DEFAULT_CONFIG: NotifTypeConfig = {
  icon: 'notifications-outline',
  label: '알림',
  color: TEXT_MUTED,
};

interface MemberNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
}

function formatNotifTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function SkeletonItem() {
  return (
    <View style={styles.skeletonItem}>
      <View style={styles.skeletonIcon} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonLineShort} />
        <View style={styles.skeletonLineLong} />
        <View style={[styles.skeletonLineLong, { width: '50%' }]} />
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  async function loadNotifications() {
    const myMember = await getMyMemberRow();
    if (!myMember) { setLoading(false); return; }
    setMemberId(myMember.id);

    const { data } = await supabase
      .from('member_notifications')
      .select('id, title, body, type, is_read, created_at, reference_id, reference_type')
      .eq('member_id', myMember.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications(data ?? []);
    setLoading(false);
  }

  async function markNotifRead(notifId: string) {
    await supabase
      .from('member_notifications')
      .update({ is_read: true })
      .eq('id', notifId);
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
    );
  }

  function handleNotifTap(notif: MemberNotification) {
    if (!notif.is_read) markNotifRead(notif.id);
    switch (notif.type) {
      case 'lesson_report':
        router.push('/(tabs)/report');
        break;
      case 'message':
      case 'chat_message':
        router.push('/coach-chat');
        break;
      case 'lesson_reminder':
      case 'lesson_update':
      case 'reregister':
        router.push('/(tabs)/schedule');
        break;
      case 'payment':
        router.push('/(tabs)/payment' as never);
        break;
      default:
        break;
    }
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadNotifications();
  }, []));

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>알림</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3, 4].map(i => <SkeletonItem key={i} />)}
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadNotifications();
                setRefreshing(false);
              }}
              tintColor={TERRA}
            />
          }
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color={TEXT_MUTED}
                style={{ opacity: 0.4 }}
              />
              <Text style={styles.emptyTitle}>아직 도착한 알림이 없어요</Text>
              <Text style={styles.emptySub}>
                레슨 일정이나 코치 메시지가 오면{'\n'}여기서 확인할 수 있어요
              </Text>
            </View>
          }
          renderItem={({ item: notif }) => {
            const config = NOTIF_CONFIG[notif.type] ?? DEFAULT_CONFIG;
            return (
              <TouchableOpacity
                style={[styles.notifItem, !notif.is_read && styles.notifItemUnread]}
                onPress={() => handleNotifTap(notif)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconCircle, { backgroundColor: config.color + '18' }]}>
                  <Ionicons name={config.icon} size={20} color={config.color} />
                </View>
                <View style={styles.notifContent}>
                  <View style={styles.notifTopRow}>
                    <Text style={[styles.notifTypeLabel, { color: config.color }]}>
                      {config.label}
                    </Text>
                    <Text style={styles.notifTime}>{formatNotifTime(notif.created_at)}</Text>
                  </View>
                  <Text style={[styles.notifTitle, !notif.is_read && styles.notifTitleUnread]}>
                    {notif.title}
                  </Text>
                  <Text style={styles.notifBody} numberOfLines={2}>{notif.body}</Text>
                </View>
                {!notif.is_read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY },
  headerBadge: {
    backgroundColor: '#E53E3E',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  headerRight: { width: 40 },

  // List
  listContent: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: DIVIDER, marginLeft: 76 },

  // Notification item
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: CARD_WHITE,
    gap: 12,
  },
  notifItemUnread: { backgroundColor: LESSON_CARD_BG + '50' },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: { flex: 1, gap: 3 },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifTypeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  notifTime: { fontSize: 11, color: TEXT_MUTED },
  notifTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, lineHeight: 20 },
  notifTitleUnread: { fontWeight: '800' },
  notifBody: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TERRA,
    marginTop: 6,
    flexShrink: 0,
  },

  // Skeleton
  skeletonList: { paddingTop: 8 },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: DIVIDER,
    flexShrink: 0,
  },
  skeletonContent: { flex: 1, gap: 8 },
  skeletonLineShort: { height: 10, width: '30%', borderRadius: 5, backgroundColor: DIVIDER },
  skeletonLineLong: { height: 12, width: '90%', borderRadius: 6, backgroundColor: DIVIDER },

  // Empty state
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  emptySub: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },

});
