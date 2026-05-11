import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.navy,
      tabBarInactiveTintColor: Colors.mutedFg,
      tabBarStyle: { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white, paddingBottom: 4 },
      headerStyle: { backgroundColor: Colors.primary },
      headerTintColor: Colors.white,
      headerTitleStyle: { fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{
        title: '홈', tabBarLabel: '홈',
        tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        headerTitle: 'KERRI',
      }} />
      <Tabs.Screen name="schedule" options={{
        title: '내 일정', tabBarLabel: '내 일정',
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        headerTitle: '내 레슨 일정',
      }} />
      <Tabs.Screen name="profile" options={{
        title: '내 정보', tabBarLabel: '내 정보',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        headerShown: false,
      }} />
    </Tabs>
  );
}
