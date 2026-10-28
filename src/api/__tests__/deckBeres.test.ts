/**
 * Tes bubble tugas live + "Beres:" (§18.7, 0.10.3).
 *
 * Aturan: kerja → "<tugas>" (note presence); selesai (transisi
 * kerja→diam terlihat + ada tugas terakhir) → "Beres: <tugas>" maks
 * 5 menit; diam tanpa tugas → tidak ada bubble. "Beres" dihitung
 * client-side — server tidak menyediakan field tugas-selesai.
 */
import {
  BERES_PREFIX,
  BERES_TTL_MS,
  BUBBLE_MAX_CHARS,
  bubbleText,
  updateBeresTasks,
} from '../deckOverlay';

describe('bubbleText + Beres', () => {
  it('kerja + note → note itu (tanpa prefix)', () => {
    expect(bubbleText('Bikin landing page', true)).toBe('Bikin landing page');
  });

  it('kerja tanpa note → label generik (bukan Beres)', () => {
    expect(bubbleText(null, true, 'tugas lama')).toBe('bekerja…');
  });

  it('diam + tugas selesai → "Beres: <tugas>"', () => {
    expect(bubbleText(null, false, 'Balas chat customer')).toBe(
      'Beres: Balas chat customer',
    );
    // Note lama yang masih menempel di beacon tidak dipakai saat diam.
    expect(bubbleText('Balas chat customer', false, 'Balas chat customer')).toBe(
      'Beres: Balas chat customer',
    );
  });

  it('diam tanpa tugas selesai → tidak ada bubble (perilaku 0.9.8)', () => {
    expect(bubbleText(null, false)).toBe(null);
    expect(bubbleText('menulis naskah', false)).toBe(null);
    expect(bubbleText(null, false, '   ')).toBe(null);
  });

  it('"Beres:" dipotong ke batas bubble (60 karakter, prefix ikut dihitung)', () => {
    const long = 'a'.repeat(100);
    const out = bubbleText(null, false, long);
    expect(out).not.toBe(null);
    expect(out!.length).toBe(BUBBLE_MAX_CHARS);
    expect(out!.startsWith(BERES_PREFIX)).toBe(true);
  });
});

describe('updateBeresTasks', () => {
  const T0 = 1_000_000;
  const working = { xman: true };
  const idle = { xman: false };
  const tasks = { xman: 'Bikin landing page' };

  it('transisi kerja→diam + ada tugas → entri baru (completedAt = now)', () => {
    const out = updateBeresTasks({}, working, idle, tasks, T0);
    expect(out.xman).toEqual({ task: 'Bikin landing page', completedAt: T0 });
  });

  it('diam dari awal (tidak terlihat bekerja) + ada tugas → TIDAK ada entri', () => {
    const out = updateBeresTasks({}, {}, idle, tasks, T0);
    expect(out).toEqual({});
  });

  it('transisi kerja→diam tanpa tugas → tidak ada entri', () => {
    const out = updateBeresTasks({}, working, idle, {}, T0);
    expect(out).toEqual({});
    const out2 = updateBeresTasks({}, working, idle, { xman: '   ' }, T0);
    expect(out2).toEqual({});
  });

  it('tugas berikutnya dimulai (bekerja lagi) → entri dihapus', () => {
    const prev = { xman: { task: 'Bikin landing page', completedAt: T0 } };
    const out = updateBeresTasks(prev, idle, working, tasks, T0 + 60_000);
    expect(out).toEqual({});
  });

  it('entri segar (< 5 menit) dipertahankan; entri basi (≥ 5 menit) dibuang', () => {
    const prev = { xman: { task: 'Bikin landing page', completedAt: T0 } };
    const fresh = updateBeresTasks(prev, idle, idle, tasks, T0 + BERES_TTL_MS - 1000);
    expect(fresh.xman).toEqual(prev.xman);
    const stale = updateBeresTasks(prev, idle, idle, tasks, T0 + BERES_TTL_MS);
    expect(stale).toEqual({});
  });

  it('entri lama tidak ditimpa tugas baru saat tetap diam (tugas selesai = yang tercatat)', () => {
    const prev = { xman: { task: 'Tugas A', completedAt: T0 } };
    const out = updateBeresTasks(prev, idle, idle, { xman: 'Tugas B' }, T0 + 1000);
    expect(out.xman.task).toBe('Tugas A');
  });

  it('tiap bot independen', () => {
    const out = updateBeresTasks(
      {},
      { xman: true, tesi: false },
      { xman: false, tesi: false },
      { xman: 'Tugas X', tesi: 'Tugas T' },
      T0,
    );
    expect(Object.keys(out)).toEqual(['xman']);
  });
});
