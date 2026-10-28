/**
 * Tes VISIBILITAS deck (0.10.0) — pelajaran 0.9.10.
 *
 * Chibi 0.9.10 lolos semua unit test tapi TIDAK TERLIHAT di screenshot
 * Sam: badannya ketutup meja, warnanya nyatu kursi gelap. Unit test
 * pose/kursi tidak menangkap itu — yang menangkap adalah angka
 * proyeksi: berapa piksel karakter di layar HP referensi.
 *
 * Referensi: Canvas deck di HP 390×844 — scene flex:1 di antara
 * topBar (~110px) dan legenda (~190px) ≈ 390×540. Zoom kamera =
 * min(390/13, 540/8) = 30. Ruas vertikal dunia setinggi h tampil
 * setinggi h × zoom × 0.841 px (faktor isometrik, lihat deckOverlay).
 */
import {
  GHOST_BEANBAG_SCALE,
  GHOST_DESK_SCALE,
  GHOST_EYE_Y,
  GHOST_PROFILE_HEIGHT,
  cameraZoomFor,
  nameplateAnchorY,
  projectedPxHeight,
  seatGhostPosition,
} from '../deckOverlay';

import {
  ROLE_CHARACTER_HEIGHT,
  ROLE_EYE_Y,
} from '../roleCharacter';

/** Ukuran Canvas deck referensi (HP 390×844, scene ≈ 390×540). */
const REF_W = 390;
const REF_H = 540;
/** Tinggi papan meja + monitor di DeskSpot (dunia): meja 0.74 + monitor sampai 1.35. */
const DESK_TOP_Y = 0.78;
const MONITOR_TOP_Y = 0.78 + 0.32 + 0.25;
/** Pangkal blob di kursi meja / beanbag (DeskSpot / OfficeScene). */
const DESK_BASE_Y = 0.47;
const BEANBAG_BASE_Y = 0.52;

describe('cameraZoomFor', () => {
  it('memakai rumus CameraRig (min lebar/13, tinggi/8, jepit 20..80)', () => {
    expect(cameraZoomFor(390, 540)).toBe(30);
    expect(cameraZoomFor(100, 100)).toBe(20);
    expect(cameraZoomFor(4000, 4000)).toBe(80);
  });
});

describe('visibilitas blob di layar referensi', () => {
  it('blob meja setinggi ≥30px (0.10.2-final: 1.5 — patokan referensi Sam: kepala + bahu di atas meja, bukan raksasa; 0.10.2-tengah 2.3 = 169px terukur, visual masih menjulang; 0.10.1: 3.2 KEGEDAN 238px; 0.10.0: klaim 47px, kenyataan 51px selapis lewat jendela — posisi salah)', () => {
    const oldPx = projectedPxHeight(GHOST_PROFILE_HEIGHT * 0.62, REF_W, REF_H);
    expect(oldPx).toBeLessThan(20);
    const px = projectedPxHeight(GHOST_PROFILE_HEIGHT * GHOST_DESK_SCALE, REF_W, REF_H);
    expect(px).toBeGreaterThanOrEqual(30);
  });

  it('blob beanbag setinggi ≥25px (0.10.2-final: 1.3)', () => {
    const px = projectedPxHeight(GHOST_PROFILE_HEIGHT * GHOST_BEANBAG_SCALE, REF_W, REF_H);
    expect(px).toBeGreaterThanOrEqual(25);
  });

  it('mata blob meja berada DI ATAS garis monitor (tidak tertutup meja)', () => {
    const eyeWorldY = DESK_BASE_Y + GHOST_EYE_Y * GHOST_DESK_SCALE;
    expect(eyeWorldY).toBeGreaterThan(MONITOR_TOP_Y);
    expect(eyeWorldY).toBeGreaterThan(DESK_TOP_Y);
  });

  it('puncak blob meja berada di atas meja (badan tidak ketutup penuh)', () => {
    const topWorldY = DESK_BASE_Y + GHOST_PROFILE_HEIGHT * GHOST_DESK_SCALE;
    expect(topWorldY).toBeGreaterThan(MONITOR_TOP_Y);
  });

  it('jangkar nameplate berada di atas puncak blob', () => {
    const anchor = nameplateAnchorY(DESK_BASE_Y, GHOST_DESK_SCALE);
    const topWorldY = DESK_BASE_Y + GHOST_PROFILE_HEIGHT * GHOST_DESK_SCALE;
    expect(anchor).toBeGreaterThan(topWorldY);
  });

  it('blob beanbag: mata di atas beanbag, jangkar di atas puncak', () => {
    const eyeWorldY = BEANBAG_BASE_Y + GHOST_EYE_Y * GHOST_BEANBAG_SCALE;
    expect(eyeWorldY).toBeGreaterThan(BEANBAG_BASE_Y + 0.5);
    const anchor = nameplateAnchorY(BEANBAG_BASE_Y, GHOST_BEANBAG_SCALE);
    expect(anchor).toBeGreaterThan(BEANBAG_BASE_Y + GHOST_PROFILE_HEIGHT * GHOST_BEANBAG_SCALE);
  });

  it('puncak blob meja tetap di bawah dinding (3.5) — tidak menembus atap', () => {
    const topWorldY = DESK_BASE_Y + GHOST_PROFILE_HEIGHT * GHOST_DESK_SCALE;
    expect(topWorldY).toBeLessThan(3.5);
  });

  it('puncak blob meja di bawah 3.0 (0.10.2: margin atap — 0.10.1: 3.48, nyaris menyentuh dinding, itu sebagian kenapa terlihat raksasa; 0.10.2-final: 1.88)', () => {
    const topWorldY = DESK_BASE_Y + GHOST_PROFILE_HEIGHT * GHOST_DESK_SCALE;
    expect(topWorldY).toBeLessThan(3.0);
  });
});

describe('visibilitas karakter peran chibi (0.10.3 — amplop ukuran SAMA seperti blob)', () => {
  it('karakter peran meja setinggi ≥30px (tinggi total 0.94 × scale 1.5, sama seperti blob)', () => {
    const px = projectedPxHeight(ROLE_CHARACTER_HEIGHT * GHOST_DESK_SCALE, REF_W, REF_H);
    expect(px).toBeGreaterThanOrEqual(30);
  });

  it('mata karakter peran meja berada DI ATAS garis monitor', () => {
    const eyeWorldY = DESK_BASE_Y + ROLE_EYE_Y * GHOST_DESK_SCALE;
    expect(eyeWorldY).toBeGreaterThan(MONITOR_TOP_Y);
  });

  it('puncak karakter peran meja di bawah 3.0 (tidak menembus atap)', () => {
    const topWorldY = DESK_BASE_Y + ROLE_CHARACTER_HEIGHT * GHOST_DESK_SCALE;
    expect(topWorldY).toBeLessThan(3.0);
    expect(topWorldY).toBeGreaterThan(MONITOR_TOP_Y);
  });

  it('jangkar nameplate berada di atas puncak karakter peran', () => {
    const anchor = nameplateAnchorY(DESK_BASE_Y, GHOST_DESK_SCALE, ROLE_CHARACTER_HEIGHT);
    const topWorldY = DESK_BASE_Y + ROLE_CHARACTER_HEIGHT * GHOST_DESK_SCALE;
    expect(anchor).toBeGreaterThan(topWorldY);
  });
});

describe('posisi karakter vs nameplate (regresi bug 0.10.0)', () => {
  it('meja belakang: karakter di depan meja (z=-1.55), BUKAN di belakang dinding (z=-3.85)', () => {
    const pos = seatGhostPosition({ kind: 'desk', x: -2.8, z: -2.3 });
    expect(pos.x).toBeCloseTo(-2.8, 4);
    expect(pos.z).toBeCloseTo(-1.55, 4);
    expect(pos.z).toBeGreaterThan(-3); // di depan dinding belakang
  });

  it('meja depan: karakter di depan meja (z=1.45), BUKAN melayang 1.4 unit di depan kursi (z=2.15)', () => {
    const pos = seatGhostPosition({ kind: 'desk', x: 2.4, z: 0.7 });
    expect(pos.x).toBeCloseTo(2.4, 4);
    expect(pos.z).toBeCloseTo(1.45, 4);
  });

  it('beanbag: karakter di titik duduk (0.2, 2.3)', () => {
    expect(seatGhostPosition({ kind: 'beanbag', x: 0.2, z: 2.35 })).toEqual({
      x: 0.2,
      z: 2.3,
    });
  });
});
