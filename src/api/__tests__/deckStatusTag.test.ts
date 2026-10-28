/**
 * Tes status tag di bawah karakter (§18.3, 0.10.3).
 *
 * Label dari beacon presence + gate cap — sumber yang sama seperti
 * bubble 0.9.8. Aturan jujur: tanpa data → OFFLINE (jangan
 * pura-pura live); BUDGET HABIS hanya bila cap-check menjawab
 * allowed === false secara eksplisit (bukan dari kegagalan jaringan).
 */
import { botStateLabel, statusTagAnchorY } from '../deckOverlay';

const freshActive = { state: 'active', age_seconds: 5 };
const staleActive = { state: 'active', age_seconds: 200 };
const noAgeActive = { state: 'active' };
const idle = { state: 'idle', age_seconds: 5 };
const stopped = { state: 'stopped', age_seconds: 5 };

describe('botStateLabel', () => {
  it('tanpa beacon / tanpa data → OFFLINE', () => {
    expect(botStateLabel(null)).toBe('OFFLINE');
    expect(botStateLabel(undefined)).toBe('OFFLINE');
    // Cap habis pun tidak bisa diklaim tanpa beacon — tidak ada data.
    expect(botStateLabel(null, 120, false)).toBe('OFFLINE');
  });

  it('beacon active + segar → KERJA', () => {
    expect(botStateLabel(freshActive)).toBe('KERJA');
    expect(botStateLabel(freshActive, 120, true)).toBe('KERJA');
    // Tanpa data cap pun tetap KERJA (cap unknown ≠ cap habis).
    expect(botStateLabel(freshActive, 120, undefined)).toBe('KERJA');
  });

  it('cap habis mengalahkan KERJA (allowed === false eksplisit)', () => {
    expect(botStateLabel(freshActive, 120, false)).toBe('BUDGET HABIS');
    expect(botStateLabel(idle, 120, false)).toBe('BUDGET HABIS');
  });

  it('idle / stopped / active basi → TIDUR (bukan OFFLINE — beacon ada)', () => {
    expect(botStateLabel(idle)).toBe('TIDUR');
    expect(botStateLabel(stopped)).toBe('TIDUR');
    expect(botStateLabel(staleActive)).toBe('TIDUR');
    expect(botStateLabel(noAgeActive)).toBe('TIDUR');
  });

  it('jendela segar mengikuti staleAfter server', () => {
    expect(botStateLabel({ state: 'active', age_seconds: 130 }, 180)).toBe('KERJA');
    expect(botStateLabel({ state: 'active', age_seconds: 130 }, 120)).toBe('TIDUR');
  });
});

describe('statusTagAnchorY', () => {
  it('sedikit di bawah pangkal karakter (tag di bawah karakter, bukan menutupi wajah)', () => {
    expect(statusTagAnchorY(0.47)).toBeLessThan(0.47);
    expect(statusTagAnchorY(0.47)).toBeGreaterThan(0.3);
    expect(statusTagAnchorY(0.52)).toBeCloseTo(0.44, 10);
  });
});
