import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/utils/test-utils';
import FocusPage from './FocusPage';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import { pomodoroConfigApi } from '@/features/focus/api/focus.api';
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
  isTerminalFocusSessionError: () => false,
}));

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { getPlan: vi.fn() },
}));

const LOGGED_IN = { authUser: { id: 'user-1', email: 'a@b.c', name: null } } as const;

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

  // Web Locks liveness probe (M3). query() returns the origin-wide held/pending lock table;
  // default: nothing held, so a snapshot for the current user is offered for resume.
  Object.defineProperty(navigator, 'locks', {
    value: {
      query: vi.fn().mockResolvedValue({ held: [], pending: [] }),
      request: vi.fn(),
    },
    configurable: true,
  });

  // vi.clearAllMocks() keeps factory implementations, but re-assert the pomodoro default so each
  // test starts from a resolved config regardless of prior mockResolvedValueOnce use.
  vi.mocked(pomodoroConfigApi.get).mockResolvedValue({
    work: 25,
    short_break: 5,
    long_break: 15,
    cycles: 4,
    sound: true,
  });
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
  });
});
