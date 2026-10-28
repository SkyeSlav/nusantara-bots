import {
  WALK_HOVER_LIFT,
  freeSeats,
  lerpSeatPosition,
  nextSeatMap,
  sortBotsForSeats,
  walkPositionAt,
} from '../deckSeats';

const BOTS = [
  { id: 'b-analyst', name: 'YT Analyst' },
  { id: 'a-chief', name: 'Chief' },
  { id: 'c-scout', name: 'YT Idea Scout' },
];

describe('sortBotsForSeats', () => {
  it('puts working bots first, then alphabetical', () => {
    const working = { 'b-analyst': false, 'a-chief': true, 'c-scout': false };
    const sorted = sortBotsForSeats(BOTS, working);
    expect(sorted.map((b) => b.id)).toEqual(['a-chief', 'b-analyst', 'c-scout']);
  });

  it('is alphabetical when nobody works', () => {
    const sorted = sortBotsForSeats(BOTS, {});
    expect(sorted.map((b) => b.id)).toEqual(['a-chief', 'b-analyst', 'c-scout']);
  });
});

describe('nextSeatMap', () => {
  it('assigns the lowest free seats to new bots', () => {
    const map = nextSeatMap({}, BOTS, {}, 5);
    expect(map).toEqual({ 'a-chief': 0, 'b-analyst': 1, 'c-scout': 2 });
  });

  it('keeps existing assignments stable when working status changes', () => {
    const first = nextSeatMap({}, BOTS, {}, 5);
    const working = { 'c-scout': true };
    const second = nextSeatMap(first, BOTS, working, 5);
    expect(second).toEqual(first);
  });

  it('frees a seat when a bot leaves and reuses it for a new bot', () => {
    const first = nextSeatMap({}, BOTS, {}, 5);
    const remaining = BOTS.filter((b) => b.id !== 'a-chief');
    const second = nextSeatMap(first, remaining, {}, 5);
    expect(second['a-chief']).toBeUndefined();
    expect(second['b-analyst']).toBe(1);
    const third = nextSeatMap(second, [...remaining, { id: 'd-new', name: 'New' }], {}, 5);
    expect(third['d-new']).toBe(0);
  });

  it('caps assignments at capacity (extra bots get no seat)', () => {
    const map = nextSeatMap({}, BOTS, {}, 2);
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['a-chief']).toBe(0);
    expect(map['b-analyst']).toBe(1);
    expect(map['c-scout']).toBeUndefined();
  });

  it('drops seats outside the capacity', () => {
    const prev = { 'a-chief': 0, 'b-analyst': 4 };
    const map = nextSeatMap(prev, BOTS, {}, 3);
    expect(map['b-analyst']).toBe(1);
  });
});

describe('freeSeats', () => {
  it('lists unoccupied seats in order', () => {
    expect(freeSeats({ a: 0, b: 2 }, 5)).toEqual([1, 3, 4]);
    expect(freeSeats({}, 3)).toEqual([0, 1, 2]);
    expect(freeSeats({ a: 0, b: 1 }, 2)).toEqual([]);
  });
});

describe('lerpSeatPosition', () => {
  it('interpolates between two floor positions', () => {
    const from = { x: -2.8, z: -1.55 };
    const to = { x: 2.4, z: 1.45 };
    expect(lerpSeatPosition(from, to, 0)).toEqual(from);
    const end = lerpSeatPosition(from, to, 1);
    expect(end.x).toBeCloseTo(to.x, 6);
    expect(end.z).toBeCloseTo(to.z, 6);
    const mid = lerpSeatPosition(from, to, 0.5);
    expect(mid.x).toBeCloseTo(-0.2, 6);
    expect(mid.z).toBeCloseTo(-0.05, 6);
  });

  it('clamps progress to 0..1', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 10, z: 10 };
    expect(lerpSeatPosition(from, to, -1)).toEqual(from);
    expect(lerpSeatPosition(from, to, 2)).toEqual(to);
  });
});

describe('walkPositionAt', () => {
  const walk = {
    from: { x: -2.8, z: -1.55 },
    to: { x: 2.4, z: 1.45 },
    fromY: 0.47,
    toY: 0.47,
    scale: 0.9,
  };

  it('starts seated and ends seated', () => {
    const start = walkPositionAt(walk, 0);
    expect(start.y).toBeCloseTo(0.47, 6);
    expect(start.x).toBeCloseTo(-2.8, 6);
    const end = walkPositionAt(walk, 1);
    expect(end.y).toBeCloseTo(0.47, 6);
    expect(end.x).toBeCloseTo(2.4, 6);
  });

  it('hovers above the seats mid-walk (blob melayang, bukan berdiri)', () => {
    const mid = walkPositionAt(walk, 0.5);
    expect(mid.y).toBeCloseTo(0.47 + WALK_HOVER_LIFT, 6);
  });

  it('is still rising at the start and lowering at the end', () => {
    const early = walkPositionAt(walk, 0.08);
    expect(early.y).toBeGreaterThan(0.47);
    expect(early.y).toBeLessThan(0.47 + WALK_HOVER_LIFT);
    const late = walkPositionAt(walk, 0.92);
    expect(late.y).toBeGreaterThan(0.47);
    expect(late.y).toBeLessThan(0.47 + WALK_HOVER_LIFT);
  });
});
