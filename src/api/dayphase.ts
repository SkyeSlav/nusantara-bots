/**
 * Siklus siang–malam untuk deck kantor 3D.
 *
 * Murni dan deterministik: diberi tanggal/jam, mengembalikan fase
 * (siang / senja / malam) plus palet warna (langit, matahari/bulan,
 * cahaya ambient, lampu). Deck memakai palet ini untuk mewarnai
 * langit di jendela, lampu kantor, dan jendela kota.
 *
 * Batas fase (WIB, jam lokal perangkat):
 * - siang  : 06:00 – 17:00
 * - senja  : 17:00 – 19:00
 * - malam  : 19:00 – 06:00
 */

export type DayPhase = 'day' | 'sunset' | 'night';

export interface DayPalette {
  /** Warna langit di balik jendela. */
  sky: string;
  /** Warna cakram matahari/bulan. */
  sun: string;
  /** 0–1: seberapa terang cahaya ambient (siang terang, malam redup). */
  ambient: number;
  /** Warna cahaya matahari (directional). */
  sunLight: string;
  /** 0–1: intensitas cahaya matahari. */
  sunIntensity: number;
  /** Warna lampu kantor (hangat). */
  lamp: string;
  /** 0–1: seberapa nyala lampu kantor + layar (0 = mati siang hari). */
  lampGlow: number;
  /** 0–1: seberapa banyak jendela kota yang menyala. */
  cityLit: number;
}

const PALETTES: Record<DayPhase, DayPalette> = {
  day: {
    sky: '#87ceeb',
    sun: '#fff7c0',
    ambient: 0.85,
    sunLight: '#fff2cc',
    sunIntensity: 1.0,
    lamp: '#ffd9a0',
    lampGlow: 0,
    cityLit: 0.05,
  },
  sunset: {
    sky: '#ff8c5a',
    sun: '#ff5e3a',
    ambient: 0.55,
    sunLight: '#ffb27a',
    sunIntensity: 0.65,
    lamp: '#ffc27a',
    lampGlow: 0.55,
    cityLit: 0.45,
  },
  night: {
    sky: '#0b1026',
    sun: '#e8ecff',
    ambient: 0.22,
    sunLight: '#9db4ff',
    sunIntensity: 0.18,
    lamp: '#ffc27a',
    lampGlow: 1,
    cityLit: 0.95,
  },
};

export function dayPhase(date: Date): DayPhase {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'sunset';
  return 'night';
}

export function dayPalette(phase: DayPhase): DayPalette {
  return { ...PALETTES[phase] };
}

/**
 * Palet untuk satu jam (0–23, boleh pecahan). Di dekat batas fase,
 * warnanya di-blend halus antara dua palet tetangga (jendela 1 jam).
 * Dipakai deck agar transisi siang→senja→malam tidak patah.
 */
export function dayPaletteAt(date: Date): DayPalette {
  const h = date.getHours() + date.getMinutes() / 60;
  const phase = dayPhase(date);
  // Titik tengah tiap fase (dipakai untuk mengukur jarak ke batas).
  const blend = (a: DayPalette, b: DayPalette, t: number): DayPalette => {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const lerpColor = (ca: string, cb: string): string => {
      const pa = hexToRgb(ca);
      const pb = hexToRgb(cb);
      const c = [
        Math.round(lerp(pa[0], pb[0])),
        Math.round(lerp(pa[1], pb[1])),
        Math.round(lerp(pa[2], pb[2])),
      ];
      return rgbToHex(c[0], c[1], c[2]);
    };
    return {
      sky: lerpColor(a.sky, b.sky),
      sun: lerpColor(a.sun, b.sun),
      ambient: lerp(a.ambient, b.ambient),
      sunLight: lerpColor(a.sunLight, b.sunLight),
      sunIntensity: lerp(a.sunIntensity, b.sunIntensity),
      lamp: lerpColor(a.lamp, b.lamp),
      lampGlow: lerp(a.lampGlow, b.lampGlow),
      cityLit: lerp(a.cityLit, b.cityLit),
    };
  };
  // Jendela blend 1 jam di sekitar tiap batas fase (tengah di batas):
  // 17:00 siang→senja, 19:00 senja→malam, 06:00 malam→siang.
  // Di luar jendela, palet murni fase itu.
  if (h >= 16.5 && h < 17.5) return blend(PALETTES.day, PALETTES.sunset, h - 16.5);
  if (h >= 18.5 && h < 19.5) return blend(PALETTES.sunset, PALETTES.night, h - 18.5);
  if (h >= 5.5 && h < 6.5) return blend(PALETTES.night, PALETTES.day, h - 5.5);
  return { ...PALETTES[phase] };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}
