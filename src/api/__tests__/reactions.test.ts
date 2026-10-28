/**
 * Tests untuk reaksi emoji (reactions.ts, 0.10.0 bagian I).
 *
 * Model: satu emoji per pesan, tersimpan lokal per room. Emoji yang
 * sama = hapus; emoji lain = ganti; emoji tak dikenal = abaikan.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REACTION_EMOJIS, getReactions, toggleReaction } from '../reactions';

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

beforeEach(() => {
  const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
  store.clear();
  jest.clearAllMocks();
});

describe('REACTION_EMOJIS', () => {
  it('menawarkan 6 emoji (👍 👎 ❤️ 😂 🎉 😮)', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '👎', '❤️', '😂', '🎉', '😮']);
  });
});

describe('getReactions / toggleReaction', () => {
  it('mulai kosong, tambah, ganti, hapus (toggle)', async () => {
    expect(await getReactions('general')).toEqual({});
    let next = await toggleReaction('general', '42', '👍');
    expect(next).toEqual({ '42': '👍' });
    expect(await getReactions('general')).toEqual({ '42': '👍' });
    next = await toggleReaction('general', '42', '❤️');
    expect(next).toEqual({ '42': '❤️' });
    next = await toggleReaction('general', '42', '❤️');
    expect(next).toEqual({});
  });

  it('reaksi terpisah per room', async () => {
    await toggleReaction('general', '1', '👍');
    expect(await getReactions('meeting-room')).toEqual({});
    expect(await getReactions('general')).toEqual({ '1': '👍' });
  });

  it('mengabaikan emoji tak dikenal dan data rusak', async () => {
    const before = await toggleReaction('general', '1', '🤖');
    expect(before).toEqual({});
    const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
    store.set('grokbot_reactions_general', 'bukan-json{');
    expect(await getReactions('general')).toEqual({});
  });
});
