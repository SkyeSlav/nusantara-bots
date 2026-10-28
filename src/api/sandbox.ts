/**
 * Sandbox (Fase B, 0.9.9 — pola proyek referensi Local VM).
 *
 * Pola yang dipinjam (bukan kode — semua tulisan sendiri):
 * - proyek referensi `vm_exec` (containerExec): satu fungsi eksekusi yang
 *   mengembalikan {exitCode, stdout, stderr, timedOut}; perintah
 *   dibatasi panjang + timeout; output dipotong head+tail.
 * - proyek referensi: keamanan berasal dari ISOLASI (container), bukan dari
 *   approval per-perintah — kerja di dalam sandbox sendiri tidak
 *   butuh approval; approval efek luar = Fase C, bukan di sini.
 *
 * Sisi aplikasi ini TIDAK mengeksekusi apa pun sendiri: semua
 * eksekusi lewat server (POST /api/sandbox/exec, kontrak di handoff
 * 0.9.9 — parent yang membangun server + container Docker-nya).
 * Bila server belum ada / gagal, tool call gagal dengan pesan ramah
 * (bukan crash), dan model diberi tahu hasilnya gagal.
 */

import { apiFetch } from './client';
import type { ChatTool, ParsedToolCall } from './byo';

export const VM_EXEC_TOOL_NAME = 'vm_exec';

/**
 * Tool `vm_exec` untuk model (skema OpenAI function calling).
 * Dijalankan HANYA di dalam sandbox terisolasi di server.
 */
export const VM_EXEC_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: VM_EXEC_TOOL_NAME,
    description:
      'Jalankan satu perintah shell di dalam sandbox Linux terisolasi milikmu. ' +
      'Perintah berjalan di workspace sandbox; hasilnya berupa exit code beserta output teks. ' +
      'Pakai tool ini untuk memeriksa file, menjalankan skrip, atau mengerjakan tugas di sandbox.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Perintah shell yang dijalankan di sandbox (satu baris atau skrip pendek).',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Batas waktu eksekusi dalam detik (default 60, maks 300).',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

/** Batas perintah (pola referensi: ≤20.000 karakter). */
export const VM_EXEC_MAX_COMMAND_LENGTH = 20000;
/** Timeout default + maks (detik). */
export const VM_EXEC_DEFAULT_TIMEOUT_SECONDS = 60;
export const VM_EXEC_MAX_TIMEOUT_SECONDS = 300;
/** Batas output yang diteruskan ke model (head+tail). */
export const VM_EXEC_MAX_OUTPUT_CHARS = 8000;

/**
 * Potong output panjang menjadi head + tail (pola referensi
 * clipExecOutput) supaya tidak membanjiri konteks model.
 */
export function clipExecOutput(text: string, maxChars: number = VM_EXEC_MAX_OUTPUT_CHARS): string {
  const t = text ?? '';
  if (t.length <= maxChars) return t;
  const omitted = t.length - maxChars;
  const headLen = Math.ceil(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  return `${t.slice(0, headLen)}\n… ${omitted} karakter dihilangkan …\n${t.slice(t.length - tailLen)}`;
}

export type VmExecArgs =
  | { ok: true; command: string; timeoutSeconds: number }
  | { ok: false; error: string };

/** Validasi argumen vm_exec dari model (jangan kirim perintah kosong). */
export function validateVmExecArgs(args: unknown): VmExecArgs {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: 'Argumen vm_exec harus berupa objek dengan command.' };
  }
  const raw = (args as Record<string, unknown>).command;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'Perintah vm_exec kosong — berikan command yang valid.' };
  }
  const command = raw.trim();
  if (command.length > VM_EXEC_MAX_COMMAND_LENGTH) {
    return {
      ok: false,
      error: `Perintah terlalu panjang (${command.length} karakter, maks ${VM_EXEC_MAX_COMMAND_LENGTH}). Bagi menjadi beberapa perintah yang lebih pendek.`,
    };
  }
  const rawTimeout = (args as Record<string, unknown>).timeout_seconds;
  let timeoutSeconds = VM_EXEC_DEFAULT_TIMEOUT_SECONDS;
  if (typeof rawTimeout === 'number' && Number.isFinite(rawTimeout)) {
    timeoutSeconds = Math.min(
      VM_EXEC_MAX_TIMEOUT_SECONDS,
      Math.max(1, Math.floor(rawTimeout)),
    );
  }
  return { ok: true, command, timeoutSeconds };
}

/** Hasil eksekusi dari server (kontrak POST /api/sandbox/exec). */
export type SandboxExecResult =
  | {
      ok: true;
      exitCode: number;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }
  | { ok: false; error: string };

/**
 * Panggil POST /api/sandbox/exec di server. TIDAK PERNAH throw —
 * semua kegagalan (server belum ada, jaringan putus, respons aneh)
 * dikembalikan sebagai {ok:false, error} supaya tool call bisa
 * memberi tahu model dengan ramah.
 */
export async function execSandboxCommand(
  command: string,
  timeoutSeconds: number = VM_EXEC_DEFAULT_TIMEOUT_SECONDS,
): Promise<SandboxExecResult> {
  let res: Response;
  try {
    res = await apiFetch('/api/sandbox/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout: timeoutSeconds }),
    });
  } catch {
    return {
      ok: false,
      error: 'Sandbox tidak terjangkau — server tidak menjawab. Coba lagi nanti.',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `Sandbox menolak eksekusi (HTTP ${res.status}). Server sandbox mungkin belum disiapkan.`,
    };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Sandbox menjawab dengan format yang tidak dikenal.' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Sandbox menjawab dengan format yang tidak dikenal.' };
  }
  const d = data as Record<string, unknown>;
  if (
    typeof d.exitCode !== 'number' ||
    typeof d.stdout !== 'string' ||
    typeof d.stderr !== 'string'
  ) {
    return { ok: false, error: 'Sandbox menjawab tanpa exitCode/stdout/stderr yang valid.' };
  }
  return {
    ok: true,
    exitCode: d.exitCode,
    stdout: d.stdout,
    stderr: d.stderr,
    timedOut: d.timedOut === true,
  };
}

/**
 * Format hasil eksekusi menjadi teks untuk model (hasil tool).
 * Output dipotong head+tail; kegagalan dijelaskan dengan jujur.
 */
export function formatVmExecResult(result: SandboxExecResult): string {
  if (!result.ok) {
    return `Perintah gagal dijalankan di sandbox: ${result.error} Beri tahu pengguna dengan jujur dan jangan mengulang perintah yang sama.`;
  }
  const lines: string[] = [
    `Perintah selesai (exit code ${result.exitCode}${result.timedOut ? ', waktu habis' : ''}).`,
  ];
  const out = clipExecOutput(result.stdout);
  const err = clipExecOutput(result.stderr);
  if (out) lines.push(`stdout:\n${out}`);
  if (err) lines.push(`stderr:\n${err}`);
  if (!out && !err) lines.push('(tidak ada output)');
  return lines.join('\n');
}

/**
 * Eksekutor tool vm_exec untuk tool loop BYO. TIDAK PERNAH throw —
 * semua kegagalan dikembalikan sebagai teks hasil tool.
 */
export async function executeVmExecTool(call: ParsedToolCall): Promise<string> {
  if (call.name !== VM_EXEC_TOOL_NAME) {
    return 'Tool itu tidak dikenal di aplikasi ini.';
  }
  if (!call.argsValid) {
    return 'Argumen vm_exec tidak valid (bukan JSON objek). Berikan command sebagai string.';
  }
  const checked = validateVmExecArgs(call.args);
  if (!checked.ok) {
    return `Perintah tidak dijalankan: ${checked.error}`;
  }
  const result = await execSandboxCommand(checked.command, checked.timeoutSeconds);
  return formatVmExecResult(result);
}

export interface SandboxStatus {
  available: boolean;
  workspace: string | null;
}

const SANDBOX_STATUS_TIMEOUT_MS = 3000;

/**
 * Cek ketersediaan sandbox di server (GET /api/sandbox/status).
 * Fail-soft: gagal apa pun (404, jaringan putus, timeout) = tidak
 * tersedia — chat tetap jalan sebagai chat teks biasa.
 */
export async function checkSandboxAvailable(): Promise<SandboxStatus> {
  const unavailable: SandboxStatus = { available: false, workspace: null };
  try {
    const result = await Promise.race([
      apiFetch('/api/sandbox/status').then(async (res) => {
        if (!res.ok) return unavailable;
        try {
          const data = (await res.json()) as Record<string, unknown>;
          if (data && data.available === true) {
            return {
              available: true,
              workspace: typeof data.workspace === 'string' ? data.workspace : null,
            };
          }
          return unavailable;
        } catch {
          return unavailable;
        }
      }),
      new Promise<SandboxStatus>((resolve) =>
        setTimeout(() => resolve(unavailable), SANDBOX_STATUS_TIMEOUT_MS),
      ),
    ]);
    return result;
  } catch {
    return unavailable;
  }
}
