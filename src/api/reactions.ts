/**
 * Reaksi emoji pesan chat (0.10.0, bagian I).
 *
 * Penyimpanan LOKAL saja (AsyncStorage per room) — server belum
 * punya endpoint reaksi, jadi reaksi hanya tersimpan di HP ini dan
 * tidak tersinkron ke perangkat lain. Itu batas yang jujur: bila
 * server nanti punya endpoint reaksi, modul ini yang diganti.
 *
 * Model: satu emoji per pesan (pengguna yang sama dari HP ini).
 * Ketuk emoji yang sama lagi = hapus reaksi; emoji lain = ganti.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Emoji reaksi yang ditawarkan di menu long-press (0.10.6: disamakan
 * dengan menu lengkap referensi Sam — 👍 👎 ❤️ 😂 🎉 😮). */
export const REACTION_EMOJIS: readonly string[] = ['👍', '👎', '❤️', '😂', '🎉', '😮'];

export type RoomReactions = Record<string, string>;

function keyFor(roomId: string): string {
  return `grokbot_reactions_${roomId}`;
}

/** Muat semua reaksi satu room ({} bila belum ada). Fail-soft. */
export async function getReactions(roomId: string): Promise<RoomReactions> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(roomId));
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: RoomReactions = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string' && REACTION_EMOJIS.includes(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Toggle reaksi satu pesan. Mengembalikan peta reaksi room yang baru
 * (sudah tersimpan). Emoji sama = hapus; emoji lain = ganti.
 */
export async function toggleReaction(
  roomId: string,
  messageId: string,
  emoji: string,
): Promise<RoomReactions> {
  const current = await getReactions(roomId);
  const next: RoomReactions = { ...current };
  if (!REACTION_EMOJIS.includes(emoji)) return current;
  if (next[messageId] === emoji) {
    delete next[messageId];
  } else {
    next[messageId] = emoji;
  }
  try {
    await AsyncStorage.setItem(keyFor(roomId), JSON.stringify(next));
  } catch {
    return current;
  }
  return next;
}
