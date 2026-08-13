import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  Image,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onRetry?: () => void;
  timeoutMs?: number;
}

export function LoadingScreen({ visible, onRetry, timeoutMs = 5000 }: Props) {
  const [shouldRender, setShouldRender] = useState(visible);
  const [showRetry, setShowRetry] = useState(false);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setShowRetry(false);
      setShouldRender(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShouldRender(false);
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setShowRetry(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [visible, timeoutMs]);

  return (
    <Modal visible={shouldRender} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.container, { opacity }]}
        pointerEvents="auto"
      >
        <SafeAreaView style={styles.safe}>
          <Animated.View style={styles.content}>
            <Image
              source={require('../assets/icon.png')}
              style={styles.symbol}
              resizeMode="contain"
            />
            <Text style={styles.logo}>KERRI</Text>
            <Text style={styles.tagline}>당신의 가르침이 오래 기억되도록.</Text>
            {showRetry ? (
              <TouchableOpacity onPress={onRetry} style={styles.retryButton} activeOpacity={0.7}>
                <Text style={styles.retryText}>다시 시도</Text>
              </TouchableOpacity>
            ) : (
              <ActivityIndicator size="small" color="#C0755A" style={styles.indicator} />
            )}
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7F0E9',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  symbol: {
    width: 88,
    height: 88,
    marginBottom: 20,
  },
  logo: {
    fontSize: 30,
    fontWeight: '700',
    color: '#C0755A',
    letterSpacing: 5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '400',
    color: '#3E2B22',
    marginBottom: 36,
    letterSpacing: 0.3,
  },
  indicator: {
    // ActivityIndicator 자체 size="small" 유지
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#C0755A',
    borderRadius: 20,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#C0755A',
  },
});
