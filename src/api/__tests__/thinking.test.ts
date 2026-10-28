/**
 * Tests untuk indikator thinking (thinking.ts, 0.10.7).
 *
 * Aturan yang diuji: fase berpikir -> fase tool (nama + ringkasan
 * argumen + nomor tool) -> mode menunggu setelah 30 dtk tanpa
 * progres (fakta waktu, tanpa tuduhan).
 */
import {
  THINKING_NO_PROGRESS_SECONDS,
  buildThinkingText,
  summarizeToolArgs,
  waitingSecondsSince,
  type ThinkingState,
} from '../thinking';
import type { ParsedToolCall } from '../byo';

function call(name: string, args: unknown): ParsedToolCall {
  return {
    id: 'call-1',
    name,
    args: args as Record<string, unknown>,
    argsRaw: JSON.stringify(args ?? {}),
    argsValid: true,
  };
}

describe('waitingSecondsSince', () => {
  it('ref 0 (belum pernah progres) = 0, BUKAN timestamp Unix (0.10.15)', () => {
    // Akar bug 28 Okt 00:33: thinkingProgressRef awal 0, elapsed =
    // Date.now()/1000 = 1793122408 dtk. Helper ini mengembalikan 0.
    expect(waitingSecondsSince(0, 1793122408000)).toBe(0);
    expect(waitingSecondsSince(0, Date.now())).toBe(0);
  });

  it('menghitung elapsed normal dan tidak negatif', () => {
    expect(waitingSecondsSince(100000, 145000)).toBe(45);
    expect(waitingSecondsSince(200000, 100000)).toBe(0);
  });
});

describe('summarizeToolArgs', () => {
  it('vm_exec menampilkan perintahnya (dipotong 60 karakter)', () => {
    const s = summarizeToolArgs(
      call('vm_exec', { command: 'ls /home/cua/workspace' }),
    );
    expect(s).toBe('ls /home/cua/workspace');
    const long = summarizeToolArgs(
      call('vm_exec', {
        command:
          'echo "=== whoami/id ==="; id; echo "=== network ==="; (ip a 2>/dev/null || ifconfig); echo "=== os ==="; cat /etc/os-release',
      }),
    );
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith('…')).toBe(true);
  });

  it('tool lain menampilkan nilai argumen pertama', () => {
    expect(summarizeToolArgs(call('browser_type', { text: 'jadwal sholat' }))).toBe(
      'jadwal sholat',
    );
    expect(summarizeToolArgs(call('filesystem_list_allowed_directories', {}))).toBe('');
  });
});

describe('buildThinkingText', () => {
  it('fase thinking: "Berpikir"', () => {
    const t: ThinkingState = { phase: 'thinking' };
    expect(buildThinkingText(t, 0)).toBe('Berpikir');
  });

  it('fase tool: nama + ringkasan + nomor tool', () => {
    const t: ThinkingState = {
      phase: 'tool',
      toolName: 'vm_exec',
      toolSummary: 'ls /home/cua/workspace',
      toolCount: 2,
    };
    expect(buildThinkingText(t, 0)).toBe(
      'Memakai tool: vm_exec — ls /home/cua/workspace (tool ke-2)',
    );
  });

  it('putaran ke-N tampil saat round diset (cap 20, Sam 09:01)', () => {
    const t: ThinkingState = {
      phase: 'tool',
      toolName: 'vm_exec',
      toolSummary: 'ls /home/cua/workspace',
      toolCount: 2,
      round: 3,
    };
    expect(buildThinkingText(t, 0)).toBe(
      'Memakai tool: vm_exec — ls /home/cua/workspace (ronde 3) (tool ke-2)',
    );
  });

  it('nomor tool naik walau call identik (progres terlihat)', () => {
    const t1: ThinkingState = {
      phase: 'tool',
      toolName: 'vm_exec',
      toolSummary: 'uname -a',
      toolCount: 1,
    };
    const t2: ThinkingState = { ...t1, toolCount: 3 };
    expect(buildThinkingText(t1, 0)).toContain('(tool ke-1)');
    expect(buildThinkingText(t2, 0)).toContain('(tool ke-3)');
    expect(buildThinkingText(t1, 0)).not.toBe(buildThinkingText(t2, 0));
  });

  it('menunggu 30 dtk tanpa progres: fakta waktu, tanpa tuduhan', () => {
    expect(THINKING_NO_PROGRESS_SECONDS).toBe(30);
    const t: ThinkingState = { phase: 'thinking' };
    const text = buildThinkingText(t, 30);
    expect(text).toBe('Menunggu balasan model (30 dtk tanpa progres)');
    expect(text).not.toMatch(/bengong|stuck|macet|error|gagal/i);
  });

  it('menunggu saat tool jalan: nama tool tetap terlihat', () => {
    const t: ThinkingState = {
      phase: 'tool',
      toolName: 'vm_exec',
      toolSummary: 'find /home/cua/workspace',
      toolCount: 4,
    };
    const text = buildThinkingText(t, 45);
    expect(text).toContain('Memakai tool: vm_exec');
    expect(text).toContain('(45 dtk tanpa progres)');
    expect(text).not.toMatch(/bengong|stuck|macet|error|gagal/i);
  });

  it('di bawah 30 dtk belum masuk mode menunggu', () => {
    const t: ThinkingState = { phase: 'thinking' };
    expect(buildThinkingText(t, 29)).toBe('Berpikir');
  });
});
