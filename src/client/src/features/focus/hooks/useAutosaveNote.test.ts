import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosaveNote } from './useAutosaveNote';
import { sessionNoteApi } from '../api/notes.api';
import type { SessionNote } from '../types/focus.types';

vi.mock('../api/notes.api', () => ({
  sessionNoteApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(sessionNoteApi);

const SESSION = 's-1';
const CONCEPT = 'c-1';

function note(over: Partial<SessionNote> = {}): SessionNote {
  return {
    id: 'n-1',
    sessionId: SESSION,
    conceptId: CONCEPT,
    body: 'x',
    createdAt: '2026-08-09T13:00:00Z',
    updatedAt: '2026-08-09T13:00:00Z',
    ...over,
  };
}

/** Xả microtask (promise của effect nạp danh sách / các lần lưu) khi đang dùng fake timers. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mount() {
  return renderHook(() => useAutosaveNote({ sessionId: SESSION, conceptId: CONCEPT }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.list.mockResolvedValue([]);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useAutosaveNote', () => {
  it('loads existing session notes (newest-first as the API returns them)', async () => {
    api.list.mockResolvedValue([note({ id: 'n-2' }), note({ id: 'n-1' })]);
    const { result } = mount();
    await flush();
    expect(api.list).toHaveBeenCalledWith(SESSION);
    expect(result.current.notes.map((n) => n.id)).toEqual(['n-2', 'n-1']);
  });

  it('POSTs on the first save, then PATCHes the same note on later edits', async () => {
    api.create.mockResolvedValue(note({ id: 'n-1', body: 'hello' }));
    api.update.mockResolvedValue(note({ id: 'n-1', body: 'hello world' }));
    const { result } = mount();
    await flush();

    act(() => result.current.setDraft('hello'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.create).toHaveBeenCalledWith(SESSION, { conceptId: CONCEPT, body: 'hello' });
    expect(api.update).not.toHaveBeenCalled();
    expect(result.current.status).toBe('saved');

    act(() => result.current.setDraft('hello world'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.update).toHaveBeenCalledWith(SESSION, 'n-1', 'hello world');
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('does not save a body that is empty after trim', async () => {
    const { result } = mount();
    await flush();
    act(() => result.current.setDraft('   '));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.create).not.toHaveBeenCalled();
    expect(result.current.canCommit).toBe(false);
  });

  it('commitNote moves the saved note into the list and clears the draft', async () => {
    api.create.mockResolvedValue(note({ id: 'n-1', body: 'first' }));
    const { result } = mount();
    await flush();

    act(() => result.current.setDraft('first'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(result.current.notes).toHaveLength(0);

    await act(async () => {
      result.current.commitNote();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.notes.map((n) => n.id)).toContain('n-1');
    expect(result.current.draft).toBe('');
    expect(result.current.canCommit).toBe(false);
  });

  it('keeps a localStorage draft and marks offline when the network is down', async () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    api.create.mockRejectedValue(new Error('network down'));

    const { result } = mount();
    await flush();
    act(() => result.current.setDraft('offline note'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));

    expect(result.current.status).toBe('offline');
    const raw = localStorage.getItem(`recall.sessionNote.draft.${SESSION}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).body).toBe('offline note');

    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
  });

  it('does not fire a second create while one is already in flight', async () => {
    let resolveCreate: (n: SessionNote) => void = () => {};
    api.create.mockReturnValue(
      new Promise<SessionNote>((resolve) => {
        resolveCreate = resolve;
      })
    );
    api.update.mockResolvedValue(note({ id: 'n-1', body: 'ab' }));
    const { result } = mount();
    await flush();

    act(() => result.current.setDraft('a'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.create).toHaveBeenCalledTimes(1); // in flight

    // Edit again while the create is still pending — the debounce fires but the in-flight guard
    // must skip, so no second create goes out.
    act(() => result.current.setDraft('ab'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.create).toHaveBeenCalledTimes(1);

    // Resolve the create → the newer body is saved via PATCH on the reschedule.
    await act(async () => {
      resolveCreate(note({ id: 'n-1', body: 'a' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(SESSION, 'n-1', 'ab');
  });

  it('resends the kept draft when the connection returns', async () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    api.create
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(note({ id: 'n-1', body: 'x' }));

    const { result } = mount();
    await flush();
    act(() => result.current.setDraft('x'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(result.current.status).toBe('offline');
    expect(localStorage.getItem(`recall.sessionNote.draft.${SESSION}`)).toBeTruthy();

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.create).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
    expect(localStorage.getItem(`recall.sessionNote.draft.${SESSION}`)).toBeNull();

    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
  });
});
