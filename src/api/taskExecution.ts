/**
 * taskExecution — detektor + prompt repair untuk Issue 1 (0.10.14).
 *
 * Akar masalah yang TERBUKTI: model menjawab permintaan tugas dengan
 * RENCANA (daftar langkah) tanpa memanggil tool sama sekali. Repair
 * turn 0.10.13 hanya menangani pembuatan bot (create_bot); modul ini
 * menggeneralisasi pola yang sama ke SEMUA tugas: bila pesan pengguna
 * adalah permintaan mengerjakan sesuatu DAN model tidak memanggil tool
 * sama sekali DAN balasannya tampak seperti rencana, jalankan satu
 * repair turn yang memaksa model memanggil tool.
 */

/** Kata kerja tugas (ID + EN) yang menandakan pengguna minta dikerjakan. */
const TASK_VERBS =
  /\b(recon|enumerasi|enum|scan|cek|periksa|cari|telusuri|audit|fuzz|test|uji|buat|bikin|perbaiki|jalankan|eksekusi|lakukan|kerjakan|mulai|hitung|bandingkan|analisa|analisis|kumpulkan|unduh|download|install|pasang|deploy|monitor|pantau|do|run|execute|check|scan|search|find|fetch|build|fix|create|enumerate|audit|fuzz|test|analyze|collect|download|install|deploy|monitor)\b/i;

/** Frasa rencana: model mendeskripsikan apa yang AKAN dilakukan. */
const PLAN_MARKERS =
  /(rencana|langkah[- ]langkah|tahap( |:)|akan (saya |aku )?(melakukan|memulai|menjalankan|mengecek|mencari|mengerjakan)|saya akan|aku akan|berikut (adalah )?rencana|step[- ]by[- ]step|roadmap|workflow|pendekatan|strategi|tahapan|pertama[,:]?\s+(saya|aku)?\s*(akan)?|kedua[,:]|ketiga[,:]|selanjutnya[,:]?\s+(saya|aku)?\s*akan|i will|i'll|here'?s (the )?plan|step 1|langkah 1|phase 1|fase 1)/i;

/** Frasa delegasi ke bot lain dengan nama (model tidak bisa melakukannya). */
const DELEGATION_MARKERS =
  /(bot\s+\w+[\w-]*\s+(akan|siap|langsung|mulai|bertugas)|menggunakan\s+bot\s+\w+|diserahkan\s+ke\s+bot|bot\s+\w+\s+akan\s+melakukan|the\s+\w+\s+bot\s+will)/i;

/**
 * Apakah pesan pengguna adalah permintaan mengerjakan sesuatu (bukan
 * sekadar tanya jawab / obrolan)? Dipakai untuk memutuskan apakah
 * repair turn eksekusi relevan.
 */
export function wantsTaskExecution(text: string): boolean {
  const t = (text || '').trim();
  if (t.length < 3) return false;
  // Pertanyaan murni (diawali kata tanya, tanpa kata kerja tugas) bukan tugas.
  if (/^(apa|siapa|dimana|di mana|kapan|kenapa|mengapa|bagaimana|berapa|apakah|bisakah|bolehkah)\b/i.test(t) && !TASK_VERBS.test(t)) {
    return false;
  }
  return TASK_VERBS.test(t);
}

/**
 * Apakah balasan model tampak seperti rencana / delegasi, bukan hasil
 * kerja nyata? (Tidak ada tool call + teks berisi marker rencana.)
 */
export function looksLikePlanOnly(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return PLAN_MARKERS.test(t) || DELEGATION_MARKERS.test(t);
}

/**
 * Prompt repair turn: paksa model memanggil tool SEKARANG, bukan
 * menulis rencana lagi. Dipakai bila model sudah menjawab dengan
 * rencana tanpa tool call.
 */
export function buildTaskExecutionRepairPrompt(userText: string): string {
  return [
    'PERBAIKAN — kamu menjawab dengan rencana, bukan dengan pekerjaan.',
    `Permintaan pemilik: "${userText}"`,
    'Jangan menulis rencana, daftar langkah, atau janji lagi. PANGGIL TOOL SEKARANG (vm_exec untuk pekerjaan shell/recon di PC, browser_open/browser_search untuk web, MCP untuk pencarian kode/repo) dan kerjakan tugasnya.',
    'Laporkan HASIL NYATA dari output tool. Bila tool gagal, coba cara lain sebelum menyerah.',
  ].join('\n');
}
