import type { ConceptStatus, ReviewItemStatus, ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import {
  COMPLETED_PLAN_MESSAGE,
  COMPLETED_TODAY_MESSAGE,
  getReviewQueueForPlan,
  getTodayReviewQueue,
} from '../services/scheduling.service';
import { getUserPlans } from '../services/plan.service';

/**
 * #343 — a concept SP-05 re-analyze removed from the plan (`status: 'deprecated'`, never
 * deleted) must not surface on any read of the review queue. It used to: the queue filtered
 * `ReviewQueueItem.status` and nothing else, so any concept that had once been interviewed and
 * was dropped from a later analysis kept its place in line — and the queue feeds
 * `interview.service.ts`'s auto-pick branch, which would then build a whole session on material
 * that is in neither the plan nor the graph.
 *
 * Prisma is faked with an in-memory table that actually honours `where` (same approach, and the
 * same reason, as `review-queue-status.test.ts`): the bug lives *in* a filter, so a mock that
 * hands back a canned array whatever it was asked for would have passed just as happily before
 * the fix. Both services under test import the same `../config/prisma`, so one fake covers the
 * queue reads and the plan-card badge — which is what lets the "badge 3 / list 0" case be
 * written as one assertion instead of two hopeful ones.
 *
 * No Prisma client is constructed, so this passes without DATABASE_URL/GEMINI_API_KEY (R05).
 */

const PLAN_ID = 'plan-uuid';
const USER_ID = 'user-uuid';
/** Relative to the real `new Date()` the services call, so `dueOnly` needs no clock faking. */
const ALREADY_DUE = new Date('2026-08-04T09:00:00.000Z');

interface FakeConcept {
  id: string;
  planId: string;
  name: string;
  masteryScore: number | null;
  difficulty: number;
  status: ConceptStatus;
}

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

let concepts: FakeConcept[] = [];
let queueRows: FakeQueueRow[] = [];

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

interface FakeConceptWhere {
  planId?: string;
  status?: ConceptStatus;
  id?: { in: string[] };
}

/** The subset of Prisma's `where` grammar these reads actually use. */
interface FakeQueueWhere {
  planId?: string | { in: string[] };
  status?: ReviewItemStatus | { notIn?: ReviewItemStatus[] };
  scheduledFor?: { lte: Date };
  concept?: { status?: ConceptStatus };
}

function matchesQueueRow(candidate: FakeQueueRow, where: FakeQueueWhere = {}): boolean {
  if (typeof where.planId === 'string' && candidate.planId !== where.planId) return false;
  if (typeof where.planId === 'object' && !where.planId.in.includes(candidate.planId)) return false;
  if (typeof where.status === 'string' && candidate.status !== where.status) return false;
  if (typeof where.status === 'object' && where.status.notIn?.includes(candidate.status)) {
    return false;
  }
  if (where.scheduledFor !== undefined) {
    // `NULL <= now` is false in SQL too: an item with no date is not due today.
    if (candidate.scheduledFor === null) return false;
    if (candidate.scheduledFor > where.scheduledFor.lte) return false;
  }
  if (where.concept?.status !== undefined) {
    // `ReviewQueueItem.concept` is a required relation, so real Prisma resolves exactly one row
    // here and the filter is a plain inner join. A fixture that breaks that invariant would make
    // the fake answer a question the database can never be asked.
    const concept = concepts.find((candidate_) => candidate_.id === candidate.conceptId);
    if (concept === undefined) {
      throw new Error(`fixture: queue row ${candidate.id} points at a concept that does not exist`);
    }
    if (concept.status !== where.concept.status) return false;
  }
  return true;
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    reviewQueueItem: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    concept: { findMany: jest.fn(), count: jest.fn() },
    interviewSession: { findMany: jest.fn() },
    studyPlan: { findUnique: jest.fn(), findMany: jest.fn() },
    analysisJob: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  reviewQueueItem: { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
  concept: { findMany: jest.Mock; count: jest.Mock };
  interviewSession: { findMany: jest.Mock };
  studyPlan: { findUnique: jest.Mock; findMany: jest.Mock };
  analysisJob: { findMany: jest.Mock };
};

const PLAN_ROW = {
  id: PLAN_ID,
  userId: USER_ID,
  name: 'Cấu trúc dữ liệu',
  deadline: null,
  status: 'active' as const,
  createdAt: new Date('2026-07-31'),
};

beforeEach(() => {
  jest.clearAllMocks();

  concepts = [
    {
      id: 'concept-avl',
      planId: PLAN_ID,
      name: 'Cây AVL',
      masteryScore: 0.31,
      difficulty: 3,
      status: 'active',
    },
    {
      id: 'concept-dfs',
      planId: PLAN_ID,
      name: 'Duyệt đồ thị DFS',
      masteryScore: 0.2,
      difficulty: 4,
      status: 'active',
    },
    // Dropped by a later analysis. The row is kept — a revived concept gets its mastery back.
    {
      id: 'concept-gone',
      planId: PLAN_ID,
      name: 'Cây đỏ đen',
      masteryScore: 0.15,
      difficulty: 5,
      status: 'deprecated',
    },
  ];
  queueRows = [];

  mockedPrisma.reviewQueueItem.count.mockImplementation(({ where }: { where: FakeQueueWhere }) =>
    Promise.resolve(queueRows.filter((candidate) => matchesQueueRow(candidate, where)).length)
  );

  mockedPrisma.reviewQueueItem.findMany.mockImplementation(({ where }: { where: FakeQueueWhere }) =>
    Promise.resolve(
      queueRows
        .filter((candidate) => matchesQueueRow(candidate, where))
        .map((candidate) => ({
          ...candidate,
          concept: concepts.find((concept) => concept.id === candidate.conceptId),
        }))
    )
  );

  // `by: ['planId', 'conceptId']` — one group per distinct pair among the matching rows, which
  // is the whole point of the badge query: rows per concept must not inflate the count (#232).
  //
  // The pair is joined on a pipe -- no id contains one. Do not "improve" this to a raw NUL
  // separator: one NUL byte anywhere in a file makes git call the whole file binary, and the
  // diff collapses to "Bin 0 -> N bytes" with zero insertions, so the entire test disappears
  // from code review. `grep` goes quiet on such a file too, which hides it from scripts as well.
  mockedPrisma.reviewQueueItem.groupBy.mockImplementation(
    ({ where }: { where: FakeQueueWhere }) => {
      const pairs = new Set<string>();
      for (const candidate of queueRows) {
        if (matchesQueueRow(candidate, where)) {
          pairs.add(`${candidate.planId}|${candidate.conceptId}`);
        }
      }
      return Promise.resolve(
        [...pairs].map((pair) => {
          const [planId, conceptId] = pair.split('|');
          return { planId, conceptId };
        })
      );
    }
  );

  // `findMany` và `count` (#345) chia CHUNG một vị từ, đúng như production: cả hai đều hỏi
  // `{ planId, status: 'active' }`. Tách ra hai bộ lọc chép tay là mở đường cho fake trả lời
  // hai kiểu cho cùng một câu hỏi — thứ khiến mutant chết vì lý do sai.
  const matchesConcept = (concept: FakeConcept, where: FakeConceptWhere): boolean =>
    (where.planId === undefined || concept.planId === where.planId) &&
    (where.status === undefined || concept.status === where.status) &&
    (where.id === undefined || where.id.in.includes(concept.id));

  mockedPrisma.concept.findMany.mockImplementation(({ where }: { where: FakeConceptWhere }) =>
    Promise.resolve(concepts.filter((concept) => matchesConcept(concept, where)))
  );

  mockedPrisma.concept.count.mockImplementation(({ where }: { where: FakeConceptWhere }) =>
    Promise.resolve(concepts.filter((concept) => matchesConcept(concept, where)).length)
  );

  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
  mockedPrisma.analysisJob.findMany.mockResolvedValue([]);

  mockedPrisma.studyPlan.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === PLAN_ID ? PLAN_ROW : null)
  );
  mockedPrisma.studyPlan.findMany.mockImplementation(() =>
    Promise.resolve([
      {
        ...PLAN_ROW,
        // A real query has already applied `where: { status: 'active' }` to this nested select.
        concepts: concepts
          .filter((concept) => concept.status === 'active')
          .map((concept) => ({ masteryScore: concept.masteryScore })),
        documents: [],
      },
    ])
  );
});

function conceptIdsOf(items: { conceptId: string }[]): string[] {
  return items.map((item) => item.conceptId);
}

describe('GET /review-queue?planId=', () => {
  it('leaves out an item whose concept the plan no longer contains', async () => {
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl' }),
      row({ id: 'item-gone', conceptId: 'concept-gone' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-avl']);
  });
});

describe('GET /review-queue/today', () => {
  it('does not let a dropped concept through the due filter either', async () => {
    queueRows = [
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
      row({ id: 'item-gone', conceptId: 'concept-gone' }),
    ];

    const queue = await getTodayReviewQueue(USER_ID);

    expect(conceptIdsOf(queue.items)).toEqual(['concept-dfs']);
  });

  it('says nothing is due rather than congratulating, when only dropped concepts were queued', async () => {
    queueRows = [row({ id: 'item-gone', conceptId: 'concept-gone' })];

    const queue = await getTodayReviewQueue(USER_ID);

    expect(queue.items).toEqual([]);
    expect(queue.message).not.toBe(COMPLETED_TODAY_MESSAGE);
  });
});

describe('the "Đã gỡ khỏi lịch" group', () => {
  it('offers "Đưa lại vào lịch" only for concepts the plan still contains', async () => {
    // Without the filter this list is worse than a stale row: every line here is drawn with a
    // button that puts the concept *back* on the schedule.
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl', status: 'skipped' }),
      row({ id: 'item-gone', conceptId: 'concept-gone', status: 'skipped' }),
    ];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID, 10, { includeSkipped: true });

    expect(conceptIdsOf(queue.skippedItems ?? [])).toEqual(['concept-avl']);
  });
});

describe('the empty state a plan of nothing-but-tombstones falls into', () => {
  it('suggests active concepts instead of claiming the plan is finished', async () => {
    // `totalCount` is not just another filtered read — it decides *which* empty state shows.
    // Unfiltered, this plan has history, so the queue would answer COMPLETED_PLAN_MESSAGE: a
    // congratulation for finishing work the student never did.
    queueRows = [row({ id: 'item-gone', conceptId: 'concept-gone' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.message).not.toBe(COMPLETED_PLAN_MESSAGE);
    expect(conceptIdsOf(queue.items).sort()).toEqual(['concept-avl', 'concept-dfs']);
  });

  it('still congratulates a plan that really did finish its queue', async () => {
    // The other side of the same branch: `done` is off the schedule but its concept is alive,
    // so history is real and the sentence is true. Filtering `totalCount` must not cost this.
    queueRows = [row({ id: 'item-avl', conceptId: 'concept-avl', status: 'done' })];

    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(queue.items).toEqual([]);
    expect(queue.message).toBe(COMPLETED_PLAN_MESSAGE);
  });
});

describe('the plan-card badge', () => {
  it('counts what the queue will actually show — no badge 3 / list 0', async () => {
    // Two live concepts, not one: with a single one the expected count (1) would coincide with
    // what a filter aimed at the *wrong* status produces, and this test would pass while
    // asserting nothing — the mutation sweep caught exactly that.
    queueRows = [
      row({ id: 'item-avl', conceptId: 'concept-avl' }),
      // Two rows, one concept: the badge counts concepts, not rows (#232).
      row({ id: 'item-avl-2', conceptId: 'concept-avl' }),
      row({ id: 'item-dfs', conceptId: 'concept-dfs' }),
      row({ id: 'item-gone', conceptId: 'concept-gone' }),
    ];

    const [card] = await getUserPlans(USER_ID);
    const queue = await getReviewQueueForPlan(PLAN_ID, USER_ID);

    expect(card?.reviewQueueConceptCount).toBe(2);
    expect(card?.reviewQueueConceptCount).toBe(queue.items.length);
  });
});
