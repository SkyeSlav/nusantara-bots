/**
 * Tests for item 1 (0.9.5): a deleted bot must stay gone.
 *
 * Regression for Sam's report "bot dihapus hilang, dijalanin lagi
 * kembali kaya yg awal". Root cause: the app never caches the
 * character list locally (HomeScreen refetches getCharacters() on
 * every focus) — the resurrection was the server delete failing
 * (HTTP 501 before 0.9.5's server endpoint), so the refetch brought
 * the bot back. These tests drive getCharacters + deleteCharacter
 * against a stateful fake fetch-backed server and assert the
 * invariant both ways: a successful delete keeps the bot gone
 * across a refetch, and a failed delete leaves it visible.
 */
import { deleteCharacter, getCharacters } from '../client';
import type { Character } from '../types';

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

const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function jsonResponse(status: number, body: unknown): MockResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function bot(id: string, name: string): Character {
  return { id, name, role: 'Chief', skills: [], memory_scope: `private:${id}` };
}

describe('delete-then-refetch (bot stays gone)', () => {
  // Stateful fake server: the list lives here, like chat.json /
  // characters/*.md on the real server.
  let serverBots: Character[];
  let failDeleteWith: number | null;

  beforeEach(() => {
    serverBots = [bot('chief-officer', 'Chief Officer'), bot('xman', 'Xman')];
    failDeleteWith = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (path === '/api/characters' && (!init || !init.method || init.method === 'GET')) {
        return jsonResponse(200, { characters: serverBots });
      }
      if (path.startsWith('/api/characters/') && init?.method === 'DELETE') {
        if (failDeleteWith !== null) {
          // Tanpa body error: pesan yang dilempar ApiError adalah
          // "Server returned HTTP <status>".
          return jsonResponse(failDeleteWith, {});
        }
        const id = decodeURIComponent(path.split('/')[3].split('?')[0]);
        serverBots = serverBots.filter((b) => b.id !== id);
        return jsonResponse(200, { deleted: id, with_memory: false });
      }
      return jsonResponse(404, { error: 'not found' });
    });
  });

  it('a successfully deleted bot is gone after a refetch', async () => {
    const before = await getCharacters();
    expect(before?.map((b) => b.id)).toEqual(['chief-officer', 'xman']);

    await expect(deleteCharacter('xman', false)).resolves.toBe(true);

    const after = await getCharacters();
    expect(after?.map((b) => b.id)).toEqual(['chief-officer']);
    // Refetch again — still gone (no local cache can resurrect it).
    const again = await getCharacters();
    expect(again?.map((b) => b.id)).toEqual(['chief-officer']);
  });

  it('a failed delete leaves the bot in the list (never hide it locally)', async () => {
    failDeleteWith = 500;
    await expect(deleteCharacter('xman', false)).rejects.toThrow('500');

    const after = await getCharacters();
    expect(after?.map((b) => b.id)).toEqual(['chief-officer', 'xman']);
  });

  it('deleteCharacter returns false on 401 (token needed)', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(401, { error: 'token required' }),
    );
    await expect(deleteCharacter('xman', false)).resolves.toBe(false);
    // The bot is still on the server — a refetch still shows it.
    const after = await getCharacters();
    expect(after?.map((b) => b.id)).toContain('xman');
  });
});
