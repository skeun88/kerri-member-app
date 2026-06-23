import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Shadow } from '../../lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) Alert.alert('로그인 실패', error.message);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>K</Text>
          </View>
          <Text style={styles.appName}>KERRI Member</Text>
          <Text style={styles.appSub}>테니스 레슨 관리 앱</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>로그인</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>이메일</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.mutedFg} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="이메일 주소" placeholderTextColor={Colors.placeholder}
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>비밀번호</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.mutedFg} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="비밀번호" placeholderTextColor={Colors.placeholder}
                value={password} onChangeText={setPassword} secureTextEntry={!showPw} />
              <TouchableOpacity onPress={() => setShowPw(v => !v)}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.mutedFg} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>로그인</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 80 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoText: { fontSize: 32, fontWeight: '900', color: Colors.primary },
  appName: { fontSize: 26, fontWeight: '800', color: Colors.white },
  appSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 24, ...Shadow.md },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.primary, marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.mutedFg, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.mutedBg, borderRadius: Radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, color: Colors.foreground, paddingVertical: 12 },
  loginBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
