/**
 * Deterministic per-bot blob (ghost) style, ported exactly from the
 * web deck (app.js 0.6.0): djb2 string hash, hue = hash % 360,
 * variant = hash % 5. The same bot id always yields the same hue
 * and shape variant; different bots (usually) get different ones.
 * No bot id → the old amber default, hue 38, variant 0.
 */

export interface BlobStyle {
  /** 0–359 */
  hue: number;
  /** 0–4 */
  variant: number;
}

export const BLOB_VARIANTS = 5;
export const DEFAULT_BLOB_STYLE: BlobStyle = { hue: 38, variant: 0 };
/** Teal accent used when there is no bot id (matches the deck default). */
export const DEFAULT_GHOST_COLOR = '#0d9488';

/** djb2 hash, unsigned 32-bit — identical to the web deck's blobHash. */
export function blobHash(id: string | null | undefined): number {
  const s = String(id == null ? '' : id);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Override avatar per bot (0.9.8) — cache in-memory.
 *
 * Warna + bentuk blob normalnya diturunkan deterministik dari id bot
 * (hash djb2 di bawah). Sam bisa mengganti avatar per bot lewat menu
 * ••• di ChatScreen ("Ganti avatar"); override itu disimpan di
 * AsyncStorage (lihat api/avatar) dan cache ini diisi saat aplikasi
 * start (App.tsx) + setiap kali override disimpan/dihapus.
 *
 * Cache ini yang membuat blobStyleFor/ghostColor (dipakai GhostBlob
 * 2D, Ghost3D deck, dan legenda) otomatis memakai override tanpa
 * mengubah pemanggilnya. Bila tidak ada override, fallback ke hash
 * seperti sebelumnya.
 */
const overrideCache = new Map<string, BlobStyle>();

export function setAvatarOverrideCache(botId: string, style: BlobStyle): void {
  overrideCache.set(botId, { hue: style.hue, variant: style.variant });
}

export function clearAvatarOverrideCache(botId: string): void {
  overrideCache.delete(botId);
}

export function clearAllAvatarOverrideCache(): void {
  overrideCache.clear();
}

export function blobStyleFor(botId: string | null | undefined): BlobStyle {
  if (!botId) return { ...DEFAULT_BLOB_STYLE };
  const override = overrideCache.get(botId);
  if (override) return { ...override };
  const h = blobHash(botId);
  return { hue: h % 360, variant: h % BLOB_VARIANTS };
}

/**
 * Accent colour for a bot's ghost blob, derived from its hue.
 * Deterministic: the same bot id always returns the same colour.
 * No id → the default teal.
 */
export function ghostColor(botId: string | null | undefined): string {
  if (!botId) return DEFAULT_GHOST_COLOR;
  const { hue } = blobStyleFor(botId);
  return `hsl(${hue}, 70%, 55%)`;
}
