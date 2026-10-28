/**
 * Repro 0.10.7: wrapper mengirim 2 tool calls dalam SATU delta SSE
 * TANPA field `index` (format d4f_wrapper: satu chunk, calls lengkap).
 * Parser lama menggabungkan keduanya ke slot 0 (arguments di-concat
 * -> JSON tidak valid -> argsValid=false -> vm_exec tidak pernah POST).
 */
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

import { SseStreamParser, parseToolCallArgs } from '../byo';

const sse = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;

describe('SseStreamParser multi-call tanpa index (bug 0.10.7)', () => {
  it('memisahkan 2 tool calls tanpa index menjadi 2 call utuh', () => {
    const parser = new SseStreamParser();
    const argsA = JSON.stringify({ command: 'echo A; uname -a' });
    const argsB = JSON.stringify({ command: 'find /home/cua/workspace -maxdepth 2' });
    parser.feed(
      sse({
        choices: [
          {
            delta: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'call_A', type: 'function', function: { name: 'vm_exec', arguments: argsA } },
                { id: 'call_B', type: 'function', function: { name: 'vm_exec', arguments: argsB } },
              ],
            },
          },
        ],
      }),
    );
    parser.feed(sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));

    expect(parser.toolCalls).toHaveLength(2);
    expect(parser.toolCalls[0].id).toBe('call_A');
    expect(parser.toolCalls[0].function.name).toBe('vm_exec');
    expect(parseToolCallArgs(parser.toolCalls[0]).argsValid).toBe(true);
    expect(parseToolCallArgs(parser.toolCalls[0]).args).toEqual({ command: 'echo A; uname -a' });
    expect(parser.toolCalls[1].id).toBe('call_B');
    expect(parseToolCallArgs(parser.toolCalls[1]).argsValid).toBe(true);
    expect(parseToolCallArgs(parser.toolCalls[1]).args).toEqual({
      command: 'find /home/cua/workspace -maxdepth 2',
    });
  });

  it('tetap menggabungkan fragmen ber-index ala OpenAI', () => {
    const parser = new SseStreamParser();
    parser.feed(
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'vm_exec', arguments: '{"comm' } },
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
    expect(parser.toolCalls).toHaveLength(1);
    expect(parseToolCallArgs(parser.toolCalls[0]).args).toEqual({ command: 'ls' });
  });
});
