/**
 * Tests for taskExecution (0.10.14, Issue 1).
 * Repair-turn detector: when the user asks the bot to DO something and
 * the model answers with a PLAN (no tool calls), run one repair turn
 * that forces a tool call.
 */
import {
  buildTaskExecutionRepairPrompt,
  looksLikePlanOnly,
  wantsTaskExecution,
} from '../taskExecution';

describe('wantsTaskExecution', () => {
  it('detects recon / enumeration / check requests (ID + EN)', () => {
    expect(wantsTaskExecution('Enumerasi sub-domain pump.fun')).toBe(true);
    expect(wantsTaskExecution('Buat bot recon mulai dr recon')).toBe(true);
    expect(wantsTaskExecution('Cek file .env dan .git di repo itu')).toBe(true);
    expect(wantsTaskExecution('scan the API for vulnerabilities')).toBe(true);
    expect(wantsTaskExecution('jalankan fuzzing ke endpoint login')).toBe(true);
  });

  it('does not fire on pure questions or chit-chat', () => {
    expect(wantsTaskExecution('Apa itu subdomain?')).toBe(false);
    expect(wantsTaskExecution('Siapa kamu?')).toBe(false);
    expect(wantsTaskExecution('Halo')).toBe(false);
    expect(wantsTaskExecution('')).toBe(false);
  });
});

describe('looksLikePlanOnly', () => {
  it('detects plan language (ID + EN)', () => {
    expect(
      looksLikePlanOnly(
        'Rencana recon: 1. Enumerasi sub-domain api.pump.fun, 2. Deteksi teknologi frontend, 3. Cek file sensitif .env/.git.',
      ),
    ).toBe(true);
    expect(
      looksLikePlanOnly('Berikut langkah-langkah yang akan saya lakukan: pertama, scan port; kedua, cek header.'),
    ).toBe(true);
    expect(looksLikePlanOnly("Here's the plan: step 1 enumerate, step 2 scan.")).toBe(true);
    expect(looksLikePlanOnly('Saya akan memulai proses recon terhadap pump.fun menggunakan tools.')).toBe(true);
  });

  it('detects delegation to another named bot', () => {
    expect(
      looksLikePlanOnly('Web Bughunter Alpha akan mengerjakan enumerasi ini untukmu.'),
    ).toBe(true);
    expect(
      looksLikePlanOnly('Menggunakan bot Automation Fuzzer untuk fuzzing endpoint.'),
    ).toBe(true);
  });

  it('does not flag a real result report', () => {
    expect(
      looksLikePlanOnly(
        'Hasil enumerasi: ditemukan 3 sub-domain — api.pump.fun (200), dev.pump.fun (200), staging.pump.fun (404).',
      ),
    ).toBe(false);
    expect(looksLikePlanOnly('Selesai. 2 kerentanan ditemukan: XSS di /search, SQLi di /login.')).toBe(false);
  });

  it('does not flag empty text', () => {
    expect(looksLikePlanOnly('')).toBe(false);
  });
});

describe('buildTaskExecutionRepairPrompt', () => {
  it('forces a tool call and forbids writing another plan', () => {
    const prompt = buildTaskExecutionRepairPrompt('Enumerasi sub-domain pump.fun');
    expect(prompt).toContain('Enumerasi sub-domain pump.fun');
    expect(prompt).toContain('PANGGIL TOOL SEKARANG');
    expect(prompt).toContain('Jangan menulis rencana');
    expect(prompt).toContain('HASIL NYATA');
  });
});
