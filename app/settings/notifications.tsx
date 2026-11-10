import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, SafeAreaView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, getMyMemberRow } from '../../lib/supabase';
import { Colors } from '../../lib/theme';

const TERRA = Colors.primary;
const BG = Colors.background;

type SettingsRow = {
  lesson_day_before: boolean;
  lesson_hour_before: boolean;
  schedule_change: boolean;
  lesson_cancel: boolean;
  bogan_result: boolean;
  reregister_alert: boolean;
  payment_notice: boolean;
  ai_report: boolean;
  coach_message: boolean;
};

const DEFAULTS: SettingsRow = {
  lesson_day_before: true,
  lesson_hour_before: true,
  schedule_change: true,
  lesson_cancel: true,
  bogan_result: true,
  reregister_alert: true,
  payment_notice: true,
  ai_report: true,
  coach_message: true,
};

type Section = {
  title: string;
  items: Item[];
};

type Item = {
  key: keyof SettingsRow | 'schedule_change_cancel';
  icon: string;
  label: string;
  desc: string;
};

const SECTIONS: Section[] = [
  {
    title: '레슨 일정',
    items: [
      { key: 'lesson_day_before',      icon: 'calendar-outline',      label: '레슨 전날 알림',    desc: '레슨 전날 오후 7시에 알려드려요' },
      { key: 'lesson_hour_before',     icon: 'alarm-outline',         label: '레슨 1시간 전',     desc: '레슨 시작 1시간 전에 알려드려요' },
      { key: 'schedule_change_cancel', icon: 'calendar-clear-outline', label: '일정 변경·취소',   desc: '레슨 일정이 변경되거나 취소되면 알려드려요' },
      { key: 'bogan_result',           icon: 'refresh-circle-outline', label: '보강 신청 결과',   desc: '보강 신청이 승인·거절되면 알려드려요' },
    ],
  },
  {
    title: '레슨 관리',
    items: [
      { key: 'reregister_alert',  icon: 'repeat-outline',           label: '남은 레슨 1회 알림', desc: '레슨권 잔여 횟수가 1회 남으면 알려드려요' },
      { key: 'payment_notice',    icon: 'card-outline',             label: '결제 안내',          desc: '결제 처리 결과를 알려드려요' },
      { key: 'ai_report',         icon: 'document-text-outline',    label: '레슨 기록 도착',     desc: '코치님이 레슨 기록을 보내면 알려드려요' },
    ],
  },
  {
    title: '코치 소통',
    items: [
      { key: 'coach_message', icon: 'chatbubble-outline', label: '코치 메시지', desc: '코치님이 메시지를 보내면 알려드려요' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsRow>(DEFAULTS);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const member = await getMyMemberRow();
      if (!member) return;
      setMemberId(member.id);

      const { data } = await supabase
        .from('notification_settings')
        .select('lesson_day_before,lesson_hour_before,schedule_change,lesson_cancel,bogan_result,reregister_alert,payment_notice,ai_report,coach_message')
        .eq('member_id', member.id)
        .maybeSingle();

      if (data) {
        setSettings({
          lesson_day_before:  data.lesson_day_before  ?? true,
          lesson_hour_before: data.lesson_hour_before ?? true,
          schedule_change:    data.schedule_change    ?? true,
          lesson_cancel:      data.lesson_cancel      ?? true,
          bogan_result:       data.bogan_result       ?? true,
          reregister_alert:   data.reregister_alert   ?? true,
          payment_notice:     data.payment_notice     ?? true,
          ai_report:          data.ai_report          ?? true,
          coach_message:      data.coach_message      ?? true,
        });
      } else {
        // 행이 없으면 기본값으로 생성
        await supabase.from('notification_settings').upsert({
          member_id: member.id,
          user_type: 'member',
          ...DEFAULTS,
        }, { onConflict: 'member_id' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggle(key: keyof SettingsRow | 'schedule_change_cancel', value: boolean) {
    if (!memberId) return;
    setSaving(key);

    // schedule_change_cancel은 schedule_change + lesson_cancel 동시 업데이트
    const updatePayload: Partial<SettingsRow> =
      key === 'schedule_change_cancel'
        ? { schedule_change: value, lesson_cancel: value }
        : { [key]: value };

    setSettings(prev => ({
      ...prev,
      ...updatePayload,
    }));

    await supabase
      .from('notification_settings')
      .upsert({ member_id: memberId, user_type: 'member', ...updatePayload }, { onConflict: 'member_id' });

    setSaving(null);
  }

  function getValue(key: Item['key']): boolean {
    if (key === 'schedule_change_cancel') {
      return settings.schedule_change && settings.lesson_cancel;
    }
    return settings[key as keyof SettingsRow];
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>알림 설정</Text>
        </View>
        <ActivityIndicator color={TERRA} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림 설정</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.topDesc}>
          각 알림을 개별적으로 켜거나 끌 수 있어요.{'\n'}
          알림을 끄면 앱 내 알림함 기록은 유지돼요.
        </Text>

        {SECTIONS.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((item, ii) => {
                const isLast = ii === section.items.length - 1;
                const val = getValue(item.key);
                const isSaving = saving === item.key;
                return (
                  <View key={item.key}>
                    <View style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Ionicons name={item.icon as any} size={18} color={TERRA} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Text style={styles.rowDesc}>{item.desc}</Text>
                      </View>
                      {isSaving ? (
                        <ActivityIndicator size="small" color={TERRA} style={{ width: 50 }} />
                      ) : (
                        <Switch
                          value={val}
                          onValueChange={v => toggle(item.key, v)}
                          trackColor={{ false: Colors.border, true: TERRA + '66' }}
                          thumbColor={val ? TERRA : Colors.mutedFg}
                          ios_backgroundColor={Colors.border}
                        />
                      )}
                    </View>
                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: Platform.OS === 'ios' ? 4 : 16,
    paddingHorizontal: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: BG,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.foreground },
  scroll: { padding: 20, paddingBottom: 40 },
  topDesc: {
    fontSize: 13, color: Colors.mutedFg, lineHeight: 20,
    marginBottom: 24,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.mutedFg,
    letterSpacing: 0.5, marginBottom: 10, marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.foreground, marginBottom: 2 },
  rowDesc: { fontSize: 12, color: Colors.mutedFg, lineHeight: 17 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 62 },
});
