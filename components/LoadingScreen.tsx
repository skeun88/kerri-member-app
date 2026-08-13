import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  onRetry?: () => void;
  timeoutMs?: number;
}

export function LoadingScreen({ onRetry, timeoutMs = 5000 }: Props) {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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
      </View>
      <Text style={styles.versionMarker}>v4</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F0E9',
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
  indicator: {},
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
  versionMarker: {
    textAlign: 'center',
    fontSize: 10,
    color: '#C0B5AA',
    paddingBottom: 8,
  },
});
