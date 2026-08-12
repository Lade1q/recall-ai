import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/utils/test-utils';
import FocusPage from './FocusPage';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import {
  focusSessionApi,
  isTerminalFocusSessionError,
  pomodoroConfigApi,
} from '@/features/focus/api/focus.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { ReviewQueueItem } from '@/features/review-queue/types/review-queue.types';

// The data layer is entirely mocked: FocusPage's entry logic reads GET /review-queue/today
// (reviewQueueApi.getToday), the deep-link path reads GET /plans/:id (planApi.getPlan), and the
// pomodoro defaults come from pomodoroConfigApi.get. None of them can hit a real backend in jsdom.
vi.mock('@/features/review-queue/api/review-queue.api', () => ({
  reviewQueueApi: { getToday: vi.fn() },
}));

vi.mock('@/features/focus/api/focus.api', () => ({
  focusSessionApi: { create: vi.fn(), end: vi.fn() },
  pomodoroConfigApi: {
    get: vi
      .fn()
      .mockResolvedValue({ work: 25, short_break: 5, long_break: 15, cycles: 4, sound: true }),
  },
  getFocusSessionErrorMessage: () => 'err',
  // vi.fn (not a bare arrow) so a test can flip a single call to `true` and exercise the
  // terminal-4xx → clear-snapshot half of invariant #4.
  isTerminalFocusSessionError: vi.fn(() => false),
}));

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { getPlan: vi.fn() },
}));

const LOGGED_IN = { authUser: { id: 'user-1', email: 'a@b.c', name: null } } as const;

/**
 * A stand-in for navigator.locks that models the two properties #311 leans on:
 *  - query() reports the origin-wide held table (used by the >=60s resume-offer path).
 *  - request(name, { ifAvailable: true }, cb) grants ATOMICALLY: while one request's callback is
 *    still pending, a second request for the same name is handed `null` instead of running
 *    concurrently. That mutual exclusion — not any app-level flag — is what stops repeated effect
 *    runs from firing a second cleanup PATCH, so the mock has to reproduce it faithfully.
 *
 * `foreignHeld` simulates another live tab already holding every session lock, so request() always
 * hands back `null` (used by the "a live <60s session must survive" test).
 */
type LockCallback = (lock: Lock | null) => unknown;

function installLocksMock({ foreignHeld = false }: { foreignHeld?: boolean } = {}) {
  const heldNames = new Set<string>();
  const request = vi.fn(
    async (name: string, optsOrCb: LockCallback | LockOptions, maybeCb?: LockCallback) => {
      const cb = (typeof optsOrCb === 'function' ? optsOrCb : maybeCb) as LockCallback;
      if (foreignHeld || heldNames.has(name)) return cb(null);
      heldNames.add(name);
      try {
        return await cb({ name, mode: 'exclusive' } as Lock);
      } finally {
        heldNames.delete(name);
      }
    }
  );
  const query = vi.fn().mockResolvedValue({ held: [], pending: [] });
  Object.defineProperty(navigator, 'locks', { value: { request, query }, configurable: true });
  return { request, query };
}

/** A full ReviewQueueItem — every field the type demands, so NotStartedPanel renders. */
function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'i1',
    conceptId: 'c1',
    name: 'Array',
    planId: 'p1',
    planName: 'DSA',
    priority: 1,
    reason: 'spaced_repetition',
    reasonText: 'Đến hạn ôn tập.',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.5,
    status: 'pending',
    estimatedMinutes: 6,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.pushState({}, '', '/focus');

  installLocksMock();

  // vi.clearAllMocks() keeps factory implementations, but re-assert the pomodoro default so each
  // test starts from a resolved config regardless of prior mockResolvedValueOnce use.
  vi.mocked(pomodoroConfigApi.get).mockResolvedValue({
    work: 25,
    short_break: 5,
    long_break: 15,
    cycles: 4,
    sound: true,
  });

  // The bare vi.fn() from the factory returns undefined, which #311's fire-and-forget chain would
  // then call .then() on. Give it a resolved value so the orphan cleanup path is exercised for real.
  vi.mocked(focusSessionApi.end).mockResolvedValue({} as never);
});

afterEach(() => {
  window.history.pushState({}, '', '/focus');
});

describe('FocusPage — entry branches', () => {
  it('has-item: a due concept renders its name and a "Bắt đầu" button', async () => {
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue({
      items: [makeItem({ name: 'Array' })],
      message: null,
      totalEstimatedMinutes: 6,
    });

    render(<FocusPage />, { ...LOGGED_IN });

    await screen.findByText('Array');
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeInTheDocument();
  });

  it('no-history (message:null, empty items): shows the "chưa có lịch ôn tập" panel with a /graph link', async () => {
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue({
      items: [],
      message: null,
      totalEstimatedMinutes: 0,
    });

    render(<FocusPage />, { ...LOGGED_IN });

    await screen.findByText(/chưa có lịch ôn tập/i);

    const graphLink = screen.getByRole('link', { name: /đồ thị/i });
    expect(graphLink.getAttribute('href')).toContain('/graph');
  });

  it('deep-link (?planId&conceptId): resolves the concept from the plan, bypassing the queue', async () => {
    // BrowserRouter reads window.location — set the deep-link URL BEFORE render so useSearchParams
    // (and FocusPage's one-time lazy deepLink capture) sees the params at mount.
    window.history.pushState({}, '', '/focus?planId=P1&conceptId=C2');

    vi.mocked(planApi.getPlan).mockResolvedValue({
      id: 'P1',
      name: 'DSA',
      status: 'active',
      graph: {
        concepts: [{ id: 'C2', name: 'Binary Tree', mastery_score: 0.6 }],
        edges: [],
      },
    } as never);

    render(<FocusPage />, { ...LOGGED_IN });

    // Came from the plan, not the queue: concept name + the synthetic "you picked it on the graph" reason.
    await screen.findByText('Binary Tree');
    expect(screen.getByText('Bạn chọn khái niệm này trên đồ thị để học.')).toBeInTheDocument();
  });
});

describe('FocusPage — interrupted-session resume (owner guard)', () => {
  it('does NOT offer resume when the snapshot belongs to a different user', async () => {
    localStorage.setItem(
      'recall.focusSession',
      JSON.stringify({
        sessionId: 's1',
        startedAt: new Date().toISOString(),
        focusedMs: 300000,
        awayCount: 0,
        pomodorosCompleted: 0,
        conceptName: 'X',
        planId: 'P1',
        conceptIds: ['C2'],
        userId: 'OTHER-user',
      })
    );

    vi.mocked(reviewQueueApi.getToday).mockResolvedValue({
      items: [],
      message: null,
      totalEstimatedMinutes: 0,
    });

    render(<FocusPage />, { ...LOGGED_IN });

    // Let the page settle (entry resolves to the no-history panel).
    await screen.findByText(/chưa có lịch ôn tập/i);
    await waitFor(() => {});

    expect(screen.queryByText(/chưa được ghi nhận/i)).toBeNull();
  });

  it('offers resume when the snapshot belongs to the current user and no live lock is held', async () => {
    localStorage.setItem(
      'recall.focusSession',
      JSON.stringify({
        sessionId: 's1',
        startedAt: new Date().toISOString(),
        focusedMs: 300000,
        awayCount: 0,
        pomodorosCompleted: 0,
        conceptName: 'X',
        planId: 'P1',
        conceptIds: ['C2'],
        userId: 'user-1',
      })
    );

    vi.mocked(reviewQueueApi.getToday).mockResolvedValue({
      items: [],
      message: null,
      totalEstimatedMinutes: 0,
    });

    render(<FocusPage />, { ...LOGGED_IN });

    // locks.query() resolves held:[] => owner tab is gone => the recover dialog appears.
    await screen.findByText(/chưa được ghi nhận/i);

    // ...and nothing is ended behind the user's back: the >=60s path only ever asks (#311 must not
    // start auto-cancelling sessions that are worth recovering).
    expect(focusSessionApi.end).not.toHaveBeenCalled();
  });
});

/**
 * #311 (QA TC-FS-024) — a session reloaded under 60s still leaves its server row `running` until
 * the 8h reap. The user-facing side stays as designed (no recover dialog); what changes is that the
 * orphan row is closed right away, and ONLY when the Web Locks table proves no tab is still live.
 */
describe('FocusPage — orphan cleanup for sessions too short to offer (#311)', () => {
  const SNAPSHOT_KEY = 'recall.focusSession';

  /** A snapshot for the logged-in user; `focusedMs` decides which branch of the effect runs. */
  function writeSnapshot(focusedMs: number, sessionId: string) {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        sessionId,
        startedAt: new Date().toISOString(),
        focusedMs,
        awayCount: 0,
        pomodorosCompleted: 0,
        conceptName: 'X',
        planId: 'P1',
        conceptIds: ['C2'],
        userId: 'user-1',
      })
    );
  }

  beforeEach(() => {
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue({
      items: [],
      message: null,
      totalEstimatedMinutes: 0,
    });
  });

  it('cancels the orphan row when no tab holds the session lock', async () => {
    writeSnapshot(12_000, 's-cancel'); // 12s — under the 60s offer threshold

    render(<FocusPage />, { ...LOGGED_IN });

    await waitFor(() => expect(focusSessionApi.end).toHaveBeenCalledTimes(1));
    // `status: 'cancelled'` is what forces the server to write durationMinutes = 0 and touch
    // neither mastery nor the review queue; the real focusedSeconds is sent (not 0) so the row
    // matches what a manual cancel would leave and keeps the raw measurement.
    expect(focusSessionApi.end).toHaveBeenCalledWith('s-cancel', {
      status: 'cancelled',
      focusedSeconds: 12,
    });

    // Cleanup is silent: the setup screen renders as before and no recover dialog appears.
    await screen.findByText(/chưa có lịch ôn tập/i);
    expect(screen.queryByText(/chưa được ghi nhận/i)).toBeNull();
    // Row closed => nothing left to recover.
    await waitFor(() => expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull());
  });

  it('does NOT cancel while another tab holds the lock (a live <60s session must survive)', async () => {
    writeSnapshot(12_000, 's-locked');

    // Tab A is running this very session and holds its liveness lock; this mount is tab B, so
    // request({ ifAvailable: true }) is handed null and the cleanup callback bails.
    installLocksMock({ foreignHeld: true });

    render(<FocusPage />, { ...LOGGED_IN });

    await screen.findByText(/chưa có lịch ôn tập/i);
    await waitFor(() => {});

    expect(focusSessionApi.end).not.toHaveBeenCalled();
    expect(localStorage.getItem(SNAPSHOT_KEY)).not.toBeNull();
  });

  it('does NOT cancel when Web Locks is unavailable (no liveness signal => no destruction)', async () => {
    writeSnapshot(12_000, 's-nolocks');

    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });

    render(<FocusPage />, { ...LOGGED_IN });

    await screen.findByText(/chưa có lịch ôn tập/i);
    await waitFor(() => {});

    expect(focusSessionApi.end).not.toHaveBeenCalled();
  });

  it('keeps the snapshot when the cancel fails transiently, so a later mount can retry', async () => {
    writeSnapshot(12_000, 's-transient');
    // isTerminalFocusSessionError is mocked to false => offline / 5xx, i.e. retryable.
    vi.mocked(focusSessionApi.end).mockRejectedValue(new Error('network down'));

    render(<FocusPage />, { ...LOGGED_IN });

    await waitFor(() => expect(focusSessionApi.end).toHaveBeenCalledTimes(1));
    await screen.findByText(/chưa có lịch ôn tập/i);
    expect(localStorage.getItem(SNAPSHOT_KEY)).not.toBeNull();
  });

  it('clears the snapshot when the cancel fails with a terminal 4xx (nothing left to clean)', async () => {
    writeSnapshot(12_000, 's-terminal');
    vi.mocked(focusSessionApi.end).mockRejectedValue(new Error('already ended'));
    // 4xx: e.g. ALREADY_ENDED because the 8h reap beat us to it, or the row is simply gone.
    vi.mocked(isTerminalFocusSessionError).mockReturnValueOnce(true);

    render(<FocusPage />, { ...LOGGED_IN });

    await waitFor(() => expect(focusSessionApi.end).toHaveBeenCalledTimes(1));
    // Retrying a 4xx just fails again, so drop the snapshot rather than loop the cleanup PATCH on
    // every /focus mount — the other half of invariant #4 from the transient test above.
    await waitFor(() => expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull());
  });

  it('does not clear a NEWER session snapshot if one was started before cleanup resolved (F1)', async () => {
    writeSnapshot(12_000, 's-old');

    // Hold the cleanup PATCH open so a new session can claim the shared snapshot key mid-flight.
    let resolveEnd!: (value: unknown) => void;
    vi.mocked(focusSessionApi.end).mockReturnValue(
      new Promise((resolve) => {
        resolveEnd = resolve;
      }) as never
    );

    render(<FocusPage />, { ...LOGGED_IN });
    await waitFor(() => expect(focusSessionApi.end).toHaveBeenCalledTimes(1));

    // User taps "Bắt đầu": a brand-new session overwrites `recall.focusSession` (one shared key).
    writeSnapshot(0, 's-new');

    // Only now does the orphan cleanup for s-old come back 200.
    resolveEnd({});
    await waitFor(() => {});

    // The clear is guarded by sessionId, so s-new survives. An unconditional clear here would wipe
    // it and re-create exactly the #311 orphan for the new session on its next reload.
    expect(JSON.parse(localStorage.getItem(SNAPSHOT_KEY)!).sessionId).toBe('s-new');
  });

  it('fires ONE cleanup PATCH per session even when the effect runs several times', async () => {
    writeSnapshot(12_000, 's-dedupe');
    // Never resolves: the first request holds the session lock for the whole PATCH, so any effect
    // re-run that races in while it is still in flight must be denied the lock (ifAvailable) and
    // skip its own PATCH. Measured LIVE the effect fires 3x per page load; the lock is what keeps
    // that down to one request.
    vi.mocked(focusSessionApi.end).mockReturnValue(new Promise(() => {}));

    render(<FocusPage />, { ...LOGGED_IN });
    await waitFor(() => expect(focusSessionApi.end).toHaveBeenCalledTimes(1));

    // A second mount of the same page load (React StrictMode / an AuthContext identity change does
    // this for real) shares the same lock table and must not re-send it.
    render(<FocusPage />, { ...LOGGED_IN });
    await waitFor(() => {});

    expect(focusSessionApi.end).toHaveBeenCalledTimes(1);
  });
});
