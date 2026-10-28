import { splitMessageSegments } from '../messageTables';

describe('splitMessageSegments', () => {
  it('teks biasa tanpa tabel jadi satu segmen teks', () => {
    const segs = splitMessageSegments('Halo Sam\nApa kabar?');
    expect(segs).toEqual([{ type: 'text', text: 'Halo Sam\nApa kabar?' }]);
  });

  it('teks kosong jadi segmen kosong', () => {
    expect(splitMessageSegments('')).toEqual([]);
  });

  it('tabel dengan pemisah dikenali sebagai segmen tabel', () => {
    const input =
      'Hasil analisa:\n' +
      '| # | Aksi | Deadline |\n' +
      '|---|---|---|\n' +
      '| 1 | Cek Studio | 26 Okt |\n' +
      '| 2 | Produksi video | 27 Okt |\n' +
      'Selesai.';
    const segs = splitMessageSegments(input);
    expect(segs).toEqual([
      { type: 'text', text: 'Hasil analisa:' },
      {
        type: 'table',
        text:
          '| # | Aksi | Deadline |\n' +
          '|---|---|---|\n' +
          '| 1 | Cek Studio | 26 Okt |\n' +
          '| 2 | Produksi video | 27 Okt |',
      },
      { type: 'text', text: 'Selesai.' },
    ]);
  });

  it('tabel tanpa pemisah tapi 3+ baris tetap dikenali', () => {
    const input = '| a | b |\n| 1 | 2 |\n| 3 | 4 |';
    const segs = splitMessageSegments(input);
    expect(segs).toEqual([{ type: 'table', text: input }]);
  });

  it('satu baris | sendirian bukan tabel', () => {
    const input = 'Cek ini | lalu lanjut\nBaris berikut.';
    const segs = splitMessageSegments(input);
    expect(segs).toEqual([{ type: 'text', text: input }]);
  });

  it('dua baris | tanpa pemisah bukan tabel', () => {
    const input = '| a | b |\n| 1 | 2 |\nTeks sesudahnya.';
    const segs = splitMessageSegments(input);
    expect(segs).toEqual([{ type: 'text', text: input }]);
  });

  it('dua tabel terpisah jadi dua segmen tabel', () => {
    const input =
      '| A | B |\n|---|---|\n| 1 | 2 |\n\nTengah.\n\n| C | D |\n|---|---|\n| 3 | 4 |';
    const segs = splitMessageSegments(input);
    expect(segs.length).toBe(3);
    expect(segs[0].type).toBe('table');
    expect(segs[1]).toEqual({ type: 'text', text: 'Tengah.' });
    expect(segs[2].type).toBe('table');
  });

  it('baris tabel dengan spasi di depan tetap dikenali', () => {
    const input = '  | A | B |\n  |---|---|\n  | 1 | 2 |';
    const segs = splitMessageSegments(input);
    expect(segs).toEqual([{ type: 'table', text: input }]);
  });
});
