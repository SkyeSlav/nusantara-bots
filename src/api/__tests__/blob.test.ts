import {
  blobHash,
  blobStyleFor,
  ghostColor,
  DEFAULT_GHOST_COLOR,
} from '../blob';

/**
 * Expected values below were computed from the djb2 algorithm in
 * blob.ts (verified against the web deck's blobHash in app.js):
 *   h = 0; for each char: h = ((h << 5) - h + charCode) | 0; hash = h >>> 0
 *   hue = hash % 360, variant = hash % 5
 */
const EXPECTED: Array<{ id: string; hash: number; hue: number; variant: number }> = [
  { id: 'chief', hash: 94630981, hue: 301, variant: 1 },
  { id: 'researcher', hash: 2091635592, hue: 312, variant: 2 },
  { id: 'inbox', hash: 100344454, hue: 214, variant: 4 },
  { id: 'writer', hash: 3515393139, hue: 339, variant: 4 },
  { id: 'scout', hash: 109264638, hue: 318, variant: 3 },
  { id: 'mentor', hash: 3217245121, hue: 1, variant: 1 },
];

describe('blobHash', () => {
  it.each(EXPECTED)('hashes "$id" deterministically', ({ id, hash }) => {
    expect(blobHash(id)).toBe(hash);
    expect(blobHash(id)).toBe(blobHash(id));
  });

  it('hashes the empty id to 0', () => {
    expect(blobHash('')).toBe(0);
    expect(blobHash(null)).toBe(0);
    expect(blobHash(undefined)).toBe(0);
  });

  it('is an unsigned 32-bit integer', () => {
    for (const { id } of EXPECTED) {
      const h = blobHash(id);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('blobStyleFor', () => {
  it.each(EXPECTED)('"$id" -> hue $hue, variant $variant', ({ id, hue, variant }) => {
    expect(blobStyleFor(id)).toEqual({ hue, variant });
  });

  it('gives six different hues for six different bots', () => {
    const hues = new Set(EXPECTED.map(({ id }) => blobStyleFor(id).hue));
    expect(hues.size).toBe(6);
  });

  it('returns the amber default {hue: 38, variant: 0} with no id', () => {
    expect(blobStyleFor(null)).toEqual({ hue: 38, variant: 0 });
    expect(blobStyleFor(undefined)).toEqual({ hue: 38, variant: 0 });
    expect(blobStyleFor('')).toEqual({ hue: 38, variant: 0 });
  });

  it('keeps hue in 0..359 and variant in 0..4', () => {
    const ids = [...EXPECTED.map((e) => e.id), 'a', 'zzz', 'bot-123', 'X'.repeat(50)];
    for (const id of ids) {
      const { hue, variant } = blobStyleFor(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThanOrEqual(4);
    }
  });
});

describe('ghostColor', () => {
  it('is deterministic per bot id and differs across bots', () => {
    expect(ghostColor('chief')).toBe(ghostColor('chief'));
    expect(ghostColor('chief')).toBe('hsl(301, 70%, 55%)');
    expect(ghostColor('mentor')).toBe('hsl(1, 70%, 55%)');
    expect(ghostColor('chief')).not.toBe(ghostColor('mentor'));
  });

  it('returns the default teal with no id', () => {
    expect(ghostColor(null)).toBe(DEFAULT_GHOST_COLOR);
    expect(ghostColor(undefined)).toBe(DEFAULT_GHOST_COLOR);
    expect(ghostColor('')).toBe(DEFAULT_GHOST_COLOR);
    expect(DEFAULT_GHOST_COLOR).toBe('#0d9488');
  });
});
