/**
 * Tests for item 4 (0.9.5): MCP servers (mcp.ts).
 *
 * The server does NOT implement /api/mcp/servers yet, so the HTTP
 * tests assert the exact request shape and the honest failure modes
 * (404 throws ApiError — Settings shows "server belum menyediakan
 * daftar MCP", never a fake list). The summary helper is pure.
 */
import {
  getMcpServers,
  mcpServerSummary,
  setMcpServerEnabled,
  type McpServer,
} from '../mcp';
import { ApiError } from '../types';

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

function server(over: Partial<McpServer> = {}): McpServer {
  return { id: 'zapier', name: 'Zapier', type: 'http', enabled: true, ...over };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('getMcpServers', () => {
  it('parses the server list from GET /api/mcp/servers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        servers: [
          server(),
          server({ id: 'filesystem', name: 'Filesystem', type: 'stdio', enabled: false }),
        ],
      }),
    );
    const list = await getMcpServers();
    expect(list).toHaveLength(2);
    expect(list?.[0].name).toBe('Zapier');
    expect(list?.[1].enabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/servers'),
      expect.anything(),
    );
  });

  it('returns null on 401 (token needed)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'token required' }));
    await expect(getMcpServers()).resolves.toBeNull();
  });

  it('throws ApiError 404 when the server has no MCP endpoint yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }));
    const err: unknown = await getMcpServers().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});

describe('setMcpServerEnabled', () => {
  it('POSTs {enabled} and returns true on 2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { server: server({ enabled: false }) }));
    await expect(setMcpServerEnabled('zapier', false)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/mcp/servers/zapier');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });

  it('returns false on 401 (token needed)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'token required' }));
    await expect(setMcpServerEnabled('zapier', true)).resolves.toBe(false);
  });

  it('throws ApiError on 404 (endpoint not implemented yet)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }));
    const err: unknown = await setMcpServerEnabled('zapier', true).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('carries the server error message when present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'toggle failed' }));
    await expect(setMcpServerEnabled('zapier', true)).rejects.toThrow('toggle failed');
  });
});

describe('mcpServerSummary', () => {
  it('counts total and enabled servers', () => {
    expect(
      mcpServerSummary([
        server(),
        server({ id: 'a', name: 'A', enabled: false }),
        server({ id: 'b', name: 'B', enabled: true }),
      ]),
    ).toEqual({ total: 3, enabled: 2 });
  });

  it('handles an empty list', () => {
    expect(mcpServerSummary([])).toEqual({ total: 0, enabled: 0 });
  });
});
