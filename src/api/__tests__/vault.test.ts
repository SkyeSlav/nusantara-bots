/**
 * Tests untuk vault (vault.ts, 0.10.0 bagian G).
 *
 * Aturan yang diuji: GET hanya mengembalikan NAMA layanan (nilai
 * TIDAK PERNAH lewat daftar); simpan/hapus fail-soft dan jujur.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteSecret,
  hasSecret,
  listSecrets,
  saveSecret,
  validateSecretInput,
} from '../vault';

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

describe('listSecrets', () => {
  it('mengembalikan nama layanan saja (tanpa nilai kredensial)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        secrets: [
          {
            service: 'youtube-studio',
            label: 'Login YouTube Studio (Google)',
            created_at: '2026-10-26T00:00:00Z',
            updated_at: '2026-10-26T00:00:00Z',
          },
        ],
      }),
    );
    const list = await listSecrets();
    expect(list).toHaveLength(1);
    expect(list?.[0].service).toBe('youtube-studio');
    expect(list?.[0]).not.toHaveProperty('password');
    expect(list?.[0]).not.toHaveProperty('username');
  });

  it('mengembalikan daftar kosong bila vault kosong, null bila 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { secrets: [] }));
    expect(await listSecrets()).toEqual([]);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'token required' }));
    expect(await listSecrets()).toBeNull();
  });
});

describe('hasSecret', () => {
  it('true bila tersimpan, false bila tidak / gagal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stored: true }));
    expect(await hasSecret('youtube-studio')).toBe(true);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stored: false }));
    expect(await hasSecret('youtube-studio')).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await hasSecret('youtube-studio')).toBe(false);
  });
});

describe('saveSecret', () => {
  it('POST ke /api/vault/secrets dan mengembalikan {stored, service}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { stored: true, service: 'youtube-studio' }));
    const r = await saveSecret({
      service: 'youtube-studio',
      label: 'Login YouTube Studio (Google)',
      username: 'user@example.com',
      password: 'test-password',
    });
    expect(r).toEqual({ stored: true, service: 'youtube-studio' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.service).toBe('youtube-studio');
    expect(sent.username).toBe('user@example.com');
  });

  it('melempar ApiError dengan pesan server bila ditolak', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'service tidak valid' }));
    await expect(
      saveSecret({ service: 'youtube-studio', username: 'u', password: 'p' }),
    ).rejects.toThrow('service tidak valid');
  });
});

describe('deleteSecret', () => {
  it('true bila server menghapus, false bila gagal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { deleted: true }));
    expect(await deleteSecret('youtube-studio')).toBe(true);
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }));
    expect(await deleteSecret('youtube-studio')).toBe(false);
  });
});

describe('validateSecretInput', () => {
  it('menolak service tak valid, username kosong, password kosong', () => {
    expect(validateSecretInput({ service: 'YouTube Studio', username: 'u', password: 'p' })).toContain('tidak valid');
    expect(validateSecretInput({ service: 'youtube-studio', username: '  ', password: 'p' })).toContain('Username');
    expect(validateSecretInput({ service: 'youtube-studio', username: 'u', password: '' })).toContain('Password');
    expect(validateSecretInput({ service: 'youtube-studio', username: 'u', password: 'p' })).toBeNull();
  });
});
