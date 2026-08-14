import { finalizeConceptCoverage } from '../services/concept-coverage.service';
import prisma from '../config/prisma';

/**
 * Closing a concept on the coverage grain (#340): evidence in, a stored score and a review row out.
 *
 * These run the REAL `scheduleConceptReview` over stateful in-memory fakes, deliberately. The
 * whole point of the issue is that its three writes are gated DIFFERENTLY, and a mocked-out
 * scheduler would let `if (masteryScore !== null) { schedule }` — the exact mistake being guarded
 * against — pass every assertion here. No DATABASE_URL and no GEMINI_API_KEY: scoring from stored
 * evidence never asks the AI anything (C4 / risk R05).
 *
 * By default the plan has NO deadline, so `reviewIntervalDays` is a function of the mastery score
 * alone and the day counts below say which score was actually used. One case sets a near deadline
 * on purpose, to pin the clamp.
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    interviewSession: { findUnique: jest.fn() },
    concept: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    conceptEdge: { findMany: jest.fn() },
    conceptCheckpoint: { findMany: jest.fn() },
    interviewEvidence: { findMany: jest.fn() },
    reviewQueueItem: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  interviewSession: { findUnique: jest.Mock };
  concept: { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
  conceptCheckpoint: { findMany: jest.Mock };
  interviewEvidence: { findMany: jest.Mock };
  reviewQueueItem: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

/**
 * The client `$transaction` hands the callback — a DISTINCT object from the base client, with its
 * own spies over the same fakes.
 *
 * Handing back `mockedPrisma` itself would make "read inside the transaction" and "read on a fresh
 * connection" indistinguishable, and both would pass. They are not the same thing: the isolation
 * level a future caller sets on this transaction only covers statements issued ON it, so a read
 * that quietly escapes to the base client is exactly the "looks patched but isn't" trap #340 warns
 * about. The base fakes stay wired and working, so an escaped read still returns the right data —
 * it just gets recorded on the wrong object, which is what the assertions catch.
 */
let tx: {
  concept: { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
  conceptCheckpoint: { findMany: jest.Mock };
  interviewEvidence: { findMany: jest.Mock };
  reviewQueueItem: { upsert: jest.Mock };
};

const conceptUpdate = () => tx.concept.update;
const checkpointFindMany = () => tx.conceptCheckpoint.findMany;
const evidenceFindMany = () => tx.interviewEvidence.findMany;
const reviewUpsert = () => tx.reviewQueueItem.upsert;

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const CONCEPT_ID = '22222222-2222-4222-8222-222222222222';
const PREREQ_ID = '44444444-4444-4444-8444-444444444444';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The prior score of the concept under test — what an EARLIER session proved about it. */
const PRIOR_MASTERY = 0.42;

interface FakeConcept {
  id: string;
  name: string;
  planId: string;
  masteryScore: number | null;
  lastTestedAt: Date | null;
  status: string;
}

let concepts: FakeConcept[];
let edges: Array<{ fromConceptId: string; toConceptId: string }>;
let evidence: Array<{ checkpointId: string; status: string }>;
/** The plan's deadline. `null` in most cases, so the review interval is a function of the score. */
let deadline: Date | null;

/** Four committed checkpoints — the ruler the evidence is scored against. */
function ruler(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `cp-${index + 1}`,
    text: `Điểm kiểm ${index + 1}`,
    orderIndex: index,
  }));
}

/** The one spaced-repetition row this concept's own close produced. */
function spacedRepetitionRow() {
  const call = reviewUpsert().mock.calls.find((args) => args[0].create.conceptId === CONCEPT_ID);
  return call?.[0].create;
}

/** The concept under test, as the fake tables currently hold it. */
function underTest(): FakeConcept {
  const concept = concepts.find((candidate) => candidate.id === CONCEPT_ID);
  if (!concept) throw new Error('fixture lost the concept under test');
  return concept;
}

/**
 * Every query inside the transaction nudges the clock a second forward.
 *
 * Without this, "one instant for the whole close" is untestable: two `new Date()` calls in the
 * same tick return the same millisecond, so a version that took a fresh timestamp per write would
 * pass every timing assertion. Under a fake clock that only these fakes move, any second reading
 * of the time lands a measurable distance from the first.
 *
 * The READS have to tick too, not just the writes. The score write is the first write of the
 * close, so at that point a fresh `new Date()` would still equal the timestamp taken before the
 * transaction — the mutation would survive. The prior-read that precedes it is what puts distance
 * between them.
 */
function tick(): void {
  jest.advanceTimersByTime(1000);
}

/* One fake per table, shared by the base client and the transaction client so that only WHICH
 * object recorded the call distinguishes them. */
const fakes = {
  sessionFindUnique: ({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === SESSION_ID
        ? { planId: PLAN_ID, plan: { deadline, tracebackEnabled: true } }
        : null
    ),
  conceptFindFirst: ({ where }: { where: { id: string; planId: string } }) => {
    tick();
    return Promise.resolve(
      concepts.find((concept) => concept.id === where.id && concept.planId === where.planId) ?? null
    );
  },
  conceptUpdate: ({ where, data }: { where: { id: string }; data: Partial<FakeConcept> }) => {
    tick();
    const concept = concepts.find((candidate) => candidate.id === where.id);
    Object.assign(concept as FakeConcept, data);
    return Promise.resolve({ ...(concept as FakeConcept) });
  },
  conceptFindMany: ({ where }: { where: { planId: string } }) =>
    Promise.resolve(concepts.filter((concept) => concept.planId === where.planId)),
  edgeFindMany: () => Promise.resolve(edges),
  checkpointFindMany: () => Promise.resolve(ruler()),
  evidenceFindMany: () => Promise.resolve(evidence),
  reviewUpsert: () => {
    tick();
    return Promise.resolve({});
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  // The scheduler logs one line per decision by design; keep it out of the report.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  edges = [];
  evidence = [];
  deadline = null;
  concepts = [
    {
      id: CONCEPT_ID,
      name: 'Đệ quy',
      planId: PLAN_ID,
      masteryScore: PRIOR_MASTERY,
      lastTestedAt: new Date(2026, 0, 1),
      status: 'active',
    },
    {
      id: PREREQ_ID,
      name: 'Con trỏ',
      planId: PLAN_ID,
      masteryScore: 0.2,
      lastTestedAt: new Date(2026, 0, 1),
      status: 'active',
    },
  ];

  tx = {
    concept: {
      findFirst: jest.fn(fakes.conceptFindFirst),
      update: jest.fn(fakes.conceptUpdate),
      findMany: jest.fn(fakes.conceptFindMany),
    },
    conceptEdge: { findMany: jest.fn(fakes.edgeFindMany) },
    conceptCheckpoint: { findMany: jest.fn(fakes.checkpointFindMany) },
    interviewEvidence: { findMany: jest.fn(fakes.evidenceFindMany) },
    reviewQueueItem: { upsert: jest.fn(fakes.reviewUpsert) },
  };

  // The session read happens BEFORE the transaction opens; everything else must not.
  mockedPrisma.interviewSession.findUnique.mockImplementation(fakes.sessionFindUnique);
  mockedPrisma.concept.findFirst.mockImplementation(fakes.conceptFindFirst);
  mockedPrisma.concept.update.mockImplementation(fakes.conceptUpdate);
  mockedPrisma.concept.findMany.mockImplementation(fakes.conceptFindMany);
  mockedPrisma.conceptEdge.findMany.mockImplementation(fakes.edgeFindMany);
  mockedPrisma.conceptCheckpoint.findMany.mockImplementation(fakes.checkpointFindMany);
  mockedPrisma.interviewEvidence.findMany.mockImplementation(fakes.evidenceFindMany);
  mockedPrisma.reviewQueueItem.upsert.mockImplementation(fakes.reviewUpsert);
  // Nothing here tests rollback; what the separate client buys is telling apart a statement issued
  // ON the transaction from one that escaped to a fresh connection.
  mockedPrisma.$transaction.mockImplementation((fn: (client: unknown) => Promise<unknown>) =>
    fn(tx)
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('finalizeConceptCoverage — a concept it could measure', () => {
  it('stores the score and schedules the review on one clock', async () => {
    // 3 of 4 checkpoints resolved = 0.75 coverage, over the 0.7 floor; 2 of those 3 correct.
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
      { checkpointId: 'cp-3', status: 'contradicted' },
    ];

    const t0 = Date.now();
    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    expect(result.outcome).toBe('closed');
    if (result.outcome !== 'closed') return;
    expect(result.masteryScore).toBe(0.67);
    expect(result.tally).toMatchObject({ committed: 4, resolved: 3, notDiscussed: 1 });

    expect(conceptUpdate()).toHaveBeenCalledTimes(1);
    const written = conceptUpdate().mock.calls[0][0].data;
    expect(written.masteryScore).toBe(0.67);

    // round(1 + 0.67 * 13) = 10 — the score this session measured, not the prior 0.42.
    expect(result.schedule.reviewInDays).toBe(10);
    expect(spacedRepetitionRow()).toMatchObject({ reason: 'spaced_repetition', priority: 0.33 });

    // ONE instant for the whole close, pinned to the instant BEFORE any write: `lastTestedAt` is
    // the base `scheduledFor` was measured from, and both come from the timestamp taken before
    // the transaction opened. Two clocks would date the assessment and its follow-up apart.
    expect((written.lastTestedAt as Date).getTime()).toBe(t0);
    expect(result.schedule.scheduledFor.getTime()).toBe(t0 + 10 * MS_PER_DAY);
  });

  it('clamps the interval to a near deadline instead of scheduling past it', async () => {
    // Three days and an hour out. The hour matters: `daysUntil` FLOORS, so a deadline of exactly
    // `now + 3d` would be read as 3 only if not a microsecond had passed since — padding past the
    // day boundary makes the expectation say what it means instead of racing the clock.
    deadline = new Date(Date.now() + 3 * MS_PER_DAY + 60 * 60 * 1000);
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
      { checkpointId: 'cp-3', status: 'contradicted' },
    ];

    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    if (result.outcome !== 'closed') throw new Error('expected the concept to be closed');
    // The score alone would say 10 days. Dropping the plan's deadline on the way into the
    // scheduler is not a rounding difference — it books the review a week AFTER the exam.
    expect(result.schedule.reviewInDays).toBe(3);
  });

  it('traces back weak prerequisites when the score is below the mastery threshold', async () => {
    edges = [{ fromConceptId: PREREQ_ID, toConceptId: CONCEPT_ID }];
    // 3 of 4 resolved (still over the floor), only 1 of them correct → 0.33 < 0.6.
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'contradicted' },
      { checkpointId: 'cp-3', status: 'contradicted' },
    ];

    const t0 = Date.now();
    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    if (result.outcome !== 'closed') throw new Error('expected the concept to be closed');
    expect(result.masteryScore).toBe(0.33);
    expect(result.schedule.tracebackSkipReason).toBeNull();
    expect(result.schedule.prerequisites).toEqual([
      expect.objectContaining({ conceptId: PREREQ_ID, depth: 1 }),
    ]);

    const prerequisiteRow = reviewUpsert().mock.calls.find(
      (args) => args[0].create.conceptId === PREREQ_ID
    )?.[0].create;
    expect(prerequisiteRow).toMatchObject({
      reason: 'traceback',
      sourceConceptId: CONCEPT_ID,
      depth: 1,
      priority: 2.8,
    });
    // Prerequisites are due immediately, ahead of the concept they came from (AE-07 step 6) —
    // and "immediately" is the SAME instant the concept was scored at, three writes earlier, not
    // whatever the clock says by the time the loop reaches them.
    expect(prerequisiteRow.scheduledFor.getTime()).toBe(t0);
    expect(result.schedule.scheduledFor.getTime()).toBe(t0 + 5 * MS_PER_DAY);
  });
});

/**
 * The `MIN_COVERAGE` case, and the reason the floor is allowed to exist at all: too little of the
 * concept was resolved to judge it. §2.3 answers that by putting the concept back in the queue —
 * so `null` must schedule, and must schedule on the PRIOR score.
 */
describe('finalizeConceptCoverage — a concept it could NOT measure', () => {
  beforeEach(() => {
    // 2 of 4 resolved = 0.5 coverage, under the 0.7 floor.
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
    ];
  });

  it('writes no score — null must not erase what an earlier session proved', async () => {
    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    if (result.outcome !== 'closed') throw new Error('expected the concept to be closed');
    expect(result.masteryScore).toBeNull();
    expect(conceptUpdate()).not.toHaveBeenCalled();
    expect(underTest().masteryScore).toBe(PRIOR_MASTERY);
    expect(underTest().lastTestedAt).toEqual(new Date(2026, 0, 1));
  });

  it('still schedules the review, priced off the prior score', async () => {
    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    if (result.outcome !== 'closed') throw new Error('expected the concept to be closed');
    // round(1 + 0.42 * 13) = 6 and priority 1 - 0.42 = 0.58. Treating the unmeasured concept as a
    // zero instead would give 1 day at priority 1.0 — a concept nobody assessed shouting louder
    // than one that was assessed and failed.
    expect(result.schedule.reviewInDays).toBe(6);
    expect(spacedRepetitionRow()).toMatchObject({ reason: 'spaced_repetition', priority: 0.58 });
  });

  it('does not trace back — there is no evidence of a weak foundation to act on', async () => {
    edges = [{ fromConceptId: PREREQ_ID, toConceptId: CONCEPT_ID }];

    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    if (result.outcome !== 'closed') throw new Error('expected the concept to be closed');
    expect(result.schedule.tracebackSkipReason).toBe('not_graded');
    expect(result.schedule.prerequisites).toEqual([]);
    // The prerequisite sits at 0.2 with traceback switched on: the ONLY thing keeping it out of
    // the queue is that this session measured nothing.
    expect(reviewUpsert()).toHaveBeenCalledTimes(1);
  });
});

/**
 * Both the reads and the writes of a close have to be issued ON the transaction, not merely
 * inside the callback that has one. Today the difference is invisible — Postgres reads at READ
 * COMMITTED either way — but `db`/`tx` is the thread a future REPEATABLE READ hangs on, and a read
 * that escapes to a fresh connection would leave the isolation level set on statements it no
 * longer covers: patched on paper, unpatched in fact.
 */
describe('finalizeConceptCoverage — everything runs on the transaction client', () => {
  it('issues the ruler and evidence reads on the transaction, not on a fresh connection', async () => {
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
      { checkpointId: 'cp-3', status: 'covered' },
    ];

    await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    expect(tx.conceptCheckpoint.findMany).toHaveBeenCalledTimes(1);
    expect(tx.interviewEvidence.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.conceptCheckpoint.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewEvidence.findMany).not.toHaveBeenCalled();
  });

  it('issues the score write and the queue row on the transaction too', async () => {
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
      { checkpointId: 'cp-3', status: 'covered' },
    ];

    await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    expect(tx.concept.update).toHaveBeenCalledTimes(1);
    expect(tx.reviewQueueItem.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.concept.update).not.toHaveBeenCalled();
    expect(mockedPrisma.reviewQueueItem.upsert).not.toHaveBeenCalled();
    // The session read is the one statement that belongs OUTSIDE: it decides whether there is
    // anything to open a transaction for.
    expect(mockedPrisma.interviewSession.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('finalizeConceptCoverage — concepts it must not touch', () => {
  it('skips a concept deprecated mid-session instead of scoring it', async () => {
    underTest().status = 'deprecated';
    evidence = [
      { checkpointId: 'cp-1', status: 'covered' },
      { checkpointId: 'cp-2', status: 'covered' },
      { checkpointId: 'cp-3', status: 'covered' },
    ];

    const result = await finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID });

    // Re-analysis is not blocked while a session runs, so this is reachable from the outside.
    expect(result).toEqual({ outcome: 'skipped', conceptId: CONCEPT_ID, reason: 'deprecated' });
    expect(conceptUpdate()).not.toHaveBeenCalled();
    // Not merely unscheduled: nothing is derived at all. The review queue reads by plan without
    // filtering on `status`, so a row queued here would be shown for a concept that is gone.
    expect(reviewUpsert()).not.toHaveBeenCalled();
    expect(checkpointFindMany()).not.toHaveBeenCalled();
    expect(evidenceFindMany()).not.toHaveBeenCalled();
    expect(mockedPrisma.conceptCheckpoint.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewEvidence.findMany).not.toHaveBeenCalled();
  });

  it('refuses a concept belonging to somebody else’s plan', async () => {
    underTest().planId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    await expect(
      finalizeConceptCoverage({ sessionId: SESSION_ID, conceptId: CONCEPT_ID })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Concept not found in this study plan' });
    expect(reviewUpsert()).not.toHaveBeenCalled();
  });

  it('refuses a session that does not exist', async () => {
    await expect(
      finalizeConceptCoverage({
        sessionId: '99999999-9999-4999-8999-999999999999',
        conceptId: CONCEPT_ID,
      })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Interview session not found' });
  });
});
