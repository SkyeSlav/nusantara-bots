/**
 * Tests for the sandbox module (sandbox.ts, 0.9.9 Fase B).
 *
 * The server client is mocked: apiFetch is a controllable fake —
 * no real network. No native modules are touched.
 */
import {
  VM_EXEC_MAX_COMMAND_LENGTH,
  VM_EXEC_TOOL,
  checkSandboxAvailable,
  clipExecOutput,
  execSandboxCommand,
  executeVmExecTool,
  formatVmExecResult,
  validateVmExecArgs,
} from '../sandbox';
import type { ParsedToolCall } from '../byo';

// Mock the server client with its own jest.fn inside the factory
// (a factory must not reference outer consts — Jest hoists mocks
// above them). Grab the reference after imports.
jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}));
import { apiFetch } from '../client';
const mockApiFetch = apiFetch as jest.Mock;

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const errResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: 'nope' }),
});

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('VM_EXEC_TOOL', () => {
  it('is an OpenAI function tool named vm_exec with a command parameter', () => {
    expect(VM_EXEC_TOOL.type).toBe('function');
    expect(VM_EXEC_TOOL.function.name).toBe('vm_exec');
    expect(VM_EXEC_TOOL.function.description).toContain('sandbox');
    const params = VM_EXEC_TOOL.function.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(params.properties.command).toBeDefined();
    expect(params.required).toContain('command');
  });
});

describe('validateVmExecArgs', () => {
  it('accepts a plain command with the default timeout', () => {
    expect(validateVmExecArgs({ command: 'ls -la' })).toEqual({
      ok: true,
      command: 'ls -la',
      timeoutSeconds: 60,
    });
  });

  it('clamps the timeout to 1..300 seconds', () => {
    expect(validateVmExecArgs({ command: 'x', timeout_seconds: 999 })).toEqual({
      ok: true,
      command: 'x',
      timeoutSeconds: 300,
    });
    expect(validateVmExecArgs({ command: 'x', timeout_seconds: 0 })).toEqual({
      ok: true,
      command: 'x',
      timeoutSeconds: 1,
    });
  });

  it('rejects empty, missing, and over-long commands', () => {
    expect(validateVmExecArgs({ command: '   ' }).ok).toBe(false);
    expect(validateVmExecArgs({}).ok).toBe(false);
    expect(validateVmExecArgs(null).ok).toBe(false);
    expect(validateVmExecArgs('ls').ok).toBe(false);
    expect(
      validateVmExecArgs({ command: 'x'.repeat(VM_EXEC_MAX_COMMAND_LENGTH + 1) }).ok,
    ).toBe(false);
  });
});

describe('clipExecOutput', () => {
  it('passes short output through unchanged', () => {
    expect(clipExecOutput('hello', 100)).toBe('hello');
  });

  it('keeps head and tail with an omission note for long output', () => {
    const text = 'A'.repeat(500) + 'B'.repeat(500);
    const clipped = clipExecOutput(text, 100);
    expect(clipped.length).toBeLessThan(text.length);
    expect(clipped).toContain('karakter dihilangkan');
    expect(clipped.startsWith('A')).toBe(true);
    expect(clipped.endsWith('B')).toBe(true);
  });
});

describe('execSandboxCommand', () => {
  it('posts {command, timeout} and returns the parsed result', async () => {
    mockApiFetch.mockResolvedValue(
      okResponse({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }),
    );
    const res = await execSandboxCommand('ls', 30);
    expect(res).toEqual({
      ok: true,
      exitCode: 0,
      stdout: 'ok\n',
      stderr: '',
      timedOut: false,
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/sandbox/exec',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'ls', timeout: 30 }),
      }),
    );
  });

  it('returns a friendly error on HTTP failure instead of throwing', async () => {
    mockApiFetch.mockResolvedValue(errResponse(500));
    const res = await execSandboxCommand('ls');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('HTTP 500');
  });

  it('returns a friendly error on network failure instead of throwing', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const res = await execSandboxCommand('ls');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('tidak terjangkau');
  });

  it('returns a friendly error on a malformed server answer', async () => {
    mockApiFetch.mockResolvedValue(okResponse({ nope: true }));
    const res = await execSandboxCommand('ls');
    expect(res.ok).toBe(false);
  });
});

describe('formatVmExecResult', () => {
  it('formats success with exit code and clipped output', () => {
    const text = formatVmExecResult({
      ok: true,
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      timedOut: false,
    });
    expect(text).toContain('exit code 0');
    expect(text).toContain('hello');
  });

  it('mentions timeout and stderr', () => {
    const text = formatVmExecResult({
      ok: true,
      exitCode: 124,
      stdout: '',
      stderr: 'timed out',
      timedOut: true,
    });
    expect(text).toContain('waktu habis');
    expect(text).toContain('timed out');
  });

  it('turns a failure into an honest note for the model', () => {
    const text = formatVmExecResult({ ok: false, error: 'Sandbox mati.' });
    expect(text).toContain('gagal dijalankan');
    expect(text).toContain('Sandbox mati.');
  });
});

describe('executeVmExecTool', () => {
  const call = (args: Record<string, unknown>, name = 'vm_exec'): ParsedToolCall => ({
    id: 'call_1',
    name,
    args,
    argsRaw: JSON.stringify(args),
    argsValid: true,
  });

  it('executes a valid vm_exec call and returns the formatted result', async () => {
    mockApiFetch.mockResolvedValue(
      okResponse({ exitCode: 0, stdout: 'file.txt\n', stderr: '', timedOut: false }),
    );
    const text = await executeVmExecTool(call({ command: 'ls' }));
    expect(text).toContain('exit code 0');
    expect(text).toContain('file.txt');
  });

  it('refuses unknown tools and empty commands without calling the server', async () => {
    expect(await executeVmExecTool(call({ command: 'ls' }, 'other_tool'))).toContain(
      'tidak dikenal',
    );
    expect(await executeVmExecTool(call({ command: '  ' }))).toContain('tidak dijalankan');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('never throws on server failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const text = await executeVmExecTool(call({ command: 'ls' }));
    expect(text).toContain('gagal dijalankan');
  });
});

describe('checkSandboxAvailable', () => {
  it('returns available + workspace when the server says so', async () => {
    mockApiFetch.mockResolvedValue(
      okResponse({ available: true, workspace: '/home/cua/workspace' }),
    );
    await expect(checkSandboxAvailable()).resolves.toEqual({
      available: true,
      workspace: '/home/cua/workspace',
    });
  });

  it('is fail-soft: HTTP error, unavailable flag, and network error all mean false', async () => {
    mockApiFetch.mockResolvedValue(errResponse(404));
    await expect(checkSandboxAvailable()).resolves.toEqual({
      available: false,
      workspace: null,
    });
    mockApiFetch.mockResolvedValue(okResponse({ available: false }));
    await expect(checkSandboxAvailable()).resolves.toEqual({
      available: false,
      workspace: null,
    });
    mockApiFetch.mockRejectedValue(new Error('boom'));
    await expect(checkSandboxAvailable()).resolves.toEqual({
      available: false,
      workspace: null,
    });
  });
});
