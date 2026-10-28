/**
 * Tests untuk tool MCP (mcpTools.ts, 0.10.0).
 *
 * Klasifikasi baca/tulis diuji terhadap 17 tool Zapier (yang sudah
 * terverifikasi live di server lain) — tool tulis HARUS minta kartu
 * approval, tool baca jalan langsung. Eksekutor TIDAK PERNAH throw.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  callMcpTool,
  executeMcpTool,
  getMcpTools,
  isMcpWriteTool,
  MCP_CALL_TIMEOUT_MS,
} from '../mcpTools';
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

function call(name: string, args: unknown, argsValid = true): ParsedToolCall {
  return {
    id: 'call-1',
    name,
    args: args as Record<string, unknown>,
    argsRaw: JSON.stringify(args ?? {}),
    argsValid,
  };
}

describe('isMcpWriteTool — 17 tool Zapier', () => {
  it('tool baca jalan langsung (tanpa kartu)', () => {
    const read = [
      'discover_zapier_actions',
      'inspect_zapier_actions',
      'execute_zapier_read_action',
      'list_zapier_connections',
      'list_zapier_skills',
      'get_zapier_skill',
      'get_configuration_url',
    ];
    for (const name of read) expect(isMcpWriteTool(name)).toBe(false);
  });

  it('tool tulis WAJIB kartu approval', () => {
    const write = [
      'execute_zapier_write_action',
      'write_code_action',
      'enable_zapier_action',
      'disable_zapier_action',
      'create_zapier_skill',
      'update_zapier_skill',
      'delete_zapier_skill',
      'send_feedback',
      'manage_zapier_connections',
      'auto_provision_mcp',
    ];
    for (const name of write) expect(isMcpWriteTool(name)).toBe(true);
  });

  it('directory tools baca jalan langsung, call_tool selalu minta kartu', () => {
    expect(isMcpWriteTool('search_tools')).toBe(false);
    expect(isMcpWriteTool('describe_tool')).toBe(false);
    expect(isMcpWriteTool('query_result')).toBe(false);
    expect(isMcpWriteTool('call_tool')).toBe(true);
  });

  it('nama tak dikenal fail-closed (dianggap tulis)', () => {
    expect(isMcpWriteTool('do_something_mysterious')).toBe(true);
    expect(isMcpWriteTool('')).toBe(true);
  });
});

describe('getMcpTools', () => {
  it('mengubah daftar server menjadi ChatTool OpenAI', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        tools: [
          {
            name: 'zapier_discover_zapier_actions',
            description: 'Cari aksi Zapier.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
            server: 'zapier',
            tool: 'discover_zapier_actions',
          },
        ],
        skipped: [],
      }),
    );
    const tools = await getMcpTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('zapier_discover_zapier_actions');
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.parameters).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
  });

  it('fail-soft: 404 / jaringan putus / format aneh = daftar kosong', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }));
    expect(await getMcpTools()).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await getMcpTools()).toEqual([]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { tools: 'bukan-list' }));
    expect(await getMcpTools()).toEqual([]);
  });
});

describe('executeMcpTool', () => {
  it('tool baca dieksekusi langsung via POST /api/mcp/call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, text: 'aksi: kirim email', isError: false }));
    const text = await executeMcpTool(call('zapier_discover_zapier_actions', { query: 'gmail' }));
    expect(text).toBe('aksi: kirim email');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ tool: 'zapier_discover_zapier_actions', arguments: { query: 'gmail' } });
  });

  it('tool tulis DITOLAK tanpa approveWrite (fail-closed)', async () => {
    const text = await executeMcpTool(
      call('zapier_execute_zapier_write_action', { action: 'kirim email' }),
    );
    expect(text).toContain('TIDAK dijalankan');
    expect(text).toContain('butuh persetujuan pengguna');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tool tulis jalan bila pengguna menyetujui (approveWrite true)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, text: 'terkirim', isError: false }));
    const text = await executeMcpTool(
      call('zapier_execute_zapier_write_action', { action: 'kirim email' }),
      async () => true,
    );
    expect(text).toBe('terkirim');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tool tulis batal bila pengguna menolak (approveWrite false)', async () => {
    const text = await executeMcpTool(
      call('zapier_execute_zapier_write_action', { action: 'kirim email' }),
      async () => false,
    );
    expect(text).toContain('TIDAK dijalankan');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isError server dilaporkan sebagai error, bukan sukses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, text: 'aksi tidak dikenal', isError: true }));
    const text = await executeMcpTool(call('zapier_discover_zapier_actions', { query: 'x' }));
    expect(text).toContain('Terjadi error');
    expect(text).not.toContain('zapier_discover_zapier_actions');
  });

  it('argumen bukan JSON valid ditolak tanpa memanggil server', async () => {
    const text = await executeMcpTool(call('zapier_discover_zapier_actions', null, false));
    expect(text).toContain('tidak valid');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('callMcpTool', () => {
  it('mengembalikan {ok:false} saat server menolak (HTTP non-2xx)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
    const result = await callMcpTool('zapier_discover_zapier_actions', {});
    expect(result.ok).toBe(false);
  });

  it('timeout MCP 120 dtk (0.10.15): bukan 0/tanpa batas', () => {
    // Tanpa timeout, apiFetch polos bisa gantung selamanya bila
    // server/MCP macet — indikator "Memakai tool" jalan terus.
    expect(MCP_CALL_TIMEOUT_MS).toBe(120000);
  });

  it('gagal cepat {ok:false} (bukan hang/throw) saat fetch diabort (timeout)', async () => {
    // apiFetchTimeout membatalkan fetch via AbortController; fetch
    // menolak dengan AbortError. callMcpTool TIDAK PERNAH throw —
    // abort jadi {ok:false} dengan pesan jelas.
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortErr);
    const result = await callMcpTool('rea_search_tools', { query: 'apk' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/tidak terjangkau|tidak menjawab/);
    }
  });
});
