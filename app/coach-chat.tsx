import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getMyMemberRow } from '../lib/supabase';
import { Colors, Radius, Shadow } from '../lib/theme';
import { notifyCoachMessage } from '../lib/notifications';

interface Msg {
  id: string;
  sender_type: 'coach' | 'member';
  content: string;
  created_at: string;
  read_at: string | null;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export default function CoachChatScreen() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const memberIdRef = useRef<string | null>(null);

  async function loadMsgs(mid: string, cid: string) {
    const { data } = await supabase.from('messages').select('*')
      .eq('member_id', mid).order('created_at', { ascending: true });
    setMsgs(data ?? []);
    setLoading(false);
    // 읽음 처리
    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('member_id', mid).eq('sender_type', 'coach').is('read_at', null);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
  }

  // 최초 마운트: 회원 정보 로드
  useEffect(() => {
    (async () => {
      const mem = await getMyMemberRow();
      if (!mem) { setLoading(false); return; }
      setMemberId(mem.id);
      setCoachId(mem.coach_id);
      memberIdRef.current = mem.id;
      await loadMsgs(mem.id, mem.coach_id);
    })();
  }, []);

  // 포커스 시 메시지 리로드 (다른 탭에서 돌아올 때)
  useFocusEffect(useCallback(() => {
    if (memberIdRef.current && coachId) {
      loadMsgs(memberIdRef.current, coachId);
    }
  }, [coachId]));

  // Realtime 구독 (filter 없이 → 클라이언트에서 member_id 검증)
  useEffect(() => {
    if (!memberId) return;
    const ch = supabase.channel('chat_member_rt_' + memberId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg.member_id !== memberId) return;
        setMsgs(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg as Msg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        if (newMsg.sender_type === 'coach') {
          supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', newMsg.id).then(() => {});
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [memberId]);

  async function send() {
    if (!input.trim() || sending) return;
    if (!memberId || !coachId) {
      Alert.alert('오류', '회원 정보를 불러올 수 없어요. 앱을 다시 시작해주세요.');
      return;
    }
    const text = input.trim();
    setInput('');
    setSending(true);
    const { error } = await supabase.from('messages').insert({ coach_id: coachId, member_id: memberId, sender_type: 'member', content: text });
    setSending(false);
    if (error) {
      Alert.alert('전송 실패', error.message);
    } else {
      // PN-03: 코치에게 회원 메시지 알림
      const member = await getMyMemberRow();
      if (member && coachId) {
        notifyCoachMessage(coachId, member.name ?? '회원').catch(() => {});
      }
    }
  }

  function renderMsg({ item, index }: { item: Msg; index: number }) {
    const isMe = item.sender_type === 'member';
    const prev = index > 0 ? msgs[index - 1] : null;
    const showDate = !prev || fmtDate(item.created_at) !== fmtDate(prev.created_at);
    return (
      <>
        {showDate && (
          <View style={s.dateDivider}><Text style={s.dateText}>{fmtDate(item.created_at)}</Text></View>
        )}
        <View style={[s.row, isMe ? s.rowMe : s.rowThem]}>
          {!isMe && <View style={s.avatar}><Text style={s.avatarTxt}>코</Text></View>}
          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
            <Text style={[s.txt, isMe && s.txtMe]}>{item.content}</Text>
            <Text style={[s.time, isMe && s.timeMe]}>{fmt(item.created_at)}</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>코치 메시지</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : msgs.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.iconMuted} />
            <Text style={s.emptyTxt}>코치님과 첫 메시지를 보내보세요 🎾</Text>
          </View>
        ) : (
          <FlatList ref={listRef} data={msgs} keyExtractor={i => i.id} renderItem={renderMsg}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} />
        )}
        <View style={s.bar}>
          <TextInput style={s.input} value={input} onChangeText={setInput}
            placeholder="메시지 입력..." placeholderTextColor={Colors.placeholder}
            multiline maxLength={500} />
          <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnOff]}
            onPress={send} disabled={!input.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTxt: { fontSize: 14, color: Colors.placeholder, textAlign: 'center' },
  dateDivider: { alignItems: 'center', marginVertical: 12 },
  dateText: { fontSize: 14, color: Colors.mutedFg, backgroundColor: Colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8, gap: 8 },
  rowMe: { flexDirection: 'row-reverse' },
  rowThem: {},
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  txt: { fontSize: 15, color: Colors.foreground, lineHeight: 22 },
  txtMe: { color: '#fff' },
  time: { fontSize: 12, color: Colors.mutedFg, marginTop: 4 },
  timeMe: { color: 'rgba(255,255,255,0.65)' },
  bar: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  input: { flex: 1, fontSize: 15, color: Colors.foreground, backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnOff: { backgroundColor: Colors.iconMuted },
});
