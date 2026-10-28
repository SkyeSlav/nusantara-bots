/**
 * Tests for item 3 (0.9.5): Computer — GET /api/computers
 * (computers.ts). Pure helpers (status label, bridge liveness, age
 * formatting) plus the HTTP shape: parse machines + primary_id,
 * null on 401, throw on network failure.
 */
import {
  formatAge,
  getComputers,
  isBridgeLive,
  machineStatusLabel,
  type Machine,
} from '../computers';

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

function machine(over: Partial<Machine> = {}): Machine {
  return {
    id: 'local-1',
    label: 'my-pc',
    owner: 'user',
    status: 'active',
    capabilities: ['adb'],
    notes: '',
    created_at: '2026-10-25T00:00:00Z',
    last_seen: '2026-10-26T00:00:00Z',
    primary: true,
    devices: {
      available: true,
      shared: true,
      phone: { connected: true, serial: 'TEST1234567890', state: 'device' },
      display: { running: true },
      mirror_running: false,
      last_shot: {
        phone: { ts: '2026-10-26T00:00:00Z', age_seconds: 42, bytes: 1234 },
        display: null,
      },
    },
    devices_reason: null,
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('getComputers', () => {
  it('parses machines + primary_id from GET /api/computers', async () => {
    const m = machine();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { machines: [m], primary_id: 'local-1' }),
    );
    const data = await getComputers();
    expect(data?.machines).toHaveLength(1);
    expect(data?.machines[0].label).toBe('my-pc');
    expect(data?.primary_id).toBe('local-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/computers'),
      expect.anything(),
    );
  });

  it('returns an empty list when no machine is registered', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { machines: [], primary_id: null }));
    const data = await getComputers();
    expect(data?.machines).toEqual([]);
    expect(data?.primary_id).toBeNull();
  });

  it('returns null on 401 (token needed)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'token required' }));
    await expect(getComputers()).resolves.toBeNull();
  });

  it('throws on network failure (screen shows offline state)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(getComputers()).rejects.toThrow('Network request failed');
  });
});

describe('machineStatusLabel', () => {
  it('labels active/paused/removed in Indonesian', () => {
    expect(machineStatusLabel(machine({ status: 'active' }))).toBe('Aktif');
    expect(machineStatusLabel(machine({ status: 'paused' }))).toBe('Jeda');
    expect(machineStatusLabel(machine({ status: 'removed' }))).toBe('Dihapus');
  });
});

describe('isBridgeLive', () => {
  it('is true when the server merged a devices view', () => {
    expect(isBridgeLive(machine())).toBe(true);
  });

  it('is false when devices is null (bridge unreadable)', () => {
    expect(isBridgeLive(machine({ devices: null, devices_reason: 'bridge down' }))).toBe(
      false,
    );
  });
});

describe('formatAge', () => {
  it('formats seconds / minutes / hours', () => {
    expect(formatAge(5)).toBe('5 dtk lalu');
    expect(formatAge(59)).toBe('59 dtk lalu');
    expect(formatAge(120)).toBe('2 mnt lalu');
    expect(formatAge(3600)).toBe('1 jam lalu');
    expect(formatAge(9000)).toBe('2 jam lalu');
  });

  it('returns a dash for missing or negative ages', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(undefined)).toBe('—');
    expect(formatAge(-1)).toBe('—');
  });
});
