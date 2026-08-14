import type { ConceptStatus, ReviewItemStatus, ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import {
  COMPLETED_PLAN_MESSAGE,
  COMPLETED_TODAY_MESSAGE,
  CONTENT_CHANGED_PLAN_NOTE,
  CONTENT_CHANGED_TODAY_MESSAGE,
  NO_ACTIVE_CONCEPTS_PLAN_MESSAGE,
  NO_ACTIVE_CONCEPTS_TODAY_MESSAGE,
  getReviewQueueForPlan,
  getTodayReviewQueue,
} from '../services/scheduling.service';
import { startInterview } from '../services/interview.service';
import { AppError } from '../middleware/errorHandler';

/**
 * #345 — four empty states, two surfaces, and every state gets a sentence that is true of it.
 *
 * #344 filtered deprecated concepts out of the queue reads, which was right, but it routed a
 * plan whose queued concepts had all been dropped into the "never interviewed" branch. The
 * student then read "chưa có kết quả vấn đáp nào" — or, on the queue page, a green tick — about
 * work they had actually done.
 *
 * The fake honours `where`, same as `review-queue-status.test.ts` and for the same reason: every
 * branch here is chosen by a count, so a mock that answers the same thing whatever it was asked
 * would pass identically before and after the fix. No Prisma client is constructed (R05).
 */

const USER_ID = 'user-uuid';
const PLAN_ID = 'plan-uuid';
const OTHER_PLAN_ID = 'plan-other-uuid';
/** In the past relative to the real `new Date()` the services call — always due, no fake clock. */
const ALREADY_DUE = new Date('2026-08-04T09:00:00.000Z');
const NEVER_DUE = new Date('2036-08-12T09:00:00.000Z');

interface FakeConcept {
  id: string;
  planId: string;
  name: string;
  masteryScore: number | null;
  status: ConceptStatus;
}

interface FakeQueueRow {
  id: string;
  planId: string;
  conceptId: string;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptId: string | null;
  sourceSessionId: string | null;
  scheduledFor: Date | null;
}

interface FakePlan {
  id: string;
  name: string;
}

let concepts: FakeConcept[] = [];
let queueRows: FakeQueueRow[] = [];
let plans: FakePlan[] = [];

function concept(overrides: Partial<FakeConcept> & { id: string }): FakeConcept {
  return {
    planId: PLAN_ID,
    name: `Khái niệm ${overrides.id}`,
    masteryScore: null,
    status: 'active',
    ...overrides,
  };
}

function row(overrides: Partial<FakeQueueRow> & { id: string; conceptId: string }): FakeQueueRow {
  return {
    planId: PLAN_ID,
    reason: 'spaced_repetition',
    depth: null,
    status: 'pending',
    sourceConceptId: null,
    sourceSessionId: null,
    scheduledFor: ALREADY_DUE,
    ...overrides,
  };
}

interface QueueWhere {
  planId?: string;
  status?: ReviewItemStatus | { notIn?: ReviewItemStatus[] };
  scheduledFor?: { lte: Date };
  concept?: { status?: ConceptStatus };
}

interface ConceptWhere {
  planId?: string;
  status?: ConceptStatus;
  id?: { in: string[] };
}

function conceptOf(row_: FakeQueueRow): FakeConcept {
  const found = concepts.find((c) => c.id === row_.conceptId);
  if (found === undefined) {
    // The relation is required in the schema, so a fixture without it would be asking the fake a
    // question the database cannot be asked.
    throw new Error(`fixture: row ${row_.id} points at a concept that does not exist`);
  }
  return found;
}

function matchesRow(candidate: FakeQueueRow, where: QueueWhere = {}): boolean {
  if (where.planId !== undefined && candidate.planId !== where.planId) return false;
  if (typeof where.status === 'string' && candidate.status !== where.status) return false;
  if (typeof where.status === 'object' && where.status.notIn?.includes(candidate.status)) {
    return false;
  }
  if (where.scheduledFor !== undefined) {
    if (candidate.scheduledFor === null) return false;
    if (candidate.scheduledFor > where.scheduledFor.lte) return false;
  }
  if (where.concept?.status !== undefined && conceptOf(candidate).status !== where.concept.status) {
    return false;
  }
  return true;
}

function matchesConcept(candidate: FakeConcept, where: ConceptWhere = {}): boolean {
  return (
    (where.planId === undefined || candidate.planId === where.planId) &&
    (where.status === undefined || candidate.status === where.status) &&
    (where.id === undefined || where.id.in.includes(candidate.id))
  );
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    reviewQueueItem: { count: jest.fn(), findMany: jest.fn() },
    concept: { count: jest.fn(), findMany: jest.fn() },
    studyPlan: { findUnique: jest.fn(), findMany: jest.fn() },
    interviewSession: { findMany: jest.fn(), findFirst: jest.fn() },
    document: { findFirst: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  reviewQueueItem: { count: jest.Mock; findMany: jest.Mock };
  concept: { count: jest.Mock; findMany: jest.Mock };
  studyPlan: { findUnique: jest.Mock; findMany: jest.Mock };
  interviewSession: { findMany: jest.Mock; findFirst: jest.Mock };
  document: { findFirst: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  concepts = [];
  queueRows = [];
  plans = [{ id: PLAN_ID, name: 'Cấu trúc dữ liệu' }];

  mockedPrisma.reviewQueueItem.count.mockImplementation(({ where }: { where: QueueWhere }) =>
    Promise.resolve(queueRows.filter((r) => matchesRow(r, where)).length)
  );
  mockedPrisma.reviewQueueItem.findMany.mockImplementation(({ where }: { where: QueueWhere }) =>
    Promise.resolve(
      queueRows.filter((r) => matchesRow(r, where)).map((r) => ({ ...r, concept: conceptOf(r) }))
    )
  );
  // One predicate for both, exactly as production asks it — `{ planId, status: 'active' }` drives
  // the fallback list and the flag alike, so the fake must not be able to answer them differently.
  mockedPrisma.concept.count.mockImplementation(({ where }: { where: ConceptWhere }) =>
    Promise.resolve(concepts.filter((c) => matchesConcept(c, where)).length)
  );
  mockedPrisma.concept.findMany.mockImplementation(({ where }: { where: ConceptWhere }) =>
    Promise.resolve(concepts.filter((c) => matchesConcept(c, where)))
  );

  mockedPrisma.studyPlan.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    const plan = plans.find((p) => p.id === where.id);
    return Promise.resolve(
      plan ? { ...plan, userId: USER_ID, deadline: null, status: 'active' } : null
    );
  });
  mockedPrisma.studyPlan.findMany.mockImplementation(() =>
    Promise.resolve(plans.map((p) => ({ ...p, deadline: null, status: 'active' })))
  );
  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
  mockedPrisma.interviewSession.findFirst.mockResolvedValue(null);
  mockedPrisma.document.findFirst.mockResolvedValue({ id: 'doc-uuid' });
});

const queue = () => getReviewQueueForPlan(PLAN_ID, USER_ID);

describe('GET /review-queue?planId= — one sentence per state', () => {
  it('(a) never graded, graph intact: suggestions and no note at all', async () => {
    concepts = [concept({ id: 'c-avl' })];

    const result = await queue();

    expect(result.items.map((i) => i.conceptId)).toEqual(['c-avl']);
    expect(result.message).toBeNull();
    // The client owns this sentence (#273's A2b exception). The server staying quiet is what
    // keeps that exception reachable.
    expect(result.noScheduleNote).toBeNull();
    expect(result.hasActiveConcepts).toBe(true);
  });

  it('(b) graded and genuinely finished: still congratulated', async () => {
    concepts = [concept({ id: 'c-avl' })];
    queueRows = [row({ id: 'i-1', conceptId: 'c-avl', status: 'done' })];

    const result = await queue();

    expect(result.items).toEqual([]);
    expect(result.message).toBe(COMPLETED_PLAN_MESSAGE);
    expect(result.noScheduleNote).toBeNull();
  });

  it('(c) graded, every queued concept dropped, graph still has material', async () => {
    concepts = [
      concept({ id: 'c-gone', status: 'deprecated' }),
      concept({ id: 'c-new' }), // came in with the re-analysis
    ];
    queueRows = [row({ id: 'i-1', conceptId: 'c-gone' })];

    const result = await queue();

    // The list is the A3 suggestion list, so it is NOT empty — which is exactly why the sentence
    // cannot ride `message`.
    expect(result.items.map((i) => i.conceptId)).toEqual(['c-new']);
    expect(result.message).toBeNull();
    expect(result.noScheduleNote).toBe(CONTENT_CHANGED_PLAN_NOTE);
  });

  it('(d) no concept left in the graph: says so, and says nothing about history', async () => {
    // Deliberately with NO graded history either: a fix that gated this on `hadGradedHistory`
    // would answer `null` here and the student would get the blank congratulation card back.
    concepts = [];

    const result = await queue();

    expect(result.items).toEqual([]);
    expect(result.message).toBe(NO_ACTIVE_CONCEPTS_PLAN_MESSAGE);
    expect(result.hasActiveConcepts).toBe(false);
  });

  it('(d) reached the other way — graded, then the graph was emptied', async () => {
    concepts = [concept({ id: 'c-gone', status: 'deprecated' })];
    queueRows = [row({ id: 'i-1', conceptId: 'c-gone' })];

    const result = await queue();

    expect(result.message).toBe(NO_ACTIVE_CONCEPTS_PLAN_MESSAGE);
    expect(result.noScheduleNote).toBeNull();
  });
});

describe('GET /review-queue/today — the five-branch table', () => {
  const secondPlan = () => {
    plans.push({ id: OTHER_PLAN_ID, name: 'Mạng máy tính' });
  };

  it('DUE-DONE: one plan still has a live queue, nothing due right now', async () => {
    concepts = [concept({ id: 'c-avl' })];
    queueRows = [row({ id: 'i-1', conceptId: 'c-avl', scheduledFor: NEVER_DUE })];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.items).toEqual([]);
    expect(result.message).toBe(COMPLETED_TODAY_MESSAGE);
  });

  it('EMPTY-GRAPH: every plan has an empty graph', async () => {
    secondPlan();
    concepts = [];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.message).toBe(NO_ACTIVE_CONCEPTS_TODAY_MESSAGE);
  });

  it('EMPTY-GRAPH wins over CHANGED when a plan is both', async () => {
    // Graded before (so CHANGED's condition holds) *and* nothing active left (so EMPTY-GRAPH's
    // does). The order of the two branches is the whole assertion.
    concepts = [concept({ id: 'c-gone', status: 'deprecated' })];
    queueRows = [row({ id: 'i-1', conceptId: 'c-gone' })];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.message).toBe(NO_ACTIVE_CONCEPTS_TODAY_MESSAGE);
    expect(result.message).not.toBe(CONTENT_CHANGED_TODAY_MESSAGE);
  });

  it('CHANGED: every plan was graded, none has anything left on the schedule', async () => {
    concepts = [concept({ id: 'c-gone', status: 'deprecated' }), concept({ id: 'c-new' })];
    queueRows = [row({ id: 'i-1', conceptId: 'c-gone' })];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.message).toBe(CONTENT_CHANGED_TODAY_MESSAGE);
  });

  it('INVITE: nothing was ever graded — the client keeps its own sentence', async () => {
    concepts = [concept({ id: 'c-avl' })];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.message).toBeNull();
  });

  it('INVITE-MIXED: a brand-new plan beside a changed one still gets the invitation', async () => {
    // The case that killed the `some()` rule an earlier draft proposed: the diagnosis would be
    // false of the new plan, and it would swallow the one invitation the student can act on.
    secondPlan();
    concepts = [
      concept({ id: 'c-gone', planId: PLAN_ID, status: 'deprecated' }),
      concept({ id: 'c-new-plan', planId: OTHER_PLAN_ID }),
    ];
    queueRows = [row({ id: 'i-1', conceptId: 'c-gone', planId: PLAN_ID })];

    const result = await getTodayReviewQueue(USER_ID);

    expect(result.message).toBeNull();
    expect(result.message).not.toBe(CONTENT_CHANGED_TODAY_MESSAGE);
  });
});

describe('the two surfaces never share a sentence', () => {
  it('every new string is distinct from its counterpart on the other endpoint', () => {
    // `/today` aggregates across plans, so "Kế hoạch này" would be wrong there — the pairs exist
    // precisely because one wording cannot serve both.
    expect(CONTENT_CHANGED_PLAN_NOTE).not.toBe(CONTENT_CHANGED_TODAY_MESSAGE);
    expect(NO_ACTIVE_CONCEPTS_PLAN_MESSAGE).not.toBe(NO_ACTIVE_CONCEPTS_TODAY_MESSAGE);
    expect(COMPLETED_PLAN_MESSAGE).not.toBe(COMPLETED_TODAY_MESSAGE);
  });
});

describe('the sentence also has to work as a refusal (409)', () => {
  it('starting an interview on a plan with no concepts is refused with the same words', async () => {
    // `resolveConceptQueue` throws `queue.message ?? NO_CONCEPTS_MESSAGE`, and `queue` there is
    // `getReviewQueueForPlan` — so case (d)'s sentence silently becomes the body of this 409.
    // Pinned here because nothing at the wording's own call site would notice it drifting.
    concepts = [];

    await expect(startInterview(USER_ID, { planId: PLAN_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: 'NO_CONCEPTS_TO_REVIEW',
      message: NO_ACTIVE_CONCEPTS_PLAN_MESSAGE,
    });
  });

  it('is an AppError, so the handler renders it rather than a 500', async () => {
    concepts = [];

    await expect(startInterview(USER_ID, { planId: PLAN_ID })).rejects.toBeInstanceOf(AppError);
  });
});
