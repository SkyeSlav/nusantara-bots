/**
 * Tests for item 2 (0.9.5): hapus chat/ruangan (deleteRoom.ts +
 * deleteRoom in client.ts).
 *
 * The server does NOT implement DELETE /api/rooms/:id yet, so the
 * HTTP tests assert the exact request shape and the honest failure
 * modes (404/501 throw ApiError — the UI shows that, it never hides
 * the room locally). The pure helpers (protected rooms, list
 * removal) are tested without network.
 */
import { deleteRoom } from '../client';
import {
  PROTECTED_ROOM_IDS,
  deleteRoomChat,
  isProtectedRoom,
  removeRoomFromList,
} from '../deleteRoom';
import { ApiError } from '../types';
import type { Room } from '../types';

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

function room(id: string, name: string): Room {
  return { id, name, mode: 'chat', members: [] };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('deleteRoom (client.ts)', () => {
  it('calls DELETE /api/rooms/:id and returns true on 2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { deleted: 'r1' }));
    await expect(deleteRoom('r1')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/rooms/r1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('returns false on 401 (token needed)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'token required' }));
    await expect(deleteRoom('r1')).resolves.toBe(false);
  });

  it('throws ApiError with the server message on 404 (unknown room)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'unknown room' }));
    await expect(deleteRoom('nope')).rejects.toThrow('unknown room');
  });

  it('throws ApiError on 501 (server endpoint not implemented yet)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(501, { error: 'not found' }));
    const err: unknown = await deleteRoom('r1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(501);
  });
});

describe('isProtectedRoom', () => {
  it('protects exactly the server default rooms', () => {
    expect([...PROTECTED_ROOM_IDS].sort()).toEqual(['general', 'meeting-room']);
    expect(isProtectedRoom('general')).toBe(true);
    expect(isProtectedRoom('meeting-room')).toBe(true);
    expect(isProtectedRoom('r1')).toBe(false);
    expect(isProtectedRoom('')).toBe(false);
  });
});

describe('deleteRoomChat', () => {
  it('refuses a protected room without calling the server', async () => {
    const deleteFn = jest.fn(async () => true);
    await expect(deleteRoomChat('general', deleteFn)).rejects.toThrow(
      'tidak bisa dihapus',
    );
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('deletes a normal room via the injected function', async () => {
    const deleteFn = jest.fn(async () => true);
    await deleteRoomChat('r1', deleteFn);
    expect(deleteFn).toHaveBeenCalledWith('r1');
  });

  it('throws a token hint when the delete call returns false (401)', async () => {
    const deleteFn = jest.fn(async () => false);
    await expect(deleteRoomChat('r1', deleteFn)).rejects.toThrow('access token');
  });

  it('lets server errors through unchanged', async () => {
    const deleteFn = jest.fn(async () => {
      throw new Error('Server returned HTTP 501');
    });
    await expect(deleteRoomChat('r1', deleteFn)).rejects.toThrow('501');
  });
});

describe('removeRoomFromList', () => {
  it('removes only the deleted room, keeps the order of the rest', () => {
    const rooms = [room('general', 'General'), room('r1', 'Satu'), room('r2', 'Dua')];
    expect(removeRoomFromList(rooms, 'r1').map((r) => r.id)).toEqual([
      'general',
      'r2',
    ]);
  });

  it('leaves the list untouched for an unknown id', () => {
    const rooms = [room('general', 'General')];
    expect(removeRoomFromList(rooms, 'nope')).toEqual(rooms);
  });
});
