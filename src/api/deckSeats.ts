/**
 * Penugasan kursi deck kantor (0.9.10, karakter full; 0.9.11 kembali
 * ke blob — logika kursi + jalan tidak berubah, hanya cara karakternya
 * bergerak: blob melayang, bukan berjalan berkaki).
 *
 * Kursi bersifat persisten: tiap bot menempati satu nomor kursi
 * sampai ia pergi atau pindah (jalan). Ini yang memungkinkan
 * karakter BERJALAN antar kursi — tanpa peta kursi yang stabil,
 * urutan sort (bekerja dulu) bisa menukar kursi bot di tengah jalan.
 *
 * Semua fungsi di sini murni dan teruji; OfficeScene hanya
 * menyimpan hasilnya di state.
 */

export type SeatMap = Record<string, number>;

/** Urutkan bot: yang bekerja dulu, lalu alfabetis (sama seperti 0.9.8). */
export function sortBotsForSeats(
  bots: { id: string; name: string }[],
  working: Record<string, boolean>,
): { id: string; name: string }[] {
  return [...bots].sort((a, b) => {
    const wa = working[a.id] ? 0 : 1;
    const wb = working[b.id] ? 0 : 1;
    if (wa !== wb) return wa - wb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Sinkronkan peta kursi dengan daftar bot saat ini:
 * - Bot yang pergi → kursinya dibebaskan.
 * - Bot baru → kursi kosong terendah (urutan: bekerja dulu, lalu nama).
 * - Bot lama → kursinya TIDAK berubah (stabil, walau status kerja berubah).
 */
export function nextSeatMap(
  prev: SeatMap,
  bots: { id: string; name: string }[],
  working: Record<string, boolean>,
  capacity: number,
): SeatMap {
  const ids = new Set(bots.map((b) => b.id));
  const next: SeatMap = {};
  for (const [id, seat] of Object.entries(prev)) {
    if (ids.has(id) && seat >= 0 && seat < capacity) next[id] = seat;
  }
  const taken = new Set(Object.values(next));
  const sorted = sortBotsForSeats(bots, working);
  for (const b of sorted) {
    if (next[b.id] !== undefined) continue;
    for (let s = 0; s < capacity; s++) {
      if (!taken.has(s)) {
        next[b.id] = s;
        taken.add(s);
        break;
      }
    }
  }
  return next;
}

/** Daftar nomor kursi kosong (0..capacity-1) yang belum ditempati. */
export function freeSeats(seatMap: SeatMap, capacity: number): number[] {
  const taken = new Set(Object.values(seatMap));
  const out: number[] = [];
  for (let s = 0; s < capacity; s++) {
    if (!taken.has(s)) out.push(s);
  }
  return out;
}

/** Interpolasi posisi lantai (x, z) dari kursi asal ke tujuan. */
export function lerpSeatPosition(
  from: { x: number; z: number },
  to: { x: number; z: number },
  progress: number,
): { x: number; z: number } {
  const p = Math.max(0, Math.min(1, progress));
  return { x: from.x + (to.x - from.x) * p, z: from.z + (to.z - from.z) * p };
}

/** Durasi jalan antar kursi (detik) — cukup pelan supaya kelihatan. */
export const WALK_DURATION = 2.5;
/**
 * Ketinggian melayang blob saat transit (di atas pangkal kursi):
 * blob tidak punya kaki — ia tidak "berdiri", ia naik sedikit lalu
 * melayang ke kursi tujuan. 0.9.10 memakai tinggi pinggul manusia
 * (0.68 × skala) — untuk blob sebesar 2.0 itu melayang sampai
 * y 1.36, terlalu tinggi (hampir menyentuh atap ruangan).
 */
export const WALK_HOVER_LIFT = 0.3;
/** Fraksi awal/akhir jalan untuk naik/turun (sisanya melayang murni). */
export const WALK_STAND_FRACTION = 0.16;

export interface WalkEndpoints {
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Tinggi pangkal karakter di kursi asal/tujuan (0.47 meja, 0.52 beanbag). */
  fromY: number;
  toY: number;
  scale: number;
}

/**
 * Posisi karakter (x, y, z) pada progres jalan `progress` (0..1):
 * naik dari kursi (0–16%), melayang (16–84%), turun di kursi tujuan
 * (84–100%). y = tinggi pangkal karakter (blob melayang sedikit di
 * atas kursi, bukan berdiri seperti manusia).
 */
export function walkPositionAt(
  walk: WalkEndpoints,
  progress: number,
): { x: number; y: number; z: number } {
  const p = Math.max(0, Math.min(1, progress));
  const xz = lerpSeatPosition(walk.from, walk.to, p);
  const hoverY = Math.max(walk.fromY, walk.toY) + WALK_HOVER_LIFT;
  let y: number;
  if (p < WALK_STAND_FRACTION) {
    y = walk.fromY + (hoverY - walk.fromY) * (p / WALK_STAND_FRACTION);
  } else if (p > 1 - WALK_STAND_FRACTION) {
    y = hoverY + (walk.toY - hoverY) * ((p - (1 - WALK_STAND_FRACTION)) / WALK_STAND_FRACTION);
  } else {
    y = hoverY;
  }
  return { x: xz.x, y, z: xz.z };
}
