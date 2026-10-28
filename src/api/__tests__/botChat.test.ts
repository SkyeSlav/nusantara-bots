/**
 * Tests for item 1 + 2 (0.9.6): old bot data must not resurface, and
 * a new bot must be usable immediately after creation.
 *
 * Sam's reports (2026-10-26 ~01:15):
 * 1. "Bot habis di hapus bikin bot baru malahan data bot lama yg
 *    keluar" — after deleting a bot and creating a new one, the OLD
 *    bot's data comes out. Root cause: a new bot gets NO room of its
 *    own (the server does not create one on POST /api/characters),
 *    so its chat falls back to "general" — which still holds all
 *    the old messages (the server does not purge messages on
 *    DELETE /api/characters/:id). Fix in the app (this file):
 *    createBotChat creates a dedicated 1-1 room for the new bot, so
 *    its chat starts EMPTY. Fix on the server (spec in
 *    BUILD-0.9.6-HANDOFF.md): DELETE must also purge the bot's
 *    messages from chat.json.
 * 2. "Jadi harus keluar kalo mau gunakan" — after creating a bot
 *    Sam had to exit before he could use it. Fix: createBotChat
 *    returns the full Chat target (roomId + characterId) so
 *    CreateSheet can `replace` straight into the new bot's fresh
 *    chat — no manual exit, no stale "general" view.
 */

import { createCharacter, deleteCharacter, getChat } from '../client';
import { createBotChat, roomIdFor } from '../botChat';
import type { Character, ChatMessage, Room } from '../types';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const store = new Map<string, string>();
    return {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  },
  { virtual: true },
);

const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function jsonResponse(status: number, body: unknown): MockResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function bot(id: string, name: string): Character {
  return { id, name, role: 'Chief', skills: [], memory_scope: `private:${id}` };
}

function room(
  id: string,
  name: string,
  members: string[],
  mode: 'chat' | 'meeting' = 'chat',
): Room {
  return { id, name, mode, members };
}

function msg(id: number, roomId: string, character: string | null, text: string): ChatMessage {
  return {
    id,
    room: roomId,
    character,
    role: character ? 'assistant' : 'user',
    text,
    created_at: '2026-10-26T00:00:00Z',
  };
}

describe('roomIdFor (canonical 1-1 resolution)', () => {
  const rooms: Room[] = [
    // 'duo' ditaruh sebelum 'general': resolusi memilih room pertama
    // yang cocok (perilaku yang sudah ada sejak awal).
    room('duo', 'Duo', ['chief-officer', 'xman']),
    room('general', 'General chat', ['chief-officer', 'xman']),
    room('meeting-room', 'Meeting room', ['chief-officer'], 'meeting'),
    room('xman-room', 'Xman', ['xman']),
  ];

  it('prefers the single-member room of the bot', () => {
    expect(roomIdFor('xman', rooms)).toBe('xman-room');
  });

  it('falls back to a multi-member room containing the bot', () => {
    expect(roomIdFor('chief-officer', rooms)).toBe('duo');
  });

  it("falls back to 'general' when the bot has no room", () => {
    expect(roomIdFor('brand-new', rooms)).toBe('general');
  });
});

describe('createBotChat + delete-then-create-same-name (fake server)', () => {
  // Stateful fake server, mirroring the real one: characters/*.md,
  // chat.json rooms + messages. 'general' holds 18 old messages
  // (xman 14, chief-officer 4) — exactly what Sam saw on the server.
  let serverBots: Character[];
  let serverRooms: Room[];
  let serverMessages: ChatMessage[];
  let nextMsgId: number;
  let nextRoomN: number;
  let failRoomCreate: boolean;
  // Models the server-side purge requested in 0.9.6 (spec in the
  // handoff). false = the server as it is today (no purge).
  let purgeMessagesOnDelete: boolean;

  beforeEach(() => {
    serverBots = [bot('chief-officer', 'Chief Officer'), bot('xman', 'Xman')];
    serverRooms = [
      room('general', 'General chat', ['chief-officer', 'xman']),
      room('meeting-room', 'Meeting room', ['chief-officer', 'xman'], 'meeting'),
    ];
    serverMessages = [];
    for (let i = 1; i <= 14; i++) {
      serverMessages.push(msg(i, 'general', 'xman', `pesan lama xman ${i}`));
    }
    for (let i = 15; i <= 18; i++) {
      serverMessages.push(msg(i, 'general', 'chief-officer', `pesan lama chief ${i}`));
    }
    nextMsgId = 19;
    nextRoomN = 2;
    failRoomCreate = false;
    purgeMessagesOnDelete = false;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      if (path === '/api/characters' && method === 'GET') {
        return jsonResponse(200, { characters: serverBots });
      }
      if (path === '/api/characters' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name: string;
          focus: string;
        };
        const id = slug(body.name);
        if (serverBots.some((b) => b.id === id)) {
          return jsonResponse(409, { error: `character '${id}' already exists` });
        }
        const created = bot(id, body.name);
        serverBots.push(created);
        return jsonResponse(200, { character: created });
      }
      if (path.startsWith('/api/characters/') && method === 'DELETE') {
        const id = decodeURIComponent(path.split('/')[3].split('?')[0]);
        serverBots = serverBots.filter((b) => b.id !== id);
        if (purgeMessagesOnDelete) {
          serverMessages = serverMessages.filter((m) => m.character !== id);
          serverRooms = serverRooms.map((r) => ({
            ...r,
            members: (r.members ?? []).filter((m) => m !== id),
          }));
        }
        return jsonResponse(200, { deleted: id, with_memory: false });
      }
      if (path === '/api/rooms' && method === 'POST') {
        if (failRoomCreate) return jsonResponse(500, { error: 'boom' });
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name: string;
          members?: string[];
          mode?: 'chat' | 'meeting';
        };
        let id = slug(body.name);
        if (serverRooms.some((r) => r.id === id)) {
          id = `${id}-${nextRoomN}`;
          nextRoomN += 1;
        }
        const created = room(id, body.name, body.members ?? [], body.mode ?? 'chat');
        serverRooms.push(created);
        return jsonResponse(200, { room: created });
      }
      if (path === '/api/rooms' && method === 'GET') {
        return jsonResponse(200, { rooms: serverRooms, meeting_budget: 40, mock_label: 'MOCK' });
      }
      if (path.startsWith('/api/chat?room=')) {
        const roomId = decodeURIComponent(path.split('room=')[1]);
        return jsonResponse(200, {
          room: roomId,
          messages: serverMessages.filter((m) => m.room === roomId),
        });
      }
      return jsonResponse(404, { error: 'not found' });
    });
  });

  it('a new bot gets its own 1-1 room and the chat starts empty', async () => {
    // Sam: hapus Xman, lalu buat bot baru "Xman".
    await deleteCharacter('xman', false);
    const created = await createCharacter({ name: 'Xman', focus: 'day-to-day' });
    expect(created).not.toBeNull();
    expect(created?.id).toBe('xman');

    const target = await createBotChat(created as Character);
    expect(target.characterId).toBe('xman');
    // Bukan 'general': room 1-1 baru dibuat untuk bot ini.
    expect(target.roomId).toBeDefined();
    expect(target.roomId).not.toBe('general');

    // Chat di room baru KOSONG — tidak ada pesan lama.
    const fresh = await getChat(target.roomId as string);
    expect(fresh?.messages).toEqual([]);
    // Sementara 'general' masih menyimpan 14 pesan lama xman
    // (itulah yang dulu keluar di chat bot baru — server purge
    // adalah perbaikan server terpisah, lihat tes di bawah).
    const general = await getChat('general');
    expect(general?.messages.filter((m) => m.character === 'xman')).toHaveLength(14);
  });

  it('when room creation fails, the bot is still usable via the old fallback', async () => {
    failRoomCreate = true;
    const created = await createCharacter({ name: 'Baru', focus: 'day-to-day' });
    const target = await createBotChat(created as Character);
    expect(target.characterId).toBe('baru');
    // Tanpa roomId: Chat memakai resolusi roomIdFor (fallback
    // 'general') — pembuatan bot tidak gagal gara-gara room.
    expect(target.roomId).toBeUndefined();
    expect(roomIdFor('baru', serverRooms)).toBe('general');
  });

  it('with the server-side purge, deleting a bot also clears its old messages', async () => {
    // Model keadaan yang diminta dari server di 0.9.6: DELETE bot
    // menghapus pesan-pesannya dari chat.json (kedua pilihan
    // with_memory — pilihan itu hanya mengatur memory.db).
    purgeMessagesOnDelete = true;
    await deleteCharacter('xman', false);
    const general = await getChat('general');
    expect(general?.messages.filter((m) => m.character === 'xman')).toHaveLength(0);
    // Pesan bot lain tetap ada.
    expect(general?.messages.filter((m) => m.character === 'chief-officer')).toHaveLength(4);
    // Dan bot baru 'Xman' mulai bersih di mana pun.
    const created = await createCharacter({ name: 'Xman', focus: 'day-to-day' });
    const target = await createBotChat(created as Character);
    const fresh = await getChat(target.roomId as string);
    expect(fresh?.messages).toEqual([]);
    expect(roomIdFor('xman', serverRooms)).toBe(target.roomId);
  });
});
