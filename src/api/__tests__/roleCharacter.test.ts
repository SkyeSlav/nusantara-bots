/**
 * Tes resolusi peran → karakter 3D (0.10.3).
 *
 * Aturan: role server "Chief" (atau botId "xman") → RoleCharacter
 * Chief; peran lain → null (tetap Ghost3D, jangan fallback ke bentuk
 * setengah jadi). "Chief Officer" adalah peran BERBEDA — jangan
 * dipetakan ke Chief. Bentuk bintang Chief dari titik-titik murni
 * (starPoints) supaya bisa dites tanpa three.
 */
import {
  GHOST_PROFILE_HEIGHT,
} from '../deckOverlay';
import {
  ROLE_CHARACTER_HEIGHT,
  ROLE_EPAULET_X,
  ROLE_EPAULET_Y,
  ROLE_HAIR_COLOR,
  ROLE_HAIR_TOP_Y,
  ROLE_HEAD_OUTLINE_SCALE,
  ROLE_SHIRT_BOTTOM_RADIUS,
  ROLE_SHIRT_HEIGHT,
  ROLE_SHIRT_TOP_RADIUS,
  ROLE_SHIRT_Y,
  ROLE_SHOULDER_SCALE,
  ROLE_SHOULDER_Y,
  ROLE_SKIN_COLOR,
  ROLE_STAR_Y,
  ROLE_STAR_Z,
  ROLE_TORSO_OUTLINE_SCALE,
  normalizeRole,
  resolveRoleKind,
  shirtRadiusAt,
  starPoints,
} from '../roleCharacter';

describe('normalizeRole', () => {
  it('mengecilkan + merapikan spasi', () => {
    expect(normalizeRole('Chief')).toBe('chief');
    expect(normalizeRole('  CHIEF   Officer  ')).toBe('chief officer');
    expect(normalizeRole(null)).toBe('');
    expect(normalizeRole(undefined)).toBe('');
  });
});

describe('resolveRoleKind', () => {
  it('role Chief → chief (case + spasi tidak penting)', () => {
    expect(resolveRoleKind('Chief', 'xman')).toBe('chief');
    expect(resolveRoleKind('chief', 'other-bot')).toBe('chief');
    expect(resolveRoleKind('  CHIEF  ', 'other-bot')).toBe('chief');
  });

  it('botId xman → chief walau role kosong (satu-satunya Chief di server live)', () => {
    expect(resolveRoleKind('', 'xman')).toBe('chief');
    expect(resolveRoleKind(null, 'xman')).toBe('chief');
    expect(resolveRoleKind(undefined, 'XMAN')).toBe('chief');
  });

  it('Chief Officer BUKAN Chief (peran beda: dasi + kerah)', () => {
    expect(resolveRoleKind('Chief Officer', 'chief-officer')).toBe(null);
    expect(resolveRoleKind('chief officer', 'xman2')).toBe(null);
  });

  it('peran lain → null (tetap Ghost3D, jangan bentuk setengah jadi)', () => {
    expect(resolveRoleKind('Video Producer', 'producer')).toBe(null);
    expect(resolveRoleKind('Analyst', 'analyst')).toBe(null);
    expect(resolveRoleKind('Job Application Agent', 'job')).toBe(null);
    expect(resolveRoleKind('', 'tesi')).toBe(null);
    expect(resolveRoleKind(null, null)).toBe(null);
    expect(resolveRoleKind(undefined, undefined)).toBe(null);
  });
});

describe('starPoints (bintang emas Chief)', () => {
  it('10 titik: radius luar/dalam bergantian, titik pertama di ujung atas', () => {
    const pts = starPoints(0.085, 0.036);
    expect(pts).toHaveLength(10);
    // Titik 0 = ujung atas (0, outer).
    expect(pts[0].x).toBeCloseTo(0, 10);
    expect(pts[0].y).toBeCloseTo(0.085, 10);
    for (let i = 0; i < 10; i++) {
      const r = Math.hypot(pts[i].x, pts[i].y);
      expect(r).toBeCloseTo(i % 2 === 0 ? 0.085 : 0.036, 10);
    }
  });

  it('ujung luar berselisih 72° (simetri bintang 5)', () => {
    const pts = starPoints(1, 0.4);
    // Titik luar 0 (90°) dan 2 (162°): selisih sudut 72°.
    const a0 = Math.atan2(pts[0].y, pts[0].x);
    const a2 = Math.atan2(pts[2].y, pts[2].x);
    expect(a2 - a0).toBeCloseTo((72 * Math.PI) / 180, 10);
  });
});

describe('amplop ukuran karakter peran', () => {
  it('tinggi total SAMA dengan profil blob (0.94) — jangkar nameplate + tes visibilitas tetap berlaku', () => {
    expect(ROLE_CHARACTER_HEIGHT).toBe(GHOST_PROFILE_HEIGHT);
    expect(ROLE_CHARACTER_HEIGHT).toBe(0.94);
  });
});

describe('outline tidak menelan badan (regresi 0.10.3-iterasi-1)', () => {
  it('outline torso lebih lebar di X dari pinggang baju (garis luar) tapi lebih pipih di Z dari muka baju (baju menonjol ke depan)', () => {
    // Outline: x 1.07*0.3 = 0.321 > pinggang baju 0.30 (rim di sisi).
    expect(ROLE_TORSO_OUTLINE_SCALE.x * 0.3).toBeGreaterThan(ROLE_SHIRT_BOTTOM_RADIUS);
    // Outline: z 0.6*0.3 = 0.18 < muka baju di dada 0.26 (baju di depan).
    expect(ROLE_TORSO_OUTLINE_SCALE.z * 0.3).toBeLessThan(shirtRadiusAt(ROLE_STAR_Y));
  });

  it('outline kepala lebih pipih di Z dari kepala (wajah menonjol ke depan)', () => {
    expect(ROLE_HEAD_OUTLINE_SCALE.z).toBeLessThan(1);
    expect(ROLE_HEAD_OUTLINE_SCALE.x).toBeGreaterThan(1);
  });
});

describe('baju manusia 0.10.4 (bukan bola)', () => {
  it('baju meruncing bahu→pinggang (atas lebih kecil dari bawah)', () => {
    expect(ROLE_SHIRT_TOP_RADIUS).toBeLessThan(ROLE_SHIRT_BOTTOM_RADIUS);
    expect(shirtRadiusAt(ROLE_SHIRT_Y + ROLE_SHIRT_HEIGHT / 2)).toBeCloseTo(ROLE_SHIRT_TOP_RADIUS, 10);
    expect(shirtRadiusAt(ROLE_SHIRT_Y - ROLE_SHIRT_HEIGHT / 2)).toBeCloseTo(ROLE_SHIRT_BOTTOM_RADIUS, 10);
  });

  it('bintang di dada menonjol dari permukaan baju (tidak tenggelam)', () => {
    expect(ROLE_STAR_Z).toBeGreaterThan(shirtRadiusAt(ROLE_STAR_Y));
  });

  it('epaulet di atas bar bahu (di dalam rentang atas bahu, di luar sumbu tengah)', () => {
    const shoulderTop = ROLE_SHOULDER_Y + ROLE_SHOULDER_SCALE.y * 0.3;
    expect(ROLE_EPAULET_Y).toBeLessThanOrEqual(shoulderTop);
    expect(ROLE_EPAULET_Y).toBeGreaterThan(ROLE_SHOULDER_Y);
    expect(ROLE_EPAULET_X).toBeGreaterThan(0.15);
    expect(ROLE_EPAULET_X).toBeLessThan(ROLE_SHOULDER_SCALE.x * 0.3);
  });

  it('puncak rambut = tinggi total karakter (jangkar nameplate tetap 0.94)', () => {
    expect(ROLE_HAIR_TOP_Y).toBe(ROLE_CHARACTER_HEIGHT);
  });

  it('warna kulit hangat + rambut hitam (tetap, bukan warna identitas)', () => {
    expect(ROLE_SKIN_COLOR).toBe('#f2c79b');
    expect(ROLE_HAIR_COLOR).toBe('#211d1b');
  });
});
