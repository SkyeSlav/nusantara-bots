/**
 * Tests for web browsing (0.9.7, permintaan Sam: bot bisa memakai
 * kemampuan browser).
 *
 * - searchWeb / fetchPage / browsePage: POST ke endpoint server
 *   masing-masing; gagal apa pun (401, 500, jaringan, body rusak)
 *   = null, tidak pernah throw ke UI.
 * - buildWebContext / buildWebPrompt: format blok konteks pencarian
 *   persis seperti spesifikasi.
 * - buildPageContext / buildPagePrompt: format blok isi halaman
 *   (dipakai saat pesan berisi URL + toggle Web ON).
 * - extractUrls / splitLinkSegments: URL di teks — deteksi dan
 *   pemisahan untuk link yang bisa ditekan.
 */

import {
  browsePage,
  buildPageContext,
  buildPagePrompt,
  buildWebContext,
  buildWebPrompt,
  extractUrls,
  fetchPage,
  searchWeb,
  splitLinkSegments,
  type WebPage,
  type WebResult,
} from '../web';

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

const RESULTS: WebResult[] = [
  { title: 'Harga Emas Hari Ini', url: 'https://contoh.com/emas', snippet: 'Emas naik ke 4300.' },
  { title: 'XAUUSD', url: 'https://contoh.com/xau', snippet: 'XAUUSD di 4328.' },
];

const PAGE: WebPage = {
  url: 'https://studio.youtube.com/',
  title: 'YouTube Studio',
  text: 'Channel Jejak Hikmah: 290 subscriber.',
};

describe('searchWeb (POST /api/web/search)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts {q} and returns the results', async () => {
    let seenUrl = '';
    let seenBody: unknown;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init?.body ?? '{}'));
      expect(init?.method).toBe('POST');
      return jsonResponse(200, { results: RESULTS });
    });
    const out = await searchWeb('harga emas hari ini');
    expect(out).toEqual(RESULTS);
    expect(seenUrl).toContain('/api/web/search');
    expect(seenBody).toEqual({ q: 'harga emas hari ini' });
  });

  it('returns null for an empty query without calling the server', async () => {
    expect(await searchWeb('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on 401', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, {}));
    expect(await searchWeb('emas')).toBeNull();
  });

  it('returns null on 500 (search failure)', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(500, { error: 'search failed' }),
    );
    expect(await searchWeb('emas')).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    expect(await searchWeb('emas')).toBeNull();
  });

  it('returns null on a malformed body', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { nope: true }));
    expect(await searchWeb('emas')).toBeNull();
  });
});

describe('fetchPage (POST /api/web/fetch)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts {url} and returns the page', async () => {
    let seenUrl = '';
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      seenUrl = url;
      expect(init?.method).toBe('POST');
      return jsonResponse(200, PAGE);
    });
    const out = await fetchPage('https://contoh.com/a');
    expect(out).toEqual(PAGE);
    expect(seenUrl).toContain('/api/web/fetch');
  });

  it('returns null on 400 (bad URL)', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(400, { error: 'bad url' }),
    );
    expect(await fetchPage('bukan-url')).toBeNull();
  });

  it('returns null on 500', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(500, { error: 'fetch failed' }),
    );
    expect(await fetchPage('https://contoh.com/a')).toBeNull();
  });
});

describe('browsePage (POST /api/web/browse)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts {url} to the browse endpoint (logged-in browser) and returns the page', async () => {
    let seenUrl = '';
    let seenBody: unknown;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init?.body ?? '{}'));
      return jsonResponse(200, PAGE);
    });
    const out = await browsePage('https://studio.youtube.com/');
    expect(out).toEqual(PAGE);
    expect(seenUrl).toContain('/api/web/browse');
    expect(seenBody).toEqual({ url: 'https://studio.youtube.com/' });
  });

  it('returns null on failure (never throws)', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('browser down');
    });
    expect(await browsePage('https://studio.youtube.com/')).toBeNull();
  });
});

describe('buildWebContext / buildWebPrompt', () => {
  it('formats the search block exactly as specified', () => {
    expect(buildWebContext(RESULTS)).toBe(
      '[Hasil pencarian web — gunakan info ini untuk menjawab]\n' +
        '1. Harga Emas Hari Ini — Emas naik ke 4300. (https://contoh.com/emas)\n' +
        '2. XAUUSD — XAUUSD di 4328. (https://contoh.com/xau)\n' +
        '[Akhir hasil pencarian]',
    );
  });

  it('prepends the context to the user message', () => {
    expect(buildWebPrompt('berapa harga emas?', RESULTS)).toBe(
      '[Hasil pencarian web — gunakan info ini untuk menjawab]\n' +
        '1. Harga Emas Hari Ini — Emas naik ke 4300. (https://contoh.com/emas)\n' +
        '2. XAUUSD — XAUUSD di 4328. (https://contoh.com/xau)\n' +
        '[Akhir hasil pencarian]\n\nberapa harga emas?',
    );
  });

  it('returns the message unchanged when there are no results', () => {
    expect(buildWebPrompt('berapa harga emas?', [])).toBe('berapa harga emas?');
    expect(buildWebPrompt('berapa harga emas?', null)).toBe('berapa harga emas?');
  });
});

describe('buildPageContext / buildPagePrompt', () => {
  it('formats the page block', () => {
    expect(buildPageContext(PAGE)).toBe(
      '[Isi halaman web — gunakan info ini untuk menjawab]\n' +
        'Judul: YouTube Studio\n' +
        'URL: https://studio.youtube.com/\n' +
        'Channel Jejak Hikmah: 290 subscriber.\n' +
        '[Akhir isi halaman]',
    );
  });

  it('prepends the page context to the user message', () => {
    expect(buildPagePrompt('analisa channel ini', PAGE)).toBe(
      '[Isi halaman web — gunakan info ini untuk menjawab]\n' +
        'Judul: YouTube Studio\n' +
        'URL: https://studio.youtube.com/\n' +
        'Channel Jejak Hikmah: 290 subscriber.\n' +
        '[Akhir isi halaman]\n\nanalisa channel ini',
    );
  });

  it('returns the message unchanged when the page is null', () => {
    expect(buildPagePrompt('analisa channel ini', null)).toBe('analisa channel ini');
  });
});

describe('extractUrls', () => {
  it('finds http(s) URLs in text', () => {
    expect(extractUrls('cek https://studio.youtube.com/ dong')).toEqual([
      'https://studio.youtube.com/',
    ]);
    expect(extractUrls('a http://x.com/1 b https://y.com/2')).toEqual([
      'http://x.com/1',
      'https://y.com/2',
    ]);
  });

  it('strips trailing punctuation', () => {
    expect(extractUrls('lihat https://contoh.com/a, ya.')).toEqual([
      'https://contoh.com/a',
    ]);
  });

  it('returns an empty list when there is no URL', () => {
    expect(extractUrls('tidak ada link di sini')).toEqual([]);
  });
});

describe('splitLinkSegments', () => {
  it('splits plain text and URLs', () => {
    expect(splitLinkSegments('cek https://contoh.com/a ya')).toEqual([
      { text: 'cek ', url: false },
      { text: 'https://contoh.com/a', url: true },
      { text: ' ya', url: false },
    ]);
  });

  it('keeps trailing punctuation out of the link', () => {
    expect(splitLinkSegments('lihat https://contoh.com/a.')).toEqual([
      { text: 'lihat ', url: false },
      { text: 'https://contoh.com/a', url: true },
      { text: '.', url: false },
    ]);
  });

  it('returns one plain segment when there is no URL', () => {
    expect(splitLinkSegments('halo dunia')).toEqual([{ text: 'halo dunia', url: false }]);
  });

  it('handles a message that is only a URL', () => {
    expect(splitLinkSegments('https://contoh.com/a')).toEqual([
      { text: 'https://contoh.com/a', url: true },
    ]);
  });
});
