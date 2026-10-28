/**
 * MCP servers (0.9.5, permintaan Sam: "pilihan Connect mcp tidak ada").
 *
 * CATATAN 0.9.6: server SUDAH punya GET /api/mcp/servers dan POST
 * /api/mcp/servers/:id {enabled} (diimplementasikan 2026-10-26 di
 * PC, sumber: profil tunnel-client ~/.config/tunnel-client/*-mcp.yaml;
 * 41 server, enabled = tunnel_id real bukan REPLACE_ME). Yang BELUM
 * ada: POST /api/mcp/servers untuk MENAMBAH server baru — spesifikasi
 * ada di BUILD-0.9.6-HANDOFF.md; sampai endpoint itu ada, form
 * "Connect MCP" menampilkan pesan itu apa adanya (tidak ada sukses
 * palsu).
 *
 * Bentuk satu server MCP (yang dikembalikan server):
 *   {id, name, type: "stdio" | "http" | "sse", enabled,
 *    url?, tools_count?}
 */

import { apiJson, apiFetch } from './client';
import { ApiError } from './types';

export type McpServerType = 'stdio' | 'http' | 'sse';

export interface McpServer {
  id: string;
  name: string;
  type: McpServerType;
  enabled: boolean;
  /** URL remote (http/sse) — kosong untuk stdio. */
  url?: string;
  /** Jumlah tool yang diekspos server ini, bila server tahu. */
  tools_count?: number;
}

export interface McpServersResponse {
  servers: McpServer[];
}

/**
 * GET /api/mcp/servers — null on 401 (token needed).
 * Throws ApiError 404/501 bila server belum mengimplementasikan
 * endpoint ini — pemanggil membedakan itu dari "tidak ada server"
 * (daftar kosong) supaya pesannya jujur.
 */
export async function getMcpServers(): Promise<McpServer[] | null> {
  const data = await apiJson<McpServersResponse>('/api/mcp/servers');
  return data ? data.servers : null;
}

/**
 * POST /api/mcp/servers/:id {enabled} — nyalakan/matikan satu
 * server MCP. Returns false on 401 (token needed); throws ApiError
 * bila server menolak (termasuk 404/501: endpoint belum ada).
 */
export async function setMcpServerEnabled(
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const res = await apiFetch(`/api/mcp/servers/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    let message = `Server returned HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (data && typeof data.error === 'string' && data.error) {
        message = data.error;
      }
    } catch {
      /* bukan JSON — pakai pesan status */
    }
    throw new ApiError(res.status, message);
  }
  return true;
}

/** Ringkasan hitungan untuk header bagian MCP. */
export function mcpServerSummary(servers: McpServer[]): {
  total: number;
  enabled: number;
} {
  return {
    total: servers.length,
    enabled: servers.filter((s) => s.enabled).length,
  };
}

/** Input form "Connect MCP" (0.9.6). */
export interface NewMcpServerInput {
  name: string;
  type: McpServerType;
  /**
   * http/sse: URL endpoint (mis. https://mcp.zapier.com/...).
   * stdio: perintah/server yang dijalankan (mis. npx -y ...).
   */
  url: string;
}

/**
 * Validasi input form Connect MCP. Mengembalikan pesan error bahasa
 * Indonesia, atau null bila valid. Murni — dipakai layar dan test.
 */
export function validateMcpServerInput(input: NewMcpServerInput): string | null {
  if (!input.name.trim()) return 'Nama MCP wajib diisi.';
  if (input.type !== 'stdio' && input.type !== 'http' && input.type !== 'sse') {
    return 'Tipe MCP harus stdio, http, atau sse.';
  }
  const target = input.url.trim();
  if (!target) {
    return input.type === 'stdio'
      ? 'Perintah server (stdio) wajib diisi.'
      : 'URL endpoint wajib diisi.';
  }
  if (input.type !== 'stdio' && !/^https?:\/\//i.test(target)) {
    return 'URL harus diawali http:// atau https://.';
  }
  return null;
}

/**
 * POST /api/mcp/servers — tambah server MCP baru (0.9.6, "Connect
 * MCP"). Body {name, type, url}. Returns server yang dibuat, atau
 * null pada 401 (token dibutuhkan). Throws ApiError bila server
 * menolak — termasuk 404/501 (endpoint tambah-server belum ada di
 * server); pemanggil menampilkan pesan itu apa adanya.
 */
export async function addMcpServer(input: NewMcpServerInput): Promise<McpServer | null> {
  const res = await apiFetch('/api/mcp/servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.trim(),
      type: input.type,
      url: input.url.trim(),
    }),
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    let message = `Server returned HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (data && typeof data.error === 'string' && data.error) {
        message = data.error;
      }
    } catch {
      /* bukan JSON — pakai pesan status */
    }
    throw new ApiError(res.status, message);
  }
  const data = (await res.json()) as { server: McpServer };
  return data.server;
}

/** Hasil probe satu server MCP (POST /api/mcp/servers/:id/test, 0.10.0). */
export interface McpServerProbe {
  ok: boolean;
  tools: Array<{ name: string; description: string }>;
  total: number;
  error?: string;
}

/**
 * POST /api/mcp/servers/:id/test — handshake + tools/list satu
 * server. Fail-soft di level pemanggil: 404/501 (endpoint belum ada)
 * dilempar sebagai ApiError supaya layar menampilkan status jujur.
 */
export async function testMcpServer(id: string): Promise<McpServerProbe> {
  const res = await apiFetch(`/api/mcp/servers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  });
  if (!res.ok) {
    let message = `Server returned HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (data && typeof data.error === 'string' && data.error) {
        message = data.error;
      }
    } catch {
      /* bukan JSON — pakai pesan status */
    }
    throw new ApiError(res.status, message);
  }
  const data = (await res.json()) as {
    ok?: unknown;
    tools?: unknown;
    total?: unknown;
    error?: unknown;
  };
  const tools = Array.isArray(data.tools)
    ? (data.tools as Array<Record<string, unknown>>)
        .filter((t) => t && typeof t.name === 'string')
        .map((t) => ({
          name: t.name as string,
          description: typeof t.description === 'string' ? t.description : '',
        }))
    : [];
  return {
    ok: data.ok === true,
    tools,
    total: typeof data.total === 'number' ? data.total : tools.length,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}
