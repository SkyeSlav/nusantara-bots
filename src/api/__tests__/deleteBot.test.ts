/**
 * Tests for the ••• delete-bot options (deleteBot.ts, 0.9.4).
 *
 * Pure logic only: option labels, the mode -> withMemory mapping,
 * and error pass-through. No network, no React Native UI — the
 * delete function is injected. The real deleteCharacter HTTP shape
 * is covered in client.test.ts.
 */
import { DELETE_BOT_OPTIONS, DeleteBotMode, deleteBot } from '../deleteBot';

// deleteBot.ts imports client.ts, which imports AsyncStorage: mock it
// (same in-memory mock as byo.test.ts / client.test.ts) so Jest never
// tries to parse the real ESM module.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const store = new Map<string, string>();
    return {
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

describe('DELETE_BOT_OPTIONS', () => {
  it('offers exactly the two choices Sam asked for', () => {
    expect(DELETE_BOT_OPTIONS.map((o) => o.mode)).toEqual([
      'with-memory',
      'without-memory',
    ]);
    expect(DELETE_BOT_OPTIONS.map((o) => o.title)).toEqual([
      'Hapus + memory',
      'Hapus saja',
    ]);
  });

  it('explains that with-memory wipes memory and without-memory keeps it', () => {
    const withMemory = DELETE_BOT_OPTIONS.find((o) => o.mode === 'with-memory');
    const withoutMemory = DELETE_BOT_OPTIONS.find((o) => o.mode === 'without-memory');
    expect(withMemory?.description).toMatch(/memory/i);
    expect(withoutMemory?.description).toMatch(/tetap tersimpan/);
  });
});

describe('deleteBot', () => {
  it('passes withMemory=true for "with-memory"', async () => {
    const deleteFn = jest.fn(async () => true);
    await deleteBot('xman', 'with-memory', deleteFn);
    expect(deleteFn).toHaveBeenCalledWith('xman', true);
  });

  it('passes withMemory=false for "without-memory"', async () => {
    const deleteFn = jest.fn(async () => true);
    await deleteBot('xman', 'without-memory', deleteFn);
    expect(deleteFn).toHaveBeenCalledWith('xman', false);
  });

  it('throws a token hint when the delete call returns false (401)', async () => {
    const deleteFn = jest.fn(async () => false);
    await expect(deleteBot('xman', 'without-memory', deleteFn)).rejects.toThrow(
      'access token',
    );
  });

  it('lets server errors through unchanged', async () => {
    const deleteFn = jest.fn(async () => {
      throw new Error('Server returned HTTP 501');
    });
    await expect(deleteBot('xman', 'with-memory', deleteFn)).rejects.toThrow('501');
  });

  it('every DeleteBotMode has an option entry', () => {
    const modes: DeleteBotMode[] = ['with-memory', 'without-memory'];
    for (const mode of modes) {
      expect(DELETE_BOT_OPTIONS.some((o) => o.mode === mode)).toBe(true);
    }
  });
});
