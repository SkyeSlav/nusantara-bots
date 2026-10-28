// Indikator "mengetik…" — tiga titik abu-abu yang berkedip bergantian,
// dipakai di gelembung chat saat balasan sedang mengalir.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export function TypingDots() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const opacityFor = (phase: number) =>
    t.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.3, phase === 1 ? 1 : 0.3, 0.3],
    });

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { opacity: opacityFor(0) }]} />
      <Animated.View style={[styles.dot, { opacity: opacityFor(1) }]} />
      <Animated.View style={[styles.dot, { opacity: opacityFor(0) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
});
