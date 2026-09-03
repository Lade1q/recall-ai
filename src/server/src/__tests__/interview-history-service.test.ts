import { listInterviews } from '../services/interview-history.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * SPEC_DB-03 — `listInterviews()` against mocked Prisma.
 *
 * Nothing from `interview.service.ts` is mocked any more: the one thing this module reused from
 * it, `parseConceptQueue`, is pure and now lives in `utils/interview-queue.ts`, so the real
 * function runs here. The mock it replaces was a hand-written copy carrying the pre-traceback
 * `typeof id === 'string'` filter — this suite would have stayed green while the history tab
 * listed no concepts for every session written in the object form.
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    studyPlan: { findUnique: jest.fn() },
    interviewSession: { findMany: jest.fn() },
    concept: { findMany: jest.fn() },
    interviewTurn: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  studyPlan: { findUnique: jest.Mock };
  interviewSession: { findMany: jest.Mock };
  concept: { findMany: jest.Mock };
  interviewTurn: { findMany: jest.Mock };
};

const USER_ID = 'user-uuid';
const OTHER_USER_ID = 'other-user-uuid';
const PLAN_ID = 'plan-uuid';
const CONCEPT_A = 'concept-a';
const CONCEPT_B = 'concept-b';
const SESSION_OLD = 'session-old';
const SESSION_NEW = 'session-new';

const STARTED_OLD = new Date('2026-07-01T10:00:00.000Z');
const STARTED_NEW = new Date('2026-08-01T10:00:00.000Z');

function sessionRow(overrides: {
  id: string;
  startedAt: Date;
  endedAt?: Date | null;
  status?: string;
  fallbackMode?: boolean;
  /** `unknown[]`, not `string[]`: the column holds the object form since live traceback. */
  conceptQueue?: unknown[];
}) {
  return {
    id: overrides.id,
    startedAt: overrides.startedAt,
    endedAt: overrides.endedAt ?? null,
    status: overrides.status ?? 'completed',
    fallbackMode: overrides.fallbackMode ?? false,
    // Object form by default — the shape every session written since live traceback stores.
    // Call sites that pass a plain `string[]` keep covering the legacy shape.
    conceptQueue: overrides.conceptQueue ?? [
      { conceptId: CONCEPT_A, hop: 0, viaConceptId: null, added: false },
    ],
    plan: { id: PLAN_ID, name: 'Cấu trúc dữ liệu & Giải thuật' },
  };
}

function turnRow(sessionId: string, startedAt: Date, conceptId: string, score: number | null) {
  return {
    sessionId,
    conceptId,
    turnIndex: 1,
    score,
    session: { startedAt },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listInterviews', () => {
  it('sorts by startedAt descending and forwards limit/offset to Prisma', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([]);

    await listInterviews(USER_ID, { limit: 5, offset: 10 });

    expect(mockedPrisma.interviewSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        orderBy: { startedAt: 'desc' },
        take: 5,
        skip: 10,
      })
    );
  });

  it('returns [] for a user with no sessions (AF1)', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([]);

    const result = await listInterviews(USER_ID, {});

    expect(result).toEqual([]);
    expect(mockedPrisma.concept.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewTurn.findMany).not.toHaveBeenCalled();
  });

  it('filters by planId once ownership is confirmed', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ id: PLAN_ID, userId: USER_ID });
    mockedPrisma.interviewSession.findMany.mockResolvedValue([]);

    await listInterviews(USER_ID, { planId: PLAN_ID });

    expect(mockedPrisma.interviewSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, planId: PLAN_ID } })
    );
  });

  it('throws 404 NOT_FOUND — not 403 — when planId belongs to another user (#115)', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ id: PLAN_ID, userId: OTHER_USER_ID });

    const error = await listInterviews(USER_ID, { planId: PLAN_ID }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.interviewSession.findMany).not.toHaveBeenCalled();
  });

  it('throws 404 NOT_FOUND when planId does not exist at all', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue(null);

    const error = await listInterviews(USER_ID, { planId: PLAN_ID }).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('marks a concept never assessed before as masteryBefore: null, isFirstAssessment: true — not 0', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([
      sessionRow({ id: SESSION_NEW, startedAt: STARTED_NEW, conceptQueue: [CONCEPT_A] }),
    ]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_A, name: 'Ngăn xếp' }]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      turnRow(SESSION_NEW, STARTED_NEW, CONCEPT_A, 0.8),
    ]);

    const [item] = await listInterviews(USER_ID, {});

    expect(item?.concepts).toEqual([
      {
        conceptId: CONCEPT_A,
        name: 'Ngăn xếp',
        masteryBefore: null,
        masteryAfter: 0.8,
        isFirstAssessment: true,
      },
    ]);
    expect(item?.averageMasteryScore).toBe(0.8);
  });

  /**
   * The history tab reads the concepts of a session out of `conceptQueue`, which has had two
   * shapes. Every other test here passes the legacy `string[]`, so none of them can tell whether
   * the object form — what every session written since live traceback stores — is understood.
   * Without this, `parseConceptQueue` could go back to a `typeof id === 'string'` filter and the
   * whole tab would list zero concepts per session with the suite still green.
   */
  it('🔴 reads a queue stored in the OBJECT form, so post-traceback sessions still list concepts', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([
      sessionRow({
        id: SESSION_NEW,
        startedAt: STARTED_NEW,
        conceptQueue: [{ conceptId: CONCEPT_A, hop: 1, viaConceptId: CONCEPT_B, added: true }],
      }),
    ]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_A, name: 'Ngăn xếp' }]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      turnRow(SESSION_NEW, STARTED_NEW, CONCEPT_A, 0.8),
    ]);

    const [item] = await listInterviews(USER_ID, {});

    // The number stated outright: 0 is the regression, so "not empty" is not enough of a claim.
    expect(item?.concepts).toHaveLength(1);
    expect(item?.concepts[0]?.conceptId).toBe(CONCEPT_A);
  });

  it("takes masteryBefore from the prior session that graded this concept, not the concept's current live score", async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([
      sessionRow({ id: SESSION_NEW, startedAt: STARTED_NEW, conceptQueue: [CONCEPT_A] }),
      sessionRow({ id: SESSION_OLD, startedAt: STARTED_OLD, conceptQueue: [CONCEPT_A] }),
    ]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_A, name: 'Ngăn xếp' }]);
    // Both sessions graded the SAME concept — masteryBefore of the newer one must be the
    // older session's own score, never Concept.masteryScore (not queried at all here).
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      turnRow(SESSION_OLD, STARTED_OLD, CONCEPT_A, 0.3),
      turnRow(SESSION_NEW, STARTED_NEW, CONCEPT_A, 0.9),
    ]);

    const [newest, oldest] = await listInterviews(USER_ID, {});

    expect(newest?.id).toBe(SESSION_NEW);
    expect(newest?.concepts[0]).toMatchObject({
      masteryBefore: 0.3,
      masteryAfter: 0.9,
      isFirstAssessment: false,
    });
    expect(oldest?.id).toBe(SESSION_OLD);
    expect(oldest?.concepts[0]).toMatchObject({
      masteryBefore: null,
      masteryAfter: 0.3,
      isFirstAssessment: true,
    });
  });

  it('drops a concept from the deltas when its row no longer exists (re-analysis, SP-05)', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([
      sessionRow({ id: SESSION_NEW, startedAt: STARTED_NEW, conceptQueue: [CONCEPT_A, CONCEPT_B] }),
    ]);
    // Only CONCEPT_A still exists — CONCEPT_B was deleted since.
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_A, name: 'Ngăn xếp' }]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      turnRow(SESSION_NEW, STARTED_NEW, CONCEPT_A, 0.6),
    ]);

    const [item] = await listInterviews(USER_ID, {});

    expect(item?.concepts).toHaveLength(1);
    expect(item?.concepts[0]?.conceptId).toBe(CONCEPT_A);
  });

  it('leaves averageMasteryScore null when no concept of the session has a real score yet', async () => {
    mockedPrisma.interviewSession.findMany.mockResolvedValue([
      sessionRow({
        id: SESSION_NEW,
        startedAt: STARTED_NEW,
        status: 'paused',
        conceptQueue: [CONCEPT_A],
      }),
    ]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_A, name: 'Ngăn xếp' }]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([]);

    const [item] = await listInterviews(USER_ID, {});

    expect(item?.concepts[0]).toMatchObject({ masteryBefore: null, masteryAfter: null });
    expect(item?.averageMasteryScore).toBeNull();
  });
});
