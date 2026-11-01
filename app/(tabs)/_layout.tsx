import { Tabs } from 'expo-router';
import MemberTabBar from '../../components/MemberTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MemberTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="payment" options={{ href: null }} />
      <Tabs.Screen name="report" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
