/**
 * Karakter peran chibi 3D (0.10.3 → 0.10.4) — bentuk, bukan blob.
 *
 * Sam 20:19 WIB: ukuran kecil saja belum cukup, dia mau BENTUK 3D
 * (pola referensi: tiap peran punya siluet + props beda total, peran
 * terbaca dari bentuknya saja). 0.10.3 membangun SATU peran dulu:
 * Chief (Xman) — bintang emas + epaulet emas di bahu. Peran lain
 * TETAP pakai Ghost3D sampai gilirannya (lihat resolveRoleKind).
 *
 * 0.10.4 (verdict Sam 22:27 "Lucu bro walaupun belum seperti"):
 * karakter jadi manusia chibi detail — rambut hitam (topi rambut di
 * atas kepala, bukan cangkang hitam polos), wajah kulit hangat,
 * baju (silinder meruncing + bar bahu, bukan bola), lengan + tangan
 * (mengetik saat working). Siluet peran dipertahankan: bintang +
 * epaulet emas Chief. Skala TETAP 1.5/1.3, tinggi total TETAP 0.94
 * (puncak rambut) — jangkar nameplate tidak berubah.
 *
 * Semua geometri dari primitif R3F (sphere/box/cylinder/extrude
 * dari titik bintang) — tanpa model/tekstur/aset eksternal. Warna
 * baju dari identitas bot (deterministik per botId, seperti Ghost3D);
 * wajah kulit hangat + rambut hitam sama untuk semua peran.
 *
 * Animasi (warisi 0.9.8, hormati `animated` + `working`): angguk
 * saat working, napas saat diam; tangan ikut bob mengetik saat
 * working; pose 'walking' = melayang seperti blob (karakter ini
 * tidak punya kaki).
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { ghostColor } from '../../api/blob';
import {
  ROLE_EPAULET_X,
  ROLE_EPAULET_Y,
  ROLE_EYE_Y,
  ROLE_HAIR_COLOR,
  ROLE_HAIR_TOP_Y,
  ROLE_HEAD_OUTLINE_SCALE,
  ROLE_HEAD_RADIUS,
  ROLE_HEAD_Y,
  ROLE_MOUTH_Y,
  ROLE_SHIRT_BOTTOM_RADIUS,
  ROLE_SHIRT_HEIGHT,
  ROLE_SHIRT_TOP_RADIUS,
  ROLE_SHIRT_Y,
  ROLE_SHOULDER_SCALE,
  ROLE_SHOULDER_Y,
  ROLE_SKIN_COLOR,
  ROLE_STAR_TILT_X,
  ROLE_STAR_Y,
  ROLE_STAR_Z,
  ROLE_TORSO_OUTLINE_SCALE,
  resolveRoleKind,
  starPoints,
  type RoleVariant,
} from '../../api/roleCharacter';
import { Ghost3D } from './Ghost3D';

export type RoleCharacterProps = {
  botId: string | null;
  /** 'chief' = bintang + epaulet emas; 'neutral' = chibi polos tanpa props. */
  variant?: RoleVariant;
  /** true = bot sedang bekerja (dari presence server). */
  working?: boolean;
  /** false = matikan animasi (hemat baterai). */
  animated?: boolean;
  /** Skala keseluruhan (meja 1.5 / beanbag 1.3 — sama seperti blob). */
  scale?: number;
  /** 'seated' = duduk di kursi, 'walking' = melayang antar kursi. */
  pose?: 'seated' | 'walking';
};

/** Emas Chief (bintang + epaulet). */
const GOLD = '#f5c542';
const GOLD_EMISSIVE = '#8a6d00';
/** Outline gelap (kepala + torso) + wajah — sama seperti blob. */
const DARK = '#161616';

/** Bintang emas di dada Chief (extrude dari titik bintang).
    Menempel di permukaan baju (kerucut) — miring ikut kemiringan
    kerucut supaya ujung bawah tidak tenggelam ke dalam baju. */
function ChiefStar() {
  const shape = useMemo(() => {
    const pts = starPoints(0.085, 0.036).map((p) => new THREE.Vector2(p.x, p.y));
    return new THREE.Shape(pts);
  }, []);
  return (
    <mesh position={[0, ROLE_STAR_Y, ROLE_STAR_Z]} rotation={[ROLE_STAR_TILT_X, 0, 0]}>
      <extrudeGeometry args={[shape, { depth: 0.02, bevelEnabled: false }]} />
      <meshStandardMaterial
        color={GOLD}
        metalness={0.55}
        roughness={0.35}
        emissive={GOLD_EMISSIVE}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

/** Epaulet emas di bahu Chief — kotak pipih miring + kancing ujung.
    Duduk di atas bar bahu (0.10.4), bukan di bola torso. */
function ChiefEpaulet({ side }: { side: -1 | 1 }) {
  return (
    <group position={[side * ROLE_EPAULET_X, ROLE_EPAULET_Y, 0.02]} rotation={[0, 0, side * -0.12]}>
      <mesh>
        <boxGeometry args={[0.22, 0.035, 0.14]} />
        <meshStandardMaterial
          color={GOLD}
          metalness={0.55}
          roughness={0.35}
          emissive={GOLD_EMISSIVE}
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh position={[side * 0.1, 0.005, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.55} roughness={0.35} />
      </mesh>
    </group>
  );
}

/**
 * Lengan + tangan (0.10.4): lengan baju (silinder warna baju) dari
 * bahu condong ke depan-bawah + tangan kulit di ujungnya, bertumpu
 * di pangkuan (di depan meja — karakter duduk menghadap kamera).
 * Saat working, lengan ikut bob mengetik (diputar dari `armRef`).
 */
function TypingArm({
  side,
  shirtColor,
  armRef,
}: {
  side: -1 | 1;
  shirtColor: string;
  armRef: React.Ref<THREE.Group>;
}) {
  return (
    <group ref={armRef} position={[side * 0.33, 0.38, 0.02]} rotation={[-0.45, 0, side * 0.28]}>
      {/* Lengan baju. */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.055, 0.05, 0.3, 10]} />
        <meshStandardMaterial color={shirtColor} roughness={0.6} emissive={shirtColor} emissiveIntensity={0.15} />
      </mesh>
      {/* Tangan kulit. */}
      <mesh position={[0, -0.32, 0]}>
        <sphereGeometry args={[0.062, 12, 10]} />
        <meshStandardMaterial color={ROLE_SKIN_COLOR} roughness={0.6} emissive={ROLE_SKIN_COLOR} emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

export function RoleCharacter({
  botId,
  variant = 'neutral',
  working = false,
  animated = true,
  scale = 1,
  pose = 'seated',
}: RoleCharacterProps) {
  // Variant asing (di luar 'chief'/'neutral') → bentuk dasar netral:
  // chibi polos, tanpa props — jangan pernah mengarang props.
  const v: RoleVariant = variant === 'chief' ? 'chief' : 'neutral';
  const color = useMemo(() => ghostColor(botId), [botId]);

  const animRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const clock = useRef(0);
  useFrame((_, delta) => {
    if (!animated || !animRef.current) return;
    clock.current += delta;
    const t = clock.current;
    const g = animRef.current;
    // Tangan mengetik saat working: bob kecil bergantian kiri-kanan.
    const typeBob = working ? Math.sin(t * 9) * 0.05 : 0;
    if (armLRef.current) armLRef.current.rotation.x = -0.45 + typeBob;
    if (armRRef.current) armRRef.current.rotation.x = -0.45 - typeBob;
    if (pose === 'walking') {
      // Melayang: bob + condong ke depan + goyang halus (sama seperti blob).
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
        {/* Outline torso: cangkang gelap di belakang baju — tepinya
            mengintip sebagai garis luar di sisi pinggang (lihat
            ROLE_TORSO_OUTLINE_SCALE). JANGAN pakai z 0.95: cangkang
            menelan baju + bintang dada (regresi 0.10.3-iterasi-1). */}
        <mesh position={[0, 0.24, -0.02]} scale={[ROLE_TORSO_OUTLINE_SCALE.x, ROLE_TORSO_OUTLINE_SCALE.y, ROLE_TORSO_OUTLINE_SCALE.z]}>
          <sphereGeometry args={[0.3, 20, 16]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
        {/* Baju (0.10.4): badan manusia — silinder meruncing bahu→
            pinggang, warna identitas bot (baju Xman = pink). Duduk:
            kaki tidak terlihat, di belakang meja. */}
        <mesh position={[0, ROLE_SHIRT_Y, 0]}>
          <cylinderGeometry args={[ROLE_SHIRT_TOP_RADIUS, ROLE_SHIRT_BOTTOM_RADIUS, ROLE_SHIRT_HEIGHT, 20]} />
          <meshStandardMaterial
            color={color}
            roughness={0.6}
            emissive={color}
            emissiveIntensity={0.22}
          />
        </mesh>
        {/* Bar bahu: garis bahu manusia di atas baju. */}
        <mesh position={[0, ROLE_SHOULDER_Y, 0]} scale={[ROLE_SHOULDER_SCALE.x, ROLE_SHOULDER_SCALE.y, ROLE_SHOULDER_SCALE.z]}>
          <sphereGeometry args={[0.3, 20, 16]} />
          <meshStandardMaterial
            color={color}
            roughness={0.6}
            emissive={color}
            emissiveIntensity={0.22}
          />
        </mesh>
        {/* Lengan + tangan (0.10.4) — mengetik saat working. */}
        <TypingArm side={-1} shirtColor={color} armRef={armLRef} />
        <TypingArm side={1} shirtColor={color} armRef={armRRef} />
        {/* Outline kepala: cangkang gelap di belakang kepala. */}
        <mesh position={[0, ROLE_HEAD_Y, -0.025]} scale={[ROLE_HEAD_OUTLINE_SCALE.x, ROLE_HEAD_OUTLINE_SCALE.y, ROLE_HEAD_OUTLINE_SCALE.z]}>
          <sphereGeometry args={[ROLE_HEAD_RADIUS, 24, 18]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
        {/* Kepala BESAR (chibi) — wajah KULIT HANGAT (0.10.4), bukan
            warna identitas: yang pink sekarang bajunya. */}
        <mesh position={[0, ROLE_HEAD_Y, 0]}>
          <sphereGeometry args={[ROLE_HEAD_RADIUS, 24, 18]} />
          <meshStandardMaterial
            color={ROLE_SKIN_COLOR}
            roughness={0.6}
            emissive={ROLE_SKIN_COLOR}
            emissiveIntensity={0.15}
          />
        </mesh>
        {/* Rambut hitam (0.10.4): topi rambut di atas kepala — kubah
            atas (thetaLength 0.45π) sehingga garis rambut jatuh tepat
            di atas mata, wajah tetap terbuka. Puncak = 0.94 = tinggi
            total karakter (ROLE_HAIR_TOP_Y). */}
        <mesh position={[0, ROLE_HAIR_TOP_Y - 0.31, -0.02]}>
          <sphereGeometry args={[0.31, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
          <meshStandardMaterial color={ROLE_HAIR_COLOR} roughness={0.75} />
        </mesh>
        {/* Mata besar gelap + highlight putih (permukaan kepala di
            y mata: z ≈ 0.297 — mata ditanam 0.027 ke dalam). */}
        <mesh position={[-0.11, ROLE_EYE_Y, 0.27]}>
          <sphereGeometry args={[0.055, 12, 10]} />
          <meshStandardMaterial color={DARK} roughness={0.4} />
        </mesh>
        <mesh position={[0.11, ROLE_EYE_Y, 0.27]}>
          <sphereGeometry args={[0.055, 12, 10]} />
          <meshStandardMaterial color={DARK} roughness={0.4} />
        </mesh>
        <mesh position={[-0.092, ROLE_EYE_Y + 0.025, 0.31]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.128, ROLE_EYE_Y + 0.025, 0.31]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Mulut senyum (busur torus, diputar 180°). */}
        <mesh position={[0, ROLE_MOUTH_Y, 0.26]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.07, 0.015, 8, 16, Math.PI]} />
          <meshStandardMaterial color={DARK} roughness={0.4} />
        </mesh>
        {/* Props Chief — HANYA bila variant chief. */}
        {v === 'chief' ? (
          <>
            <ChiefStar />
            <ChiefEpaulet side={-1} />
            <ChiefEpaulet side={1} />
          </>
        ) : null}
      </group>
    </group>
  );
}

/**
 * Satu titik pemilihan karakter di kursi: Chief → RoleCharacter,
 * peran lain (belum dibangun) → Ghost3D seperti semula. Dipakai
 * DeskSpot, BeanbagSpot, dan karakter yang sedang berjalan — satu
 * sumber kebenaran wiring, bukan switch yang disalin tiga kali.
 */
export function DeckCharacter({
  botId,
  role,
  working = false,
  animated = true,
  scale = 1,
  pose = 'seated',
}: {
  botId: string | null;
  role?: string | null;
  working?: boolean;
  animated?: boolean;
  scale?: number;
  pose?: 'seated' | 'walking';
}) {
  if (resolveRoleKind(role, botId) === 'chief') {
    return (
      <RoleCharacter
        botId={botId}
        variant="chief"
        working={working}
        animated={animated}
        scale={scale}
        pose={pose}
      />
    );
  }
  return (
    <Ghost3D botId={botId} working={working} animated={animated} scale={scale} pose={pose} />
  );
}
