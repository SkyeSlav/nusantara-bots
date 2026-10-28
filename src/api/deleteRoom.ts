/**
 * Hapus chat/ruangan (0.9.5, permintaan Sam: "tidak ada hapus chat").
 *
 * Aturan yang sama seperti hapus bot (deleteBot.ts): ruangan HANYA
 * dihapus dari daftar lokal SETELAH server mengonfirmasi. Hapus yang
 * gagal (throw) berarti ruangan tetap ada — jangan sembunyikan
 * ruangan yang gagal dihapus, supaya tidak terulang bug "dihapus
 * lalu kembali lagi" seperti pada bot di 0.9.4.
 *
 * Ruangan bawaan server ("general" dan "meeting-room") tidak bisa
 * dihapus — keduanya dibuat otomatis oleh ChatStore
 * (ensure_default_rooms) dan dipakai sebagai fallback chat.
 */

import { deleteRoom } from './client';
import type { Room } from './types';

/** Id ruangan bawaan yang tidak boleh dihapus. */
export const PROTECTED_ROOM_IDS: readonly string[] = ['general', 'meeting-room'];

/** True bila ruangan ini ruangan bawaan server (tidak bisa dihapus). */
export function isProtectedRoom(roomId: string): boolean {
  return PROTECTED_ROOM_IDS.includes(roomId);
}

/**
 * Hapus satu ruangan. `deleteFn` bisa di-inject untuk test; produksi
 * memakai deleteRoom (DELETE /api/rooms/:id). Throws saat server
 * menolak (termasuk 401 = token belum disimpan, dan 404/501 bila
 * server belum mengimplementasikan endpoint-nya).
 */
export async function deleteRoomChat(
  roomId: string,
  deleteFn: (id: string) => Promise<boolean> = deleteRoom,
): Promise<void> {
  if (isProtectedRoom(roomId)) {
    throw new Error('Ruangan bawaan tidak bisa dihapus.');
  }
  const ok = await deleteFn(roomId);
  if (!ok) {
    throw new Error('Server meminta access token — simpan token dulu.');
  }
}

/**
 * Keluarkan satu ruangan dari daftar lokal. Murni — dipakai
 * RoomsScreen setelah server mengonfirmasi penghapusan. TIDAK
 * boleh dipakai sebelum konfirmasi server.
 */
export function removeRoomFromList(rooms: Room[], roomId: string): Room[] {
  return rooms.filter((r) => r.id !== roomId);
}
