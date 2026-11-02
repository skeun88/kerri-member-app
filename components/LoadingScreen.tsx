import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../lib/theme';

// Arc paths: center=(20,20), r=16, 105° each with 15° gaps
// Arc 1: -90° → 15°,  Arc 2: 30° → 135°,  Arc 3: 150° → 255°
const ARC1 = 'M 20 4 A 16 16 0 0 1 35.455 24.141';
const ARC2 = 'M 33.856 28 A 16 16 0 0 1 8.686 31.314';
const ARC3 = 'M 6.144 28 A 16 16 0 0 1 15.859 4.545';

interface Props {
  onRetry?: () => void;
  timeoutMs?: number;
}

export function LoadingScreen({ onRetry, timeoutMs = 5000 }: Props) {
  const [showRetry, setShowRetry] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, [rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../assets/images/kerri-logo.png')}
          style={styles.wordmark}
          resizeMode="contain"
        />
        {showRetry ? (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton} activeOpacity={0.7}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View style={[styles.spinnerWrap, { transform: [{ rotate: spin }] }]}>
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Path d={ARC1} stroke="#C0755A" strokeWidth={3.5} fill="none" strokeLinecap="round" />
              <Path d={ARC2} stroke="#E8C9BD" strokeWidth={3.5} fill="none" strokeLinecap="round" />
              <Path d={ARC3} stroke="#F8EEE9" strokeWidth={3.5} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  wordmark: {
    width: 180,
    height: 60,
    marginBottom: 48,
  },
  spinnerWrap: {
    width: 40,
    height: 40,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#C0755A',
    borderRadius: 20,
    marginTop: 48,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#C0755A',
  },
});
