/**
 * Tests untuk tool manajemen bot (botTools.ts, 0.9.11 anti-halu).
 *
 * Aturan yang diuji: model HANYA boleh mengklaim bot terbentuk bila
 * tool mengembalikan sukses dari server — eksekutor TIDAK PERNAH
 * mengarang keberhasilan dan TIDAK PERNAH throw.
 */
import {
  CREATE_BOT_TOOL,
  LIST_BOTS_TOOL,
  executeBotTool,
  executeCreateBotTool,
  executeListBotsTool,
  validateCreateBotArgs,
} from '../botTools';
import type { ParsedToolCall } from '../byo';

jest.mock('../client', () => ({
  createCharacter: jest.fn(),
  getCharacters: jest.fn(),
}));
jest.mock('../botChat', () => ({
  createBotChat: jest.fn(),
}));

import { createCharacter, getCharacters } from '../client';
import { createBotChat } from '../botChat';
import { ApiError } from '../types';

const mockCreateCharacter = createCharacter as jest.Mock;
const mockGetCharacters = getCharacters as jest.Mock;
const mockCreateBotChat = createBotChat as jest.Mock;

function call(name: string, args: unknown, argsValid = true): ParsedToolCall {
  return {
    id: 'call-1',
    name,
    args: args as Record<string, unknown>,
    argsRaw: JSON.stringify(args ?? {}),
    argsValid,
  };
}

const BOT = {
  id: 'scribe-bot',
  name: 'Scribe Bot',
  role: 'Penulis naskah',
  skills: ['menulis'],
  memory_scope: 'team',
};

describe('CREATE_BOT_TOOL / LIST_BOTS_TOOL', () => {
  it('mendefinisikan dua tool dengan nama dan deskripsi jujur', () => {
    expect(CREATE_BOT_TOOL.function.name).toBe('create_bot');
    expect(LIST_BOTS_TOOL.function.name).toBe('list_bots');
    expect(CREATE_BOT_TOOL.function.description).toContain('BENAR-BENAR ada');
    expect(CREATE_BOT_TOOL.function.description).toContain('Jangan pernah mengklaim');
    expect(LIST_BOTS_TOOL.function.description).toContain('jangan mengarang');
  });
});

describe('validateCreateBotArgs', () => {
  it('menerima nama + default focus day-to-day', () => {
    expect(validateCreateBotArgs({ name: 'Scribe Bot' })).toEqual({
      ok: true,
      name: 'Scribe Bot',
      role: undefined,
      focus: 'day-to-day',
      skills: undefined,
    });
  });

  it('menerima focus, role, dan skills yang valid', () => {
    expect(
      validateCreateBotArgs({
        name: 'Growth Bot',
        role: 'Analis SEO',
        focus: 'research',
        skills: ['seo', 'riset'],
      }),
    ).toEqual({
      ok: true,
      name: 'Growth Bot',
      role: 'Analis SEO',
      focus: 'research',
      skills: ['seo', 'riset'],
    });
  });

  it('menolak nama kosong, focus tak dikenal, dan nama terlalu panjang', () => {
    expect(validateCreateBotArgs({ name: '   ' }).ok).toBe(false);
    expect(validateCreateBotArgs({ name: 'Bot', focus: 'ngarang' }).ok).toBe(false);
    expect(validateCreateBotArgs({ name: 'x'.repeat(61) }).ok).toBe(false);
    expect(validateCreateBotArgs(null).ok).toBe(false);
    expect(validateCreateBotArgs('teks').ok).toBe(false);
  });

  it('memotong skills ke maks 8 dan menolak skill terlalu panjang', () => {
    const many = validateCreateBotArgs({
      name: 'Bot',
      skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    });
    expect(many.ok).toBe(true);
    if (many.ok) expect(many.skills).toHaveLength(8);
    expect(validateCreateBotArgs({ name: 'Bot', skills: ['x'.repeat(41)] }).ok).toBe(false);
  });
});

describe('executeCreateBotTool', () => {
  it('mengembalikan sukses server apa adanya (nama + id), bukan karangan', async () => {
    mockCreateCharacter.mockResolvedValueOnce(BOT);
    mockCreateBotChat.mockResolvedValueOnce({ roomId: 'room-1', characterId: BOT.id, title: BOT.name });
    const text = await executeCreateBotTool(call('create_bot', { name: 'Scribe Bot' }));
    expect(text).toContain('Bot dibuat: Scribe Bot (id: scribe-bot');
    expect(mockCreateCharacter).toHaveBeenCalledWith({
      name: 'Scribe Bot',
      focus: 'day-to-day',
      role: undefined,
      skills: undefined,
    });
  });

  it('melaporkan 409 sebagai "sudah ada" — bukan sukses palsu', async () => {
    mockCreateCharacter.mockRejectedValueOnce(new ApiError(409, 'already exists'));
    const text = await executeCreateBotTool(call('create_bot', { name: 'Scribe Bot' }));
    expect(text).toContain('tidak dibuat');
    expect(text).toContain('sudah ada');
    expect(text).not.toContain('Bot dibuat');
  });

  it('melaporkan server menolak tanpa mengklaim bot ada', async () => {
    mockCreateCharacter.mockRejectedValueOnce(new Error('boom'));
    const text = await executeCreateBotTool(call('create_bot', { name: 'Scribe Bot' }));
    expect(text).toContain('tidak dibuat');
    expect(text).toContain('jangan mengklaim bot sudah ada');
  });

  it('menolak argumen tidak valid tanpa memanggil server', async () => {
    const text = await executeCreateBotTool(call('create_bot', { name: '' }));
    expect(text).toContain('tidak dibuat');
    expect(mockCreateCharacter).not.toHaveBeenCalled();
  });

  it('menolak tool call yang args-nya bukan JSON valid', async () => {
    const text = await executeCreateBotTool(call('create_bot', null, false));
    expect(text).toContain('tidak valid');
  });

  it('bot tetap dilaporkan dibuat walau room 1-1 gagal (best-effort)', async () => {
    mockCreateCharacter.mockResolvedValueOnce(BOT);
    mockCreateBotChat.mockRejectedValueOnce(new Error('room gagal'));
    const text = await executeCreateBotTool(call('create_bot', { name: 'Scribe Bot' }));
    expect(text).toContain('Bot dibuat: Scribe Bot');
    expect(text).toContain('Room chat-nya belum terbentuk');
  });

  it('0.10.13: server tolak skill tak dikenal (400) → coba lagi tanpa skill, bot tetap dibuat', async () => {
    const risetBot = { ...BOT, id: 'riset-bot', name: 'Riset Bot', role: 'Riset harga pasar' };
    mockCreateCharacter.mockRejectedValueOnce(
      new ApiError(400, 'unknown skill(s): riset, analisis harga'),
    );
    mockCreateCharacter.mockResolvedValueOnce(risetBot);
    mockCreateBotChat.mockResolvedValueOnce({ roomId: 'room-1', characterId: risetBot.id, title: risetBot.name });
    const text = await executeCreateBotTool(
      call('create_bot', { name: 'Riset Bot', focus: 'research', skills: ['riset', 'analisis harga'] }),
    );
    expect(text).toContain('Bot dibuat: Riset Bot');
    // Panggilan pertama pakai skill model, panggilan kedua tanpa skill.
    expect(mockCreateCharacter).toHaveBeenCalledTimes(2);
    expect(mockCreateCharacter).toHaveBeenNthCalledWith(1, {
      name: 'Riset Bot',
      focus: 'research',
      role: undefined,
      skills: ['riset', 'analisis harga'],
    });
    expect(mockCreateCharacter).toHaveBeenNthCalledWith(2, {
      name: 'Riset Bot',
      focus: 'research',
      role: undefined,
    });
  });

  it('0.10.13: 400 bukan soal skill → tidak dicoba ulang, lapor gagal jujur', async () => {
    mockCreateCharacter.mockRejectedValueOnce(new ApiError(400, 'name must slugify'));
    const text = await executeCreateBotTool(call('create_bot', { name: 'Riset Bot' }));
    expect(text).toContain('tidak dibuat');
    expect(mockCreateCharacter).toHaveBeenCalledTimes(1);
  });
});

describe('executeListBotsTool', () => {
  it('mengembalikan daftar bot yang benar-benar ada', async () => {
    mockGetCharacters.mockResolvedValueOnce([BOT, { ...BOT, id: 'b2', name: 'Growth Bot' }]);
    const text = await executeListBotsTool(call('list_bots', {}));
    expect(text).toContain('Bot yang ada di server (2)');
    expect(text).toContain('Scribe Bot');
    expect(text).toContain('Growth Bot');
  });

  it('jujur bila belum ada bot — melarang klaim tim', async () => {
    mockGetCharacters.mockResolvedValueOnce([]);
    const text = await executeListBotsTool(call('list_bots', {}));
    expect(text).toContain('Belum ada bot di server');
    expect(text).toContain('Jangan mengklaim ada tim');
  });

  it('jujur bila server tidak menjawab — bukan daftar karangan', async () => {
    mockGetCharacters.mockRejectedValueOnce(new Error('down'));
    const text = await executeListBotsTool(call('list_bots', {}));
    expect(text).toContain('Tidak bisa membaca daftar bot');
    expect(text).toContain('Jangan mengklaim bot apa pun');
  });
});

describe('executeBotTool (dispatcher)', () => {
  it('merutekan create_bot dan list_bots, menolak nama tak dikenal', async () => {
    mockGetCharacters.mockResolvedValueOnce([]);
    expect(await executeBotTool(call('list_bots', {}))).toContain('Belum ada bot');
    expect(await executeBotTool(call('vm_exec', { command: 'ls' }))).toContain('tidak dikenal');
  });
});
