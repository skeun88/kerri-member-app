import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '../lib/theme';

interface BoxProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  dark?: boolean;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style, dark }: BoxProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ])
    ).start();
    return () => { opacity.stopAnimation(); };
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: dark ? 'rgba(255,255,255,0.25)' : '#E8DDD8', opacity },
        style,
      ]}
    />
  );
}

export function HomeSkeleton() {
  return (
    <View style={sk.container}>
      {/* 헤더 */}
      <View style={sk.header}>
        <SkeletonBox width="50%" height={22} borderRadius={6} />
        <SkeletonBox width={64} height={26} borderRadius={Radius.full} />
      </View>

      {/* 크레딧 바 */}
      <View style={sk.card}>
        <SkeletonBox width="40%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="100%" height={8} borderRadius={4} style={{ marginBottom: 6 }} />
        <View style={sk.row}>
          <SkeletonBox width="30%" height={12} />
          <SkeletonBox width="20%" height={12} />
        </View>
      </View>

      {/* 코치 카드 */}
      <View style={sk.card}>
        <View style={sk.row}>
          <SkeletonBox width={52} height={52} borderRadius={26} style={{ marginRight: 12 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBox width="55%" height={16} />
            <SkeletonBox width="35%" height={12} />
            <SkeletonBox width={64} height={20} borderRadius={Radius.full} />
          </View>
          <SkeletonBox width={72} height={72} borderRadius={8} />
        </View>
        <View style={[sk.row, { marginTop: 14, gap: 10 }]}>
          <SkeletonBox width="48%" height={36} borderRadius={Radius.md} />
          <SkeletonBox width="48%" height={36} borderRadius={Radius.md} />
        </View>
      </View>

      {/* 다가오는 레슨 */}
      <SkeletonBox width="35%" height={14} style={{ marginBottom: 10 }} />
      {[0, 1, 2].map(i => (
        <View key={i} style={sk.lessonRow}>
          <SkeletonBox width={48} height={48} borderRadius={Radius.md} style={{ marginRight: 12 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="60%" height={14} />
            <SkeletonBox width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ScheduleSkeleton() {
  return (
    <View style={sk.container}>
      {/* 탭 바 */}
      <View style={sk.tabRow}>
        {[80, 110, 56, 88].map((w, i) => (
          <SkeletonBox key={i} width={w} height={32} borderRadius={Radius.md} />
        ))}
      </View>

      {/* 섹션 헤더 */}
      <SkeletonBox width="45%" height={16} style={{ marginBottom: 16 }} />

      {/* 레슨 아이템들 */}
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={sk.card}>
          <View style={sk.row}>
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBox width="65%" height={15} />
              <SkeletonBox width="40%" height={12} />
            </View>
            <SkeletonBox width={60} height={24} borderRadius={Radius.full} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Hero */}
      <View style={[sk.hero, { paddingTop: 60, paddingBottom: 28 }]}>
        <View style={[sk.row, { alignItems: 'flex-start', marginBottom: 0 }]}>
          <SkeletonBox dark width={72} height={72} borderRadius={36} style={{ marginRight: 16 }} />
          <View style={{ flex: 1, gap: 8, paddingTop: 6 }}>
            <SkeletonBox dark width="55%" height={18} />
            <SkeletonBox dark width="70%" height={13} />
            <SkeletonBox dark width={80} height={22} borderRadius={Radius.full} />
          </View>
        </View>
      </View>

      <View style={sk.body}>
        {/* 통계 카드 */}
        <View style={sk.statsRow}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={sk.statCell}>
              <SkeletonBox width={40} height={22} borderRadius={4} style={{ marginBottom: 6 }} />
              <SkeletonBox width={36} height={12} borderRadius={4} />
            </View>
          ))}
        </View>

        {/* 구독 카드 */}
        <View style={sk.card}>
          <View style={sk.row}>
            <SkeletonBox width={40} height={40} borderRadius={Radius.md} style={{ marginRight: 12 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="50%" height={15} />
              <SkeletonBox width="30%" height={12} />
            </View>
          </View>
        </View>

        {/* 출석 */}
        <View style={sk.card}>
          <SkeletonBox width="40%" height={14} style={{ marginBottom: 12 }} />
          <View style={[sk.row, { gap: 8 }]}>
            {Array(8).fill(0).map((_, i) => (
              <SkeletonBox key={i} width={28} height={28} borderRadius={14} style={{ flex: undefined }} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

export function ReportSkeleton() {
  return (
    <View style={sk.container}>
      {/* 헤더 */}
      <View style={sk.header}>
        <View>
          <SkeletonBox width="45%" height={20} style={{ marginBottom: 6 }} />
          <SkeletonBox width="65%" height={13} />
        </View>
      </View>

      {/* 리포트 아이템들 */}
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={sk.card}>
          <View style={[sk.row, { marginBottom: 10 }]}>
            <SkeletonBox width="40%" height={14} />
            <SkeletonBox width={64} height={22} borderRadius={Radius.full} />
          </View>
          <SkeletonBox width="90%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonBox width="70%" height={14} style={{ marginBottom: 10 }} />
          <View style={sk.row}>
            {[0, 1, 2].map(j => (
              <SkeletonBox key={j} width={72} height={24} borderRadius={Radius.full} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    paddingVertical: 4,
  },
  hero: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    justifyContent: 'space-around',
  },
  statCell: {
    alignItems: 'center',
    flex: 1,
  },
});
