import { dayPalette, dayPaletteAt, dayPhase } from '../dayphase';

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 9, 25, hour, minute, 0, 0);
  return d;
}

describe('dayPhase', () => {
  it('siang 06:00–17:00', () => {
    expect(dayPhase(at(6))).toBe('day');
    expect(dayPhase(at(10))).toBe('day');
    expect(dayPhase(at(16, 59))).toBe('day');
  });
  it('senja 17:00–19:00', () => {
    expect(dayPhase(at(17))).toBe('sunset');
    expect(dayPhase(at(18))).toBe('sunset');
    expect(dayPhase(at(18, 59))).toBe('sunset');
  });
  it('malam 19:00–06:00', () => {
    expect(dayPhase(at(19))).toBe('night');
    expect(dayPhase(at(23))).toBe('night');
    expect(dayPhase(at(3))).toBe('night');
    expect(dayPhase(at(5, 59))).toBe('night');
  });
});

describe('dayPaletteAt', () => {
  it('tengah hari = palet siang murni', () => {
    expect(dayPaletteAt(at(12)).sky).toBe(dayPalette('day').sky);
    expect(dayPaletteAt(at(12)).lampGlow).toBe(0);
  });
  it('tengah malam = palet malam murni', () => {
    expect(dayPaletteAt(at(23)).sky).toBe(dayPalette('night').sky);
    expect(dayPaletteAt(at(23)).lampGlow).toBe(1);
  });
  it('jam 18:00 = palet senja murni', () => {
    expect(dayPaletteAt(at(18)).sky).toBe(dayPalette('sunset').sky);
  });
  it('di batas 17:00 langit di-blend (bukan siang murni, bukan senja murni)', () => {
    const sky = dayPaletteAt(at(17)).sky;
    expect(sky).not.toBe(dayPalette('day').sky);
    expect(sky).not.toBe(dayPalette('sunset').sky);
  });
  it('lampu mati di siang, nyala penuh di malam', () => {
    expect(dayPaletteAt(at(10)).lampGlow).toBe(0);
    expect(dayPaletteAt(at(22)).lampGlow).toBe(1);
    const dusk = dayPaletteAt(at(17, 30)).lampGlow;
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });
});
