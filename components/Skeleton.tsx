import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, SafeAreaView, ScrollView } from 'react-native';

export function FadeInView({ children, duration = 260 }: { children: React.ReactNode; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F5' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* 앱 헤더: KERRI 로고 + 벨 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
          <SkeletonBox width={72} height={22} borderRadius={4} />
          <SkeletonBox width={36} height={36} borderRadius={18} />
        </View>

        {/* 인사 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 }}>
          <SkeletonBox width="55%" height={22} borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox width="35%" height={14} borderRadius={4} />
        </View>

        {/* 다음 레슨 카드 (복숭아색) */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#F4E5DC', borderRadius: 20, padding: 20 }}>
          <SkeletonBox width={52} height={20} borderRadius={10} dark style={{ marginBottom: 12 }} />
          <SkeletonBox width="70%" height={20} borderRadius={6} dark style={{ marginBottom: 6 }} />
          <SkeletonBox width="48%" height={13} borderRadius={4} dark style={{ marginBottom: 18 }} />
          <SkeletonBox width="100%" height={42} borderRadius={12} dark />
        </View>

        {/* 주간 캘린더 */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          {/* 캘린더 헤더: 이전/다음 버튼 + 월 라벨 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <SkeletonBox width={20} height={20} borderRadius={10} />
            <SkeletonBox width={72} height={14} borderRadius={4} />
            <SkeletonBox width={20} height={20} borderRadius={10} />
          </View>
          {/* 요일+날짜 스트립 */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 12, backgroundColor: '#FFFFFF', borderRadius: 16 }}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <View key={i} style={{ alignItems: 'center', flex: 1, gap: 5 }}>
                <SkeletonBox width={14} height={12} borderRadius={3} />
                <SkeletonBox width={30} height={30} borderRadius={15} />
                <SkeletonBox width={5} height={5} borderRadius={3} />
              </View>
            ))}
          </View>
        </View>

        {/* 통계 2개 카드 */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 }}>
          {[0, 1].map(i => (
            <View key={i} style={{ flex: 1, backgroundColor: '#FDFAF8', borderRadius: 16, padding: 18, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E8EBEF' }}>
              <SkeletonBox width={52} height={24} borderRadius={4} />
              <SkeletonBox width={40} height={12} borderRadius={3} />
            </View>
          ))}
        </View>

        {/* 지난 레슨 브리핑 카드 */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <SkeletonBox width="40%" height={15} borderRadius={4} style={{ marginBottom: 10 }} />
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8EBEF' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E8EBEF' }}>
              <SkeletonBox width="42%" height={13} borderRadius={4} />
              <SkeletonBox width="28%" height={13} borderRadius={4} />
            </View>
            <View style={{ backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, marginBottom: 10, gap: 8 }}>
              <SkeletonBox width="28%" height={11} borderRadius={3} />
              <SkeletonBox width="88%" height={13} borderRadius={4} />
              <SkeletonBox width="72%" height={13} borderRadius={4} />
            </View>
            <View style={{ backgroundColor: '#F8EEE9', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <SkeletonBox width="22%" height={11} borderRadius={3} style={{ marginBottom: 8 }} />
              <SkeletonBox width="80%" height={13} borderRadius={4} />
            </View>
            <SkeletonBox width="100%" height={36} borderRadius={10} />
          </View>
        </View>

        {/* 담당 코치 카드 */}
        <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <SkeletonBox width="30%" height={15} borderRadius={4} style={{ marginBottom: 10 }} />
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E8EBEF', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
              <SkeletonBox width={48} height={48} borderRadius={24} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonBox width="45%" height={15} borderRadius={4} />
                <SkeletonBox width="60%" height={12} borderRadius={3} />
              </View>
              <SkeletonBox width={16} height={16} borderRadius={8} />
            </View>
            <View style={{ height: 1, backgroundColor: '#E8EBEF', marginHorizontal: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
              <SkeletonBox width="48%" height={40} borderRadius={12} />
              <SkeletonBox width="48%" height={40} borderRadius={12} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ScheduleSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F5' }}>
      {/* 헤더: "레슨" + 벨 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <SkeletonBox width={48} height={22} borderRadius={6} />
        <SkeletonBox width={36} height={36} borderRadius={18} />
      </View>

      {/* 탭 바: 4개 탭 전체 폭 */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E8EBEF', paddingHorizontal: 4 }}>
        {['일정', '보강', '결제', '성장'].map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
            <SkeletonBox width={i === 1 ? 52 : i === 3 ? 56 : 36} height={14} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* 레슨권 요약 카드 */}
      <View style={{ marginHorizontal: 20, marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
        <SkeletonBox width="45%" height={14} borderRadius={4} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SkeletonBox width="40%" height={20} borderRadius={4} />
          <SkeletonBox width="30%" height={13} borderRadius={4} />
        </View>
        <SkeletonBox width="100%" height={8} borderRadius={4} style={{ marginBottom: 8 }} />
        <SkeletonBox width="50%" height={13} borderRadius={4} />
      </View>

      {/* 달력 카드 */}
      <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
        {/* 달력 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SkeletonBox width={80} height={16} borderRadius={4} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <SkeletonBox width={28} height={28} borderRadius={14} />
            <SkeletonBox width={36} height={28} borderRadius={8} />
            <SkeletonBox width={28} height={28} borderRadius={14} />
          </View>
        </View>
        {/* 요일 행 */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
              <SkeletonBox width={14} height={13} borderRadius={3} />
            </View>
          ))}
        </View>
        {/* 날짜 그리드: 5행 × 7열 */}
        {[0, 1, 2, 3, 4].map(row => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {[0, 1, 2, 3, 4, 5, 6].map(col => (
              <View key={col} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}>
                <SkeletonBox width={30} height={30} borderRadius={15} />
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* 월간 현황 카드 */}
      <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
        <SkeletonBox width="45%" height={13} borderRadius={4} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <SkeletonBox width={8} height={8} borderRadius={4} />
              <SkeletonBox width={28} height={22} borderRadius={4} />
              <SkeletonBox width={24} height={12} borderRadius={3} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F5' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <SkeletonBox width={48} height={22} borderRadius={6} />
      </View>

      {/* Profile card */}
      <View style={[sk.card, { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <SkeletonBox width={64} height={64} borderRadius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBox width="55%" height={18} borderRadius={6} />
          <SkeletonBox width="70%" height={13} borderRadius={6} />
          <SkeletonBox width={60} height={20} borderRadius={Radius.full} />
        </View>
      </View>

      {/* Stats card */}
      <View style={[sk.card, { marginHorizontal: 16, marginBottom: 12 }]}>
        <SkeletonBox width="40%" height={13} borderRadius={4} style={{ marginBottom: 16 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{ width: '50%', paddingVertical: 14, alignItems: 'center', gap: 6 }}>
              <SkeletonBox width={44} height={22} borderRadius={4} />
              <SkeletonBox width={36} height={12} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>

      {/* Account card */}
      <View style={[sk.card, { marginHorizontal: 16 }]}>
        <SkeletonBox width="35%" height={13} borderRadius={4} style={{ marginBottom: 14 }} />
        <SkeletonBox width="40%" height={16} borderRadius={4} />
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

export function PaymentSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F5', padding: 16 }}>
      {/* 미납 배너 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200,120,60,0.08)', borderRadius: Radius.lg, padding: 16, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(200,120,60,0.2)' }}>
        <SkeletonBox width={40} height={40} borderRadius={20} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBox width="40%" height={13} borderRadius={4} />
          <SkeletonBox width="35%" height={20} borderRadius={4} />
        </View>
      </View>

      {/* 미납 내역 섹션 */}
      <SkeletonBox width="30%" height={16} borderRadius={4} style={{ marginBottom: 10 }} />
      {[0, 1].map(i => (
        <View key={i} style={[sk.card, { marginBottom: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{ gap: 6 }}>
              <SkeletonBox width="55%" height={15} borderRadius={4} />
              <SkeletonBox width="40%" height={12} borderRadius={4} />
            </View>
            <SkeletonBox width={48} height={22} borderRadius={6} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonBox width="30%" height={18} borderRadius={4} />
            <SkeletonBox width={88} height={38} borderRadius={Radius.md} />
          </View>
        </View>
      ))}

      {/* 레슨권 구매 섹션 */}
      <SkeletonBox width="35%" height={16} borderRadius={4} style={{ marginTop: 8, marginBottom: 10 }} />
      {[0, 1].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: '#E8EBEF', marginBottom: 8, gap: 12 }}>
          <SkeletonBox width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="55%" height={15} borderRadius={4} />
            <SkeletonBox width="30%" height={12} borderRadius={4} />
          </View>
          <SkeletonBox width={64} height={16} borderRadius={4} />
        </View>
      ))}

      {/* 결제 내역 섹션 */}
      <SkeletonBox width="25%" height={16} borderRadius={4} style={{ marginTop: 8, marginBottom: 10 }} />
      {[0, 1, 2].map(i => (
        <View key={i} style={[sk.card, { marginBottom: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox width="60%" height={15} borderRadius={4} />
              <SkeletonBox width="45%" height={12} borderRadius={4} />
            </View>
            <SkeletonBox width="25%" height={18} borderRadius={4} />
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
