/**
 * Hapus bot dari menu ••• di ChatScreen (0.9.4, permintaan Sam).
 *
 * Dua pilihan, sesuai permintaan Sam: "Hapus + memory" (hapus bot
 * DAN memory-nya) dan "Hapus saja" (hapus bot saja, memory tetap
 * tersimpan). Logika ini murni dan teruji di
 * __tests__/deleteBot.test.ts — UI-nya (Alert) tinggal di ChatScreen.
 *
 * CATATAN 0.9.5: server SUDAH mengimplementasikan
 * DELETE /api/characters/:id (2026-10-26, PC) — lihat deleteCharacter
 * di client.ts. Pilihan "dengan/tanpa memory" diteruskan sebagai
 * ?with_memory=true|false.
 */

import { deleteCharacter } from './client';
import { clearAvatarOverride } from './avatar';

/** Pilihan hapus yang ditawarkan ke user. */
export type DeleteBotMode = 'with-memory' | 'without-memory';

export interface DeleteBotOption {
  mode: DeleteBotMode;
  /** Label tombol di dialog konfirmasi. */
  title: string;
  /** Penjelasan singkat di bawah judul. */
  description: string;
}

export const DELETE_BOT_OPTIONS: readonly DeleteBotOption[] = [
  {
    mode: 'with-memory',
    title: 'Hapus + memory',
    description: 'Hapus bot dan semua memory-nya.',
  },
  {
    mode: 'without-memory',
    title: 'Hapus saja',
    description: 'Hapus bot saja — memory-nya tetap tersimpan.',
  },
];

/**
 * Hapus satu bot. `deleteFn` bisa di-inject untuk test; produksi
 * memakai deleteCharacter (DELETE /api/characters/:id).
 * Throws saat server menolak (termasuk 401 = token belum disimpan).
 */
export async function deleteBot(
  characterId: string,
  mode: DeleteBotMode,
  deleteFn: (id: string, withMemory: boolean) => Promise<boolean> = deleteCharacter,
): Promise<void> {
  const ok = await deleteFn(characterId, mode === 'with-memory');
  if (!ok) {
    throw new Error('Server meminta access token — simpan token dulu.');
  }
  // Override avatar bot ini ikut terhapus (0.9.8). Best effort:
  // kegagalan membersihkan avatar tidak menggagalkan hapus bot.
  await clearAvatarOverride(characterId).catch(() => undefined);
}
