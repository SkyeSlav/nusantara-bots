/**
 * Tests for turnRunner (0.10.14, Issue 3 — PALING PARAH).
 * Module-level registry so a turn survives ChatScreen unmount:
 * progress is published, a re-focused screen can adopt it, and STOP
 * works from any screen instance.
 */
import {
  __resetTurnRunnerForTests,
  completeTurn,
  getTurn,
  isTurnRunning,
  registerTurn,
  requestCredentialViaRunner,
  setCredentialHandler,
  stopTurn,
  subscribeTurn,
  updateTurn,
} from '../turnRunner';

describe('turnRunner', () => {
  beforeEach(() => {
    __resetTurnRunnerForTests();
  });

  it('registers a running turn and reports it via getTurn', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    const snap = getTurn('room-a');
    expect(snap).not.toBeNull();
    expect(snap?.status).toBe('running');
    expect(snap?.roomId).toBe('room-a');
    expect(isTurnRunning('room-a')).toBe(true);
  });

  it('publishes streaming text and tool thinking to subscribers', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    const seen: string[] = [];
    subscribeTurn('room-a', (snap) => {
      seen.push(`${snap.status}:${snap.text}:${snap.thinking}`);
    });
    updateTurn('room-a', { text: 'Halo' });
    updateTurn('room-a', { thinking: 'vm_exec' });
    updateTurn('room-a', { text: 'Halo dunia' });
    expect(seen).toContain('running:Halo:');
    expect(seen).toContain('running:Halo:vm_exec');
    expect(seen).toContain('running:Halo dunia:vm_exec');
  });

  it('notifies subscribers on completion so the screen can reload', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    const statuses: string[] = [];
    subscribeTurn('room-a', (snap) => statuses.push(snap.status));
    completeTurn('room-a', 'done');
    expect(statuses).toContain('done');
    expect(isTurnRunning('room-a')).toBe(false);
    expect(getTurn('room-a')?.status).toBe('done');
  });

  it('stopTurn aborts the registered controller and marks the turn stopped', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    expect(stopTurn('room-a')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(getTurn('room-a')?.status).toBe('stopped');
    expect(isTurnRunning('room-a')).toBe(false);
  });

  it('stopTurn returns false when no turn is running', () => {
    expect(stopTurn('room-none')).toBe(false);
  });

  it('re-registering a room stops the previous running turn', () => {
    const first = new AbortController();
    registerTurn('room-a', first);
    const second = new AbortController();
    const statuses: string[] = [];
    subscribeTurn('room-a', (snap) => statuses.push(snap.status));
    registerTurn('room-a', second);
    expect(statuses).toContain('stopped');
    expect(getTurn('room-a')?.status).toBe('running');
  });

  it('updateTurn is a no-op after completion (no stale progress)', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    completeTurn('room-a', 'done');
    updateTurn('room-a', { text: 'terlambat' });
    expect(getTurn('room-a')?.text).toBe('');
  });

  it('unsubscribe stops notifications', () => {
    const controller = new AbortController();
    registerTurn('room-a', controller);
    const seen: string[] = [];
    const unsub = subscribeTurn('room-a', (snap) => seen.push(snap.status));
    unsub();
    completeTurn('room-a', 'done');
    expect(seen).toEqual([]);
  });

  it('an old turn completing does not overwrite a newer turn (generation guard)', () => {
    const first = new AbortController();
    const snapA = registerTurn('room-a', first);
    const second = new AbortController();
    registerTurn('room-a', second);
    // Turn lama selesai belakangan — harus no-op, turn baru tetap jalan.
    expect(completeTurn('room-a', 'done', snapA.generation)).toBeNull();
    expect(isTurnRunning('room-a')).toBe(true);
    updateTurn('room-a', { text: 'lama' }, snapA.generation);
    expect(getTurn('room-a')?.text).toBe('');
  });

  it('credential request resolves {saved:false} when no screen is focused', async () => {
    setCredentialHandler(null);
    await expect(
      requestCredentialViaRunner({ service: 'x', label: 'X', url: 'https://example.com' }),
    ).resolves.toEqual({ saved: false });
  });

  it('credential request delegates to the focused screen handler', async () => {
    setCredentialHandler(async () => ({ saved: true }));
    await expect(
      requestCredentialViaRunner({ service: 'x', label: 'X', url: 'https://example.com' }),
    ).resolves.toEqual({ saved: true });
  });
});
