/**
 * 0.10.9 — focus mapping untuk layar New Bot.
 *
 * Server hanya menerima kode Inggris ('day-to-day' | 'inbox' |
 * 'research' | 'everything'); label Indonesia di chip UI TIDAK
 * boleh lolos ke body POST /api/characters. focusCodeFor menjamin
 * itu: menerima kode maupun label, mengembalikan kode kanonik.
 */
import { focusCodeFor } from '../client';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const store = new Map<string, string>();
    return {
      __store: store,
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  },
  { virtual: true },
);

describe('focusCodeFor', () => {
  it('memetakan keempat label Indonesia ke kode server', () => {
    expect(focusCodeFor('Sehari-hari')).toBe('day-to-day');
    expect(focusCodeFor('Inbox')).toBe('inbox');
    expect(focusCodeFor('Riset')).toBe('research');
    expect(focusCodeFor('Serba bisa')).toBe('everything');
  });

  it('meneruskan keempat kode Inggris apa adanya', () => {
    expect(focusCodeFor('day-to-day')).toBe('day-to-day');
    expect(focusCodeFor('inbox')).toBe('inbox');
    expect(focusCodeFor('research')).toBe('research');
    expect(focusCodeFor('everything')).toBe('everything');
  });

  it('toleran terhadap kapitalisasi dan spasi', () => {
    expect(focusCodeFor('  SEHARI-HARI ')).toBe('day-to-day');
    expect(focusCodeFor('Serba Bisa')).toBe('everything');
  });

  it('nilai tak dikenal jatuh ke day-to-day (bukan crash)', () => {
    expect(focusCodeFor('sehari-hari ')).toBe('day-to-day');
    expect(focusCodeFor('ngawur')).toBe('day-to-day');
    expect(focusCodeFor('')).toBe('day-to-day');
  });
});
