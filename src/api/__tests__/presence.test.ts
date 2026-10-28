/**
 * Tests for the presence module (presence.ts).
 *
 * AsyncStorage is an in-memory mock (same pattern as client.test.ts —
 * the real package ships ESM only, so it must be mocked with
 * { virtual: true }); fetch is a jest mock. No real server needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPresence, isBotWorking, workingMap, type BeaconEntry, type PresenceSnapshot } from '../presence';

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

const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
  store.clear();
  jest.clearAllMocks();
});

function entry(state: BeaconEntry['state'], age: number): BeaconEntry {
  return { state, note: '', last_seen: '2026-10-25T09:00:00Z', age_seconds: age };
}

describe('isBotWorking', () => {
  it('active + segar = bekerja', () => {
    expect(isBotWorking(entry('active', 30))).toBe(true);
    expect(isBotWorking(entry('active', 0))).toBe(true);
  });
  it('active tepat di batas 120 dtk masih bekerja', () => {
    expect(isBotWorking(entry('active', 120))).toBe(true);
  });
  it('active tapi basi (>120 dtk) = diam', () => {
    expect(isBotWorking(entry('active', 121))).toBe(false);
    expect(isBotWorking(entry('active', 3600))).toBe(false);
  });
  it('idle / stopped = diam walau segar', () => {
    expect(isBotWorking(entry('idle', 5))).toBe(false);
    expect(isBotWorking(entry('stopped', 5))).toBe(false);
  });
  it('tanpa beacon = diam', () => {
    expect(isBotWorking(null)).toBe(false);
    expect(isBotWorking(undefined)).toBe(false);
  });
});

describe('workingMap', () => {
  it('memetakan tiap bot dari snapshot', () => {
    const snap: PresenceSnapshot = {
      characters: {
        chief: entry('active', 10),
        analyst: entry('idle', 5),
        scout: entry('active', 500),
      },
      stale_after_seconds: 120,
    };
    expect(workingMap(snap)).toEqual({ chief: true, analyst: false, scout: false });
  });
  it('snapshot null/kosong = peta kosong', () => {
    expect(workingMap(null)).toEqual({});
    expect(workingMap({ characters: {}, stale_after_seconds: 120 })).toEqual({});
  });
});

describe('getPresence', () => {
  it('mengambil snapshot dari /api/presence', async () => {
    const snap: PresenceSnapshot = {
      characters: { chief: entry('active', 10) },
      stale_after_seconds: 120,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, snap));
    await expect(getPresence()).resolves.toEqual(snap);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/presence'),
      expect.anything(),
    );
  });
  it('mengembalikan null saat server gagal', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(getPresence()).resolves.toBeNull();
  });
});
