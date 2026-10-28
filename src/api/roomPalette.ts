/**
 * Palette pastel ruangan deck (0.10.4 — keputusan Sam 22:29 WIB:
 * "Bikin pastel kayak referensi"). Membatalkan tema dark charcoal +
 * amber untuk RUANGAN (instruksi lama §18.7 dicabut).
 *
 * Target (dari gambar referensi diorama Threads): dinding krem hangat, lantai
 * sage green lembut, furnitur kayu terang, sofa oranye lembut, tanaman
 * hijau, lampu hangat, aksen putih/krem. Sistem lighting §17.2
 * (dayphase) TIDAK diubah — yang berubah warna dasar ruangan.
 *
 * Modul murni (tanpa three/RN) supaya bisa dites: tes memastikan
 * tiap warna memang pastel (hue + lightness di rentang yang benar),
 * bukan sekadar string hex yang kebetulan.
 */

export const ROOM_PALETTE = {
  /** Dinding krem hangat. */
  wall: '#f3e9d7',
  /** Lantai sage green lembut. */
  floor: '#a9c39a',
  /** Kayu terang (meja, rak). */
  wood: '#d9c1a3',
  /** Kayu terang gelap (kaki meja, rak). */
  woodDark: '#b08d64',
  /** Karpet koral hangat di bawah meja kopi. */
  rug: '#c96f4a',
  /** Pola dalam karpet (panel krem). */
  rugInner: '#f2d7b6',
  /** Sofa / beanbag oranye lembut. */
  sofa: '#f6b26b',
  /** Bantal krem di sofa. */
  pillow: '#fdf3e3',
  /** Daun hijau (tanaman, pohon taman). */
  leaf: '#7fb069',
  /** Daun hijau gelap. */
  leafDark: '#5a8f5a',
  /** Daun hijau muda. */
  leafLight: '#a3c98a',
  /** Pot terakota lembut. */
  pot: '#d98c6a',
  /** Kap lampu hangat. */
  lampShade: '#ffe3b3',
  /** Batang pohon taman. */
  trunk: '#8a6a4f',
  /** Bunga kecil di taman. */
  flower: '#f4a7b9',
} as const;

export type RoomPaletteKey = keyof typeof ROOM_PALETTE;

/** Hex "#rrggbb" → HSL (h 0–360, s/l 0–1). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}
