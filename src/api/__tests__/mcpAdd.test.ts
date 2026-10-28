/**
 * Tests for the "Connect MCP" form (0.9.6, permintaan Sam: "pilihan
 * Connect ke bermacam2 mcp g ada").
 *
 * - validateMcpServerInput: pure validation of the form (name, type,
 *   URL/command) — error messages in Indonesian.
 * - addMcpServer: POST /api/mcp/servers {name, type, url} — the
 *   server endpoint for adding a server (spec in
 *   BUILD-0.9.6-HANDOFF.md). 401 yields null; anything else non-2xx
 *   throws ApiError carrying the server's message (including 404/501
 *   while the endpoint does not exist yet) so the UI can show the
 *   honest "endpoint belum ada" note instead of a fake success.
 */

import { addMcpServer, validateMcpServerInput, type NewMcpServerInput } from '../mcp';

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

describe('validateMcpServerInput', () => {
  const valid: NewMcpServerInput = {
    name: 'zapier',
    type: 'http',
    url: 'https://mcp.zapier.com/api/v1/connect',
  };

  it('accepts a valid http server', () => {
    expect(validateMcpServerInput(valid)).toBeNull();
  });

  it('accepts a valid stdio server (command, not URL)', () => {
    expect(
      validateMcpServerInput({
        name: 'filesystem',
        type: 'stdio',
        url: 'npx -y @modelcontextprotocol/server-filesystem /data',
      }),
    ).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateMcpServerInput({ ...valid, name: '   ' })).toBe(
      'Nama MCP wajib diisi.',
    );
  });

  it('rejects an unknown type', () => {
    expect(
      validateMcpServerInput({ ...valid, type: 'grpc' as never }),
    ).toBe('Tipe MCP harus stdio, http, atau sse.');
  });

  it('rejects http/sse without a URL', () => {
    expect(validateMcpServerInput({ ...valid, url: '' })).toBe(
      'URL endpoint wajib diisi.',
    );
  });

  it('rejects a non-http URL for http/sse', () => {
    expect(validateMcpServerInput({ ...valid, url: 'mcp.zapier.com/x' })).toBe(
      'URL harus diawali http:// atau https://.',
    );
  });

  it('rejects stdio without a command', () => {
    expect(
      validateMcpServerInput({ name: 'fs', type: 'stdio', url: '  ' }),
    ).toBe('Perintah server (stdio) wajib diisi.');
  });
});

describe('addMcpServer (POST /api/mcp/servers)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts {name, type, url} and returns the created server', async () => {
    let seenBody: unknown;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body ?? '{}'));
      expect(url).toContain('/api/mcp/servers');
      expect(init?.method).toBe('POST');
      return jsonResponse(201, {
        server: {
          id: 'zapier',
          name: 'zapier',
          type: 'http',
          enabled: true,
          url: 'https://mcp.zapier.com/api/v1/connect',
        },
      });
    });
    const created = await addMcpServer({
      name: ' zapier ',
      type: 'http',
      url: 'https://mcp.zapier.com/api/v1/connect',
    });
    expect(created?.id).toBe('zapier');
    expect(created?.enabled).toBe(true);
    expect(seenBody).toEqual({
      name: 'zapier',
      type: 'http',
      url: 'https://mcp.zapier.com/api/v1/connect',
    });
  });

  it('returns null on 401 (token needed)', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, {}));
    const created = await addMcpServer({
      name: 'zapier',
      type: 'http',
      url: 'https://mcp.zapier.com/api/v1/connect',
    });
    expect(created).toBeNull();
  });

  it('throws ApiError with the server message on 501 (endpoint not implemented yet)', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(501, { error: 'not implemented' }),
    );
    await expect(
      addMcpServer({
        name: 'zapier',
        type: 'http',
        url: 'https://mcp.zapier.com/api/v1/connect',
      }),
    ).rejects.toMatchObject({ status: 501, message: 'not implemented' });
  });

  it('throws ApiError with the status text when the error body is not JSON', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('not json');
      },
    }));
    await expect(
      addMcpServer({
        name: 'zapier',
        type: 'http',
        url: 'https://mcp.zapier.com/api/v1/connect',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
