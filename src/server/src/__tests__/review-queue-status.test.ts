import type { ReviewItemStatus, ReviewReason, StudyPlanStatus } from '@prisma/client';
import prisma from '../config/prisma';
import {
  ALL_PLANS_ARCHIVED_MESSAGE,
  COMPLETED_PLAN_MESSAGE,
  COMPLETED_TODAY_MESSAGE,
  NO_PLAN_MESSAGE,
  PLAN_ARCHIVED_MESSAGE,
  PLAN_AWAITING_CONFIRMATION_MESSAGE,
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
const SECOND_PLAN_ID = 'plan-second-uuid';
const ARCHIVED_PLAN_ID = 'plan-archived-uuid';

interface FakePlan {
  id: string;
  userId: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
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
      updateMany: jest.fn(),
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
    updateMany: jest.Mock;
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
      return Promise.resolve(
        found
          ? {
              id: found.id,
              conceptId: found.conceptId,
              planId: found.planId,
              plan: { userId: USER_ID },
            }
          : null
      );
    }
  );

  // #232: the write moves every row of the concept, so the fake has to honour a multi-row
  // `where` — one that only ever touched the row named by id would hide the very thing the
  // "gỡ rồi nó quay lại" test is checking.
  mockedPrisma.reviewQueueItem.updateMany.mockImplementation(
    ({
      where,
      data,
    }: {
      where: { planId: string; conceptId: string };
      data: { status: ReviewItemStatus };
    }) => {
      const affected = queueRows.filter(
        (candidate) => candidate.planId === where.planId && candidate.conceptId === where.conceptId
      );
      for (const candidate of affected) {
        candidate.status = data.status;
      }
      return Promise.resolve({ count: affected.length });
    }
  );

  // Only ever called for the A3 fallback (plan with zero rows) and for source-concept names.
  mockedPrisma.concept.findMany.mockResolvedValue([]);
  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
  // Plans honour their `where` too — a draft plan sitting next to the active one is exactly
  // the case #265 introduces, and a canned array would hide it.
  plans = [
    { id: PLAN_ID, userId: USER_ID, name: 'Cấu trúc dữ liệu', deadline: null, status: 'active' },
    { id: DRAFT_PLAN_ID, userId: USER_ID, name: 'Hệ điều hành', deadline: null, status: 'draft' },
  ];

  mockedPrisma.studyPlan.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(plans.find((plan) => plan.id === where.id) ?? null)
  );
  // Since #232 the service asks for every plan of the user and filters in JS, so the fake must
  // not pre-filter by status either — that is what makes "toàn draft" distinguishable from
  // "chưa có kế hoạch nào".
  mockedPrisma.studyPlan.findMany.mockImplementation(({ where }: { where: { userId: string } }) =>
    Promise.resolve(
      plans
        .filter((plan) => plan.userId === where.userId)
        .map((plan) => ({
          id: plan.id,
          name: plan.name,
          deadline: plan.deadline,
          status: plan.status,
        }))
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
    expect(mockedPrisma.reviewQueueItem.updateMany).not.toHaveBeenCalled();
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

/**
 * #273 — the A3 fallback (suggestions for a plan never interviewed) belongs on the per-plan
 * endpoint, not on `/today`. A fallback item has no `scheduledFor`, so it is never "due"; before
 * this fix a brand-new plan's suggestions outranked and crowded out the real, actually-due items
 * of a plan the student was mid-way through.
 */
describe('/review-queue/today drops the A3 fallback (#273)', () => {
  it('a never-interviewed plan contributes nothing to /today, but still suggests on its own queue', async () => {
    // PLAN_ID has no queue rows at all → the A3 fallback path.
    queueRows = [];
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'concept-new', name: 'Con trỏ', masteryScore: null },
    ]);

    const today = await getTodayReviewQueue(USER_ID);
    const ownQueue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    // Nothing is genuinely due on a plan that has never been scheduled.
    expect(today.items).toEqual([]);
    // …but `?planId=` still offers the fallback suggestion — A3 is correct there, untouched.
    expect(conceptIdsOf(ownQueue.items)).toEqual(['concept-new']);
  });

  it("does not let a new plan's fallback crowd out another plan's due items", async () => {
    plans.push({
      id: SECOND_PLAN_ID,
      userId: USER_ID,
      name: 'Mạng máy tính',
      deadline: null,
      status: 'active',
    });
    // SECOND_PLAN_ID has a real, due item; PLAN_ID has zero rows (fallback territory) whose
    // null-mastery concept would score a higher fallback priority than the real item and, before
    // #273, take its slot on /today.
    queueRows = [row({ id: 'item-real', conceptId: 'concept-avl', planId: SECOND_PLAN_ID })];
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'concept-new', name: 'Con trỏ', masteryScore: null },
    ]);

    const today = await getTodayReviewQueue(USER_ID);

    // Only the genuinely-due item survives; the fallback never enters /today to outrank it.
    expect(conceptIdsOf(today.items)).toEqual(['concept-avl']);
  });

  it('returns an empty list, not the fallback, when every active plan is new', async () => {
    // The only active plan (PLAN_ID) has no rows; DRAFT_PLAN_ID is filtered out by status.
    queueRows = [];
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'concept-new', name: 'Con trỏ', masteryScore: null },
    ]);

    const today = await getTodayReviewQueue(USER_ID);

    expect(today.items).toEqual([]);
    // #273 leaves the wording of this new "has plans, nothing due" empty state to #231/#232-p4;
    // here it is simply null, never a congratulation.
    expect(today.message).toBeNull();
    expect(today.message).not.toBe(COMPLETED_TODAY_MESSAGE);
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
    // #232 widened the `where` to `{ userId }` so an empty result can say *which* empty it is.
    // The filtering moved into JS; what must not change is that a draft never reaches the queue.
    expect(mockedPrisma.studyPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    expect(today.items.every((item) => item.planId === PLAN_ID)).toBe(true);
  });

  it('answers the plan queue of a draft with a status message, not a congratulation', async () => {
    queueRows = [row({ id: 'item-dfs', conceptId: 'concept-dfs', planId: DRAFT_PLAN_ID })];

    const queue = await getReviewQueueForPlan(DRAFT_PLAN_ID, USER_ID);

    expect(queue.items).toEqual([]);
    expect(queue.totalEstimatedMinutes).toBe(0);
    // "Đã ôn hết" would be a lie about a plan that never started.
    expect(queue.message).not.toBe(COMPLETED_PLAN_MESSAGE);
    expect(queue.message).not.toBe(COMPLETED_TODAY_MESSAGE);
    expect(queue.message).toBe(PLAN_AWAITING_CONFIRMATION_MESSAGE);
  });
});

/**
 * #232 phần 1 — every item names the plan it came from. `/today` merges the queues of several
 * plans, and both dashboard CTAs (`POST /interviews`, Focus Session) require a `planId`.
 */
describe('every item carries its plan (#232)', () => {
  it('names the plan on a real row of GET /review-queue', async () => {
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.items[0]).toMatchObject({ planId: PLAN_ID, planName: 'Cấu trúc dữ liệu' });
  });

  it('names the plan on an A3-fallback suggestion too — it belongs to one just as much', async () => {
    queueRows = [];
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'concept-dfs', name: 'Duyệt đồ thị DFS', masteryScore: null },
    ]);

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.items[0]?.id).toBeNull();
    expect(queue.items[0]).toMatchObject({ planId: PLAN_ID, planName: 'Cấu trúc dữ liệu' });
  });

  it('keeps each item pointing at its own plan when /today merges two active plans', async () => {
    plans.push({
      id: SECOND_PLAN_ID,
      userId: USER_ID,
      name: 'Mạng máy tính',
      deadline: null,
      status: 'active',
    });
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs', planId: SECOND_PLAN_ID }),
    ];

    const today = await getTodayReviewQueue(USER_ID);

    const planIdByConcept = Object.fromEntries(
      today.items.map((item) => [item.conceptId, item.planId])
    );
    expect(planIdByConcept).toEqual({
      'concept-avl': PLAN_ID,
      'concept-dfs': SECOND_PLAN_ID,
    });
    expect(today.items.find((item) => item.conceptId === 'concept-dfs')?.planName).toBe(
      'Mạng máy tính'
    );
  });
});

/**
 * #232 phần 3 — one item per concept. Every graded session upserts its own row for the concept
 * (`@@unique([sourceSessionId, conceptId])` is per session), so a plan interviewed a few times
 * came back `8 mục / 3 khái niệm` from the real API.
 */
describe('a concept appears once, however many sessions queued it (#232)', () => {
  const threeSessionsOnOneConcept = () => [
    row({ id: 'item-avl-1', conceptId: 'concept-avl', sourceSessionId: 'session-1' }),
    row({ id: 'item-avl-2', conceptId: 'concept-avl', sourceSessionId: 'session-2' }),
    row({ id: 'item-avl-3', conceptId: 'concept-avl', sourceSessionId: 'session-3' }),
  ];

  it('folds the duplicate rows into one item', async () => {
    queueRows = threeSessionsOnOneConcept();

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-avl']);
  });

  it('does the same on /today, so the dashboard never suggests one concept twice', async () => {
    queueRows = threeSessionsOnOneConcept();

    const today = await getTodayReviewQueue(USER_ID);

    expect(conceptIdsOf(today.items)).toEqual(['concept-avl']);
  });

  it('counts the concept once in totalEstimatedMinutes, not once per row', async () => {
    queueRows = threeSessionsOnOneConcept();

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.totalEstimatedMinutes).toBe(queue.items[0]?.estimatedMinutes);
  });

  it('keeps the row that would have been shown first — traceback over spaced repetition', async () => {
    queueRows = [
      row({ id: 'item-avl-plain', conceptId: 'concept-avl', sourceSessionId: 'session-1' }),
      row({
        id: 'item-avl-traceback',
        conceptId: 'concept-avl',
        reason: 'traceback',
        depth: 1,
        sourceConceptId: 'concept-dfs',
        sourceSessionId: 'session-2',
      }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.id).toBe('item-avl-traceback');
    expect(queue.items[0]?.reason).toBe('traceback');
  });

  it('leaves distinct concepts alone', async () => {
    queueRows = [
      ...threeSessionsOnOneConcept(),
      row({ id: 'item-dfs', conceptId: 'concept-dfs', sourceSessionId: 'session-1' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items).sort()).toEqual(['concept-avl', 'concept-dfs']);
  });

  // The hole the fold would open if PATCH still moved one row: the student removes the single
  // item they can see, and the concept walks straight back in from a sibling row.
  it('removes the whole concept when the student removes the item they can see', async () => {
    queueRows = threeSessionsOnOneConcept();

    await updateReviewQueueItemStatus('item-avl-1', USER_ID, 'skipped');

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID, undefined, {
      includeSkipped: true,
    });
    expect(queue.items).toEqual([]);
    expect(queueRows.every((candidate) => candidate.status === 'skipped')).toBe(true);
    // And it is listed once in the removed group, not three times.
    expect(conceptIdsOf(queue.skippedItems ?? [])).toEqual(['concept-avl']);
  });

  it('brings the whole concept back when the student puts it back', async () => {
    queueRows = threeSessionsOnOneConcept();

    await updateReviewQueueItemStatus('item-avl-1', USER_ID, 'skipped');
    await updateReviewQueueItemStatus('item-avl-1', USER_ID, 'pending');

    expect(conceptIdsOf((await getReviewQueueForPlan(PLAN_ID, USER_ID)).items)).toEqual([
      'concept-avl',
    ]);
    expect(queueRows.every((candidate) => candidate.status === 'pending')).toBe(true);
  });

  it('never reaches outside the concept it was asked about', async () => {
    queueRows = [...threeSessionsOnOneConcept(), row({ id: 'item-dfs', conceptId: 'concept-dfs' })];

    await updateReviewQueueItemStatus('item-avl-1', USER_ID, 'skipped');

    expect(queueRows.find((candidate) => candidate.id === 'item-dfs')?.status).toBe('pending');
  });
});

/**
 * #232 phần 4 — the two empty sentences that still described `draft` as "chưa hoạt động" after
 * #265 turned it into a long-lived "waiting for you to confirm the graph".
 */
describe('an empty queue says which empty it is (#232)', () => {
  it('tells a draft plan apart from an archived one', async () => {
    plans.push({
      id: ARCHIVED_PLAN_ID,
      userId: USER_ID,
      name: 'Giải tích',
      deadline: null,
      status: 'archived',
    });

    const draft = await getReviewQueueForPlan(DRAFT_PLAN_ID, USER_ID);
    const archived = await getReviewQueueForPlan(ARCHIVED_PLAN_ID, USER_ID);

    expect(draft.message).toBe(PLAN_AWAITING_CONFIRMATION_MESSAGE);
    expect(archived.message).toBe(PLAN_ARCHIVED_MESSAGE);
    // Writing "chờ bạn xác nhận đồ thị" on an archived plan would simply be untrue.
    expect(draft.message).not.toBe(archived.message);
  });

  it('invites a brand-new user to create a plan', async () => {
    plans = [];

    const today = await getTodayReviewQueue(USER_ID);

    expect(today.items).toEqual([]);
    expect(today.message).toBe(NO_PLAN_MESSAGE);
  });

  it('points a user whose plans are all drafts at the confirmation step, and queues nothing', async () => {
    plans = plans.filter((plan) => plan.status === 'draft');
    queueRows = [row({ id: 'item-dfs', conceptId: 'concept-dfs', planId: DRAFT_PLAN_ID })];

    const today = await getTodayReviewQueue(USER_ID);

    // The widened `where` is for counting and classifying only — a plan whose graph the student
    // has not confirmed still contributes nothing to the schedule (#265).
    expect(today.items).toEqual([]);
    expect(today.message).toContain('1 kế hoạch');
    expect(today.message).toContain('chờ xác nhận');
  });

  it('counts how many plans are waiting rather than saying "no plans"', async () => {
    plans = [
      { id: DRAFT_PLAN_ID, userId: USER_ID, name: 'A', deadline: null, status: 'draft' },
      { id: SECOND_PLAN_ID, userId: USER_ID, name: 'B', deadline: null, status: 'draft' },
    ];

    const today = await getTodayReviewQueue(USER_ID);

    expect(today.message).toContain('2 kế hoạch');
  });

  it('says the plans are archived when that is what happened', async () => {
    plans = [
      {
        id: ARCHIVED_PLAN_ID,
        userId: USER_ID,
        name: 'Giải tích',
        deadline: null,
        status: 'archived',
      },
    ];

    const today = await getTodayReviewQueue(USER_ID);

    expect(today.message).toBe(ALL_PLANS_ARCHIVED_MESSAGE);
  });

  it('never answers the three cases with one sentence', () => {
    expect(new Set([NO_PLAN_MESSAGE, ALL_PLANS_ARCHIVED_MESSAGE, PLAN_ARCHIVED_MESSAGE]).size).toBe(
      3
    );
  });
});
