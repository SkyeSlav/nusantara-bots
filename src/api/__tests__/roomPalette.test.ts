/**
 * Tes palette pastel ruangan (0.10.4): tiap warna dasar deck memang
 * pastel/hangat (hue + lightness di rentang yang benar) — bukan
 * sekadar hex yang kebetulan. Menjaga regresi ke tema dark charcoal.
 */
import { ROOM_PALETTE, hexToHsl } from '../roomPalette';

describe('hexToHsl', () => {
  it('merah murni → h 0, putih → l 1, hitam → l 0', () => {
    expect(hexToHsl('#ff0000').h).toBeCloseTo(0, 5);
    expect(hexToHsl('#ffffff').l).toBeCloseTo(1, 5);
    expect(hexToHsl('#000000').l).toBeCloseTo(0, 5);
  });
});

describe('ROOM_PALETTE pastel (Sam 22:29)', () => {
  it('dinding krem hangat: hue kuning-oranye, lightness tinggi', () => {
    const { h, l } = hexToHsl(ROOM_PALETTE.wall);
    expect(h).toBeGreaterThanOrEqual(30);
    expect(h).toBeLessThanOrEqual(50);
    expect(l).toBeGreaterThan(0.8);
  });

  it('lantai sage green: hue hijau, saturasi lembut (tidak neon)', () => {
    const { h, s, l } = hexToHsl(ROOM_PALETTE.floor);
    expect(h).toBeGreaterThanOrEqual(85);
    expect(h).toBeLessThanOrEqual(130);
    expect(s).toBeLessThan(0.45);
    expect(l).toBeGreaterThan(0.6);
  });

  it('kayu terang: hue cokelat muda, lightness > 0.6', () => {
    const { h, l } = hexToHsl(ROOM_PALETTE.wood);
    expect(h).toBeGreaterThanOrEqual(25);
    expect(h).toBeLessThanOrEqual(45);
    expect(l).toBeGreaterThan(0.6);
  });

  it('sofa oranye lembut: hue oranye, lightness > 0.6', () => {
    const { h, l } = hexToHsl(ROOM_PALETTE.sofa);
    expect(h).toBeGreaterThanOrEqual(25);
    expect(h).toBeLessThanOrEqual(40);
    expect(l).toBeGreaterThan(0.6);
  });

  it('daun hijau + pot terakota + kap lampu hangat: hue sesuai namanya', () => {
    const leaf = hexToHsl(ROOM_PALETTE.leaf);
    expect(leaf.h).toBeGreaterThanOrEqual(85);
    expect(leaf.h).toBeLessThanOrEqual(130);
    const pot = hexToHsl(ROOM_PALETTE.pot);
    expect(pot.h).toBeGreaterThanOrEqual(5);
    expect(pot.h).toBeLessThanOrEqual(30);
    const lamp = hexToHsl(ROOM_PALETTE.lampShade);
    expect(lamp.h).toBeGreaterThanOrEqual(30);
    expect(lamp.h).toBeLessThanOrEqual(45);
    expect(lamp.l).toBeGreaterThan(0.8);
  });

  it('BUKAN dark charcoal: tidak ada warna dasar dengan lightness < 0.4', () => {
    const dark = Object.entries(ROOM_PALETTE).filter(([, hex]) => hexToHsl(hex).l <= 0.4);
    expect(dark).toEqual([]);
  });
});
