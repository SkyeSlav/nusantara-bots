/**
 * Tests for the BYO-API layer (byo.ts).
 *
 * The native modules are mocked: expo-secure-store is an in-memory
 * map, and XMLHttpRequest is a controllable fake — no real network
 * and no native code is needed. fetch is never used by byo.ts.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BYO_STORE_KEY,
  BYO_XHR_TIMEOUT_MS,
  CapBlockedError,
  MAX_CHAT_HISTORY_MESSAGES,
  SseStreamParser,
  buildChatMessages,
  buildCompletionsBody,
  buildCompletionsBodyFromMessages,
  clearByo,
  extractFinishReason,
  extractReplyText,
  extractToolCalls,
  getByo,
  isByoConfigured,
  isMockReplyText,
  isToolFailureResult,
  markByoConfigured,
  parseToolCallArgs,
  saveByo,
  sendByoChat,
  streamByoReply,
  streamByoReplyWithTools,
  stripThinkBlocks,
  takeRecentHistory,
  wasByoEverConfigured,
} from '../byo';
import type { ChatMessage, ChatTool, ParsedToolCall } from '../byo';
import { ByoConfig, CapCheck } from '../types';

jest.mock(
  'expo-secure-store',
  () => {
    const store = new Map<string, string>();
    return {
      __store: store,
      getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  },
  { virtual: true },
);

// byo.ts imports checkCap from client.ts, which imports AsyncStorage:
// mock it here too (it is never touched by these tests).
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

/* ---- Controllable fake XMLHttpRequest ---- */
type XhrHandler = (() => void) | null;

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  static reset(): void {
    FakeXMLHttpRequest.instances = [];
  }

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  requestBody: string | undefined;
  responseText = '';
  status = 200;
  responseType = '';
  responseHeaders: Record<string, string> = {};
  onprogress: XhrHandler = null;
  onload: XhrHandler = null;
  onerror: XhrHandler = null;
  ontimeout: XhrHandler = null;
  onabort: XhrHandler = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name.toLowerCase()] = value;
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }

  send(body?: string): void {
    this.requestBody = body;
  }

  abort(): void {
    if (this.onabort) this.onabort();
  }

  /** Simulate the server answering with a full body at once. */
  respond(status: number, contentType: string, text: string): void {
    this.status = status;
    this.responseHeaders = { 'content-type': contentType };
    this.responseText = text;
    if (this.onprogress) this.onprogress();
    if (this.onload) this.onload();
  }

  /** Simulate an SSE body arriving in two chunks, then load. */
  respondStreaming(chunks: string[]): void {
    this.status = 200;
    this.responseHeaders = { 'content-type': 'text/event-stream' };
    for (const chunk of chunks) {
      this.responseText += chunk;
      if (this.onprogress) this.onprogress();
    }
    if (this.onload) this.onload();
  }
}

const CFG: ByoConfig = {
  baseUrl: 'https://provider.example/v1',
  model: 'test-model',
  credential: 'sk-test-123',
};

const sseChunk = (content: string, usage?: object): string =>
  `data: ${JSON.stringify({
    choices: [{ delta: { content } }],
    ...(usage ? { usage } : {}),
  })}\n\n`;

beforeEach(() => {
  FakeXMLHttpRequest.reset();
  (global as unknown as Record<string, unknown>).XMLHttpRequest =
    FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  jest.clearAllMocks();
});

describe('secure-store persistence', () => {
  it('round-trips a config through save/get/clear', async () => {
    expect(await getByo()).toBeNull();
    await saveByo(CFG);
    expect(await getByo()).toEqual(CFG);
    expect(isByoConfigured(await getByo())).toBe(true);
    await clearByo();
    expect(await getByo()).toBeNull();
    expect(isByoConfigured(null)).toBe(false);
  });

  it('strips a trailing slash from baseUrl on save', async () => {
    await saveByo({ ...CFG, baseUrl: 'https://provider.example/v1/' });
    expect((await getByo())?.baseUrl).toBe('https://provider.example/v1');
    await clearByo();
  });

  it('trims whitespace/newlines off the credential on save (0.9.4: paste dari file teks)', async () => {
    await saveByo({ ...CFG, credential: '  sk-test-123\n' });
    expect((await getByo())?.credential).toBe('sk-test-123');
    await clearByo();
  });

  it('trims a stored credential with whitespace on load (0.9.4: kredensial lama langsung jalan)', async () => {
    await SecureStore.setItemAsync(
      BYO_STORE_KEY,
      JSON.stringify({ ...CFG, credential: 'sk-test-123\n' }),
    );
    expect((await getByo())?.credential).toBe('sk-test-123');
    await clearByo();
  });

  it('refuses to save an incomplete config', async () => {
    await expect(saveByo({ ...CFG, baseUrl: '' })).rejects.toThrow();
    await expect(saveByo({ ...CFG, model: '  ' })).rejects.toThrow();
    await expect(saveByo({ ...CFG, credential: '' })).rejects.toThrow();
    expect(await getByo()).toBeNull();
  });

  it('returns null for corrupt stored JSON', async () => {
    await SecureStore.setItemAsync(BYO_STORE_KEY, '{not json');
    expect(await getByo()).toBeNull();
    await clearByo();
  });

  it('wasByoEverConfigured: false awal, true setelah saveByo (0.10.13 — bedakan "belum setup" vs "config hilang")', async () => {
    // Bersihkan dulu — saveByo di tes sebelumnya sudah menandai flag
    // (mock AsyncStorage dipakai bersama seluruh file ini).
    await AsyncStorage.removeItem('grokbot_byo_configured');
    expect(await wasByoEverConfigured()).toBe(false);
    await saveByo(CFG);
    expect(await wasByoEverConfigured()).toBe(true);
    // Config hilang tapi flag tetap — inilah kondisi "flaky" Sam.
    await clearByo();
    expect(await getByo()).toBeNull();
    expect(await wasByoEverConfigured()).toBe(true);
    await AsyncStorage.removeItem('grokbot_byo_configured');
  });

  it('markByoConfigured menandai flag tanpa menyentuh SecureStore', async () => {
    await markByoConfigured();
    expect(await wasByoEverConfigured()).toBe(true);
    expect(await getByo()).toBeNull();
    await AsyncStorage.removeItem('grokbot_byo_configured');
  });

  it('BYO_XHR_TIMEOUT_MS = 30000 (0.10.13 — request macet gagal cepat, bukan gantung)', () => {
    expect(BYO_XHR_TIMEOUT_MS).toBe(30000);
  });
});

describe('request body shape', () => {
  it('builds {model, messages, stream} and a user message', () => {
    expect(buildChatMessages('halo')).toEqual([{ role: 'user', content: 'halo' }]);
    expect(buildCompletionsBody(CFG, 'halo', true)).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'halo' }],
      stream: true,
    });
    expect(buildCompletionsBody(CFG, 'halo', false).stream).toBe(false);
  });

  it('falls back to the default model when cfg.model is empty', () => {
    expect(buildCompletionsBody({ ...CFG, model: '' }, 'x', true).model).toBe('gpt-4o-mini');
  });

  // 0.9.8: system prompt opsional — pesan pertama bila ada.
  it('puts the system prompt first when given', () => {
    expect(buildChatMessages('halo', 'Kamu Xman.')).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'halo' },
    ]);
    expect(buildCompletionsBody(CFG, 'halo', true, 'Kamu Xman.')).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Kamu Xman.' },
        { role: 'user', content: 'halo' },
      ],
      stream: true,
    });
  });

  it('sends no system message for an empty or missing prompt', () => {
    expect(buildChatMessages('halo', '')).toEqual([{ role: 'user', content: 'halo' }]);
    expect(buildChatMessages('halo', '   ')).toEqual([{ role: 'user', content: 'halo' }]);
    expect(buildChatMessages('halo', null)).toEqual([{ role: 'user', content: 'halo' }]);
    expect(buildChatMessages('halo', undefined)).toEqual([{ role: 'user', content: 'halo' }]);
    expect(buildCompletionsBody(CFG, 'halo', true, '').messages).toEqual([
      { role: 'user', content: 'halo' },
    ]);
  });

  // 0.10.5, perbaikan "pikun": riwayat chat ikut dikirim ke model.
  it('inserts history between the system prompt and the current turn', () => {
    const history = [
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
      { role: 'user', content: 'yang legal saja' },
    ] as const;
    expect(buildChatMessages('iya legal', 'Kamu Xman.', [...history])).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
      { role: 'user', content: 'yang legal saja' },
      { role: 'user', content: 'iya legal' },
    ]);
    // Tanpa system prompt, history tetap di depan turn saat ini.
    expect(buildChatMessages('iya legal', null, [...history])).toEqual([
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
      { role: 'user', content: 'yang legal saja' },
      { role: 'user', content: 'iya legal' },
    ]);
    expect(buildCompletionsBody(CFG, 'iya legal', true, 'Kamu Xman.', null, [...history]).messages).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
      { role: 'user', content: 'yang legal saja' },
      { role: 'user', content: 'iya legal' },
    ]);
  });

  it('behaves exactly as before when history is empty or missing', () => {
    expect(buildChatMessages('halo', 'Kamu Xman.', [])).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'halo' },
    ]);
    expect(buildChatMessages('halo', 'Kamu Xman.', null)).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'halo' },
    ]);
    expect(buildChatMessages('halo', 'Kamu Xman.', undefined)).toEqual([
      { role: 'system', content: 'Kamu Xman.' },
      { role: 'user', content: 'halo' },
    ]);
  });

  it('caps history to the last MAX_CHAT_HISTORY_MESSAGES turns', () => {
    expect(MAX_CHAT_HISTORY_MESSAGES).toBe(20);
    const long: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `pesan ${i + 1}`,
    }));
    const kept = takeRecentHistory(long);
    expect(kept).toHaveLength(20);
    expect(kept[0].content).toBe('pesan 6');
    expect(kept[19].content).toBe('pesan 25');
    // Urutan kronologis dipertahankan, turn terakhir tetap terakhir.
    const msgs = buildChatMessages('baru', null, long);
    expect(msgs).toHaveLength(21);
    expect(msgs[0].content).toBe('pesan 6');
    expect(msgs[20]).toEqual({ role: 'user', content: 'baru' });
  });

  it('drops system/tool roles and empty messages from history', () => {
    const mixed: ChatMessage[] = [
      { role: 'system', content: 'sistem lama' },
      { role: 'user', content: '   ' },
      { role: 'user', content: '' },
      { role: 'assistant', content: 'ok' },
      { role: 'tool', tool_call_id: 'c1', content: 'hasil tool' },
      { role: 'user', content: 'lanjut' },
    ];
    expect(takeRecentHistory(mixed)).toEqual([
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'lanjut' },
    ]);
    expect(takeRecentHistory(null)).toEqual([]);
    expect(takeRecentHistory(undefined)).toEqual([]);
  });

  it('drops server MOCK demo replies from history (0.10.5)', () => {
    // Regresi emulator: balasan demo "[MOCK model — demo reply...]"
    // yang ikut terkirim membuat model meniru format itu dan menjawab
    // hanya dengan label MOCK. Pesan demo disaring dari konteks
    // model — pesan aslinya tetap tersimpan & tampil di UI.
    const mockText =
      '[MOCK model — demo reply, no real API call] Xman here (Chief; skills: team-memory). You said: \'x\'.';
    expect(isMockReplyText(mockText)).toBe(true);
    expect(isMockReplyText('  [MOCK model — demo reply, no real API call]')).toBe(true);
    expect(isMockReplyText('Jawaban model nyata.')).toBe(false);
    expect(isMockReplyText('')).toBe(false);
    const withMock: ChatMessage[] = [
      { role: 'user', content: 'Mana blum Lo create bro' },
      { role: 'assistant', content: mockText },
      { role: 'user', content: 'Iya gas' },
    ];
    expect(takeRecentHistory(withMock)).toEqual([
      { role: 'user', content: 'Mana blum Lo create bro' },
      { role: 'user', content: 'Iya gas' },
    ]);
    // buildChatMessages juga tidak membawa pesan MOCK.
    expect(buildChatMessages('baru', null, withMock)).toEqual([
      { role: 'user', content: 'Mana blum Lo create bro' },
      { role: 'user', content: 'Iya gas' },
      { role: 'user', content: 'baru' },
    ]);
  });
});

describe('stripThinkBlocks (0.10.5)', () => {
  it('removes closed think blocks and keeps the visible text', () => {
    expect(stripThinkBlocks('Siap, OK! 😄 <think>rahasia dapur</think> Ada yang bisa saya bantu?')).toBe(
      'Siap, OK! 😄  Ada yang bisa saya bantu?',
    );
    expect(stripThinkBlocks('<think>hanya pikiran</think>Halo.')).toBe('Halo.');
  });

  it('removes an unclosed think block to the end of the text', () => {
    expect(stripThinkBlocks('Halo. <think>mulai mikir')).toBe('Halo.');
  });

  it('removes stray think tags without a partner', () => {
    expect(stripThinkBlocks('Siap! </think> Halo!')).toBe('Siap!  Halo!');
    expect(stripThinkBlocks('</think>')).toBe('');
  });

  it('leaves text without think tags unchanged', () => {
    expect(stripThinkBlocks('Halo, bro.')).toBe('Halo, bro.');
    expect(stripThinkBlocks('')).toBe('');
  });
});

describe('SseStreamParser', () => {
  it('parses deltas split across chunks', () => {
    const parser = new SseStreamParser();
    const seen: string[] = [];
    parser.feed('data: {"choices":[{"delta":{"content":"Hel', (t) => seen.push(t));
    expect(parser.text).toBe('');
    parser.feed('lo"}}]}\n\n', (t) => seen.push(t));
    expect(parser.text).toBe('Hello');
    expect(seen).toEqual(['Hello']);
  });

  it('stops at [DONE] and captures usage', () => {
    const parser = new SseStreamParser();
    parser.feed(
      sseChunk('Hi', { prompt_tokens: 5, completion_tokens: 2 }) + 'data: [DONE]\n\n',
    );
    expect(parser.text).toBe('Hi');
    expect(parser.done).toBe(true);
    expect(parser.usage).toEqual({ prompt_tokens: 5, completion_tokens: 2 });
  });

  it('ignores non-data lines and malformed JSON lines', () => {
    const parser = new SseStreamParser();
    parser.feed(': keep-alive\n\ndata: {broken\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
    expect(parser.text).toBe('ok');
    expect(parser.done).toBe(false);
  });

  it('ignores deltas with no string content', () => {
    const parser = new SseStreamParser();
    parser.feed('data: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[]}\n\n');
    expect(parser.text).toBe('');
  });
});

describe('streamByoReply over XHR', () => {
  it('streams SSE deltas and sends the Bearer header to the provider only', async () => {
    const deltas: string[] = [];
    const promise = streamByoReply(CFG, 'halo', (full) => deltas.push(full));
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr).toBeDefined();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://provider.example/v1/chat/completions');
    expect(xhr.requestHeaders['authorization']).toBe('Bearer sk-test-123');
    expect(xhr.requestHeaders['content-type']).toBe('application/json');
    expect(JSON.parse(xhr.requestBody as string)).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'halo' }],
      stream: true,
    });
    // The credential must never appear in the URL or the body.
    expect(xhr.url).not.toContain('sk-test-123');
    expect(xhr.requestBody).not.toContain('sk-test-123');

    xhr.respondStreaming([
      sseChunk('Hel'),
      sseChunk('lo', { prompt_tokens: 3, completion_tokens: 2 }),
      'data: [DONE]\n\n',
    ]);
    const res = await promise;
    expect(res).toEqual({
      streamed: true,
      text: 'Hello',
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
    expect(deltas).toEqual(['Hel', 'Hello']);
  });

  it('sends the system prompt as the first message when given (0.9.8)', async () => {
    const promise = streamByoReply(CFG, 'halo', undefined, undefined, 'Kamu Xman, Chief Officer.');
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(JSON.parse(xhr.requestBody as string)).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Kamu Xman, Chief Officer.' },
        { role: 'user', content: 'halo' },
      ],
      stream: true,
    });
    xhr.respond(
      200,
      'application/json',
      JSON.stringify({ choices: [{ message: { content: 'Siap, Bos.' } }] }),
    );
    const res = await promise;
    expect(res.text).toBe('Siap, Bos.');
  });

  it('sends history between system and current turn (0.10.5, perbaikan "pikun")', async () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
    ];
    const promise = streamByoReply(
      CFG,
      'iya legal',
      undefined,
      undefined,
      'Kamu Xman.',
      history,
    );
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(JSON.parse(xhr.requestBody as string)).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Kamu Xman.' },
        { role: 'user', content: 'buatkan 5 bot' },
        { role: 'assistant', content: 'Siap, bot apa saja?' },
        { role: 'user', content: 'iya legal' },
      ],
      stream: true,
    });
    xhr.respond(
      200,
      'application/json',
      JSON.stringify({ choices: [{ message: { content: 'Baik, lanjut.' } }] }),
    );
    const res = await promise;
    expect(res.text).toBe('Baik, lanjut.');
  });

  it('strips leaked <think> blocks from streamed text and deltas (0.10.5)', async () => {
    const deltas: string[] = [];
    const promise = streamByoReply(CFG, 'halo', (full) => deltas.push(full));
    const xhr = FakeXMLHttpRequest.instances[0];
    xhr.respondStreaming([
      sseChunk('Siap! <think>'),
      sseChunk('pikiran dalam'),
      sseChunk('</think> Halo.'),
      'data: [DONE]\n\n',
    ]);
    const res = await promise;
    expect(res.text).toBe('Siap!  Halo.');
    // Delta yang sampai ke UI tidak pernah membawa isi think.
    expect(deltas.join(' ')).not.toContain('pikiran dalam');
    expect(deltas[deltas.length - 1]).toBe('Siap!  Halo.');
  });

  it('sends the TRIMMED credential in the Bearer header (0.9.4: no "\\n" -> no HTTP 401)', async () => {
    await saveByo({ ...CFG, credential: 'sk-test-123\n' });
    const loaded = await getByo();
    expect(loaded?.credential).toBe('sk-test-123');
    const promise = streamByoReply(loaded as ByoConfig, 'halo');
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr.requestHeaders['authorization']).toBe('Bearer sk-test-123');
    xhr.respond(
      200,
      'application/json',
      JSON.stringify({ choices: [{ message: { content: 'OK.' } }] }),
    );
    const res = await promise;
    expect(res.text).toBe('OK.');
    await clearByo();
  });

  it('returns plain JSON when the provider ignores stream:true', async () => {
    const promise = streamByoReply(CFG, 'halo');
    const xhr = FakeXMLHttpRequest.instances[0];
    xhr.respond(
      200,
      'application/json',
      JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: 'Jawaban utuh.' } }],
        usage: { prompt_tokens: 4, completion_tokens: 3 },
      }),
    );
    const res = await promise;
    expect(res.streamed).toBe(false);
    expect(res.text).toBe('Jawaban utuh.');
    expect(res.usage).toEqual({ prompt_tokens: 4, completion_tokens: 3 });
    expect(res.model).toBe('test-model');
    expect(extractReplyText(res.data)).toBe('Jawaban utuh.');
  });

  it('retries once with stream:false after a 400, then reads the JSON', async () => {
    const promise = streamByoReply(CFG, 'halo');
    const first = FakeXMLHttpRequest.instances[0];
    expect(JSON.parse(first.requestBody as string).stream).toBe(true);
    first.respond(400, 'application/json', JSON.stringify({ error: 'no stream' }));
    // The retry happens before the promise settles — flush microtasks.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const second = FakeXMLHttpRequest.instances[1];
    expect(second).toBeDefined();
    expect(JSON.parse(second.requestBody as string).stream).toBe(false);
    expect(second.requestHeaders['authorization']).toBe('Bearer sk-test-123');
    second.respond(
      200,
      'application/json',
      JSON.stringify({ choices: [{ message: { content: 'OK tanpa stream.' } }] }),
    );
    const res = await promise;
    expect(res.streamed).toBe(false);
    expect(res.text).toBe('OK tanpa stream.');
    expect(FakeXMLHttpRequest.instances.length).toBe(2);
  });

  it('throws on a non-retryable HTTP error', async () => {
    const promise = streamByoReply(CFG, 'halo');
    FakeXMLHttpRequest.instances[0].respond(500, 'application/json', '{}');
    await expect(promise).rejects.toThrow('Model API returned HTTP 500');
  });

  it('aborts in flight with an AbortError', async () => {
    const controller = new AbortController();
    const promise = streamByoReply(CFG, 'halo', undefined, controller.signal);
    expect(FakeXMLHttpRequest.instances[0]).toBeDefined();
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses to run without a configured credential', async () => {
    await expect(streamByoReply({ ...CFG, credential: '' }, 'halo')).rejects.toThrow(
      'BYO-API is not configured',
    );
    expect(FakeXMLHttpRequest.instances.length).toBe(0);
  });
});

describe('cap-check gating (sendByoChat)', () => {
  const allowedGate: CapCheck = {
    bot: 'chief',
    day: '2026-10-25',
    cap_usd: 1,
    spent_usd: 0.1,
    remaining_usd: 0.9,
    allowed: true,
    message: 'sisa cap harian $0.9000 dari $1.0000',
  };
  const blockedGate: CapCheck = {
    ...allowedGate,
    spent_usd: 1,
    remaining_usd: 0,
    allowed: false,
    message: 'cap harian tercapai untuk chief: sudah $1.0000 dari cap harian $1.0000',
  };

  it('does NOT call the model when allowed === false', async () => {
    const checkCapFn = jest.fn(async () => blockedGate);
    await expect(
      sendByoChat(CFG, 'chief', 'halo', undefined, undefined, checkCapFn),
    ).rejects.toBeInstanceOf(CapBlockedError);
    expect(checkCapFn).toHaveBeenCalledWith('chief');
    // No XHR was ever constructed: zero provider calls, zero spend.
    expect(FakeXMLHttpRequest.instances.length).toBe(0);
  });

  it('calls the model when allowed === true', async () => {
    const checkCapFn = jest.fn(async () => allowedGate);
    const promise = sendByoChat(CFG, 'chief', 'halo', undefined, undefined, checkCapFn);
    // sendByoChat awaits the cap gate first — flush before the XHR exists.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr).toBeDefined();
    xhr.respondStreaming([sseChunk('Ya'), 'data: [DONE]\n\n']);
    const res = await promise;
    expect(res.streamed).toBe(true);
    expect(res.text).toBe('Ya');
  });
});

describe('tool calling (0.9.9)', () => {
  const ECHO_TOOL: ChatTool = {
    type: 'function',
    function: {
      name: 'vm_exec',
      description: 'Run a command in the sandbox.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  };

  const sse = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;

  it('builds a body with tools only when tools are given', () => {
    const withTools = buildCompletionsBody(CFG, 'halo', true, null, [ECHO_TOOL]);
    expect(withTools.tools).toEqual([ECHO_TOOL]);
    expect(buildCompletionsBody(CFG, 'halo', true).tools).toBeUndefined();
    const fromMessages = buildCompletionsBodyFromMessages(
      CFG,
      [{ role: 'user', content: 'x' }],
      false,
      [ECHO_TOOL],
    );
    expect(fromMessages.tools).toEqual([ECHO_TOOL]);
  });

  it('extracts tool calls and finish reason from plain JSON', () => {
    const data = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };
    expect(extractToolCalls(data)).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
      },
    ]);
    expect(extractFinishReason(data)).toBe('tool_calls');
    expect(extractToolCalls({ choices: [] })).toEqual([]);
    expect(extractFinishReason(null)).toBeNull();
  });

  it('parses tool call arguments, marking bad JSON invalid', () => {
    const good = parseToolCallArgs({
      id: 'c1',
      type: 'function',
      function: { name: 'vm_exec', arguments: '{"command":"ls","timeout_seconds":30}' },
    });
    expect(good).toEqual({
      id: 'c1',
      name: 'vm_exec',
      args: { command: 'ls', timeout_seconds: 30 },
      argsRaw: '{"command":"ls","timeout_seconds":30}',
      argsValid: true,
    });
    expect(
      parseToolCallArgs({
        id: 'c2',
        type: 'function',
        function: { name: 'vm_exec', arguments: '{not json' },
      }).argsValid,
    ).toBe(false);
  });

  it('accumulates streamed tool_calls fragments in the SSE parser', () => {
    const parser = new SseStreamParser();
    parser.feed(
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'vm_exec', arguments: '{"comm' },
                },
              ],
            },
          },
        ],
      }),
    );
    parser.feed(
      sse({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: 'and":"ls"}' } }],
            },
          },
        ],
      }),
    );
    parser.feed(sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));
    expect(parser.text).toBe('');
    expect(parser.finishReason).toBe('tool_calls');
    expect(parser.toolCalls).toHaveLength(1);
    expect(parser.toolCalls[0].id).toBe('call_1');
    expect(parser.toolCalls[0].function.name).toBe('vm_exec');
    expect(parser.toolCalls[0].function.arguments).toBe('{"command":"ls"}');
  });

  it('runs the tool loop: tool call, then final text (plain JSON)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Hasilnya: file ada.' },
          finish_reason: 'stop',
        },
      ],
    });
    const seen: string[] = [];
    const promise = streamByoReplyWithTools(CFG, 'cek workspace', {
      tools: [ECHO_TOOL],
      execTool: async (call) => `hasil:${call.name}:${JSON.stringify(call.args)}`,
      onToolCall: (call) => seen.push(call.name),
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[0]).toBeDefined();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[1]).toBeDefined();
    // Turn 2 must carry the tool result back to the model.
    const body2 = JSON.parse(
      FakeXMLHttpRequest.instances[1].requestBody as string,
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body2.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(
      body2.messages.find((m) => m.role === 'tool')?.content,
    ).toContain('hasil:vm_exec');
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Hasilnya: file ada.');
    expect(res.rounds).toBe(2);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].name).toBe('vm_exec');
    expect(seen).toEqual(['vm_exec']);
  });

  it('onToolCall menerima nomor putaran (1-based) untuk indikator thinking (0.10.7)', async () => {
    // Model memanggil tool di ronde 1 lalu ronde 2 — indikator harus
    // tahu bot sedang di putaran ke berapa (cap 20, Sam 09:01).
    const toolBodyFor = (cmd: string) =>
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: `call-${cmd}`,
                  type: 'function',
                  function: { name: 'vm_exec', arguments: JSON.stringify({ command: cmd }) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Selesai.' },
          finish_reason: 'stop',
        },
      ],
    });
    const roundsSeen: number[] = [];
    const promise = streamByoReplyWithTools(CFG, 'cek sandbox', {
      tools: [ECHO_TOOL],
      execTool: async () => 'ok',
      onToolCall: (_call, round) => roundsSeen.push(round ?? -1),
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBodyFor('uname -a'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBodyFor('nproc'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Selesai.');
    expect(res.rounds).toBe(3);
    expect(roundsSeen).toEqual([1, 2]);
  });

  it('answers directly in one round when the model makes no tool call', async () => {
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Halo.' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'halo', {
      tools: [ECHO_TOOL],
      execTool: async () => 'tidak dipakai',
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Halo.');
    expect(res.rounds).toBe(1);
    expect(res.toolCalls).toEqual([]);
    expect(FakeXMLHttpRequest.instances).toHaveLength(1);
  });

  it('includes history in the tool-loop request (0.10.5, jalur ChatScreen)', async () => {
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Baik, lanjut.' },
          finish_reason: 'stop',
        },
      ],
    });
    const history: ChatMessage[] = [
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
    ];
    const promise = streamByoReplyWithTools(CFG, 'iya legal', {
      tools: [ECHO_TOOL],
      execTool: async () => 'tidak dipakai',
      history,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const body = JSON.parse(
      FakeXMLHttpRequest.instances[0].requestBody as string,
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages).toEqual([
      { role: 'user', content: 'buatkan 5 bot' },
      { role: 'assistant', content: 'Siap, bot apa saja?' },
      { role: 'user', content: 'iya legal' },
    ]);
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Baik, lanjut.');
    expect(res.rounds).toBe(1);
  });

  it('stops after maxRounds and asks for a final answer without tools (0.10.7)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const finalBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Ringkasan: file ada.' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'loop', {
      tools: [ECHO_TOOL],
      execTool: async () => 'ok',
      maxRounds: 2,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // 0.10.7: sesudah batas putaran, satu panggilan terakhir TANPA tools
    // (bukan teks fallback) supaya model merangkum hasil yang sudah ada.
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    const body3 = JSON.parse(
      FakeXMLHttpRequest.instances[2].requestBody as string,
    ) as { tools?: unknown; messages: Array<{ role: string; content: string }> };
    expect(body3.tools).toBeUndefined();
    expect(
      body3.messages.some(
        (m) => m.role === 'user' && m.content.includes('Berhenti memanggil tool'),
      ),
    ).toBe(true);
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', finalBody);
    const res = await promise;
    expect(res.rounds).toBe(2);
    expect(res.toolCalls).toHaveLength(2);
    expect(res.text).toBe('Ringkasan: file ada.');
  });

  it('final answer kosong: rangkuman parsial dari hasil tool sukses (0.10.7)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const emptyBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'loop', {
      tools: [ECHO_TOOL],
      execTool: async () => 'ok',
      maxRounds: 2,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', emptyBody);
    const res = await promise;
    expect(res.rounds).toBe(2);
    // 0.10.7: hasil tool sukses TIDAK dibuang — rangkuman parsial,
    // bukan teks fallback generik.
    expect(res.text).toContain('Pemeriksaan sebagian selesai');
    expect(res.text).toContain('vm_exec: ok');
    expect(res.text).not.toContain('putaran tool sudah mencapai batas');
  });

  it('final answer kosong DAN tidak ada hasil sukses: pesan gagal jujur, tanpa rangkuman palsu (0.10.7)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const emptyBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'loop', {
      tools: [ECHO_TOOL],
      execTool: async () => 'Argumen vm_exec tidak valid (bukan JSON objek).',
      maxRounds: 2,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', emptyBody);
    const res = await promise;
    expect(res.rounds).toBe(2);
    // Tool gagal 2x -> fail-fast; tidak ada hasil sukses -> tidak ada
    // rangkuman parsial yang difabrikasi, melainkan pesan gagal jujur.
    expect(res.text).toContain('Tool gagal berulang kali');
    expect(res.text).not.toContain('Pemeriksaan sebagian selesai');
  });

  it('maxRounds eksplisit tetap dihormati sebagai batas pemanggil (FULL CAP: tanpa perpanjangan adaptif)', async () => {
    // FULL CAP (Sam 09:12): tidak ada perpanjangan adaptif lagi —
    // cap-nya memang sudah penuh (default 100). Bila pemanggil
    // mengisi maxRounds eksplisit (mis. tes), batas itu dihormati
    // walau model masih berprogres; loop berhenti di 2 lalu minta
    // jawaban akhir.
    const toolBodyFor = (cmd: string) =>
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: `call-${cmd}`,
                  type: 'function',
                  function: { name: 'vm_exec', arguments: JSON.stringify({ command: cmd }) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Ringkasan kemampuan.' },
          finish_reason: 'stop',
        },
      ],
    });
    const execTool = jest.fn(async () => 'ok');
    const promise = streamByoReplyWithTools(CFG, 'cek kemampuan', {
      tools: [ECHO_TOOL],
      execTool,
      maxRounds: 2,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBodyFor('uname -a'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBodyFor('nproc'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // maxRounds 2 tercapai walau ronde 2 berprogres -> jawaban akhir.
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Ringkasan kemampuan.');
    expect(res.rounds).toBe(2);
    expect(res.toolCalls).toHaveLength(2);
    expect(execTool).toHaveBeenCalledTimes(2);
  });

  it('full cap (default 100): loop tidak berhenti di 5/10/20 ronde (0.10.7)', async () => {
    // Tanpa maxRounds (default 100): 12 probe segar lalu jawaban
    // akhir — "cek semua kemampuan kamu" butuh ~8+ putaran, dan
    // FULL CAP (Sam 09:12) memastikan tidak ada pesan batas putaran.
    const toolBodyFor = (cmd: string) =>
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: `call-${cmd}`,
                  type: 'function',
                  function: { name: 'vm_exec', arguments: JSON.stringify({ command: cmd }) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Semua terverifikasi.' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'cek semua kemampuan', {
      tools: [ECHO_TOOL],
      execTool: async () => 'ok',
    });
    const cmds = [
      'uname -a',
      'nproc',
      'free -m',
      'df -h',
      'ls /home/cua/workspace',
      'id',
      'cat /etc/os-release',
      'hostname',
      'whoami',
      'ls /host/root',
      'python3 --version',
      'node --version',
    ];
    for (let r = 0; r < cmds.length; r++) {
      for (let i = 0; i < 5; i++) await Promise.resolve();
      FakeXMLHttpRequest.instances[r].respond(200, 'application/json', toolBodyFor(cmds[r]));
    }
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[12]).toBeDefined();
    FakeXMLHttpRequest.instances[12].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Semua terverifikasi.');
    expect(res.rounds).toBe(13);
    expect(res.toolCalls).toHaveLength(12);
  });

  it('stall: 3 ronde berturut-turut tanpa hasil tool BARU yang sukses -> stop + rangkum (FULL CAP)', async () => {
    // Model bergantian mengulang call lama ("ls") dan call baru yang
    // gagal ("bad") — campuran yang tidak ditangkap aturan 2-ronde
    // (bukan semua-gagal, bukan semua-ulang). Stall 3 ronde tanpa
    // progres menghentikan loop, bukan cap 100.
    const toolBodyFor = (cmd: string) =>
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: `call-${cmd}`,
                  type: 'function',
                  function: { name: 'vm_exec', arguments: JSON.stringify({ command: cmd }) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Rangkuman stall: ls ok, bad gagal.' },
          finish_reason: 'stop',
        },
      ],
    });
    const execTool = jest.fn(async (call: ParsedToolCall) => {
      const cmd = (call.args as { command?: string }).command ?? '';
      return cmd === 'bad' ? 'Tool vm_exec gagal: command not found' : 'ok-ls';
    });
    const promise = streamByoReplyWithTools(CFG, 'cek sandbox', {
      tools: [ECHO_TOOL],
      execTool,
    });
    const cmds = ['ls', 'ls', 'bad', 'ls'];
    for (let r = 0; r < cmds.length; r++) {
      for (let i = 0; i < 5; i++) await Promise.resolve();
      FakeXMLHttpRequest.instances[r].respond(200, 'application/json', toolBodyFor(cmds[r]));
    }
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(FakeXMLHttpRequest.instances[4]).toBeDefined();
    FakeXMLHttpRequest.instances[4].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Rangkuman stall: ls ok, bad gagal.');
    expect(res.rounds).toBe(4);
    expect(res.toolCalls).toHaveLength(4);
    // Hanya call BARU yang dieksekusi (dedupe): "ls" ronde 1 dan
    // "bad" ronde 3; pengulangan "ls" diambil dari cache.
    expect(execTool).toHaveBeenCalledTimes(2);
  });

  it('cap tercapai: rangkuman parsial dari hasil tool, bukan fallback generik (0.10.7)', async () => {
    // Model mengulang call yang sama -> fail-fast, lalu panggilan
    // jawaban-akhir mengembalikan teks kosong -> rangkuman parsial
    // dibangun dari hasil tool yang sudah ada.
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const emptyBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'cek', {
      tools: [ECHO_TOOL],
      execTool: async () => 'uid=1000(cua) gid=1000(cua)',
      maxRounds: 5,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Fail-fast (2 ronde ulang) -> panggilan jawaban-akhir (instances[3]).
    expect(FakeXMLHttpRequest.instances[3]).toBeDefined();
    FakeXMLHttpRequest.instances[3].respond(200, 'application/json', emptyBody);
    const res = await promise;
    expect(res.text).toContain('Pemeriksaan sebagian selesai');
    expect(res.text).toContain('vm_exec');
    expect(res.text).toContain('uid=1000(cua)');
    expect(res.text).not.toContain('putaran tool sudah mencapai batas');
  });

  it('dedupes an identical tool call: executes once, reuses the cached result (0.10.7)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Selesai.' },
          finish_reason: 'stop',
        },
      ],
    });
    const execTool = jest.fn(async () => 'ok');
    const promise = streamByoReplyWithTools(CFG, 'cek', {
      tools: [ECHO_TOOL],
      execTool,
      maxRounds: 3,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Ronde 2 mengulang call yang identik -> hasil dari cache, eksekutor
    // TIDAK dipanggil kedua kalinya (tidak ada POST sandbox kedua).
    expect(execTool).toHaveBeenCalledTimes(1);
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Selesai.');
    expect(res.rounds).toBe(3);
    expect(res.toolCalls).toHaveLength(2);
    expect(execTool).toHaveBeenCalledTimes(1);
  });

  it('stops after one tool fails twice and asks for a final answer (0.10.7)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const finalBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Maaf, tool gagal.' },
          finish_reason: 'stop',
        },
      ],
    });
    const execTool = jest.fn(
      async () => 'Argumen vm_exec tidak valid (bukan JSON objek).',
    );
    const promise = streamByoReplyWithTools(CFG, 'cek', {
      tools: [ECHO_TOOL],
      execTool,
      maxRounds: 5,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Call yang sama gagal 2x (ronde 2 dari cache) -> loop berhenti dan
    // memaksa jawaban akhir, bukan retry buta sampai 5 ronde.
    expect(execTool).toHaveBeenCalledTimes(1);
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    const body3 = JSON.parse(
      FakeXMLHttpRequest.instances[2].requestBody as string,
    ) as { tools?: unknown };
    expect(body3.tools).toBeUndefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', finalBody);
    const res = await promise;
    expect(res.text).toBe('Maaf, tool gagal.');
    expect(res.rounds).toBe(2);
    expect(res.toolCalls).toHaveLength(2);
  });

  it('stops after two different tools fail in two rounds (0.10.7)', async () => {
    const toolBodyA = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls /a"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const toolBodyB = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_2',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls /b"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const finalBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Dua-duanya gagal.' },
          finish_reason: 'stop',
        },
      ],
    });
    const execTool = jest.fn(async () => 'Perintah gagal dijalankan di sandbox: boom.');
    const promise = streamByoReplyWithTools(CFG, 'cek', {
      tools: [ECHO_TOOL],
      execTool,
      maxRounds: 5,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBodyA);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', toolBodyB);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Dua ronde berturut-turut semua gagal -> berhenti di ronde 2.
    expect(execTool).toHaveBeenCalledTimes(2);
    expect(FakeXMLHttpRequest.instances[2]).toBeDefined();
    FakeXMLHttpRequest.instances[2].respond(200, 'application/json', finalBody);
    const res = await promise;
    expect(res.text).toBe('Dua-duanya gagal.');
    expect(res.rounds).toBe(2);
  });

  it('isToolFailureResult recognises executor error texts (0.10.7)', () => {
    expect(isToolFailureResult('Argumen vm_exec tidak valid (bukan JSON objek).')).toBe(true);
    expect(isToolFailureResult('Perintah tidak dijalankan: perintah kosong.')).toBe(true);
    expect(isToolFailureResult('Perintah gagal dijalankan di sandbox: boom.')).toBe(true);
    expect(isToolFailureResult('Tool itu tidak dikenal di aplikasi ini.')).toBe(true);
    expect(isToolFailureResult('Gagal: koneksi terputus.')).toBe(true);
    expect(isToolFailureResult('Terjadi error: timeout.')).toBe(true);
    expect(isToolFailureResult('Aksi itu TIDAK dijalankan: butuh persetujuan.')).toBe(true);
    expect(isToolFailureResult('Tool vm_exec gagal: sandbox down.')).toBe(true);
    expect(isToolFailureResult('Tool vm_exec timeout setelah 180 detik.')).toBe(true);
    expect(isToolFailureResult('uid=1000(cua) gid=1000(cua)')).toBe(false);
    expect(isToolFailureResult('Hasil: file ada.')).toBe(false);
    expect(isToolFailureResult('')).toBe(false);
  });

  it('keeps going when a tool executor throws (result becomes an error note)', async () => {
    const toolBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'vm_exec', arguments: '{"command":"ls"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const textBody = JSON.stringify({
      model: 'test-model',
      choices: [
        {
          message: { role: 'assistant', content: 'Maaf, perintah gagal.' },
          finish_reason: 'stop',
        },
      ],
    });
    const promise = streamByoReplyWithTools(CFG, 'cek', {
      tools: [ECHO_TOOL],
      execTool: async () => {
        throw new Error('sandbox down');
      },
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    FakeXMLHttpRequest.instances[0].respond(200, 'application/json', toolBody);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const body2 = JSON.parse(
      FakeXMLHttpRequest.instances[1].requestBody as string,
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body2.messages.find((m) => m.role === 'tool')?.content).toContain('sandbox down');
    FakeXMLHttpRequest.instances[1].respond(200, 'application/json', textBody);
    const res = await promise;
    expect(res.text).toBe('Maaf, perintah gagal.');
  });
});
