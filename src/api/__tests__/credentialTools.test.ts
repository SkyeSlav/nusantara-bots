/**
 * Tests untuk tool kredensial (credentialTools.ts, 0.10.0 bagian G).
 *
 * Aturan yang diuji: bot TIDAK PERNAH melihat nilai password —
 * list_secrets hanya nama; request_credential lewat form aman;
 * login_service menolak bila belum tersimpan; Dismiss tidak memaksa.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  executeCredentialTool,
  executeListSecretsTool,
  executeLoginServiceTool,
  executeRequestCredentialTool,
} from '../credentialTools';
import type { ParsedToolCall } from '../byo';

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

jest.mock('../vault', () => ({
  hasSecret: jest.fn(),
  listSecrets: jest.fn(),
  saveSecret: jest.fn(),
}));

import { hasSecret, listSecrets } from '../vault';

const mockHasSecret = hasSecret as jest.Mock;
const mockListSecrets = listSecrets as jest.Mock;

const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function call(name: string, args: unknown, argsValid = true): ParsedToolCall {
  return {
    id: 'call-1',
    name,
    args: args as Record<string, unknown>,
    argsRaw: JSON.stringify(args ?? {}),
    argsValid,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
  store.clear();
  jest.clearAllMocks();
});

describe('executeListSecretsTool', () => {
  it('jujur bila vault kosong (list_secrets kosong)', async () => {
    mockListSecrets.mockResolvedValueOnce([]);
    const text = await executeListSecretsTool();
    expect(text).toContain('Belum ada kredensial tersimpan');
    expect(text).toContain('list_secrets kosong');
  });

  it('menyebut nama layanan yang tersimpan (tanpa nilai)', async () => {
    mockListSecrets.mockResolvedValueOnce([
      { service: 'youtube-studio', label: 'YouTube Studio', created_at: '', updated_at: '' },
    ]);
    const text = await executeListSecretsTool();
    expect(text).toContain('youtube-studio');
    expect(text).toContain('nilainya tidak bisa dibaca');
  });

  it('jujur bila vault tidak bisa dibaca', async () => {
    mockListSecrets.mockRejectedValueOnce(new Error('down'));
    const text = await executeListSecretsTool();
    expect(text).toContain('Tidak bisa membaca vault');
  });
});

describe('executeRequestCredentialTool', () => {
  it('menampilkan form dan melaporkan tersimpan bila pengguna Save', async () => {
    mockHasSecret.mockResolvedValueOnce(false);
    const requestCredential = jest.fn(async () => ({ saved: true }));
    const text = await executeRequestCredentialTool(
      call('request_credential', {
        service: 'youtube-studio',
        label: 'Login YouTube Studio (Google)',
        url: 'accounts.google.com',
      }),
      requestCredential,
    );
    expect(requestCredential).toHaveBeenCalledWith({
      service: 'youtube-studio',
      label: 'Login YouTube Studio (Google)',
      url: 'accounts.google.com',
    });
    expect(text).toContain('sudah tersimpan di vault');
    expect(text).toContain('login_service');
  });

  it('tidak memaksa bila pengguna Dismiss', async () => {
    mockHasSecret.mockResolvedValueOnce(false);
    const requestCredential = jest.fn(async () => ({ saved: false }));
    const text = await executeRequestCredentialTool(
      call('request_credential', { service: 'youtube-studio' }),
      requestCredential,
    );
    expect(text).toContain('menutup form');
    expect(text).toContain('Jangan memaksa');
  });

  it('tidak menampilkan form bila kredensial sudah tersimpan', async () => {
    mockHasSecret.mockResolvedValueOnce(true);
    const requestCredential = jest.fn(async () => ({ saved: true }));
    const text = await executeRequestCredentialTool(
      call('request_credential', { service: 'youtube-studio' }),
      requestCredential,
    );
    expect(requestCredential).not.toHaveBeenCalled();
    expect(text).toContain('SUDAH tersimpan');
  });

  it('menolak service tak valid tanpa menampilkan form', async () => {
    const requestCredential = jest.fn(async () => ({ saved: true }));
    const text = await executeRequestCredentialTool(
      call('request_credential', { service: 'YouTube Studio!' }),
      requestCredential,
    );
    expect(text).toContain('harus berupa id layanan huruf kecil');
    expect(requestCredential).not.toHaveBeenCalled();
  });
});

describe('executeLoginServiceTool', () => {
  it('menolak login bila kredensial belum tersimpan (jangan klaim berhasil)', async () => {
    mockHasSecret.mockResolvedValueOnce(false);
    const text = await executeLoginServiceTool(call('login_service', { service: 'youtube-studio' }));
    expect(text).toContain('TIDAK BISA');
    expect(text).toContain('belum tersimpan');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('login sukses via server bila kredensial tersimpan', async () => {
    mockHasSecret.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, service: 'youtube-studio', url: 'https://studio.youtube.com' }),
    );
    const text = await executeLoginServiceTool(call('login_service', { service: 'youtube-studio' }));
    expect(text).toContain('berhasil');
    expect(text).toContain('tidak pernah melihat nilainya');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ service: 'youtube-studio' });
  });

  it('melaporkan kegagalan server dengan jujur + perintah coba jalur lain (J)', async () => {
    mockHasSecret.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: false, error: 'browser belum terhubung' }));
    const text = await executeLoginServiceTool(call('login_service', { service: 'youtube-studio' }));
    expect(text).toContain('belum berhasil');
    expect(text).toContain('browser belum terhubung');
    expect(text).toContain('Coba jalur lain');
    expect(text).toContain('https://studio.youtube.com');
    expect(text).toContain('Jangan mengklaim login berhasil');
    expect(text).not.toContain('Error 400');
  });

  it('2FA dari sinyal server (needs_user_action) = tunggu user, bukan gagal (J)', async () => {
    mockHasSecret.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        service: 'youtube-studio',
        url: 'https://studio.youtube.com',
        needs_user_action: '2fa',
        message: 'Google meminta verifikasi 2 langkah.',
      }),
    );
    const text = await executeLoginServiceTool(call('login_service', { service: 'youtube-studio' }));
    expect(text).toContain('verifikasi 2 langkah');
    expect(text).toContain('TUNGGU');
    expect(text).toContain("Verify it's you");
    expect(text).toContain('BUKAN kegagalan');
  });

  it('2FA dari teks error server juga dikenali sebagai tunggu user (J)', async () => {
    mockHasSecret.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: false,
        error: 'layanan meminta verifikasi tambahan (2FA/captcha) — selesaikan manual di browser',
      }),
    );
    const text = await executeLoginServiceTool(call('login_service', { service: 'youtube-studio' }));
    expect(text).toContain('verifikasi 2 langkah');
    expect(text).toContain('TUNGGU');
  });
});

describe('executeCredentialTool (dispatcher)', () => {
  it('merutekan ketiganya dan menolak nama tak dikenal', async () => {
    mockListSecrets.mockResolvedValueOnce([]);
    expect(await executeCredentialTool(call('list_secrets', {}), async () => ({ saved: false }))).toContain(
      'Belum ada kredensial',
    );
    expect(
      await executeCredentialTool(call('vm_exec', { command: 'ls' }), async () => ({ saved: false })),
    ).toContain('tidak dikenal');
  });
});
