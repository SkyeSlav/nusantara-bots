/**
 * Presence untuk deck kantor 3D.
 *
 * Sumber: GET /api/presence — snapshot beacon terbaru per karakter
 * ({characters: {id: {state, note, last_seen, age_seconds}},
 * stale_after_seconds}). State beacon: "active" | "idle" | "stopped".
 *
 * Aturan "sedang kerja" (sama seperti deck web: run "running" =
 * bekerja; di sini beacon "active" yang masih segar = bekerja):
 * state "active" DAN umur beacon <= stale_after_seconds (120 dtk).
 * Selain itu (idle, stopped, tidak ada beacon, atau basi) = diam.
 * Tidak ada aktivitas yang dikarang: bot tanpa beacon tampil diam.
 */

import { apiJson } from './client';

export type BeaconState = 'active' | 'idle' | 'stopped';

export interface BeaconEntry {
  state: BeaconState;
  note: string;
  last_seen: string;
  age_seconds: number;
}

export interface PresenceSnapshot {
  characters: Record<string, BeaconEntry>;
  stale_after_seconds: number;
}

/** GET /api/presence — fail-soft: null saat 401 (token dibutuhkan) maupun saat server/network gagal (deck tampil diam). */
export async function getPresence(): Promise<PresenceSnapshot | null> {
  try {
    return await apiJson<PresenceSnapshot>('/api/presence');
  } catch {
    return null;
  }
}

/**
 * Apakah bot ini sedang bekerja, dari satu entri beacon.
 * `staleAfter` = jendela segar server (120 dtk); bila tidak
 * diberikan, pakai 120.
 */
export function isBotWorking(
  entry: BeaconEntry | null | undefined,
  staleAfter = 120,
): boolean {
  if (!entry) return false;
  if (entry.state !== 'active') return false;
  if (typeof entry.age_seconds !== 'number') return false;
  return entry.age_seconds <= staleAfter;
}

/** Petakan snapshot presence ke {botId: sedangKerja}. */
export function workingMap(snapshot: PresenceSnapshot | null): Record<string, boolean> {
  if (!snapshot || !snapshot.characters) return {};
  const staleAfter = snapshot.stale_after_seconds ?? 120;
  const out: Record<string, boolean> = {};
  for (const [id, entry] of Object.entries(snapshot.characters)) {
    out[id] = isBotWorking(entry, staleAfter);
  }
  return out;
}
