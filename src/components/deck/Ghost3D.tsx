/**
 * Karakter deck: hantu blob maskot aplikasi (0.9.11).
 *
 * Sam memilih arah ini 26 Okt ~14:13 ("pake bot character aja kan ada
 * di chat lumayan lucu sih kaya bergerak dan nafas") — bukan manusia
 * realistis (dari geometri kode saja akan terlihat kaku) dan bukan
 * chibi artikulasi 0.9.10 (terlalu kecil + tidak terlihat di layar HP,
 * baju pink-nya nol piksel di screenshot Sam). Blob ini avatar yang
 * sama dengan di chat (GhostBlob 2D): satu identitas, sudah terbukti
 * lucu + beranimasi.
 *
 * Bentuk: siluet lathe (5 varian, profil titik-titik) + 2 mata gelap
 * ber-highlight + mulut senyum (busur torus). Posisi z mata/mulut
 * dihitung dari profil via `radiusAt` supaya duduk tepat di permukaan
 * kubah tiap varian. Warna dari id bot (ikut avatar override).
 *
 * BESAR (pelajaran 0.9.10 + 0.10.1): skala meja 1.5 / beanbag 1.3
 * (0.10.2-final — 0.10.1: 3.2/2.7 KEGEDAN kata Sam, "gde bgd bro";
 * 0.10.2-lama: 2.6/2.2 MASIH kegedean; 0.10.2-tengah: 2.3/1.9
 * lolos ukur tapi visual masih menjulang di atas monitor; 0.10.0:
 * 2.0/1.6 kekecilan; patokan Sam 18:49 "AI Virtual Office":
 * karakter KECIL duduk di meja, kepala di atas meja, badan di
 * belakang meja) — blob meja setinggi ~1.41 unit, ~36px di layar HP
 * referensi (tes proyeksi di deckVisibility.test.ts), mata ≈ 12px
 * di emulator. Wajah (mata) berada di atas garis monitor supaya
 * tidak tertutup meja. Emissive ringan supaya warna tidak meredup
 * jadi gelap di bawah pencahayaan standar. Mata + mulut diperbesar
 * 0.10.1 (0.05→0.06 / 0.06→0.075) supaya wajah terbaca di layar
 * HP, dipertahankan 0.10.2 — bukan cuma badan besar tanpa muka.
 *
 * Animasi (useFrame, hormati `animated`): diam = napas pelan +
 * goyang halus; bekerja = angguk cepat + bob mengetik; jalan =
 * melayang (bob + condong ke depan) — blob tidak punya kaki, jadi
 * ia melayang antar kursi, bukan berjalan. Cincin status TIDAK di
 * sini — pakai komponen StatusRing terpisah di level lantai.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { ghostColor, blobStyleFor } from '../../api/blob';
import {
  GHOST_BEANBAG_SCALE,
  GHOST_DESK_SCALE,
  GHOST_EYE_Y,
  GHOST_MOUTH_Y,
  GHOST_PROFILE_HEIGHT,
  radiusAt,
} from '../../api/deckOverlay';

export { GHOST_BEANBAG_SCALE, GHOST_DESK_SCALE, GHOST_EYE_Y, GHOST_MOUTH_Y, GHOST_PROFILE_HEIGHT };

export type Ghost3DProps = {
  botId: string | null;
  /** true = bot sedang bekerja (dari presence server). */
  working?: boolean;
  /** false = matikan animasi (hemat baterai). */
  animated?: boolean;
  /** Skala keseluruhan (meja lebih besar dari beanbag). */
  scale?: number;
  /** 'seated' = duduk di kursi, 'walking' = melayang antar kursi. */
  pose?: 'seated' | 'walking';
};

/** Cincin status (0.9.8, dipertahankan): hijau saat bekerja, abu saat diam. */
const RING_INNER = 0.38;
const RING_OUTER = 0.5;
const RING_WORKING_COLOR = '#22c55e';
const RING_IDLE_COLOR = '#64748b';

/** Cincin status di lantai di bawah karakter (denyut saat bekerja). */
export function StatusRing({
  working = false,
  animated = true,
  scale = 1,
  position = [0, 0.02, 0] as [number, number, number],
}: {
  working?: boolean;
  animated?: boolean;
  scale?: number;
  position?: [number, number, number];
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  useFrame((_, delta) => {
    if (!animated || !ringRef.current) return;
    clock.current += delta;
    const s = working ? 1 + Math.sin(clock.current * 3) * 0.1 : 1;
    ringRef.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ringRef} position={position} rotation={[-Math.PI / 2, 0, 0]} scale={scale}>
      <ringGeometry args={[RING_INNER, RING_OUTER, 32]} />
      <meshBasicMaterial
        color={working ? RING_WORKING_COLOR : RING_IDLE_COLOR}
        transparent
        opacity={working ? 0.75 : 0.35}
      />
    </mesh>
  );
}

export type LathePoint = { x: number; y: number };

/**
 * Profil lathe tiap varian blob (x = radius, y = tinggi; semua
 * setinggi 0.94 supaya jangkar nameplate seragam). Varian 0 = kubah
 * (profil asli 0.9.8, dari tes deckOverlay); 1 tetesan, 2 jamur,
 * 3 gelombang, 4 berkaki — siluet hantu yang berbeda-beda.
 */
export function ghostProfile(variant: number): readonly LathePoint[] {
  switch (((variant % 5) + 5) % 5) {
    case 1: // Tetesan: bawah ramping, tengah penuh, atas meruncing.
      return [
        { x: 0.02, y: 0 },
        { x: 0.24, y: 0.05 },
        { x: 0.31, y: 0.3 },
        { x: 0.3, y: 0.55 },
        { x: 0.2, y: 0.8 },
        { x: 0.02, y: 0.94 },
      ];
    case 2: // Jamur: batang ramping, tudung lebar.
      return [
        { x: 0.02, y: 0 },
        { x: 0.17, y: 0.06 },
        { x: 0.19, y: 0.35 },
        { x: 0.3, y: 0.6 },
        { x: 0.34, y: 0.78 },
        { x: 0.2, y: 0.9 },
        { x: 0.02, y: 0.94 },
      ];
    case 3: // Gelombang: sisi berombak.
      return [
        { x: 0.02, y: 0 },
        { x: 0.3, y: 0.05 },
        { x: 0.25, y: 0.25 },
        { x: 0.32, y: 0.45 },
        { x: 0.26, y: 0.65 },
        { x: 0.3, y: 0.8 },
        { x: 0.02, y: 0.94 },
      ];
    case 4: // Berkaki: bawah berombak (kaki kecil dari depan).
      return [
        { x: 0.02, y: 0 },
        { x: 0.28, y: 0.04 },
        { x: 0.24, y: 0.18 },
        { x: 0.3, y: 0.38 },
        { x: 0.27, y: 0.6 },
        { x: 0.16, y: 0.85 },
        { x: 0.02, y: 0.94 },
      ];
    case 0:
    default: // Kubah (profil asli 0.9.8).
      return [
        { x: 0.02, y: 0 },
        { x: 0.3, y: 0.04 },
        { x: 0.33, y: 0.38 },
        { x: 0.28, y: 0.6 },
        { x: 0.14, y: 0.88 },
        { x: 0.02, y: 0.94 },
      ];
  }
}

export function Ghost3D({
  botId,
  working = false,
  animated = true,
  scale = 1,
  pose = 'seated',
}: Ghost3DProps) {
  const color = useMemo(() => ghostColor(botId), [botId]);
  const profile = useMemo(() => ghostProfile(blobStyleFor(botId).variant), [botId]);
  const points = useMemo(
    () => profile.map((p) => new THREE.Vector2(p.x, p.y)),
    [profile],
  );
  // Posisi wajah di permukaan kubah (tiap varian beda lebar).
  const eyeZ = radiusAt(profile, GHOST_EYE_Y) - 0.01;
  const mouthZ = radiusAt(profile, GHOST_MOUTH_Y) - 0.005;

  const animRef = useRef<THREE.Group>(null);
  const clock = useRef(0);
  useFrame((_, delta) => {
    if (!animated || !animRef.current) return;
    clock.current += delta;
    const t = clock.current;
    const g = animRef.current;
    if (pose === 'walking') {
      // Melayang: bob + condong ke depan + goyang halus.
      g.position.y = Math.abs(Math.sin(t * 6)) * 0.05;
      g.rotation.x = 0.08;
      g.rotation.z = Math.sin(t * 3) * 0.04;
      g.scale.set(1, 1, 1);
    } else if (working) {
      // Bekerja: angguk cepat + bob mengetik.
      g.rotation.x = Math.sin(t * 9) * 0.05;
      g.position.y = Math.sin(t * 9) * 0.012;
      g.scale.set(1, 1 + Math.sin(t * 9) * 0.008, 1);
    } else {
      // Diam: napas pelan + goyang kepala halus.
      g.scale.set(1, 1 + Math.sin(t * 1.6) * 0.02, 1);
      g.position.y = Math.sin(t * 1.6) * 0.02;
      g.rotation.x = Math.sin(t * 0.7) * 0.02;
      g.rotation.z = 0;
    }
  });

  return (
    <group scale={scale}>
      <group ref={animRef}>
        {/* Badan blob (lathe). Emissive ringan: warna identitas tetap
            terbaca walau pencahayaan redup — blob 0.9.10 hilang di
            kursi gelap salah satunya karena warnanya meredup. */}
        <mesh>
          <latheGeometry args={[points, 28]} />
          <meshStandardMaterial
            color={color}
            roughness={0.55}
            emissive={color}
            emissiveIntensity={0.22}
          />
        </mesh>
        {/* Mata gelap + highlight putih (0.10.1: radius 0.06, dulu
            0.05 — mata harus terbaca di layar HP). */}
        <mesh position={[-0.11, GHOST_EYE_Y, eyeZ]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshStandardMaterial color="#161616" roughness={0.4} />
        </mesh>
        <mesh position={[0.11, GHOST_EYE_Y, eyeZ]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshStandardMaterial color="#161616" roughness={0.4} />
        </mesh>
        <mesh position={[-0.092, GHOST_EYE_Y + 0.03, eyeZ + 0.04]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.128, GHOST_EYE_Y + 0.03, eyeZ + 0.04]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Mulut senyum (busur torus, diputar 180°; 0.10.1: radius
            0.075, dulu 0.06). */}
        <mesh position={[0, GHOST_MOUTH_Y, mouthZ]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.075, 0.016, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#161616" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
