// Pesan bot sering berisi tabel markdown (| kolom | ... |) — mis. kotak
// analisa. Teks biasa di bubble dibungkus (wrap) sehingga kolom tabel
// terpotong di tepi kanan dan tidak bisa dilihat utuh. Modul murni ini
// memisahkan blok tabel dari teks biasa, supaya ChatScreen bisa me-render
// tabel di dalam ScrollView horizontal (bisa di-slide) dengan font
// monospace agar kolom tetap sejajar.
//
// Aturan deteksi (sengaja konservatif):
// - Blok tabel = 2+ baris berurutan yang diawali `|` (setelah trim).
// - Baris kedua sebaiknya pemisah (`|---|---|`) tapi tidak wajib — bot
//   kadang mengirim tabel tanpa pemisah, tetap diperlakukan sebagai tabel.
// - Satu baris `|` sendirian BUKAN tabel (teks biasa) — jangan sampai
//   teks normal berubah tampilannya.

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'table'; text: string };

function isTableLine(line: string): boolean {
  return line.trimStart().startsWith('|');
}

function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && /^[\s|:\-]+$/.test(t) && t.includes('-');
}

export function splitMessageSegments(input: string): MessageSegment[] {
  if (!input) return [];
  const lines = input.split('\n');
  const segments: MessageSegment[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length === 0) return;
    // Buang baris kosong berlebih di ujung segmen teks, tapi pertahankan
    // isi di tengahnya.
    let text = textBuf.join('\n');
    text = text.replace(/^\n+/, '').replace(/\n+$/, '');
    if (text) segments.push({ type: 'text', text });
    textBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      // Kumpulkan run baris `|` berurutan.
      const run: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        run.push(lines[i]);
        i += 1;
      }
      const hasSeparator = run.length >= 2 && isSeparatorLine(run[1]);
      if (run.length >= 2 && (hasSeparator || run.length >= 3)) {
        flushText();
        segments.push({ type: 'table', text: run.join('\n') });
      } else {
        // Bukan tabel (mis. 1 baris, atau 2 baris tanpa pemisah):
        // kembalikan ke teks biasa.
        textBuf.push(...run);
      }
    } else {
      textBuf.push(lines[i]);
      i += 1;
    }
  }
  flushText();
  return segments;
}
