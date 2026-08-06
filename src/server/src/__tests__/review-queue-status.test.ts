import type { ReviewItemStatus, ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import {
  COMPLETED_PLAN_MESSAGE,
  COMPLETED_TODAY_MESSAGE,
  getReviewQueueForPlan,
  getTodayReviewQueue,
  updateReviewQueueItemStatus,
} from '../services/scheduling.service';

/**
 * #224 — the read/write layer around `ReviewQueueItem.status`, after traceback stopped asking
 * for approval and started applying prerequisites to the schedule directly.
 *
 * Prisma is faked with a tiny in-memory table that actually honours the `where` clause instead
 * of a `jest.fn()` returning a canned array. That is the whole point here: the bug this issue
 * fixes lived *in* the filter, so a test that hands back a fixed list whatever was asked for
 * would have passed just as happily before the fix. It also lets "remove, then put back" run as
 * one real round trip through `updateReviewQueueItemStatus()` → `getReviewQueueForPlan()`.
 *
 * No Prisma client is constructed, so this passes without DATABASE_URL/GEMINI_API_KEY (R05).
 */

interface FakeQueueRow {
  id: string;
  planId: string;
  conceptId: string;
  priority: number;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptId: string | null;
  sourceSessionId: string | null;
  scheduledFor: Date | null;
}

interface FakeConcept {
  id: string;
  name: string;
  masteryScore: number | null;
}

const PLAN_ID = 'plan-uuid';
const USER_ID = 'user-uuid';
// Both are relative to the real `new Date()` the services call — a fixed past date is always
// due, a date a decade out never is, so no clock faking is needed to pin the `dueOnly` filter.
const ALREADY_DUE = new Date('2026-08-04T09:00:00.000Z');
const FAR_FUTURE = new Date('2036-08-12T09:00:00.000Z');

const DRAFT_PLAN_ID = 'plan-draft-uuid';

interface FakePlan {
  id: string;
  userId: string;
  deadline: Date | null;
  status: string;
}

let queueRows: FakeQueueRow[] = [];
let concepts: FakeConcept[] = [];
let plans: FakePlan[] = [];

function row(overrides: Partial<FakeQueueRow> & { id: string; conceptId: string }): FakeQueueRow {
  return {
    planId: PLAN_ID,
    priority: 0.5,
    reason: 'spaced_repetition',
    depth: null,
    status: 'pending',
    sourceConceptId: null,
    sourceSessionId: null,
    scheduledFor: ALREADY_DUE,
    ...overrides,
  };
}

/** The subset of Prisma's `where` grammar these two services actually use. */
interface FakeWhere {
  planId?: string;
  status?: ReviewItemStatus | { notIn?: ReviewItemStatus[] };
  scheduledFor?: { lte: Date };
}

function matches(candidate: FakeQueueRow, where: FakeWhere = {}): boolean {
  if (where.planId !== undefined && candidate.planId !== where.planId) return false;
  if (typeof where.status === 'string' && candidate.status !== where.status) return false;
  if (typeof where.status === 'object' && where.status.notIn?.includes(candidate.status)) {
    return false;
  }
  // `NULL <= now` is false in SQL too: an item with no date is not due today.
  if (where.scheduledFor !== undefined) {
    if (candidate.scheduledFor === null) return false;
    if (candidate.scheduledFor > where.scheduledFor.lte) return false;
  }
  return true;
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    reviewQueueItem: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    concept: { findMany: jest.fn() },
    interviewSession: { findMany: jest.fn() },
    studyPlan: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  reviewQueueItem: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  concept: { findMany: jest.Mock };
  interviewSession: { findMany: jest.Mock };
  studyPlan: { findUnique: jest.Mock; findMany: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();

  concepts = [
    { id: 'concept-avl', name: 'Cây AVL', masteryScore: 0.31 },
    { id: 'concept-recursion', name: 'Đệ quy', masteryScore: 0.68 },
    { id: 'concept-dfs', name: 'Duyệt đồ thị DFS', masteryScore: 0.2 },
  ];
  queueRows = [];

  mockedPrisma.reviewQueueItem.count.mockImplementation(({ where }: { where: FakeWhere }) =>
    Promise.resolve(queueRows.filter((candidate) => matches(candidate, where)).length)
  );

  mockedPrisma.reviewQueueItem.findMany.mockImplementation(({ where }: { where: FakeWhere }) =>
    Promise.resolve(
      queueRows
        .filter((candidate) => matches(candidate, where))
        .map((candidate) => ({
          ...candidate,
          concept: concepts.find((concept) => concept.id === candidate.conceptId),
        }))
    )
  );

  mockedPrisma.reviewQueueItem.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) => {
      const found = queueRows.find((candidate) => candidate.id === where.id);
      return Promise.resolve(found ? { id: found.id, plan: { userId: USER_ID } } : null);
    }
  );

  mockedPrisma.reviewQueueItem.update.mockImplementation(
    ({ where, data }: { where: { id: string }; data: { status: ReviewItemStatus } }) => {
      const found = queueRows.find((candidate) => candidate.id === where.id);
      if (!found) throw new Error(`no such row: ${where.id}`);
      found.status = data.status;
      return Promise.resolve({
        id: found.id,
        conceptId: found.conceptId,
        planId: found.planId,
        status: found.status,
      });
    }
  );

  // Only ever called for the A3 fallback (plan with zero rows) and for source-concept names.
  mockedPrisma.concept.findMany.mockResolvedValue([]);
  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
  // Plans honour their `where` too — a draft plan sitting next to the active one is exactly
  // the case #265 introduces, and a canned array would hide it.
  plans = [
    { id: PLAN_ID, userId: USER_ID, deadline: null, status: 'active' },
    { id: DRAFT_PLAN_ID, userId: USER_ID, deadline: null, status: 'draft' },
  ];

  mockedPrisma.studyPlan.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(plans.find((plan) => plan.id === where.id) ?? null)
  );
  mockedPrisma.studyPlan.findMany.mockImplementation(
    ({ where }: { where: { userId: string; status: string } }) =>
      Promise.resolve(
        plans
          .filter((plan) => plan.userId === where.userId && plan.status === where.status)
          .map((plan) => ({ id: plan.id, deadline: plan.deadline }))
      )
  );
});

function conceptIdsOf(items: { conceptId: string }[]): string[] {
  return items.map((item) => item.conceptId);
}

describe('the queue reads everything still on the schedule, not just `pending`', () => {
  it('shows a traceback prerequisite immediately, with no accept step in between', async () => {
    // Exactly what `finalizeConceptResult()` writes: no `status` on insert, so `@default(pending)`.
    queueRows = [
      row({
        id: 'item-dfs',
        conceptId: 'concept-dfs',
        reason: 'traceback',
        depth: 1,
        sourceConceptId: 'concept-avl',
      }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-dfs']);
    expect(queue.items[0]?.status).toBe('pending');
    expect(queue.message).toBeNull();
  });

  it('keeps a leftover `accepted` row visible instead of making it vanish (migration lag)', async () => {
    // The live bug #224 fixes: filtering `status = 'pending'` meant PATCH 'accepted' deleted the
    // concept from the very queue it had just been accepted into.
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', status: 'accepted' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-avl']);
  });

  it('leaves out what the student removed and what is already finished', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' }),
      row({ id: 'item-rec', conceptId: 'concept-recursion', status: 'done' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-dfs']);
  });

  it('keeps a removed item out of /review-queue/today as well', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
    ];

    const today = await getTodayReviewQueue(USER_ID);

    expect(conceptIdsOf(today.items)).toEqual(['concept-dfs']);
  });
});

describe('remove and put back', () => {
  it('takes the item off the schedule and brings it back on the next read', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
    ];

    const removed = await updateReviewQueueItemStatus('item-avl', USER_ID, 'skipped');
    expect(removed.status).toBe('skipped');
    expect(conceptIdsOf((await getReviewQueueForPlan(PLAN_ID, USER_ID)).items)).toEqual([
      'concept-dfs',
    ]);

    const restored = await updateReviewQueueItemStatus('item-avl', USER_ID, 'pending');
    expect(restored.status).toBe('pending');

    const afterRestore = await getReviewQueueForPlan(PLAN_ID, USER_ID);
    expect(conceptIdsOf(afterRestore.items)).toEqual(
      expect.arrayContaining(['concept-avl', 'concept-dfs'])
    );
    expect(afterRestore.items).toHaveLength(2);
  });

  it('never deletes the row — a removed item is still there to be read back', async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl' })];

    await updateReviewQueueItemStatus('item-avl', USER_ID, 'skipped');

    expect(queueRows).toHaveLength(1);
    expect(queueRows[0]?.status).toBe('skipped');
  });

  it('404s on an item belonging to someone else, without touching the row', async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl' })];
    mockedPrisma.reviewQueueItem.findUnique.mockResolvedValue({
      id: 'item-avl',
      plan: { userId: 'someone-else' },
    });

    await expect(updateReviewQueueItemStatus('item-avl', USER_ID, 'skipped')).rejects.toMatchObject(
      { statusCode: 404, code: 'NOT_FOUND' }
    );
    expect(mockedPrisma.reviewQueueItem.update).not.toHaveBeenCalled();
  });
});

describe('includeSkipped — the "Đã gỡ khỏi lịch" group #225 needs', () => {
  it('omits the group entirely when it was not asked for', async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    // Absent, not `[]`: "you removed nothing" is a different claim from "nobody looked".
    expect(queue).not.toHaveProperty('skippedItems');
  });

  it('returns the removed rows, and only those, when asked for', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' }),
      row({ id: 'item-rec', conceptId: 'concept-recursion', status: 'done' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID, undefined, {
      includeSkipped: true,
    });

    expect(conceptIdsOf(queue.items)).toEqual(['concept-dfs']);
    expect(conceptIdsOf(queue.skippedItems ?? [])).toEqual(['concept-avl']);
    // Same shape as a live row, so #225 can draw both groups with one component.
    expect(queue.skippedItems?.[0]).toMatchObject({
      id: 'item-avl',
      name: 'Cây AVL',
      status: 'skipped',
      masteryScore: 0.31,
    });
  });

  it('does not count the removed group towards totalEstimatedMinutes', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID, undefined, {
      includeSkipped: true,
    });

    expect(queue.totalEstimatedMinutes).toBe(queue.items[0]?.estimatedMinutes);
  });
});

describe('the empty queue says something different on each surface', () => {
  it("a plan with nothing left says 'đã ôn hết kế hoạch này', without the word hôm nay", async () => {
    // History exists (the row is there) but nothing is on the schedule any more.
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', status: 'done' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.items).toEqual([]);
    expect(queue.message).toBe(COMPLETED_PLAN_MESSAGE);
    expect(queue.message).not.toMatch(/hôm nay/);
  });

  it("today's queue still says 'hôm nay' when the remaining items are scheduled later", async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', scheduledFor: FAR_FUTURE })];

    const today = await getTodayReviewQueue(USER_ID);

    expect(today.items).toEqual([]);
    expect(today.message).toBe(COMPLETED_TODAY_MESSAGE);
    expect(today.message).toMatch(/hôm nay/);
  });

  it('the two surfaces never share one sentence', () => {
    expect(COMPLETED_PLAN_MESSAGE).not.toBe(COMPLETED_TODAY_MESSAGE);
  });

  it('a plan that was never interviewed gets suggestions, not a congratulation (A3)', async () => {
    queueRows = [];
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'concept-dfs', name: 'Duyệt đồ thị DFS', masteryScore: null },
    ]);

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-dfs']);
    expect(queue.message).toBeNull();
  });

  it('a plan whose every item was removed still reports history, not a fresh start', async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID, undefined, {
      includeSkipped: true,
    });

    // Not the A3 fallback list: the rows exist, the student took them off the schedule. #225
    // draws its own "đã gỡ hết" empty state from a non-empty `skippedItems`.
    expect(queue.items).toEqual([]);
    expect(queue.message).toBe(COMPLETED_PLAN_MESSAGE);
    expect(queue.skippedItems).toHaveLength(1);
    expect(mockedPrisma.concept.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ planId: PLAN_ID }) })
    );
  });
});

describe('/review-queue/today keeps filtering by scheduledFor', () => {
  it('shows what is due and hides what is not', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', scheduledFor: ALREADY_DUE }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs', scheduledFor: FAR_FUTURE }),
    ];

    const today = await getTodayReviewQueue(USER_ID);
    const wholePlan = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(today.items)).toEqual(['concept-avl']);
    // The plan queue is deliberately not date-filtered — I6.3 must always have something to pick.
    expect(conceptIdsOf(wholePlan.items)).toEqual(
      expect.arrayContaining(['concept-avl', 'concept-dfs'])
    );
    expect(wholePlan.items).toHaveLength(2);
  });
});

describe('a plan the user has not confirmed yet stays off the schedule (#265)', () => {
  it('leaves a draft plan out of /review-queue/today, even with due items on it', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs', planId: DRAFT_PLAN_ID }),
    ];

    const today = await getTodayReviewQueue(USER_ID);

    // Since #265 a plan stays `draft` until its concept graph is confirmed, so drafts are now
    // a real, common state — not just the brief window while analysis runs.
    expect(conceptIdsOf(today.items)).toEqual(['concept-avl']);
    expect(mockedPrisma.studyPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, status: 'active' } })
    );
  });

  it('answers the plan queue of a draft with a status message, not a congratulation', async () => {
    queueRows = [row({ id: 'item-dfs', conceptId: 'concept-dfs', planId: DRAFT_PLAN_ID })];

    const queue = await getReviewQueueForPlan(DRAFT_PLAN_ID, USER_ID);

    expect(queue.items).toEqual([]);
    expect(queue.totalEstimatedMinutes).toBe(0);
    // "Đã ôn hết" would be a lie about a plan that never started.
    expect(queue.message).not.toBe(COMPLETED_PLAN_MESSAGE);
    expect(queue.message).not.toBe(COMPLETED_TODAY_MESSAGE);
  });
});
