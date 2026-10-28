/**
 * Clipboard (0.10.0, bagian I — salin pesan chat).
 *
 * Wrapper tipis di atas expo-clipboard supaya ChatScreen tidak
 * mengimpor modul native langsung (dan supaya gagalnya fail-soft:
 * clipboard tidak tersedia = false, bukan crash).
 */

import * as Clipboard from 'expo-clipboard';

/** Salin teks ke clipboard sistem. True bila berhasil. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
