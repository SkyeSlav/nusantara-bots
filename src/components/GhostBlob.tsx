// Blob hantu — avatar tiap bot. Siluet hantu imut bermata dua, digambar
// sendiri dengan SVG (bukan aset dari mana pun). Warna dan bentuk
// diturunkan deterministik dari id bot lewat modul api/blob, jadi bot
// yang sama selalu tampil sama dan bot yang berbeda tampil berbeda.
// Tidak ada inisial di dalam blob.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { blobStyleFor, ghostColor } from '../api/blob';
import { colors } from '../theme';

export type GhostState = 'idle' | 'working' | 'typing';

type GhostBlobProps = {
  botId: string | null;
  size?: number;
  state?: GhostState;
};

// Lima siluet hantu berbeda (viewBox 100x100). Varian dipilih dari
// blobStyleFor(botId).variant. Bentuk digambar sendiri — bukan jiplakan.
const PATHS: string[] = [
  // v0 — kubah klasik, bawah berlekuk lembut.
  'M50 8 C28 8 18 28 18 50 L18 74 Q25 68 32 74 Q38 80 44 74 Q50 68 56 74 Q62 80 68 74 Q75 68 82 74 L82 50 C82 28 72 8 50 8 Z',
  // v1 — kubah dengan tiga gelombang dalam di bawah.
  'M50 8 C28 8 18 28 18 50 L18 70 C24 62 30 62 36 70 C40 76 44 76 50 70 C56 76 60 76 64 70 C70 62 76 62 82 70 L82 50 C82 28 72 8 50 8 Z',
  // v2 — tetesan: badan membulat, ujung bawah meruncing + titik kecil.
  'M50 6 C30 6 20 22 20 42 C20 58 32 66 38 76 C42 82 46 88 50 92 C54 88 58 82 62 76 C68 66 80 58 80 42 C80 22 70 6 50 6 Z',
  // v3 — dua kaki kecil di bawah (hantu berjalan).
  'M50 8 C30 8 16 24 16 44 C16 60 26 66 34 66 L36 80 C36 86 44 86 46 80 L48 70 L52 70 L54 80 C56 86 64 86 64 80 L66 66 C74 66 84 60 84 44 C84 24 70 8 50 8 Z',
  // v4 — jamur lebar dengan ekor tetesan di kanan bawah + titik kecil.
  'M50 6 C28 6 14 22 14 44 C14 62 26 74 40 76 L42 86 C42 92 50 92 50 86 L52 76 C66 74 78 66 82 50 C86 30 72 6 50 6 Z',
];

// Varian yang punya titik kecil terpisah (seperti tetesan di frame).
const HAS_DOT: Record<number, { cx: number; cy: number; r: number } | null> = {
  0: null,
  1: null,
  2: { cx: 74, cy: 88, r: 4.5 },
  3: null,
  4: { cx: 70, cy: 90, r: 4 },
};

export function GhostBlob({ botId, size = 56, state = 'idle' }: GhostBlobProps) {
  const color = ghostColor(botId);
  const variant = useMemo(() => {
    const v = blobStyleFor(botId).variant;
    return Number.isFinite(v) ? ((v % 5) + 5) % 5 : 0;
  }, [botId]);

  // Napas pelan saat diam; denyut lebih cepat saat bekerja.
  // 0.9.8: animasi idle diperkuat supaya TERLIHAT di ukuran kecil
  // (header 36px dulu nyaris diam: scale 1→1.045 + rotate ±1.5°).
  // Sekarang: scale 1→1.09, goyangan ±4°, plus bob naik-turun
  // ~7% ukuran — jelas bergerak tapi tetap halus, tidak norak.
  // Working: denyut lebih cepat + besar + glow (tetap).
  const breath = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dur = state === 'working' ? 650 : 1600;
    const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: dur, useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: dur, useNativeDriver: true }),
    ]),
  );
  loop.start();
  return () => loop.stop();
}, [breath, state]);

  // Tiga titik berkedip saat mengetik (menggantikan mata).
  useEffect(() => {
    if (state !== 'typing') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, state]);

  const scale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: state === 'working' ? [1, 1.12] : [1, 1.09],
  });
  const rotate = breath.interpolate({
    inputRange: [0, 1],
    outputRange: state === 'working' ? ['-3deg', '3deg'] : ['-4deg', '4deg'],
  });
  // Bob naik-turun (proporsional ukuran, jadi 36px pun kelihatan).
  const bob = size * 0.07;
  const translateY = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -bob],
  });

  const dot = HAS_DOT[variant];
  const eyeY = 38;
  const dotsOpacity = (offset: number) =>
    blink.interpolate({
      inputRange: [0, 1],
      outputRange: [0.25 + offset * 0.2, 1],
    });

  return (
    <Animated.View
      style={[
        styles.wrap,
        { width: size, height: size },
        state === 'working' && { shadowColor: color, shadowOpacity: 0.55, elevation: 8 },
        { transform: [{ scale }, { rotate }, { translateY }] },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d={PATHS[variant]} fill={color} />
        {dot ? <Circle cx={dot.cx} cy={dot.cy} r={dot.r} fill={color} /> : null}
        {state === 'typing' ? (
          <>
            <AnimatedCircle cx={34} cy={eyeY + 8} r={4} fill={colors.blobEye} opacity={dotsOpacity(0)} />
            <AnimatedCircle cx={50} cy={eyeY + 8} r={4} fill={colors.blobEye} opacity={dotsOpacity(0.5)} />
            <AnimatedCircle cx={66} cy={eyeY + 8} r={4} fill={colors.blobEye} opacity={dotsOpacity(1)} />
          </>
        ) : (
          <>
            <Rect x={37} y={eyeY} width={7} height={15} rx={3.5} fill={colors.blobEye} />
            <Rect x={56} y={eyeY} width={7} height={15} rx={3.5} fill={colors.blobEye} />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}

// Circle SVG yang menerima Animated.Value sebagai opacity.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
});
