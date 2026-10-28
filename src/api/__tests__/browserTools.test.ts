/**
 * Tests untuk tool buka browser (browserTools.ts, 0.10.0 bagian H).
 *
 * Aturan yang diuji: browser dibuka LANGSUNG ke URL target (bukan
 * tab kosong); gagal = alasan spesifik server, bukan error generik;
 * eksekutor TIDAK PERNAH throw.
 */
import {
  BROWSER_CLICK_TOOL,
  BROWSER_LIST_ELEMENTS_TOOL,
  BROWSER_SCROLL_TOOL,
  BROWSER_TYPE_TOOL,
  BROWSER_ZOOM_TOOL,
  OPEN_BROWSER_TOOL,
  executeBrowserClickTool,
  executeBrowserListElementsTool,
  executeBrowserScrollTool,
  executeBrowserTypeTool,
  executeBrowserZoomTool,
  executeOpenBrowserTool,
} from '../browserTools';
import type { ParsedToolCall } from '../byo';

jest.mock('../teamComputer', () => ({
  openComputerBrowser: jest.fn(),
  clickViewportComputer: jest.fn(),
  listElementsComputer: jest.fn(),
  typeComputer: jest.fn(),
  scrollComputer: jest.fn(),
  zoomComputer: jest.fn(),
}));

import {
  clickViewportComputer,
  listElementsComputer,
  openComputerBrowser,
  scrollComputer,
  typeComputer,
  zoomComputer,
} from '../teamComputer';

const mockOpen = openComputerBrowser as jest.Mock;
const mockClick = clickViewportComputer as jest.Mock;
const mockList = listElementsComputer as jest.Mock;
const mockType = typeComputer as jest.Mock;
const mockScroll = scrollComputer as jest.Mock;
const mockZoom = zoomComputer as jest.Mock;

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
  jest.clearAllMocks();
});

describe('OPEN_BROWSER_TOOL', () => {
  it('mendefinisikan tool dengan aturan langsung-buka (tanpa tanya dulu)', () => {
    expect(OPEN_BROWSER_TOOL.function.name).toBe('open_browser');
    expect(OPEN_BROWSER_TOOL.function.description).toContain('LANGSUNG');
    expect(OPEN_BROWSER_TOOL.function.description).toContain('JANGAN bertanya dulu');
    expect(OPEN_BROWSER_TOOL.function.description).toContain('bukan tab kosong');
  });
});

describe('executeOpenBrowserTool', () => {
  it('membuka browser LANGSUNG ke URL target (scope team default)', async () => {
    mockOpen.mockResolvedValueOnce({ ok: true });
    const text = await executeOpenBrowserTool(
      call('open_browser', { url: 'https://studio.youtube.com' }),
    );
    expect(mockOpen).toHaveBeenCalledWith('team', 'https://studio.youtube.com');
    expect(text).toContain('Browser dibuka ke https://studio.youtube.com');
    expect(text).toContain('Team Computer');
  });

  it('meneruskan scope private bila diminta', async () => {
    mockOpen.mockResolvedValueOnce({ ok: true });
    await executeOpenBrowserTool(
      call('open_browser', { url: 'https://duckduckgo.com', scope: 'private' }),
    );
    expect(mockOpen).toHaveBeenCalledWith('private', 'https://duckduckgo.com');
  });

  it('melaporkan alasan SPESIFIK server bila gagal (bukan error generik)', async () => {
    mockOpen.mockResolvedValueOnce({ ok: false, error: 'browser belum terhubung — ekstensi belum dipasang' });
    const text = await executeOpenBrowserTool(
      call('open_browser', { url: 'https://studio.youtube.com' }),
    );
    expect(text).toContain('GAGAL dibuka');
    expect(text).toContain('browser belum terhubung');
    expect(text).toContain('Jangan mengklaim browser terbuka');
    expect(text).not.toContain('tool operations failed');
  });

  it('menolak URL bukan http(s) / kosong tanpa membuka browser', async () => {
    const text = await executeOpenBrowserTool(call('open_browser', { url: 'about:blank' }));
    expect(text).toContain('harus berupa URL lengkap');
    expect(mockOpen).not.toHaveBeenCalled();
    const text2 = await executeOpenBrowserTool(call('open_browser', {}));
    expect(text2).toContain('harus berupa URL lengkap');
  });

  it('menolak argumen bukan JSON valid', async () => {
    const text = await executeOpenBrowserTool(call('open_browser', null, false));
    expect(text).toContain('tidak valid');
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe('BROWSER_CLICK_TOOL (0.10.8, viewport via CDP)', () => {
  it('mendefinisikan tool klik dengan koordinat 0..1 dari daftar elemen', () => {
    expect(BROWSER_CLICK_TOOL.function.name).toBe('browser_click');
    expect(BROWSER_CLICK_TOOL.function.description).toContain('0..1');
    expect(BROWSER_CLICK_TOOL.function.description).toContain('browser_list_elements');
    expect(BROWSER_CLICK_TOOL.function.description).toContain('JANGAN PERNAH menebak');
  });

  it('mengklik sebagai actor bot via click-viewport (bukan tap layar)', async () => {
    mockClick.mockResolvedValueOnce({ ok: true, url: 'https://example.com' });
    const text = await executeBrowserClickTool(
      call('browser_click', { x: 0.5, y: 0.35 }),
    );
    expect(mockClick).toHaveBeenCalledWith('team', 0.5, 0.35, 'bot');
    expect(text).toContain('diklik di (0.5, 0.35)');
    expect(text).toContain('browser_list_elements lagi');
  });

  it('menolak koordinat di luar 0..1 tanpa memanggil server', async () => {
    const text = await executeBrowserClickTool(
      call('browser_click', { x: 1.5, y: 0.5 }),
    );
    expect(text).toContain('harus angka 0..1');
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('melaporkan alasan server bila gagal (mis. dikendalikan pengguna)', async () => {
    mockClick.mockResolvedValueOnce({ ok: false, error: 'komputer team sedang dikendalikan pengguna — ambil alih dulu lewat Take control' });
    const text = await executeBrowserClickTool(
      call('browser_click', { x: 0.5, y: 0.5 }),
    );
    expect(text).toContain('gagal');
    expect(text).toContain('dikendalikan pengguna');
    expect(text).toContain('TIDAK dilakukan');
  });
});

describe('BROWSER_LIST_ELEMENTS_TOOL (0.10.8, grounding visual teks)', () => {
  it('mendefinisikan tool daftar elemen dengan aturan wajib-list-dulu', () => {
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.name).toBe('browser_list_elements');
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.description).toContain('WAJIB');
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.description).toContain('browser_click');
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.description).toContain('JANGAN PERNAH menebak');
  });

  it('scope WAJIB diisi — invoke tanpa argumen di-drop parser DSML wrapper (0.10.8 fix)', () => {
    // Akar: model memanggil browser_list_elements tanpa argumen -> invoke
    // DSML kosong -> relay2.parse_reply mengembalikan 0 call -> tool tidak
    // pernah dieksekusi, model diam. Scope required memaksa model mengisi
    // {"scope": "team"} sehingga invoke selalu punya parameter.
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.parameters?.required).toContain('scope');
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.description).toContain('{"scope": "team"}');
    expect(BROWSER_LIST_ELEMENTS_TOOL.function.description).toContain('tanpa argumen');
  });

  it('memformat daftar elemen bernomor dengan koordinat viewport', async () => {
    mockList.mockResolvedValueOnce({
      ok: true,
      url: 'https://www.google.com/search?q=jadwal+sholat',
      title: 'jadwal sholat - Google Search',
      count: 2,
      below_fold: 5,
      elements: [
        { tag: 'a', label: 'Jadwal Sholat NU Online', href: 'https://jadwalsholat.nu.or.id/', x: 0.282, y: 0.311 },
        { tag: 'a', label: 'Jadwal Sholat Org', href: 'https://www.jadwalsholat.org/', x: 0.435, y: 0.311 },
      ],
    });
    const text = await executeBrowserListElementsTool(call('browser_list_elements', {}));
    expect(mockList).toHaveBeenCalledWith('team', 'bot');
    expect(text).toContain('Jadwal Sholat NU Online');
    expect(text).toContain('x=0.282, y=0.311');
    expect(text).toContain('5 elemen lagi di bawah lipatan');
    expect(text).toContain('browser_click');
  });

  it('memberi tahu bila tidak ada elemen + ada di bawah lipatan', async () => {
    mockList.mockResolvedValueOnce({
      ok: true, url: 'https://example.com', title: 'Example',
      count: 0, below_fold: 12, elements: [],
    });
    const text = await executeBrowserListElementsTool(call('browser_list_elements', {}));
    expect(text).toContain('tidak ada elemen');
    expect(text).toContain('12 elemen lagi di bawah lipatan');
    expect(text).toContain('scroll ke bawah');
  });

  it('melaporkan alasan server bila gagal — jangan menebak koordinat', async () => {
    mockList.mockResolvedValueOnce({ ok: false, url: null, title: null, count: 0, below_fold: 0, elements: [], error: 'CDP browser tidak terjangkau' });
    const text = await executeBrowserListElementsTool(call('browser_list_elements', {}));
    expect(text).toContain('gagal');
    expect(text).toContain('CDP browser tidak terjangkau');
    expect(text).toContain('jangan menebak koordinat');
  });
});

describe('BROWSER_TYPE_TOOL (0.10.7)', () => {
  it('mendefinisikan tool ketik dengan submit opsional', () => {
    expect(BROWSER_TYPE_TOOL.function.name).toBe('browser_type');
    expect(BROWSER_TYPE_TOOL.function.description).toContain('submit');
  });

  it('mengetik sebagai actor bot', async () => {
    mockType.mockResolvedValueOnce({ ok: true });
    const text = await executeBrowserTypeTool(
      call('browser_type', { text: 'jadwal sholat' }),
    );
    expect(mockType).toHaveBeenCalledWith('team', 'jadwal sholat', 'bot');
    expect(text).toContain('diketik ke browser');
  });

  it('submit=true menambahkan newline (Enter) di akhir teks', async () => {
    mockType.mockResolvedValueOnce({ ok: true });
    await executeBrowserTypeTool(
      call('browser_type', { text: 'jadwal sholat', submit: true }),
    );
    expect(mockType).toHaveBeenCalledWith('team', 'jadwal sholat\n', 'bot');
  });

  it('menolak teks kosong', async () => {
    const text = await executeBrowserTypeTool(call('browser_type', { text: '' }));
    expect(text).toContain('tidak boleh kosong');
    expect(mockType).not.toHaveBeenCalled();
  });
});

describe('BROWSER_SCROLL_TOOL (0.10.7)', () => {
  it('mendefinisikan tool scroll down/up', () => {
    expect(BROWSER_SCROLL_TOOL.function.name).toBe('browser_scroll');
    expect(BROWSER_SCROLL_TOOL.function.description).toContain('down');
  });

  it('scroll down sebagai actor bot', async () => {
    mockScroll.mockResolvedValueOnce({ ok: true });
    const text = await executeBrowserScrollTool(
      call('browser_scroll', { direction: 'down', amount: 3 }),
    );
    expect(mockScroll).toHaveBeenCalledWith('team', 'down', 3, 'bot');
    expect(text).toContain('di-scroll ke bawah');
  });

  it('amount di-clamp ke 1..10', async () => {
    mockScroll.mockResolvedValueOnce({ ok: true });
    await executeBrowserScrollTool(
      call('browser_scroll', { direction: 'up', amount: 99 }),
    );
    expect(mockScroll).toHaveBeenCalledWith('team', 'up', 10, 'bot');
  });
});

describe('BROWSER_ZOOM_TOOL (0.10.7)', () => {
  it('mendefinisikan tool zoom in/out/reset', () => {
    expect(BROWSER_ZOOM_TOOL.function.name).toBe('browser_zoom');
    expect(BROWSER_ZOOM_TOOL.function.description).toContain('reset');
  });

  it('zoom in/out/reset sebagai actor bot', async () => {
    mockZoom.mockResolvedValueOnce({ ok: true });
    await executeBrowserZoomTool(call('browser_zoom', { direction: 'in' }));
    expect(mockZoom).toHaveBeenCalledWith('team', 'in', 'bot');
    mockZoom.mockResolvedValueOnce({ ok: true });
    await executeBrowserZoomTool(call('browser_zoom', { direction: 'out' }));
    expect(mockZoom).toHaveBeenCalledWith('team', 'out', 'bot');
    mockZoom.mockResolvedValueOnce({ ok: true });
    const text = await executeBrowserZoomTool(call('browser_zoom', { direction: 'reset' }));
    expect(mockZoom).toHaveBeenCalledWith('team', 'reset', 'bot');
    expect(text).toContain('direset ke 100%');
  });

  it('direction tidak dikenal default ke in', async () => {
    mockZoom.mockResolvedValueOnce({ ok: true });
    await executeBrowserZoomTool(call('browser_zoom', { direction: 'besar' }));
    expect(mockZoom).toHaveBeenCalledWith('team', 'in', 'bot');
  });
});
