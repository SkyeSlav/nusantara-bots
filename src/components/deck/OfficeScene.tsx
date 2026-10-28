/**
 * Kantor isometrik 3D (deck) — React Three Fiber.
 *
 * Ruangan sudut: lantai sage green + dua dinding krem hangat,
 * jendela besar dengan pemandangan taman hijau + matahari/bulan,
 * 4 meja kayu terang + 1 sofa oranye, rak buku, 2 tanaman, lampu
 * lantai hangat, dispenser, karpet berpola + meja kopi. Semua model
 * dari kode (geometri low-poly) — tanpa aset eksternal.
 *
 * Kamera orthographic (isometrik) dengan zoom yang menyesuaikan
 * ukuran layar (CameraRig). Siklus siang–malam dari prop `palette`
 * (dihitung DeckScreen dari jam beneran): langit, matahari/bulan,
 * lampu, dan jendela kota yang menyala mengikuti palet.
 *
 * Aktivitas NYATA: tiap kursi diisi bot dari `characters` (yang
 * bekerja didahulukan, maks 5 kursi); `working[botId]` dari presence
 * server menggerakkan blob-nya (ngetik saat kerja, napas saat diam).
 * Tidak ada aktivitas yang dikarang.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import type { OrthographicCamera } from 'three';
import * as THREE from 'three';
import type { Character } from '../../api/types';
import type { DayPalette } from '../../api/dayphase';
import {
  BEACON_STALE_AFTER_SECONDS,
  botStateLabel,
  bubbleText,
  nameplateAnchorY,
  nameplateLift,
  projectAnchor,
  seatGhostPosition,
  shortName,
  statusTagAnchorY,
  type BotStateLabel,
  type BeresEntry,
  type DeckOverlayItem,
} from '../../api/deckOverlay';
import type { BeaconEntry } from '../../api/presence';
import {
  WALK_DURATION,
  freeSeats,
  nextSeatMap,
  walkPositionAt,
  type SeatMap,
  type WalkEndpoints,
} from '../../api/deckSeats';
import { DeskSpot } from './DeskSpot';
import { GHOST_BEANBAG_SCALE, GHOST_DESK_SCALE, StatusRing } from './Ghost3D';
import { DeckCharacter } from './RoleCharacter';
import { ghostColor } from '../../api/blob';
import { ROOM_PALETTE } from '../../api/roomPalette';

export type OfficeSceneProps = {
  characters: Character[];
  /** {botId: sedang bekerja} dari GET /api/presence. */
  working: Record<string, boolean>;
  /** false = matikan animasi 3D (hemat baterai). */
  animated?: boolean;
  palette: DayPalette;
  /** {botId: catatan tugas dari beacon presence} — isi speech bubble. */
  notes?: Record<string, string>;
  /** {botId: beacon presence mentah} — sumber status tag (§18.3). */
  beacons?: Record<string, BeaconEntry>;
  /** {botId: cap masih ada} dari /api/costs/cap-check — false = BUDGET HABIS. */
  capAllowed?: Record<string, boolean>;
  /** {botId: tugas yang baru selesai} — bubble "Beres: <tugas>" (§18.7). */
  beresTasks?: Record<string, BeresEntry>;
  /** Dipanggil saat posisi layar nameplate/bubble berubah (untuk overlay RN). */
  onOverlays?: (items: DeckOverlayItem[]) => void;
};

const FLOOR_W = 8;
const FLOOR_D = 6;
const WALL_H = 3.5;
/** Palette pastel 0.10.4 (Sam 22:29 — "Bikin pastel kayak referensi"). */
const WALL_COLOR = ROOM_PALETTE.wall;
const FLOOR_COLOR = ROOM_PALETTE.floor;
const RUG_COLOR = ROOM_PALETTE.rug;

type Spot = { kind: 'desk' | 'beanbag'; x: number; z: number };
const SPOTS: Spot[] = [
  { kind: 'desk', x: -2.8, z: -2.3 },
  { kind: 'desk', x: 2.4, z: -2.3 },
  { kind: 'desk', x: -2.8, z: 0.7 },
  { kind: 'desk', x: 2.4, z: 0.7 },
  { kind: 'beanbag', x: 0.2, z: 2.35 },
];

/** Zoom orthographic menyesuaikan ukuran layar agar ruangan muat. */
function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0.9, 0);
    const zoom = Math.max(20, Math.min(80, Math.min(size.width / 13, size.height / 8)));
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

/** Satu kursi + jangkar nameplate di atas kepala karakter + jangkar status tag di bawahnya. */
type OverlaySeat = {
  botId: string;
  name: string;
  working: boolean;
  note: string;
  /** Tugas yang baru selesai ('' = tidak ada bubble "Beres:"). */
  beresTask: string;
  anchor: { x: number; y: number; z: number };
  tagAnchor: { x: number; y: number; z: number };
  statusLabel: BotStateLabel;
  statusLive: boolean;
};

/**
 * Proyeksikan jangkar nameplate tiap kursi ke fraksi layar dan
 * laporkan ke parent (DeckScreen) supaya nameplate + speech bubble
 * bisa dirender sebagai View RN di atas Canvas.
 *
 * Kenapa bukan Text 3D: @react-three/drei TIDAK terpasang (troika
 * Text butuh font eksternal + dependensi baru), dan RN tidak punya
 * canvas 2D untuk CanvasTexture. Overlay RN = teks native yang tajam,
 * tanpa dependensi baru.
 *
 * Kamera sudah siap ditandai zoom > 1 (CameraRig selalu set zoom
 * 20-80; zoom default 1). Laporan hanya dikirim saat hasilnya
 * berubah (dibandingkan sebagai string) supaya tidak memicu
 * re-render tiap frame. Bila `animated` false, frameloop 'never'
 * mematikan useFrame — karena itu laporan juga dijalankan dari
 * useEffect (efek jalan walau frameloop mati).
 */
function OverlayProjector({
  seats,
  onOverlays,
}: {
  seats: OverlaySeat[];
  onOverlays?: (items: DeckOverlayItem[]) => void;
}) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const reportedRef = useRef(false);
  const lastKeyRef = useRef('');

  const report = useCallback(() => {
    if (!onOverlays) return;
    // Kamera belum diset CameraRig: jangan laporkan posisi salah.
    if (camera.zoom <= 1) return;
    const items: DeckOverlayItem[] = [];
    for (const s of seats) {
      const p = projectAnchor(s.anchor, (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return { x: v.x, y: v.y, z: v.z };
      });
      if (!p) continue;
      const tag = projectAnchor(s.tagAnchor, (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return { x: v.x, y: v.y, z: v.z };
      });
      items.push({
        botId: s.botId,
        name: shortName(s.name),
        working: s.working,
        bubble: bubbleText(s.note, s.working, s.beresTask),
        x: p.x,
        y: p.y,
        statusTag: tag
          ? { label: s.statusLabel, live: s.statusLive, x: tag.x, y: tag.y }
          : undefined,
      });
    }
    const key = JSON.stringify(
      items.map((i) => [
        i.botId,
        i.x.toFixed(3),
        i.y.toFixed(3),
        i.working,
        i.bubble,
        i.statusTag?.label,
        i.statusTag?.live,
        i.statusTag?.x.toFixed(3),
        i.statusTag?.y.toFixed(3),
      ]),
    );
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    reportedRef.current = true;
    onOverlays(items);
  }, [camera, seats, onOverlays]);

  useEffect(() => {
    report();
  }, [report, size]);

  useFrame(() => {
    if (!reportedRef.current) report();
  });

  return null;
}

/** Langit + matahari/bulan + TAMAN HIJAU di balik jendela (0.10.4).
    Dulu pemandangan kota (gedung gelap) — sekarang taman: pohon
    (batang + tajuk bola), semak, bunga. Langit + matahari/bulan
    tetap dari palette siang–malam §17.2 (tidak diubah). */
function GardenBackdrop({ palette }: { palette: DayPalette }) {
  const trees = useMemo(
    () => [
      { x: -3.1, h: 1.9, c: ROOM_PALETTE.leaf },
      { x: -1.6, h: 1.5, c: ROOM_PALETTE.leafLight },
      { x: -0.2, h: 2.2, c: ROOM_PALETTE.leafDark },
      { x: 1.4, h: 1.7, c: ROOM_PALETTE.leaf },
      { x: 2.9, h: 2.0, c: ROOM_PALETTE.leafLight },
    ],
    [],
  );
  const bushes = useMemo(
    () => [
      { x: -3.4, r: 0.32, c: ROOM_PALETTE.leafDark },
      { x: -2.4, r: 0.26, c: ROOM_PALETTE.leaf },
      { x: 0.4, r: 0.3, c: ROOM_PALETTE.leafLight },
      { x: 1.9, r: 0.26, c: ROOM_PALETTE.leaf },
      { x: 3.3, r: 0.32, c: ROOM_PALETTE.leafDark },
    ],
    [],
  );
  const flowers = useMemo(
    () => [
      { x: -2.9, c: ROOM_PALETTE.flower },
      { x: -0.9, c: '#ffffff' },
      { x: 0.9, c: ROOM_PALETTE.flower },
      { x: 2.5, c: '#ffffff' },
    ],
    [],
  );
  return (
    <group>
      {/* Langit (bidang besar di belakang jendela). */}
      <mesh position={[0, 2, -3.7]}>
        <planeGeometry args={[9, 5]} />
        <meshBasicMaterial color={palette.sky} />
      </mesh>
      {/* Matahari/bulan. */}
      <mesh position={[2.6, 3.1, -3.55]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color={palette.sun} />
      </mesh>
      {/* Pohon: batang + tajuk (2 bola). */}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, -3.45]}>
          <mesh position={[0, t.h / 2, 0]}>
            <cylinderGeometry args={[0.09, 0.12, t.h, 8]} />
            <meshStandardMaterial color={ROOM_PALETTE.trunk} roughness={0.9} />
          </mesh>
          <mesh position={[0, t.h + 0.25, 0]}>
            <sphereGeometry args={[0.55, 12, 10]} />
            <meshStandardMaterial color={t.c} roughness={0.9} />
          </mesh>
          <mesh position={[0.3, t.h + 0.05, 0]}>
            <sphereGeometry args={[0.38, 12, 10]} />
            <meshStandardMaterial color={ROOM_PALETTE.leafLight} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Semak di kaki jendela. */}
      {bushes.map((b, i) => (
        <mesh key={i} position={[b.x, b.r * 0.7, -3.4]}>
          <sphereGeometry args={[b.r, 10, 8]} />
          <meshStandardMaterial color={b.c} roughness={0.9} />
        </mesh>
      ))}
      {/* Bunga kecil di antara semak. */}
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0, -3.38]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
            <meshStandardMaterial color={ROOM_PALETTE.leafDark} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color={f.c} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Lantai, dinding sudut, jendela (dengan kusen), karpet. */
function Room() {
  return (
    <group>
      {/* Lantai. */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[FLOOR_W, 0.2, FLOOR_D]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.8} />
      </mesh>
      {/* Dinding belakang (z=-3) — 4 segmen di sekitar jendela (x -2..2, y 1.2..3.0). */}
      <mesh position={[-3, WALL_H / 2, -3]}>
        <boxGeometry args={[2, WALL_H, 0.15]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[3, WALL_H / 2, -3]}>
        <boxGeometry args={[2, WALL_H, 0.15]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, -3]}>
        <boxGeometry args={[4, 1.2, 0.15]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.25, -3]}>
        <boxGeometry args={[4, 0.5, 0.15]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      {/* Kusen jendela + tiang tengah. */}
      <mesh position={[0, 2.1, -2.95]}>
        <boxGeometry args={[4.1, 0.08, 0.06]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.24, -2.95]}>
        <boxGeometry args={[4.1, 0.08, 0.06]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.1, -2.95]}>
        <boxGeometry args={[0.08, 1.9, 0.06]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      {/* Dinding kiri (x=-4). */}
      <mesh position={[-4, WALL_H / 2, 0]}>
        <boxGeometry args={[0.15, WALL_H, FLOOR_D]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      {/* Karpet tengah + panel pola krem di atasnya. */}
      <mesh position={[0, 0.015, 0.3]}>
        <boxGeometry args={[3.0, 0.03, 2.0]} />
        <meshStandardMaterial color={RUG_COLOR} roughness={1} />
      </mesh>
      <mesh position={[0, 0.035, 0.3]}>
        <boxGeometry args={[2.5, 0.015, 1.5]} />
        <meshStandardMaterial color={ROOM_PALETTE.rugInner} roughness={1} />
      </mesh>
    </group>
  );
}

/** Perabot: rak buku kayu terang, tanaman, dispenser, meja kopi,
    jam dinding, lampu lantai hangat (0.10.4).
    `lampGlow` 0–1 dari palette siang–malam: kap + bola lampu
    menyala sore/malam, redup siang. */
function Furniture({ lampGlow = 0 }: { lampGlow?: number }) {
  const books = ['#b5524c', '#2dd4bf', '#f5c542', '#7c6ff0', '#4ade80', '#f472b6'];
  return (
    <group>
      {/* Rak buku kayu terang di dinding kiri. */}
      <group position={[-3.65, 0, 1.6]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[0.35, 2.1, 1.5]} />
          <meshStandardMaterial color={ROOM_PALETTE.woodDark} roughness={0.8} />
        </mesh>
        {[0.55, 1.05, 1.55].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.32, 0.05, 1.4]} />
            <meshStandardMaterial color="#a08055" roughness={0.8} />
          </mesh>
        ))}
        {books.map((c, i) => (
          <mesh
            key={i}
            position={[-0.05, 0.32 + (i % 3) * 0.5 + 0.12, -0.5 + (i % 4) * 0.32]}
          >
            <boxGeometry args={[0.2, 0.24, 0.22]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Tanaman di dekat jendela. */}
      <group position={[-3.5, 0, -2.5]}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.22, 0.17, 0.36, 14]} />
          <meshStandardMaterial color={ROOM_PALETTE.pot} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <sphereGeometry args={[0.3, 12, 10]} />
          <meshStandardMaterial color={ROOM_PALETTE.leaf} roughness={0.8} />
        </mesh>
        <mesh position={[0.18, 0.48, 0.1]}>
          <sphereGeometry args={[0.2, 12, 10]} />
          <meshStandardMaterial color={ROOM_PALETTE.leafLight} roughness={0.8} />
        </mesh>
        <mesh position={[-0.16, 0.5, -0.08]}>
          <sphereGeometry args={[0.18, 12, 10]} />
          <meshStandardMaterial color={ROOM_PALETTE.leafDark} roughness={0.8} />
        </mesh>
      </group>
      {/* Tanaman kecil kedua — di sudut kanan dekat dispenser. */}
      <group position={[3.5, 0, -2.5]}>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.17, 0.13, 0.28, 14]} />
          <meshStandardMaterial color={ROOM_PALETTE.pot} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.48, 0]}>
          <sphereGeometry args={[0.24, 12, 10]} />
          <meshStandardMaterial color={ROOM_PALETTE.leafDark} roughness={0.8} />
        </mesh>
        <mesh position={[0.14, 0.36, 0.08]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color={ROOM_PALETTE.leaf} roughness={0.8} />
        </mesh>
      </group>
      {/* Lampu lantai hangat (0.10.4) — tiang + kap + bola menyala.
          Posisi sudut kanan-depan, bebas dari meja/kursi/beanbag. */}
      <group position={[3.55, 0, 1.7]}>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.16, 0.18, 0.06, 14]} />
          <meshStandardMaterial color="#6b5b45" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.55, 8]} />
          <meshStandardMaterial color="#6b5b45" roughness={0.6} />
        </mesh>
        {/* Kap lampu (kerucut terbalik, krem hangat). */}
        <mesh position={[0, 1.68, 0]}>
          <cylinderGeometry args={[0.16, 0.3, 0.32, 14, 1, true]} />
          <meshStandardMaterial
            color={ROOM_PALETTE.lampShade}
            roughness={0.7}
            emissive={ROOM_PALETTE.lampShade}
            emissiveIntensity={0.15 + lampGlow * 0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Bola lampu + halo (nyala ikut lampGlow). */}
        <mesh position={[0, 1.58, 0]}>
          <sphereGeometry args={[0.09, 12, 10]} />
          <meshBasicMaterial color="#ffd9a0" transparent opacity={0.35 + lampGlow * 0.65} />
        </mesh>
        <mesh position={[0, 1.58, 0]}>
          <sphereGeometry args={[0.22, 12, 10]} />
          <meshBasicMaterial color="#ffd9a0" transparent opacity={0.08 + lampGlow * 0.3} />
        </mesh>
      </group>
      {/* Dispenser air. */}
      <group position={[3.65, 0, -1.2]}>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[0.42, 1.1, 0.42]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.22, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.35, 14]} />
          <meshStandardMaterial color="#7dd3fc" roughness={0.3} transparent opacity={0.85} />
        </mesh>
      </group>
      {/* Meja kopi kayu terang di atas karpet. */}
      <group position={[0, 0, 0.3]}>
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[1.3, 0.06, 0.7]} />
          <meshStandardMaterial color={ROOM_PALETTE.woodDark} roughness={0.8} />
        </mesh>
        <mesh position={[-0.5, 0.16, 0]}>
          <boxGeometry args={[0.08, 0.32, 0.6]} />
          <meshStandardMaterial color="#a08055" roughness={0.8} />
        </mesh>
        <mesh position={[0.5, 0.16, 0]}>
          <boxGeometry args={[0.08, 0.32, 0.6]} />
          <meshStandardMaterial color="#a08055" roughness={0.8} />
        </mesh>
        <mesh position={[0.3, 0.4, 0.1]}>
          <cylinderGeometry args={[0.06, 0.05, 0.1, 12]} />
          <meshStandardMaterial color="#2dd4bf" roughness={0.5} />
        </mesh>
      </group>
      {/* Jam dinding di dinding belakang. */}
      <group position={[3.2, 2.6, -2.9]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.05, 24]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 8]} />
          <meshStandardMaterial color="#111111" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Sofa oranye lembut (0.10.4 — dulu beanbag kuning) + bantal krem +
    laptop + karakter yang duduk santai. Spot "sofa" §18.7. */
function BeanbagSpot({
  botId,
  role = null,
  working,
  animated,
  position,
}: {
  botId: string | null;
  role?: string | null;
  working: boolean;
  animated: boolean;
  position: [number, number];
}) {
  const [x, z] = position;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.28, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.55, 18, 14]} />
        <meshStandardMaterial color={ROOM_PALETTE.sofa} roughness={0.9} />
      </mesh>
      {/* Bantal krem di sisi sofa. */}
      <mesh position={[-0.42, 0.42, 0.15]} rotation={[0, 0, 0.5]} scale={[1, 1, 0.45]}>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color={ROOM_PALETTE.pillow} roughness={0.95} />
      </mesh>
      {/* Laptop di atas beanbag. */}
      <group position={[0, 0.52, 0.28]} rotation={[-0.5, 0.3, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.03, 0.35]} />
          <meshStandardMaterial color="#333333" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.14, -0.14]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[0.5, 0.32, 0.03]} />
          <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.14, -0.12]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.44, 0.26]} />
          <meshBasicMaterial color="#cfe8ff" />
        </mesh>
      </group>
      {botId ? (
        <group position={[0, 0.52, -0.05]} rotation={[-0.18, Math.PI / 4, 0]}>
          <DeckCharacter botId={botId} role={role} working={working} animated={animated} scale={GHOST_BEANBAG_SCALE} pose="seated" />
        </group>
      ) : null}
      {/* Cincin status di lantai, agak lebar supaya kelihatan di
          sekeliling beanbag (bukan tertutup beanbag). */}
      {botId ? (
        <StatusRing working={working} animated={animated} scale={GHOST_BEANBAG_SCALE * 0.8} position={[0, 0.02, 0]} />
      ) : null}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

/** Satu bot yang sedang jalan: dari kursi asal ke kursi tujuan. */
type WalkState = {
  botId: string;
  fromSeat: number;
  toSeat: number;
  /** Arah hadap (rotation.y) — dihitung dari arah gerak. */
  facing: number;
  /** Skala karakter (ikut kursi asal: meja GHOST_DESK_SCALE, beanbag GHOST_BEANBAG_SCALE). */
  scale: number;
};

/**
 * Penggerak jalan (di dalam Canvas): memajukan progres jalan tiap
 * frame, melaporkan posisi hidup (throttle ~10 Hz) supaya nameplate
 * mengikuti, dan memanggil onDone saat tiba. Bila tidak ada jalan
 * aktif, diam (progress direset).
 */
function WalkDriver({
  walk,
  onTick,
  onDone,
}: {
  walk: (WalkState & WalkEndpoints) | null;
  onTick: (botId: string, x: number, y: number, z: number) => void;
  onDone: (botId: string, toSeat: number) => void;
}) {
  const progressRef = useRef(0);
  const lastTickRef = useRef(0);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  useFrame((state, delta) => {
    const w = walkRef.current;
    if (!w) {
      progressRef.current = 0;
      return;
    }
    progressRef.current += delta / WALK_DURATION;
    const p = Math.min(1, progressRef.current);
    const now = state.clock.elapsedTime;
    if (now - lastTickRef.current > 0.1 || p >= 1) {
      lastTickRef.current = now;
      const pos = walkPositionAt(w, p);
      onTick(w.botId, pos.x, pos.y, pos.z);
    }
    if (p >= 1) {
      progressRef.current = 0;
      onDone(w.botId, w.toSeat);
    }
  });
  return null;
}

function SceneContent({
  characters,
  working,
  animated,
  palette,
  notes,
  beacons,
  capAllowed,
  beresTasks,
  onOverlays,
}: {
  characters: Character[];
  working: Record<string, boolean>;
  animated: boolean;
  palette: DayPalette;
  notes?: Record<string, string>;
  beacons?: Record<string, BeaconEntry>;
  capAllowed?: Record<string, boolean>;
  beresTasks?: Record<string, BeresEntry>;
  onOverlays?: (items: DeckOverlayItem[]) => void;
}) {
  // Peta kursi persisten (bot → nomor kursi). Kursi tidak berubah
  // walau status kerja berubah — ini yang memungkinkan karakter
  // berjalan antar kursi tanpa kursinya tertukar di tengah jalan.
  const [seatMap, setSeatMap] = useState<SeatMap>({});
  const [walk, setWalk] = useState<(WalkState & WalkEndpoints) | null>(null);
  const [walkPos, setWalkPos] = useState<{ botId: string; x: number; y: number; z: number } | null>(null);
  const seatMapRef = useRef(seatMap);
  seatMapRef.current = seatMap;
  const walkRef = useRef(walk);
  walkRef.current = walk;

  // Sinkronkan peta kursi saat bot datang/pergi (bot lama kursinya tetap).
  useEffect(() => {
    setSeatMap((prev) => nextSeatMap(prev, characters, working, SPOTS.length));
  }, [characters, working]);

  // Bila animasi dimatikan di tengah jalan, batalkan jalan (bot
  // kembali ke kursinya — tanpa teleport aneh saat animasi nyala lagi).
  useEffect(() => {
    if (!animated && walkRef.current) {
      setWalk(null);
      setWalkPos(null);
    }
  }, [animated]);

  // Jalan-jalan berkala: tiap 14 detik, satu bot acak pindah ke
  // kursi kosong acak (hanya bila ada ≥2 bot + ada kursi kosong).
  useEffect(() => {
    if (!animated) return;
    const timer = setInterval(() => {
      if (walkRef.current) return;
      const map = seatMapRef.current;
      const free = freeSeats(map, SPOTS.length);
      const seatedIds = Object.keys(map);
      if (free.length === 0 || seatedIds.length < 2) return;
      const botId = seatedIds[Math.floor(Math.random() * seatedIds.length)];
      const toSeat = free[Math.floor(Math.random() * free.length)];
      const fromSeat = map[botId];
      if (fromSeat === undefined || fromSeat === toSeat) return;
      const from = seatCharacterPos(fromSeat);
      const to = seatCharacterPos(toSeat);
      const facing = Math.atan2(to.x - from.x, to.z - from.z);
      const scale = SPOTS[fromSeat].kind === 'beanbag' ? GHOST_BEANBAG_SCALE : GHOST_DESK_SCALE;
      const fromY = SPOTS[fromSeat].kind === 'beanbag' ? 0.52 : 0.47;
      const toY = SPOTS[toSeat].kind === 'beanbag' ? 0.52 : 0.47;
      setWalk({ botId, fromSeat, toSeat, facing, scale, from, to, fromY, toY });
      setWalkPos({ botId, x: from.x, y: fromY, z: from.z });
    }, 14000);
    return () => clearInterval(timer);
  }, [animated]);

  const handleWalkTick = useCallback((botId: string, x: number, y: number, z: number) => {
    setWalkPos({ botId, x, y, z });
  }, []);

  const handleWalkDone = useCallback((botId: string, toSeat: number) => {
    setSeatMap((prev) => ({ ...prev, [botId]: toSeat }));
    setWalk(null);
    setWalkPos(null);
  }, []);

  // Bot di satu kursi (null = kosong; bot yang sedang jalan tidak
  // dihitung duduk di kursi mana pun selama transit).
  const botAtSeat = useCallback(
    (seatIndex: number): Character | null => {
      const walkingId = walk?.botId ?? null;
      for (const bot of characters) {
        if (bot.id === walkingId) continue;
        if (seatMap[bot.id] === seatIndex) return bot;
      }
      return null;
    },
    [characters, seatMap, walk],
  );

  // Jangkar nameplate tiap kursi (posisi karakter + tinggi di atas
  // kepala) + jangkar status tag (di bawah karakter, §18.3).
  // Karakter jalan: kedua jangkar mengikuti posisi hidupnya.
  // Tambah lift selang-seling per kursi supaya nameplate tidak
  // bertumpuk persis di garis yang sama.
  const overlaySeats = useMemo<OverlaySeat[]>(() => {
    const seats: OverlaySeat[] = [];
    const walkingId = walk?.botId ?? null;
    for (const bot of characters) {
      const seat = seatMap[bot.id];
      if (seat === undefined) continue;
      const entry = beacons?.[bot.id];
      const statusLabel = botStateLabel(
        entry,
        BEACON_STALE_AFTER_SECONDS,
        capAllowed?.[bot.id],
      );
      const statusLive = !!entry;
      const beresTask = beresTasks?.[bot.id]?.task ?? '';
      const isWalking = bot.id === walkingId && walkPos?.botId === bot.id;
      if (isWalking && walkPos) {
        seats.push({
          botId: bot.id,
          name: bot.name,
          working: !!working[bot.id],
          note: notes?.[bot.id] ?? '',
          beresTask,
          anchor: {
            x: walkPos.x,
            y: nameplateAnchorY(walkPos.y, walk?.scale ?? GHOST_DESK_SCALE) + nameplateLift(seat),
            z: walkPos.z,
          },
          tagAnchor: {
            x: walkPos.x,
            y: statusTagAnchorY(walkPos.y),
            z: walkPos.z,
          },
          statusLabel,
          statusLive,
        });
      } else if (!isWalking) {
        const spot = SPOTS[seat];
        const scale = spot.kind === 'beanbag' ? GHOST_BEANBAG_SCALE : GHOST_DESK_SCALE;
        const baseY = spot.kind === 'beanbag' ? 0.52 : 0.47;
        const pos = seatCharacterPos(seat);
        seats.push({
          botId: bot.id,
          name: bot.name,
          working: !!working[bot.id],
          note: notes?.[bot.id] ?? '',
          beresTask,
          anchor: {
            x: pos.x,
            y: nameplateAnchorY(baseY, scale) + nameplateLift(seat),
            z: pos.z,
          },
          tagAnchor: {
            x: pos.x,
            y: statusTagAnchorY(baseY),
            z: pos.z,
          },
          statusLabel,
          statusLive,
        });
      }
    }
    return seats;
  }, [characters, seatMap, working, notes, beacons, capAllowed, beresTasks, walk, walkPos]);

  return (
    <>
      <ambientLight intensity={palette.ambient * 0.9} />
      <directionalLight
        position={[5, 8, 6]}
        color={palette.sunLight}
        intensity={palette.sunIntensity * 1.2}
      />
      {/* Lampu hangat — nyala di senja/malam. */}
      <pointLight
        position={[0, 3.0, -1]}
        color={palette.lamp}
        intensity={palette.lampGlow * 1.4}
        distance={9}
        decay={1.2}
      />
      <pointLight
        position={[0, 2.5, 1.8]}
        color={palette.lamp}
        intensity={palette.lampGlow * 0.9}
        distance={8}
        decay={1.2}
      />
      <GardenBackdrop palette={palette} />
      <Room />
      <Furniture lampGlow={palette.lampGlow} />
      {SPOTS.slice(0, 4).map((s, i) => {
        const bot = botAtSeat(i);
        return (
          <DeskSpot
            key={`desk-${i}`}
            position={[s.x, s.z]}
            botId={bot ? bot.id : null}
            role={bot ? bot.role : null}
            working={bot ? !!working[bot.id] : false}
            animated={animated}
            screenGlow={palette.lampGlow}
          />
        );
      })}
      <BeanbagSpot
        botId={botAtSeat(4) ? (botAtSeat(4) as Character).id : null}
        role={botAtSeat(4) ? (botAtSeat(4) as Character).role : null}
        working={botAtSeat(4) ? !!working[(botAtSeat(4) as Character).id] : false}
        animated={animated}
        position={[SPOTS[4].x, SPOTS[4].z]}
      />
      {/* Karakter yang sedang melayang antar kursi (0.10.3: Chief tetap
          RoleCharacter saat jalan). */}
      {walk && walkPos ? (
        <group position={[walkPos.x, walkPos.y, walkPos.z]} rotation={[0, walk.facing, 0]}>
          <DeckCharacter
            botId={walk.botId}
            role={characters.find((c) => c.id === walk.botId)?.role ?? null}
            working={false}
            animated={animated}
            scale={walk.scale}
            pose="walking"
          />
        </group>
      ) : null}
      {walk && walkPos ? (
        <StatusRing working={false} animated={animated} scale={walk.scale} position={[walkPos.x, 0.02, walkPos.z]} />
      ) : null}
      <WalkDriver
        walk={walk}
        onTick={(botId, x, y, z) => handleWalkTick(botId, x, y, z)}
        onDone={(botId, toSeat) => handleWalkDone(botId, toSeat)}
      />
      <OverlayProjector seats={overlaySeats} onOverlays={onOverlays} />
    </>
  );
}

/**
 * Posisi lantai karakter di satu kursi — SATU sumber kebenaran
 * (seatGhostPosition di deckOverlay): posisi ini HARUS sama dengan
 * posisi blob di DeskSpot/BeanbagSpot, kalau tidak nameplate dan
 * badan tidak sejajar (bug 0.10.0: DeskSpot memakai z + 0.75 lokal).
 */
function seatCharacterPos(seatIndex: number): { x: number; z: number } {
  const spot = SPOTS[seatIndex];
  if (!spot) return { x: 0, z: 0 };
  return seatGhostPosition(spot);
}

export function OfficeScene({
  characters,
  working,
  animated = true,
  palette,
  notes,
  beacons,
  capAllowed,
  beresTasks,
  onOverlays,
}: OfficeSceneProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [10, 10, 10], zoom: 30, near: 0.1, far: 100 }}
      frameloop={animated ? 'always' : 'never'}
      gl={{ antialias: true, powerPreference: 'low-power' }}
    >
      <CameraRig />
      <SceneContent
        characters={characters}
        working={working}
        animated={animated}
        palette={palette}
        notes={notes}
        beacons={beacons}
        capAllowed={capAllowed}
        beresTasks={beresTasks}
        onOverlays={onOverlays}
      />
    </Canvas>
  );
}

// Re-export warna blob untuk legenda (dipakai DeckScreen).
export { ghostColor };
