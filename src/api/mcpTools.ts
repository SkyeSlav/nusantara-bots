/**
 * Tool MCP untuk chat BYO (0.10.0 — MCP full, pola proyek referensi).
 *
 * Arsitektur: MCP client hidup di SERVER (Python stdlib) — aplikasi
 * hanya meminta daftar tool (GET /api/mcp/tools) dan eksekusi
 * (POST /api/mcp/call). Sama seperti vm_exec: aplikasi tidak
 * mengeksekusi apa pun sendiri.
 *
 * Nama tool: `${server}_${tool}` (maks 64 karakter, tabrakan → `_2`)
 * — sama seperti proyek referensi supaya konsisten dengan server.
 * Tool loop BYO (byo.ts) sudah generik: mcpTools tinggal digabung
 * ke daftar tools di ChatScreen bersama vm_exec + create_bot.
 *
 * Fail-soft: server tanpa endpoint MCP / gagal memuat daftar =
 * daftar kosong — chat tetap jalan dengan vm_exec + bot tools saja.
 * TIDAK PERNAH throw dari eksekutor (semua kegagalan jadi teks
 * hasil tool, seperti executeVmExecTool).
 */

import { apiFetch, apiFetchTimeout } from './client';
import type { ChatTool, ParsedToolCall } from './byo';

/** Satu tool MCP dari server (GET /api/mcp/tools). */
export interface McpToolDefinition {
  /** Nama gabungan `${server}_${tool}` (yang dipakai model). */
  name: string;
  description: string;
  /** Skema input JSON (bentuk OpenAI parameters). */
  inputSchema: Record<string, unknown>;
  /** Nama server MCP pemilik tool ini. */
  server: string;
  /** Nama tool asli di server (tanpa prefix server). */
  tool: string;
}

/** Batas hasil tool MCP yang diteruskan ke model (sama seperti vm_exec). */
export const MCP_MAX_OUTPUT_CHARS = 8000;

/**
 * Ambil daftar tool MCP dari server (GET /api/mcp/tools).
 * Fail-soft: gagal apa pun (404, jaringan putus, format aneh) =
 * daftar kosong — chat tetap jalan tanpa tool MCP.
 */
export async function getMcpTools(): Promise<ChatTool[]> {
  let res: Response;
  try {
    res = await apiFetch('/api/mcp/tools');
  } catch {
    return [];
  }
  if (!res.ok) return [];
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const tools = (data as Record<string, unknown>).tools;
  if (!Array.isArray(tools)) return [];
  const out: ChatTool[] = [];
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const d = t as Record<string, unknown>;
    if (typeof d.name !== 'string' || !d.name) continue;
    const params =
      d.inputSchema && typeof d.inputSchema === 'object'
        ? (d.inputSchema as Record<string, unknown>)
        : { type: 'object', properties: {} };
    out.push({
      type: 'function',
      function: {
        name: d.name,
        description: typeof d.description === 'string' ? d.description : `Tool MCP ${d.name}.`,
        parameters: params,
      },
    });
  }
  return out;
}

/** Nama tool MCP yang terdaftar (untuk paragraf system prompt). */
export async function getMcpToolNames(): Promise<string[]> {
  const tools = await getMcpTools();
  return tools.map((t) => t.function.name);
}

// ---------------------------------------------------------------------------
// Klasifikasi baca vs tulis (M4 — approval).
//
// Aturan (fail-closed: yang tidak dikenali sebagai baca dianggap tulis
// dan minta kartu approval):
//  1. Nama mengandung "write" → tulis (mis. execute_zapier_write_action).
//  2. Awalan baca / mengandung "_read_" / discover / directory read
//     (search_tools, describe_tool, query_result) → baca.
//  3. Awalan tulis (create/delete/remove/update/send/set/enable/
//     disable/provision) → tulis.
//  4. Sisanya → tulis (kartu approval, bukan jalan diam-diam).
// ---------------------------------------------------------------------------

const MCP_READ_PREFIXES = [
  'list_',
  'get_',
  'search_',
  'describe_',
  'discover_',
  'read_',
  'inspect_',
  'fetch_',
  'query_',
  'check_',
  'show_',
  'view_',
  'find_',
  'count_',
  'status_',
];

const MCP_WRITE_PREFIXES = [
  'create_',
  'delete_',
  'remove_',
  'update_',
  'send_',
  'set_',
  'enable_',
  'disable_',
  'provision_',
];

const MCP_DIRECTORY_READ_TOOLS = new Set(['search_tools', 'describe_tool', 'query_result']);

/**
 * True bila tool MCP ini MENULIS ke dunia luar (butuh kartu approval
 * sebelum dieksekusi). `serverToolName` adalah nama tool ASLI di
 * server (tanpa prefix `${server}_`) bila diketahui — bila tidak
 * diketahui, pakai nama gabungan (klasifikasi tetap jalan karena
 * pola dicocokkan di mana saja di nama).
 */
export function isMcpWriteTool(serverToolName: string): boolean {
  const name = (serverToolName || '').toLowerCase();
  if (!name) return true;
  // call_tool adalah dispatch ke tool lain — targetnya tidak bisa
  // dipastikan dari nama saja, jadi selalu minta approval.
  if (name === 'call_tool' || name.endsWith('_call_tool')) return true;
  if (name.includes('write')) return true;
  if (MCP_DIRECTORY_READ_TOOLS.has(name)) return false;
  if (name.includes('discover')) return false;
  if (name.includes('_read_') || name.endsWith('_read')) return false;
  if (MCP_READ_PREFIXES.some((p) => name.startsWith(p))) return false;
  if (MCP_WRITE_PREFIXES.some((p) => name.startsWith(p))) return true;
  return true;
}

/** Timeout eksekusi tool MCP (0.10.15). Server lambat: rea_search_tools
 * ~13 dtk, tools/list ~18 dtk. Tanpa timeout, apiFetch polos bisa
 * gantung selamanya bila server/MCP macet — indikator "Memakai tool"
 * jalan terus tanpa akhir. 120 dtk memberi ruang lega tapi tetap
 * gagal cepat dengan pesan jelas, bukan hang tanpa akhir. */
export const MCP_CALL_TIMEOUT_MS = 120000;

/** Hasil eksekusi tool MCP dari server (kontrak POST /api/mcp/call). */
export type McpCallResult =
  | { ok: true; text: string; isError: boolean }
  | { ok: false; error: string };

/**
 * Panggil POST /api/mcp/call di server. TIDAK PERNAH throw.
 */
export async function callMcpTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  let res: Response;
  try {
    res = await apiFetchTimeout('/api/mcp/call', MCP_CALL_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
    });
  } catch {
    return { ok: false, error: 'Server MCP tidak terjangkau — server tidak menjawab. Coba lagi nanti.' };
  }
  if (!res.ok) {
    return { ok: false, error: `Server MCP menolak eksekusi (HTTP ${res.status}).` };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Server MCP menjawab dengan format yang tidak dikenal.' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Server MCP menjawab dengan format yang tidak dikenal.' };
  }
  const d = data as Record<string, unknown>;
  if (d.ok === false) {
    return {
      ok: false,
      error: typeof d.error === 'string' && d.error ? d.error : 'Tool MCP gagal tanpa pesan error.',
    };
  }
  return {
    ok: true,
    text: typeof d.text === 'string' ? d.text : '',
    isError: d.isError === true,
  };
}

/**
 * Eksekutor tool MCP untuk tool loop BYO. TIDAK PERNAH throw.
 *
 * `approveWrite` (opsional, dari ChatScreen): bila tool ini tulis,
 * dipanggil dulu untuk meminta persetujuan — kembalikan true bila
 * diizinkan, false bila ditolak. Tanpa `approveWrite`, tool tulis
 * DITOLAK dengan pesan jujur (fail-closed — jangan pernah auto-jalan
 * tanpa approval).
 *
 * ALWAYS ALLOW (0.10.7, keputusan Sam): aplikasi selalu mengoper
 * approveWrite yang mengembalikan true — tidak ada lagi kartu
 * approval / jeda Izinkan-Tolak di chat. Fail-closed di atas hanya
 * berlaku untuk pemanggil lain yang tidak mengoper approver.
 */
export async function executeMcpTool(
  call: ParsedToolCall,
  approveWrite?: (call: ParsedToolCall) => Promise<boolean>,
): Promise<string> {
  if (!call.argsValid) {
    return 'Argumen tool MCP tidak valid (bukan JSON objek). Berikan argumen sebagai objek.';
  }
  const args =
    call.args && typeof call.args === 'object' && !Array.isArray(call.args)
      ? (call.args as Record<string, unknown>)
      : {};
  // Nama tool asli = bagian setelah prefix server pertama — dipakai
  // klasifikasi baca/tulis. Bila tidak ada `_`, pakai nama utuh.
  const underscore = call.name.indexOf('_');
  const rawName = underscore >= 0 ? call.name.slice(underscore + 1) : call.name;
  if (isMcpWriteTool(rawName)) {
    const allowed = approveWrite ? await approveWrite(call) : false;
    if (!allowed) {
      return (
        `Aksi itu TIDAK dijalankan: tool tulis butuh persetujuan pengguna ` +
        `dan pengguna menolak (atau approval belum tersedia). Beri tahu pengguna dengan jujur ` +
        `bahwa aksi tidak dilakukan.`
      );
    }
  }
  const result = await callMcpTool(call.name, args);
  if (!result.ok) {
    return `Gagal: ${result.error}`;
  }
  if (result.isError) {
    return `Terjadi error:\n${result.text || '(tidak ada pesan)'}`;
  }
  return result.text || '(tool selesai tanpa output)';
}
