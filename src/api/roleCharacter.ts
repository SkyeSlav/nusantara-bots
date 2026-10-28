/**
 * Resolusi peran → karakter 3D di deck (0.10.3).
 *
 * Tiap peran punya siluet + props yang beda total — peran terbaca dari
 * bentuknya saja, tanpa baca nameplate. Modul ini murni (tanpa three,
 * tanpa RN) supaya bisa dites seperti deckOverlay.
 *
 * Aturan resolusi (0.10.3):
 * - role server "Chief" (atau botId "xman" — satu-satunya Chief di
 *   server live) → 'chief' → komponen RoleCharacter (bintang + epaulet
 *   emas).
 * - Peran lain → null → TETAP pakai Ghost3D. Peran yang belum dibangun
 *   JANGAN fallback ke bentuk setengah jadi (keputusan §18.5 desain).
 * - "Chief Officer" adalah peran BERBEDA (dasi + kerah) — JANGAN
 *   dipetakan ke Chief; normalisasi memakai kata utuh, bukan prefix.
 *
 * Peran tak dikenal DI DALAM RoleCharacter (variant asing) → bentuk
 * dasar netral (chibi polos, tanpa props) — bukan blob, bukan props
 * karangan. Untuk 0.10.3 hanya Chief yang diimplementasi penuh.
 */

export type RoleVariant = 'chief' | 'neutral';

/**
 * Tinggi total karakter peran (lokal, sebelum scale) — SAMA dengan
 * tinggi profil blob 0.94, supaya jangkar nameplate
 * (nameplateAnchorY) dan tes visibilitas yang sama tetap berlaku:
 * puncak meja 0.47 + 0.94×1.5 = 1.88, mata di atas monitor.
 */
export const ROLE_CHARACTER_HEIGHT = 0.94;
/** Pusat kepala chibi (lokal). */
export const ROLE_HEAD_Y = 0.62;
/** Radius kepala chibi — kepala BESAR, proporsi chibi. */
export const ROLE_HEAD_RADIUS = 0.3;
/** Ketinggian mata / mulut (lokal, di permukaan kepala). */
export const ROLE_EYE_Y = 0.66;
export const ROLE_MOUTH_Y = 0.52;

/**
 * Skala cangkang outline torso (faktor terhadap sphere r=0.30) —
 * dipakai sebagai garis luar di sisi pinggang baju (0.10.4: torso
 * bola diganti baju silinder, tapi cangkang ini tetap membingkai
 * pinggang). INVARIAN: outline LEBIH BESAR di X dari jari-jari
 * bawah baju (0.30) tapi LEBIH PIPIH di Z (0.6×0.3=0.18 < muka
 * baju 0.26) — supaya baju menonjol ke depan, bukan ditelan
 * cangkang (regresi 0.10.3-iterasi-1). Sama untuk kepala: outline
 * z 0.95 < 1 (kepala sphere penuh).
 */
export const ROLE_TORSO_OUTLINE_SCALE = { x: 1.07, y: 1.07, z: 0.6 } as const;
export const ROLE_HEAD_OUTLINE_SCALE = { x: 1.07, y: 1.07, z: 0.95 } as const;

/** Warna kulit hangat wajah chibi (0.10.4 — wajah manusia, bukan warna identitas). */
export const ROLE_SKIN_COLOR = '#f2c79b';
/** Warna rambut chibi (hitam hangat). */
export const ROLE_HAIR_COLOR = '#211d1b';

/**
 * Baju (0.10.4): silinder meruncing bahu→pinggang + bar bahu
 * (sphere pipih) — bentuk badan manusia, bukan bola. Tinggi total
 * tetap 0.94 (puncak rambut, lihat ROLE_HAIR_TOP_Y).
 */
export const ROLE_SHIRT_Y = 0.24;
export const ROLE_SHIRT_HEIGHT = 0.38;
export const ROLE_SHIRT_TOP_RADIUS = 0.24;
export const ROLE_SHIRT_BOTTOM_RADIUS = 0.3;
export const ROLE_SHOULDER_Y = 0.38;
export const ROLE_SHOULDER_SCALE = { x: 1.5, y: 0.45, z: 0.85 } as const;
/** Puncak rambut = tinggi total karakter — jangkar nameplate tetap. */
export const ROLE_HAIR_TOP_Y = 0.94;
/** Bintang di dada: z permukaan baju pada y=0.30 + miring ikut kerucut baju. */
export const ROLE_STAR_Y = 0.3;
export const ROLE_STAR_Z = 0.27;
export const ROLE_STAR_TILT_X = -0.16;
/** Epaulet di atas bar bahu. */
export const ROLE_EPAULET_X = 0.24;
export const ROLE_EPAULET_Y = 0.49;

/** Jari-jari permukaan baju pada ketinggian y (interpolasi kerucut). */
export function shirtRadiusAt(y: number): number {
  const top = ROLE_SHIRT_Y + ROLE_SHIRT_HEIGHT / 2; // 0.43
  const t = Math.max(0, Math.min(1, (top - y) / ROLE_SHIRT_HEIGHT));
  return ROLE_SHIRT_TOP_RADIUS + t * (ROLE_SHIRT_BOTTOM_RADIUS - ROLE_SHIRT_TOP_RADIUS);
}

/** Normalisasi role server: kecilkan + rapikan spasi (banding kata utuh). */
export function normalizeRole(role: string | null | undefined): string {
  return (role || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Peran mana yang punya karakter 3D sendiri di 0.10.3.
 * 'chief' → RoleCharacter; null → tetap Ghost3D (peran belum dibangun).
 */
export function resolveRoleKind(
  role: string | null | undefined,
  botId: string | null | undefined,
): 'chief' | null {
  if (normalizeRole(role) === 'chief') return 'chief';
  if ((botId || '').trim().toLowerCase() === 'xman') return 'chief';
  return null;
}

/** Satu titik bentuk bintang (x, y) — di bidang XY, menghadap +Z. */
export type StarPoint = { x: number; y: number };

/**
 * Titik-titik bintang 5 ujung untuk props Chief (bentuk custom dari
 * segitiga — primitif R3F saja, tanpa aset). 10 titik: radius luar /
 * dalam bergantian, titik pertama di ujung atas (sudut 90°), tiap
 * titik berikutnya +36°.
 */
export function starPoints(outerRadius: number, innerRadius: number): StarPoint[] {
  const pts: StarPoint[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}
