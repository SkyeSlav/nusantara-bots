/**
 * Avatar blob per bot — override warna + bentuk (0.9.8, permintaan Sam).
 *
 * Avatar normalnya deterministik dari id bot (api/blob: hash djb2 ->
 * hue + variant 0-4). Sam minta bisa menggantinya: menu ••• di
 * ChatScreen ("Ganti avatar") memajukan ke preset look berikutnya.
 * Override disimpan di AsyncStorage per bot
 * (`grokbot_avatar_<botId>` = {"hue": n, "variant": n}) dan di-cache
 * in-memory di api/blob, jadi GhostBlob (2D), Ghost3D (deck), dan
 * legenda otomatis memakai override tanpa mengubah pemanggilnya.
 *
 * Preset sengaja dipilih jelas berbeda satu sama lain (hue tersebar
 * di roda warna + variant berbeda), supaya tiap kali ganti langsung
 * kelihatan bedanya. Tidak ada SVG path baru — preset hanya memilih
 * hue + variant yang sudah ada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BLOB_VARIANTS,
  clearAvatarOverrideCache,
  setAvatarOverrideCache,
  blobStyleFor,
  type BlobStyle,
} from './blob';

/** Daftar preset look avatar — hue + variant yang jelas berbeda. */
export const AVATAR_PRESETS: readonly BlobStyle[] = [
  { hue: 160, variant: 0 }, // toska, kubah klasik
  { hue: 340, variant: 2 }, // pink, tetesan
  { hue: 45, variant: 4 }, // amber, jamur
  { hue: 210, variant: 1 }, // biru, gelombang
  { hue: 280, variant: 3 }, // ungu, berkaki
  { hue: 0, variant: 0 }, // merah, kubah klasik
  { hue: 90, variant: 2 }, // hijau, tetesan
  { hue: 260, variant: 4 }, // violet, jamur
];

export const AVATAR_KEY_PREFIX = 'grokbot_avatar_';

/** Kunci AsyncStorage untuk override avatar satu bot. */
export function avatarKey(botId: string): string {
  return `${AVATAR_KEY_PREFIX}${botId}`;
}

/** Validasi satu style avatar: hue 0-359, variant 0-4, keduanya bulat. */
export function isValidAvatarStyle(style: unknown): style is BlobStyle {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return false;
  const { hue, variant } = style as Record<string, unknown>;
  return (
    typeof hue === 'number' &&
    Number.isInteger(hue) &&
    hue >= 0 &&
    hue <= 359 &&
    typeof variant === 'number' &&
    Number.isInteger(variant) &&
    variant >= 0 &&
    variant < BLOB_VARIANTS
  );
}

/**
 * Preset berikutnya setelah `current`. Bila `current` bukan salah
 * satu preset (mis. hasil hash), mulai dari preset pertama. Selalu
 * kembali ke awal setelah preset terakhir (cycle).
 */
export function nextAvatarPreset(current: BlobStyle): BlobStyle {
  const idx = AVATAR_PRESETS.findIndex(
    (p) => p.hue === current.hue && p.variant === current.variant,
  );
  const next = idx < 0 ? 0 : (idx + 1) % AVATAR_PRESETS.length;
  return { ...AVATAR_PRESETS[next] };
}

/** Permukaan storage minimal yang dibutuhkan modul ini (bisa di-inject untuk test). */
export interface AvatarStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Opsional: tidak semua typing AsyncStorage mengekspos multiGet;
  // loadAvatarOverrides jatuh kembali ke getItem satu per satu.
  getAllKeys?(): Promise<string[]>;
  multiGet?(keys: string[]): Promise<readonly (readonly [string, string | null])[]>;
}

/** Baca override avatar satu bot; null bila tidak ada / tidak valid. */
export async function getAvatarOverride(
  botId: string,
  storage: AvatarStorage = AsyncStorage,
): Promise<BlobStyle | null> {
  const raw = await storage.getItem(avatarKey(botId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidAvatarStyle(parsed)) return null;
    const style = { hue: parsed.hue, variant: parsed.variant };
    setAvatarOverrideCache(botId, style);
    return style;
  } catch {
    return null;
  }
}

/** Simpan override avatar satu bot (validasi dulu) + update cache. */
export async function setAvatarOverride(
  botId: string,
  style: BlobStyle,
  storage: AvatarStorage = AsyncStorage,
): Promise<void> {
  if (!isValidAvatarStyle(style)) {
    throw new Error('Style avatar tidak valid.');
  }
  await storage.setItem(avatarKey(botId), JSON.stringify({ hue: style.hue, variant: style.variant }));
  setAvatarOverrideCache(botId, style);
}

/** Hapus override avatar satu bot (kembali ke hash) + bersihkan cache. */
export async function clearAvatarOverride(
  botId: string,
  storage: AvatarStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(avatarKey(botId));
  clearAvatarOverrideCache(botId);
}

/**
 * Muat SEMUA override avatar dari storage ke cache (dipanggil sekali
 * saat aplikasi start, App.tsx). Mengembalikan jumlah override yang
 * berhasil dimuat; entri tidak valid diabaikan diam-diam.
 */
export async function loadAvatarOverrides(
  storage: AvatarStorage = AsyncStorage,
): Promise<number> {
  if (!storage.getAllKeys) return 0;
  const keys = await storage.getAllKeys();
  const avatarKeys = keys.filter((k) => k.startsWith(AVATAR_KEY_PREFIX));
  if (avatarKeys.length === 0) return 0;
  const pairs: readonly (readonly [string, string | null])[] = storage.multiGet
    ? await storage.multiGet(avatarKeys)
    : await Promise.all(
        avatarKeys.map(async (k) => [k, await storage.getItem(k)] as const),
      );
  let loaded = 0;
  for (const [key, raw] of pairs) {
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidAvatarStyle(parsed)) continue;
      const botId = key.slice(AVATAR_KEY_PREFIX.length);
      if (!botId) continue;
      setAvatarOverrideCache(botId, { hue: parsed.hue, variant: parsed.variant });
      loaded += 1;
    } catch {
      // Entri rusak: abaikan, jangan gagalkan start aplikasi.
    }
  }
  return loaded;
}

/**
 * Majukan avatar satu bot ke preset berikutnya (dipakai menu •••
 * "Ganti avatar"). Mengembalikan style baru yang sudah disimpan.
 */
export async function cycleAvatar(
  botId: string,
  storage: AvatarStorage = AsyncStorage,
): Promise<BlobStyle> {
  const current = blobStyleFor(botId);
  const next = nextAvatarPreset(current);
  await setAvatarOverride(botId, next, storage);
  return next;
}
