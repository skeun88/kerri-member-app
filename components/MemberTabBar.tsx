import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet, Platform,
  useWindowDimensions, Keyboard, AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TERRA = '#C0755A';
const TERRA_CAPSULE = '#F4E5DC';
const INACTIVE = '#8C8782';
const BAR_HEIGHT = 62;
const ANIM_MS = 180;

type TabDef = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDef[] = [
  { name: 'index', label: '홈', icon: 'home', iconOutline: 'home-outline' },
  { name: 'schedule', label: '레슨', icon: 'calendar', iconOutline: 'calendar-outline' },
  { name: 'report', label: '레슨 기록', icon: 'document-text', iconOutline: 'document-text-outline' },
  { name: 'profile', label: '마이', icon: 'person', iconOutline: 'person-outline' },
];

export default function MemberTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);

  const isSmall = width <= 390;
  const barHeight = isSmall ? 58 : 62;
  const iconSize = isSmall ? 20 : 22;
  const labelSize = isSmall ? 10 : 11;
  // 안드로이드: insets.bottom이 0으로 오는 경우 최소 패딩 보장
  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom, 8)
    : insets.bottom;

  const activeRouteName = state.routes[state.index]?.name;
  const activeIndex = Math.max(0, TABS.findIndex(t => t.name === activeRouteName));
  const tabWidth = width / TABS.length;
  const capsuleWidth = tabWidth * 0.65;

  const capsuleX = useRef(new Animated.Value(activeIndex * tabWidth + tabWidth / 2 - capsuleWidth / 2)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub?.remove?.(); };
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    const target = activeIndex * tabWidth + tabWidth / 2 - capsuleWidth / 2;
    if (reduceMotion) { capsuleX.setValue(target); return; }
    Animated.timing(capsuleX, { toValue: target, duration: ANIM_MS, useNativeDriver: true }).start();
  }, [activeIndex, tabWidth, capsuleWidth]);

  if (keyboardUp) return null;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      <View style={[styles.bar, { height: barHeight }]}>
        {/* Animated capsule behind active icon */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.capsule,
            { width: capsuleWidth, height: barHeight - 16, transform: [{ translateX: capsuleX }] },
          ]}
        />
        {TABS.map((tab) => {
          const route = state.routes.find(r => r.name === tab.name);
          if (!route) return null;
          const focused = activeRouteName === tab.name;
          const color = focused ? TERRA : INACTIVE;
          return (
            <Pressable
              key={tab.name}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.tab}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
            >
              <Ionicons name={focused ? tab.icon : tab.iconOutline} size={iconSize} color={color} />
              <Text style={[styles.label, { color, fontSize: labelSize }]} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EBEF',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  capsule: {
    position: 'absolute',
    top: 8,
    borderRadius: 16,
    backgroundColor: TERRA_CAPSULE,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: '100%',
    minHeight: 44,
  },
  label: {
    fontWeight: '600',
  },
});
