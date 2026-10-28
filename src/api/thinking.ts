/**
 * Indikator thinking di dalam chat (0.10.7, Sam: "tambah 1 thinking
 * jadi kita tau bot kerja apa bengon").
 *
 * SATU indikator yang jadi sumber kebenaran aktivitas — di dalam
 * daftar chat, bukan pill status bar. Fase:
 * - 'thinking': menunggu token pertama dari model (DeepSeek web
 *   chat lambat, prompt ~113K karakter — UI tidak boleh diam).
 * - 'tool': satu tool sedang jalan; teks ikut berubah tiap tool dan
 *   tiap ronde (nomor tool ke-N naik walau call-nya identik, supaya
 *   tidak terlihat stuck di satu teks saat bot mengulang call).
 * - hilang saat teks balasan mengalir / balasan selesai.
 * - 'waiting': tidak ada progres (token/tool baru) selama
 *   THINKING_NO_PROGRESS_SECONDS — teks memberi tahu lama tunggu
 *   sebagai fakta, tanpa menuduh model.
 *
 * Animasi titik bergerak ditangani komponen TypingDots di layar;
 * fungsi di sini murni (mudah dites) dan hanya membangun teks.
 * Detak timer + state React hidup di ChatScreen.
 */
import type { ParsedToolCall } from './byo';

/** Diam tanpa progres selama ini -> indikator jadi "menunggu". */
export const THINKING_NO_PROGRESS_SECONDS = 30;

export type ThinkingPhase = 'thinking' | 'tool';

export interface ThinkingState {
  phase: ThinkingPhase;
  /** Nama tool yang sedang jalan (fase 'tool'). */
  toolName?: string;
  /** Ringkasan argumen tool (fase 'tool'). */
  toolSummary?: string;
  /** Tool ke-N dalam turn ini (naik tiap call, walau identik). */
  toolCount?: number;
  /** Putaran tool ke-N (1-based) — progres utama selama cap 20. */
  round?: number;
}

/** Ringkasan argumen tool untuk indikator — pendek, satu baris. */
export function summarizeToolArgs(call: ParsedToolCall): string {
  const args = (call.args ?? {}) as Record<string, unknown>;
  // vm_exec: tampilkan perintahnya (yang paling informatif).
  if (call.name === 'vm_exec' && typeof args.command === 'string') {
    return clipThinkingText(args.command, 60);
  }
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  const first = keys[0];
  const value = args[first];
  if (typeof value === 'string') return clipThinkingText(value, 60);
  return clipThinkingText(JSON.stringify(args), 60);
}

function clipThinkingText(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

/**
 * Detik tanpa progres dari timestamp terakhir ada progres.
 * `lastProgressMs` = Date.now() saat terakhir ada progres (0 bila
 * belum pernah diset — mis. thinking di-set lewat adoptRunningTurn
 * tanpa noteThinkingProgress). Bila 0, kembalikan 0 — JANGAN hitung
 * dari epoch, karena hasilnya timestamp Unix (~1,7 miliar detik)
 * dan tampil "(1793122408 dtk tanpa progres)".
 */
export function waitingSecondsSince(lastProgressMs: number, nowMs: number): number {
  if (!lastProgressMs) return 0;
  return Math.max(0, Math.floor((nowMs - lastProgressMs) / 1000));
}

/**
 * Teks indikator thinking. `waitingSeconds` = detik tanpa progres;
 * di bawah THINKING_NO_PROGRESS_SECONDS belum masuk mode menunggu.
 */
export function buildThinkingText(
  thinking: ThinkingState,
  waitingSeconds: number,
): string {
  const name = thinking.toolName ?? 'tool';
  const summary = thinking.toolSummary ? ` — ${thinking.toolSummary}` : '';
  const count = thinking.toolCount ? ` (tool ke-${thinking.toolCount})` : '';
  // Putaran ke-N adalah progres utama (cap 20) — tampil di depan
  // jumlah tool supaya Sam langsung lihat bot di putaran berapa.
  const round = thinking.round ? ` (ronde ${thinking.round})` : '';
  if (waitingSeconds >= THINKING_NO_PROGRESS_SECONDS) {
    if (thinking.phase === 'tool') {
      return `Memakai tool: ${name}${summary}${round}${count} (${waitingSeconds} dtk tanpa progres)`;
    }
    return `Menunggu balasan model (${waitingSeconds} dtk tanpa progres)`;
  }
  if (thinking.phase === 'tool') {
    return `Memakai tool: ${name}${summary}${round}${count}`;
  }
  return 'Berpikir';
}
