/**
 * Tests untuk Team Computer (teamComputer.ts, 0.10.0 bagian F).
 *
 * Aturan yang diuji: layar yang tidak tersedia mengembalikan ALASAN
 * (bukan gambar hitam); label pemakai jujur; kontrol fail-soft.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clickComputer,
  clickViewportComputer,
  getComputerScreen,
  getComputerStatus,
  getNovncUrl,
  listElementsComputer,
  scrollComputer,
  takeControl,
  usingLabel,
  zoomComputer,
  type ComputerStatus,
} from '../teamComputer';

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

const STATUS_BOT: ComputerStatus = {
  scope: 'team',
  using_bot: { id: 'new-bot', name: 'New Bot' },
  controlled_by: 'bot',
  browser_open: true,
  url: 'https://duckduckgo.com',
  screen_available: true,
  screen_reason: null,
  screen_age_seconds: 1,
};

describe('usingLabel', () => {
  it('menyebut bot yang memakai, pengguna yang mengendalikan, atau belum dibuka', () => {
    expect(usingLabel(STATUS_BOT)).toBe('New Bot is using it');
    expect(usingLabel({ ...STATUS_BOT, controlled_by: 'user' })).toContain('Kamu mengendalikan');
    expect(usingLabel({ ...STATUS_BOT, using_bot: null, browser_open: false })).toContain('belum dibuka');
    expect(usingLabel(null)).toContain('tidak terbaca');
  });
});

describe('getComputerScreen', () => {
  it('mengembalikan gambar bila tersedia', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        available: true,
        reason: null,
        image_b64: 'iVBORw0KGgo=',
        width: 1600,
        height: 900,
        age_seconds: 1,
      }),
    );
    const shot = await getComputerScreen('team');
    expect(shot.available).toBe(true);
    expect(shot.image_b64).toBe('iVBORw0KGgo=');
  });

  it('TIDAK mengembalikan gambar hitam bila tidak tersedia — alasan jujur', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        available: false,
        reason: 'Browser belum dibuka.',
        image_b64: null,
        width: null,
        height: null,
        age_seconds: null,
      }),
    );
    const shot = await getComputerScreen('team');
    expect(shot.available).toBe(false);
    expect(shot.image_b64).toBeNull();
    expect(shot.reason).toBe('Browser belum dibuka.');
  });

  it('fail-soft bila server tidak menjawab', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'));
    const shot = await getComputerScreen('private');
    expect(shot.available).toBe(false);
    expect(shot.reason).toContain('tidak menjawab');
  });
});

describe('getComputerStatus', () => {
  it('mengembalikan status sesi, null bila gagal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS_BOT));
    expect(await getComputerStatus('team')).toEqual(STATUS_BOT);
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await getComputerStatus('team')).toBeNull();
  });
});

describe('takeControl / clickComputer', () => {
  it('take-control sukses dan gagal dilaporkan jujur', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { controlled_by: 'user' }));
    expect(await takeControl('team')).toEqual({ ok: true });
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'bot sedang memakai' }));
    const r = await takeControl('team');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bot sedang memakai');
  });

  it('klik mengirim koordinat ternormalisasi ke server (actor user default)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    expect(await clickComputer('team', 0.5, 0.25)).toEqual({ ok: true });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', x: 0.5, y: 0.25, actor: 'user' });
  });

  it('klik sebagai bot mengirim actor bot (0.10.7, tool model)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    expect(await clickComputer('team', 0.5, 0.25, 'bot')).toEqual({ ok: true });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', x: 0.5, y: 0.25, actor: 'bot' });
  });
});

describe('scrollComputer / zoomComputer (0.10.7)', () => {
  it('scroll mengirim direction + amount ke /api/computer/scroll', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    expect(await scrollComputer('team', 'down', 3, 'bot')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/api/computer/scroll');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', direction: 'down', amount: 3, actor: 'bot' });
  });

  it('zoom mengirim direction ke /api/computer/zoom', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    expect(await zoomComputer('team', 'in', 'user')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/api/computer/zoom');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', direction: 'in', actor: 'user' });
  });

  it('gagal server dilaporkan jujur (bukan throw)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'dikendalikan bot' }));
    const r = await scrollComputer('team', 'up', 2, 'user');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('dikendalikan bot');
  });
});

describe('listElementsComputer / clickViewportComputer (0.10.8)', () => {
  it('list-elements memanggil endpoint + mem-parsing daftar elemen viewport', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        url: 'https://www.google.com/search?q=jadwal+sholat',
        title: 'jadwal sholat - Google Search',
        count: 2,
        below_fold: 5,
        elements: [
          { tag: 'a', label: 'Jadwal Sholat NU Online', href: 'https://jadwalsholat.nu.or.id/', x: 0.282, y: 0.311 },
          { tag: 'a', label: 'Jadwal Sholat Org', href: 'https://www.jadwalsholat.org/', x: 0.435, y: 0.311 },
        ],
      }),
    );
    const r = await listElementsComputer('team', 'bot');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/computer/list-elements');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', actor: 'bot' });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.below_fold).toBe(5);
    expect(r.elements[0]).toEqual({ tag: 'a', label: 'Jadwal Sholat NU Online', href: 'https://jadwalsholat.nu.or.id/', x: 0.282, y: 0.311 });
  });

  it('list-elements gagal = ok:false + error (fail-soft, bukan throw)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { error: 'CDP browser tidak terjangkau' }));
    const r = await listElementsComputer('team', 'bot');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('CDP browser tidak terjangkau');
    expect(r.elements).toEqual([]);
  });

  it('click-viewport mengirim koordinat viewport ke endpoint CDP', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, url: 'https://jadwalsholat.nu.or.id/jakarta-timur' }),
    );
    const r = await clickViewportComputer('team', 0.282, 0.311, 'bot');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/computer/click-viewport');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ scope: 'team', x: 0.282, y: 0.311, actor: 'bot' });
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://jadwalsholat.nu.or.id/jakarta-timur');
  });

  it('fetch layar/status yang menggantung dibatalkan timeout (0.10.8, mirror STALE)', async () => {
    // fetch yang tidak pernah resolve — apiFetchTimeout harus
    // membatalkannya (AbortError) supaya getComputerScreen kembali
    // fail-soft, bukan menggantung selamanya dan membekukan poll.
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              reject(e);
            });
          }),
      );
      const p = getComputerScreen('team');
      // Majukan timer melewati timeout 8 dtk -> abort -> fail-soft.
      await jest.advanceTimersByTimeAsync(9000);
      const shot = await p;
      expect(shot.available).toBe(false);
      expect(shot.reason).toContain('tidak menjawab');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('getNovncUrl (0.10.13, browser bersama)', () => {
  it('mengikuti host server URL (default LAN) + port 6081 + autoconnect', async () => {
    const url = await getNovncUrl();
    expect(url).toBe(
      'http://YOUR_SERVER:6081/vnc.html?autoconnect=true&resize=scale&show_dot=true',
    );
  });

  it('mengikuti host saat server URL diganti ke alamat lain', async () => {
    await AsyncStorage.setItem('grokbot_server_url', 'http://example.com:8780');
    const url = await getNovncUrl();
    expect(url).toBe(
      'http://example.com:6081/vnc.html?autoconnect=true&resize=scale&show_dot=true',
    );
  });
});
