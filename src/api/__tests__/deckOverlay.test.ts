import {
  BUBBLE_MAX_CHARS,
  BUBBLE_WORKING_LABEL,
  GHOST_PROFILE_HEIGHT,
  bubbleText,
  nameplateAnchorY,
  nameplateLift,
  projectAnchor,
  radiusAt,
  shortName,
  truncateText,
} from '../deckOverlay';

describe('shortName', () => {
  it('keeps short names whole', () => {
    expect(shortName('Chief Officer')).toBe('Chief Officer');
    expect(shortName('YT Analyst')).toBe('YT Analyst');
    expect(shortName('Xman')).toBe('Xman');
  });

  it('falls back to "Bot" for empty names', () => {
    expect(shortName('')).toBe('Bot');
    expect(shortName('   ')).toBe('Bot');
  });

  it('normalises whitespace', () => {
    expect(shortName('  Chief   Officer  ')).toBe('Chief Officer');
  });

  it('takes the first word when too long', () => {
    expect(shortName('YT Idea Scout Longname')).toBe('YT');
    expect(shortName('A Very Long Bot Name Here')).toBe('A');
  });

  it('truncates a single very long word with an ellipsis', () => {
    const long = 'Supercalifragilisticexpialidocious';
    const out = shortName(long);
    expect(out.length).toBe(16);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe(`${long.slice(0, 15)}…`);
  });
});

describe('truncateText', () => {
  it('keeps short text whole', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates with an ellipsis at the limit', () => {
    expect(truncateText('hello world', 5)).toBe('hell…');
    expect(truncateText('hello world', 5).length).toBe(5);
  });

  it('normalises whitespace', () => {
    expect(truncateText('  hello   world  ', 20)).toBe('hello world');
  });
});

describe('bubbleText', () => {
  it('is null when the bot is idle', () => {
    expect(bubbleText('menulis naskah', false)).toBe(null);
    expect(bubbleText(null, false)).toBe(null);
    expect(bubbleText('', false)).toBe(null);
  });

  it('uses the generic label when working without a note', () => {
    expect(bubbleText(null, true)).toBe(BUBBLE_WORKING_LABEL);
    expect(bubbleText('', true)).toBe(BUBBLE_WORKING_LABEL);
    expect(bubbleText('   ', true)).toBe(BUBBLE_WORKING_LABEL);
  });

  it('uses the presence note when working', () => {
    expect(bubbleText('menulis naskah', true)).toBe('menulis naskah');
    expect(bubbleText('  menulis   naskah  ', true)).toBe('menulis naskah');
  });

  it('truncates long notes to the bubble limit', () => {
    const long = 'a'.repeat(80);
    const out = bubbleText(long, true);
    expect(out).not.toBe(null);
    expect(out!.length).toBe(BUBBLE_MAX_CHARS);
    expect(out!.endsWith('…')).toBe(true);
  });
});

describe('nameplateAnchorY', () => {
  it('sits just above the ghost head (desk + beanbag)', () => {
    // Desk: base 0.45, scale 0.62 -> head top ~1.03, anchor ~1.19.
    expect(nameplateAnchorY(0.45, 0.62)).toBeCloseTo(1.1928, 4);
    // Beanbag: base 0.52, scale 0.55 -> head top ~1.04, anchor ~1.20.
    expect(nameplateAnchorY(0.52, 0.55)).toBeCloseTo(1.197, 4);
  });

  it('uses the ghost profile height (0.10.2-final, blob scales 1.5 / 1.3)', () => {
    // Desk: base 0.47, scale 1.5, head 0.94 -> 0.47 + 1.41 + 0.16.
    expect(nameplateAnchorY(0.47, 1.5, GHOST_PROFILE_HEIGHT)).toBeCloseTo(2.04, 4);
    // Beanbag: base 0.52, scale 1.3, head 0.94 -> 0.52 + 1.222 + 0.16.
    expect(nameplateAnchorY(0.52, 1.3, GHOST_PROFILE_HEIGHT)).toBeCloseTo(1.902, 4);
  });
});

describe('nameplateLift', () => {
  it('alternates 0 / 0.05 by seat index so neighbours do not collide', () => {
    expect(nameplateLift(0)).toBe(0);
    expect(nameplateLift(1)).toBe(0.05);
    expect(nameplateLift(2)).toBe(0);
    expect(nameplateLift(3)).toBe(0.05);
    expect(nameplateLift(4)).toBe(0);
  });
});

describe('radiusAt', () => {
  // Profil lathe varian 0 (dari Ghost3D.profileFor).
  const V0 = [
    { x: 0.02, y: 0 },
    { x: 0.3, y: 0.04 },
    { x: 0.33, y: 0.38 },
    { x: 0.28, y: 0.6 },
    { x: 0.14, y: 0.88 },
    { x: 0.1, y: 0.94 },
  ];

  it('returns the endpoint outside the range', () => {
    expect(radiusAt(V0, 0)).toBe(0.02);
    expect(radiusAt(V0, -1)).toBe(0.02);
    expect(radiusAt(V0, 0.94)).toBe(0.1);
    expect(radiusAt(V0, 1.5)).toBe(0.1);
  });

  it('returns exact points on the profile', () => {
    expect(radiusAt(V0, 0.04)).toBe(0.3);
    expect(radiusAt(V0, 0.38)).toBe(0.33);
  });

  it('interpolates linearly between points', () => {
    // Antara (0.3, 0.04) dan (0.33, 0.38): t = 0.16/0.34.
    expect(radiusAt(V0, 0.2)).toBeCloseTo(0.3 + 0.03 * (0.16 / 0.34), 4);
  });

  it('returns 0 for an empty profile', () => {
    expect(radiusAt([], 0.5)).toBe(0);
  });
});

describe('projectAnchor', () => {
  const identity = (x: number, y: number, z: number) => ({ x, y, z });

  it('maps NDC centre to the middle of the screen', () => {
    expect(projectAnchor({ x: 0, y: 0, z: 0 }, identity)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('maps NDC corners (y is flipped: screen y grows downward)', () => {
    expect(projectAnchor({ x: 1, y: 1, z: 0 }, identity)).toEqual({ x: 1, y: 0 });
    expect(projectAnchor({ x: -1, y: -1, z: 0 }, identity)).toEqual({ x: 0, y: 1 });
  });

  it('returns null for points behind the camera', () => {
    const behind = () => ({ x: 0, y: 0, z: 1.5 });
    expect(projectAnchor({ x: 0, y: 0, z: 0 }, behind)).toBe(null);
    const tooClose = () => ({ x: 0, y: 0, z: -1.5 });
    expect(projectAnchor({ x: 0, y: 0, z: 0 }, tooClose)).toBe(null);
  });
});
