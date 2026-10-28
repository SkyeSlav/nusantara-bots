/**
 * Satu spot kerja di kantor: meja + kursi + monitor + cangkir +
 * penanda warna bot + blob hantu maskot yang duduk di kursi.
 *
 * Blob menghadap kamera (rotasi Y 45°) agar wajahnya terlihat —
 * seperti di video referensi, karakter terlihat dari sudut 3/4.
 * Monitor menghadap kamera juga (layar berpendar terlihat).
 * `screenGlow` 0–1 mengatur seberapa terang layar (malam = terang).
 *
 * Skala blob 0.10.2-final: 1.5 (0.10.1: 3.2 KEGEDAN kata Sam —
 * "gde bgd bro", raksasa menutupi kantor; 0.10.2-lama: 2.6 MASIH
 * kegedean; 0.10.2-tengah: 2.3 lolos ukur tapi visual masih
 * menjulang di atas monitor; 0.10.0: 2.0 kekecilan; patokan Sam
 * 18:49 "AI Virtual Office": karakter KECIL duduk di meja) — blob
 * seukuran orang kecil duduk di kursi: kepala + bahu di atas garis
 * meja, badan di belakang meja + posisi z DIPERBAIKI 0.10.1 (dulu
 * 2z + 0.75, blob meja belakang nyasar ke belakang dinding).
 * Pelajaran 0.9.10: chibi tidak terlihat, baju pink-nya nol piksel
 * di screenshot Sam.
 * Cincin status di lantai di bawah karakter (komponen StatusRing,
 * bukan di dalam karakter supaya tidak ikut naik-turun napas).
 */

import React from 'react';
import * as THREE from 'three';
import { GHOST_DESK_SCALE, StatusRing } from './Ghost3D';
import { DeckCharacter } from './RoleCharacter';
import { DESK_GHOST_LOCAL_Z } from '../../api/deckOverlay';
import { ghostColor } from '../../api/blob';

export type DeskSpotProps = {
  /** Posisi meja di lantai (x, z). */
  position: [number, number];
  /** Id bot yang duduk di sini (null = kursi kosong). */
  botId: string | null;
  /** Role bot dari server (menentukan karakter peran — Chief → bintang + epaulet). */
  role?: string | null;
  /** true = bot sedang bekerja (dari presence server). */
  working?: boolean;
  /** false = matikan animasi blob. */
  animated?: boolean;
  /** 0–1: seberapa terang layar monitor (dari palet siang-malam). */
  screenGlow?: number;
};

const WOOD = '#d9c1a3';
const WOOD_DARK = '#b08d64';
const SCREEN_DAY = '#cfe8ff';
const SCREEN_NIGHT = '#ffd9a0';
/** Kursi sage lembut (0.10.4 — dulu abu gelap). */
const CHAIR = '#7d8c6f';
const CHAIR_LEG = '#5c6b52';

function screenColor(glow: number): string {
  const a = new THREE.Color(SCREEN_DAY);
  const b = new THREE.Color(SCREEN_NIGHT);
  return `#${a.lerp(b, glow).getHexString()}`;
}

export function DeskSpot({ position, botId, role = null, working = false, animated = true, screenGlow = 0 }: DeskSpotProps) {
  const [x, z] = position;
  const tagColor = botId ? ghostColor(botId) : '#555555';
  const screen = screenColor(screenGlow);
  // Kursi + blob ada di sisi kamera meja (z + 0.75), menghadap kamera.
  // LOKAL z (relatif ke grup meja yang sudah di [x, 0, z]) — BUG 0.10.0
  // memakai z + 0.75 di sini sehingga z dunia jadi 2z + 0.75: meja
  // belakang → blob di belakang dinding (hanya selapis kelihatan
  // lewat jendela), meja depan → blob melayang 1.4 unit di depan
  // kursi. Lihat DESK_GHOST_LOCAL_Z di deckOverlay.ts.
  const ghostZ = DESK_GHOST_LOCAL_Z;
  return (
    <group position={[x, 0, z]}>
      {/* Meja: papan + 2 panel kaki. */}
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.95]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position={[-0.85, 0.35, 0]}>
        <boxGeometry args={[0.08, 0.7, 0.9]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[0.85, 0.35, 0]}>
        <boxGeometry args={[0.08, 0.7, 0.9]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      {/* Monitor: layar menghadap kamera (rotasi Y 45°), di atas stand. */}
      <group position={[0, 0.78, -0.18]} rotation={[0, Math.PI / 4, 0]}>
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.78, 0.5, 0.05]} />
          <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.32, 0.035]}>
          <planeGeometry args={[0.68, 0.42]} />
          <meshBasicMaterial color={screen} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.08, 0.1, 0.08]} />
          <meshStandardMaterial color="#333333" roughness={0.5} />
        </mesh>
      </group>
      {/* Keyboard tipis + cangkir. */}
      <mesh position={[0, 0.8, 0.22]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.55, 0.03, 0.2]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.6} />
      </mesh>
      <mesh position={[0.68, 0.86, 0.18]}>
        <cylinderGeometry args={[0.06, 0.05, 0.12, 12]} />
        <meshStandardMaterial color="#b5524c" roughness={0.5} />
      </mesh>
      {/* Penanda warna bot di atas meja (menghubungkan meja ↔ legenda). */}
      <mesh position={[-0.75, 0.95, -0.3]}>
        <boxGeometry args={[0.34, 0.2, 0.03]} />
        <meshStandardMaterial color={tagColor} roughness={0.5} />
      </mesh>
      {/* Kursi: dudukan + sandaran + kaki. */}
      <group position={[0, 0, 0.75]}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.55, 0.07, 0.5]} />
          <meshStandardMaterial color={CHAIR} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.72, -0.24]} rotation={[-0.12, 0, 0]}>
          <boxGeometry args={[0.55, 0.6, 0.07]} />
          <meshStandardMaterial color={CHAIR} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.07, 0.4, 0.07]} />
          <meshStandardMaterial color={CHAIR_LEG} roughness={0.6} />
        </mesh>
      </group>
      {/* Karakter duduk di kursi, menghadap kamera (0.10.3: Chief →
          RoleCharacter bintang + epaulet emas; peran lain tetap blob). */}
      {botId ? (
        <group position={[0, 0.47, ghostZ]} rotation={[0, Math.PI / 4, 0]}>
          <DeckCharacter botId={botId} role={role} working={working} animated={animated} scale={GHOST_DESK_SCALE} pose="seated" />
        </group>
      ) : null}
      {/* Cincin status di lantai di bawah kursi (denyut saat bekerja). */}
      {botId ? (
        <StatusRing working={working} animated={animated} scale={GHOST_DESK_SCALE * 0.8} position={[0, 0.02, ghostZ]} />
      ) : null}
      {/* Bayangan kontak di bawah meja + kursi (murah, tanpa shadow map). */}
      <mesh position={[0, 0.005, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.05, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}
