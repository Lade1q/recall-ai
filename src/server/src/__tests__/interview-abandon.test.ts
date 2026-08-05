import { abandonInterview } from '../services/interview.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * `POST /interviews/:id/abandon` (#243) — SPEC_DB-03 AF2, "Kết thúc và chấm phần đã làm".
 *
 * The point of the endpoint is that ending early *scores* the half-finished concept instead of
 * discarding it, so these tests deliberately run the **real** `finalizeConceptResult` (I7.2) and
 * the real `calculateMasteryScore` over a stateful in-memory fake of the tables they touch. A
 * mocked-out I7.2 would let a version that writes nothing at all pass every assertion here.
 *
 * Same shape as `interview-service.test.ts`: tiny mutable fakes rather than
 * `mockResolvedValueOnce` chains, because the service reloads its own view between writes and
 * that reload has to see what the write just did, the way Postgres would. No DATABASE_URL and
 * no GEMINI_API_KEY are needed — abandoning never asks the AI anything (C4 / risk R05).
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    interviewSession: { findUnique: jest.fn(), update: jest.fn() },
    interviewTurn: { findMany: jest.fn() },
    concept: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    conceptEdge: { findMany: jest.fn() },
    reviewQueueItem: { upsert: jest.fn() },
    document: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  interviewSession: { findUnique: jest.Mock; update: jest.Mock };
  interviewTurn: { findMany: jest.Mock };
  concept: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
  reviewQueueItem: { upsert: jest.Mock };
  document: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const USER_ID = 'user-uuid';
const OTHER_USER_ID = 'someone-else-uuid';
const SESSION_ID = 'session-uuid';
const PLAN_ID = 'plan-uuid';
/** The concept the session stops in the middle of. */
const CONCEPT_ID = 'concept-linked-list';
const CONCEPT_NAME = 'Danh sách liên kết';
/** Queued after it, never asked — the session ends before reaching it. */
const NEXT_CONCEPT_ID = 'concept-stack';
/** A weak prerequisite of CONCEPT_ID, for the traceback case. */
const PREREQ_CONCEPT_ID = 'concept-pointer';

interface FakeConcept {
  id: string;
  name: string;
  planId: string;
  masteryScore: number | null;
  lastTestedAt: Date | null;
}

interface FakeTurn {
  sessionId: string;
  conceptId: string;
  turnIndex: number;
  verdict: string | null;
  score: number | null;
}

let sessionRow: {
  id: string;
  userId: string;
  planId: string;
  status: string;
  conceptQueue: string[];
  currentConceptIdx: number;
  maxTurnsPerConcept: number;
  fallbackMode: boolean;
  summaryText: string | null;
  startedAt: Date;
  endedAt: Date | null;
  plan: { languageDetected: string | null; deadline: Date | null; tracebackEnabled: boolean };
};
let concepts: FakeConcept[];
let edges: Array<{ fromConceptId: string; toConceptId: string }>;
let turns: FakeTurn[];

function seedTurn(overrides: Partial<FakeTurn> = {}): void {
  turns.push({
    sessionId: SESSION_ID,
    conceptId: CONCEPT_ID,
    turnIndex: turns.length + 1,
    verdict: 'shallow',
    score: 0.5,
    ...overrides,
  });
}

function conceptById(id: string): FakeConcept | undefined {
  return concepts.find((concept) => concept.id === id);
}

beforeEach(() => {
  jest.clearAllMocks();
  // `finalizeConceptResult` logs one line per decision by design; keep it out of the report.
  jest.spyOn(console, 'log').mockImplementation(() => {});

  turns = [];
  edges = [];
  concepts = [
    {
      id: CONCEPT_ID,
      name: CONCEPT_NAME,
      planId: PLAN_ID,
      masteryScore: 0.42,
      lastTestedAt: new Date(2026, 0, 1),
    },
    {
      id: NEXT_CONCEPT_ID,
      name: 'Ngăn xếp',
      planId: PLAN_ID,
      masteryScore: null,
      lastTestedAt: null,
    },
    {
      id: PREREQ_CONCEPT_ID,
      name: 'Con trỏ',
      planId: PLAN_ID,
      masteryScore: 0.2,
      lastTestedAt: new Date(2026, 0, 1),
    },
  ];
  sessionRow = {
    id: SESSION_ID,
    userId: USER_ID,
    planId: PLAN_ID,
    status: 'active',
    conceptQueue: [CONCEPT_ID, NEXT_CONCEPT_ID],
    currentConceptIdx: 0,
    maxTurnsPerConcept: 3,
    fallbackMode: false,
    summaryText: null,
    startedAt: new Date(2026, 7, 5, 21, 0),
    endedAt: null,
    plan: { languageDetected: 'vi', deadline: new Date(2026, 8, 1), tracebackEnabled: true },
  };

  // One `findUnique` fake serves both readers: `loadSession` wants the whole session row,
  // `finalizeConceptResult` wants `planId` plus the plan's deadline and traceback switch.
  mockedPrisma.interviewSession.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === SESSION_ID ? { ...sessionRow } : null)
  );
  mockedPrisma.interviewSession.update.mockImplementation(
    ({ data }: { data: Partial<typeof sessionRow> }) => {
      Object.assign(sessionRow, data);
      return Promise.resolve({ ...sessionRow });
    }
  );
  mockedPrisma.concept.findFirst.mockImplementation(
    ({ where }: { where: { id: string; planId: string } }) => {
      const concept = conceptById(where.id);
      return Promise.resolve(concept && concept.planId === where.planId ? { ...concept } : null);
    }
  );
  mockedPrisma.concept.findMany.mockImplementation(({ where }: { where: { planId: string } }) =>
    Promise.resolve(
      concepts.filter((concept) => concept.planId === where.planId).map((c) => ({ ...c }))
    )
  );
  mockedPrisma.concept.update.mockImplementation(
    ({ where, data }: { where: { id: string }; data: Partial<FakeConcept> }) => {
      const concept = conceptById(where.id);
      if (!concept) throw new Error(`fake DB: concept ${where.id} not found`);
      Object.assign(concept, data);
      return Promise.resolve({ ...concept });
    }
  );
  mockedPrisma.conceptEdge.findMany.mockImplementation(() => Promise.resolve([...edges]));
  mockedPrisma.reviewQueueItem.upsert.mockResolvedValue({});
  mockedPrisma.document.findMany.mockResolvedValue([]);
  mockedPrisma.interviewTurn.findMany.mockImplementation(
    ({ where }: { where: { sessionId: string; conceptId?: string } }) =>
      Promise.resolve(
        turns
          .filter((turn) => turn.sessionId === where.sessionId)
          .filter((turn) => !where.conceptId || turn.conceptId === where.conceptId)
          .map((turn) => ({ ...turn, concept: { name: CONCEPT_NAME } }))
      )
  );
  // The real `finalizeConceptResult` runs inside a transaction; the fake hands it the same
  // client, which is enough because nothing here tests rollback.
  mockedPrisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockedPrisma)
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('abandonInterview — scoring what was actually answered', () => {
  it('scores a two-turn concept on renormalised weights [0.4, 0.6] and ends the session', async () => {
    seedTurn({ score: 0.5, verdict: 'shallow' });
    seedTurn({ score: 1, verdict: 'deep' });

    const result = await abandonInterview(SESSION_ID, USER_ID);

    // 0.4×0.5 + 0.6×1 = 0.8. Applying the raw [0.2, 0.3] weights would give 0.4 instead —
    // this assertion is what tells the two apart.
    expect(conceptById(CONCEPT_ID)?.masteryScore).toBe(0.8);
    expect(result.conceptCompleted?.conceptId).toBe(CONCEPT_ID);
    expect(result.conceptCompleted?.conceptName).toBe(CONCEPT_NAME);
    expect(result.conceptCompleted?.masteryScore).toBe(0.8);
    expect(result.session.status).toBe('abandoned');
    expect(result.session.endedAt).not.toBeNull();
  });

  it('counts the concept it just scored as completed rather than still in progress', async () => {
    seedTurn({ score: 0.9, verdict: 'deep' });

    const result = await abandonInterview(SESSION_ID, USER_ID);

    expect(result.session.progress.completedConcepts).toBe(1);
    expect(sessionRow.currentConceptIdx).toBe(1);
  });

  it('reports no current concept once ended, while still counting the scored one', async () => {
    // The index bump advances `currentConcept` to the *next, never-asked* concept; reporting
    // that would tell the client the session stopped somewhere it never went. Asserting the
    // count stays 1 alongside the null is what distinguishes nulling the field from dropping
    // the bump — the latter would break `completedConcepts`.
    seedTurn({ score: 0.9, verdict: 'deep' });

    const result = await abandonInterview(SESSION_ID, USER_ID);

    expect(result.session.currentConcept).toBeNull();
    expect(result.session.progress.completedConcepts).toBe(1);
  });

  it('abandons a paused session too, not only an active one', async () => {
    sessionRow.status = 'paused';
    seedTurn({ score: 0.5, verdict: 'shallow' });
    seedTurn({ score: 1, verdict: 'deep' });

    const result = await abandonInterview(SESSION_ID, USER_ID);

    expect(result.session.status).toBe('abandoned');
    expect(conceptById(CONCEPT_ID)?.masteryScore).toBe(0.8);
  });

  it('still runs traceback (AE-07) for a concept scored low on partial evidence', async () => {
    edges.push({ fromConceptId: PREREQ_CONCEPT_ID, toConceptId: CONCEPT_ID });
    seedTurn({ score: 0.1, verdict: 'wrong' });

    const result = await abandonInterview(SESSION_ID, USER_ID);

    expect(result.conceptCompleted?.tracebackSkipReason).toBeNull();
    expect(result.conceptCompleted?.prerequisites).toEqual([
      expect.objectContaining({ conceptId: PREREQ_CONCEPT_ID, depth: 1 }),
    ]);
  });
});

describe('abandonInterview — a concept with nothing to score', () => {
  it('leaves the stored masteryScore and lastTestedAt untouched', async () => {
    // The student was looking at the first question and never answered it.
    seedTurn({ score: null, verdict: null });
    const before = conceptById(CONCEPT_ID)!;
    const previousScore = before.masteryScore;
    const previousTestedAt = before.lastTestedAt;

    const result = await abandonInterview(SESSION_ID, USER_ID);

    expect(result.conceptCompleted).toBeNull();
    expect(result.session.status).toBe('abandoned');
    expect(mockedPrisma.concept.update).not.toHaveBeenCalled();
    expect(conceptById(CONCEPT_ID)?.masteryScore).toBe(previousScore);
    expect(conceptById(CONCEPT_ID)?.lastTestedAt).toBe(previousTestedAt);
  });

  it('does not queue a review for a concept that was never answered', async () => {
    seedTurn({ score: null, verdict: null });

    await abandonInterview(SESSION_ID, USER_ID);

    expect(mockedPrisma.reviewQueueItem.upsert).not.toHaveBeenCalled();
  });
});

describe('abandonInterview — guards', () => {
  it('is idempotent: a second call reports the state without scoring again', async () => {
    seedTurn({ score: 0.5, verdict: 'shallow' });
    seedTurn({ score: 1, verdict: 'deep' });

    await abandonInterview(SESSION_ID, USER_ID);
    mockedPrisma.concept.update.mockClear();

    const again = await abandonInterview(SESSION_ID, USER_ID);

    expect(again.session.status).toBe('abandoned');
    expect(again.conceptCompleted).toBeNull();
    expect(mockedPrisma.concept.update).not.toHaveBeenCalled();
    expect(conceptById(CONCEPT_ID)?.masteryScore).toBe(0.8);
  });

  it('refuses to reopen a completed session (409)', async () => {
    sessionRow.status = 'completed';
    seedTurn({ score: 0.5, verdict: 'shallow' });

    const error = await abandonInterview(SESSION_ID, USER_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(409);
    expect((error as AppError).code).toBe('SESSION_ENDED');
    expect(sessionRow.status).toBe('completed');
  });

  it("reports another user's session as 404, never 403", async () => {
    seedTurn({ score: 0.5, verdict: 'shallow' });

    const error = await abandonInterview(SESSION_ID, OTHER_USER_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(404);
    expect((error as AppError).code).toBe('NOT_FOUND');
    expect(mockedPrisma.concept.update).not.toHaveBeenCalled();
  });
});
