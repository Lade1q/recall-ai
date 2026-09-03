import { startInterview } from '../services/interview.service';
import prisma from '../config/prisma';
import { generateQuestion, getPlanMaterial, uploadFile } from '../services/gemini.service';
import { getReviewQueueForPlan, PLAN_ARCHIVED_MESSAGE } from '../services/scheduling.service';
import { AppError } from '../middleware/errorHandler';

/**
 * #272 — `startInterview()`'s two failure paths, both of which used to leave a zombie session:
 * a plan with no document, and any other failure of the very first question.
 *
 * The zombie is what made this user-visible. A session persisted before the first question is
 * `active` with nothing in it, so the *next* start matches the resume branch and answers with
 * AE-03's "phiên đang dở" dialog — the real reason ("kế hoạch chưa có tài liệu", #118/#279)
 * reached the student exactly once per plan, then never again.
 *
 * `interviewSession.create` is deliberately *not* a stateful fake here: these tests are about
 * whether the row survives the call, so `delete` is asserted directly.
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    studyPlan: { findUnique: jest.fn() },
    interviewSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    interviewTurn: { count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    concept: { findMany: jest.fn(), findFirst: jest.fn() },
    // A one-concept deep link now fills the rest of the session from the graph (03/09). No edges
    // means no neighbours, so these suites keep starting the one-concept sessions they assert on.
    conceptEdge: { findMany: jest.fn().mockResolvedValue([]) },
    conceptSourceRef: { findFirst: jest.fn() },
    document: { findFirst: jest.fn(), findMany: jest.fn() },
    questionCache: { findMany: jest.fn() },
  },
}));
jest.mock('../services/gemini.service', () => ({
  generateQuestion: jest.fn(),
  gradeAnswer: jest.fn(),
  getPlanMaterial: jest.fn(),
  uploadFile: jest.fn(),
}));
jest.mock('../services/scheduling.service', () => ({
  ...jest.requireActual('../services/scheduling.service'),
  getReviewQueueForPlan: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  studyPlan: { findUnique: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
  interviewSession: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  interviewTurn: { count: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  concept: { findMany: jest.Mock; findFirst: jest.Mock };
  conceptSourceRef: { findFirst: jest.Mock };
  document: { findFirst: jest.Mock; findMany: jest.Mock };
  questionCache: { findMany: jest.Mock };
};
const mockedGenerateQuestion = generateQuestion as jest.Mock;
const mockedGetPlanMaterial = getPlanMaterial as jest.Mock;
const mockedUploadFile = uploadFile as jest.Mock;
const mockedGetReviewQueueForPlan = getReviewQueueForPlan as jest.Mock;

const USER_ID = 'user-uuid';
const PLAN_ID = 'plan-uuid';
const SESSION_ID = 'session-uuid';
const CONCEPT_ID = 'concept-uuid';

function sessionRow() {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    planId: PLAN_ID,
    status: 'active',
    conceptQueue: [CONCEPT_ID],
    currentConceptIdx: 0,
    maxTurnsPerConcept: 3,
    fallbackMode: false,
    summaryText: null,
    startedAt: new Date('2026-08-09T10:00:00.000Z'),
    endedAt: null,
    plan: { languageDetected: 'vi' },
  };
}

describe('startInterview — no-material and first-question failures (#272)', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    // Real-AI mode: this is where a missing document has to stop the session.
    process.env.USE_MOCK_AI = 'false';

    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'active',
    });
    mockedPrisma.interviewSession.findFirst.mockResolvedValue(null);
    mockedPrisma.interviewSession.create.mockResolvedValue(sessionRow());
    mockedPrisma.interviewSession.findUnique.mockResolvedValue(sessionRow());
    mockedPrisma.interviewSession.delete.mockResolvedValue({});
    mockedPrisma.interviewTurn.count.mockResolvedValue(0);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_ID }]);
    mockedPrisma.concept.findFirst.mockResolvedValue({ id: CONCEPT_ID, name: 'Stack' });
    mockedPrisma.conceptSourceRef.findFirst.mockResolvedValue(null);
    mockedPrisma.document.findMany.mockResolvedValue([]);
    mockedPrisma.questionCache.findMany.mockResolvedValue([]);
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  // Explicit conceptIds bypass `resolveConceptQueue`'s fallback to `getReviewQueueForPlan`
  // (which is where a non-active plan gets caught by accident), so the guard must live in
  // `startInterview` itself, not rely on that indirect path.
  it('rejects an archived plan even with explicit conceptIds, before any session row is created', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'archived',
    });

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_NOT_ACTIVE',
      message: PLAN_ARCHIVED_MESSAGE,
    });

    expect(mockedPrisma.document.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.create).not.toHaveBeenCalled();
  });

  // `draft` is blocked too (review #350): reanalyzePlan can drop an in-use plan back to `draft`
  // (plan.service.ts), and that state is long-lived (#265) — not a rare few-second window.
  it('rejects a draft plan the same way', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'draft',
    });

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({ statusCode: 409, code: 'PLAN_NOT_ACTIVE' });

    expect(mockedPrisma.interviewSession.create).not.toHaveBeenCalled();
  });

  // Contract change flagged in review #350: before this guard, omitting conceptIds on a
  // non-active plan fell through to resolveConceptQueue -> getReviewQueueForPlan and surfaced
  // as 409 NO_CONCEPTS_TO_REVIEW (right status, wrong reason). Now the top-level guard catches
  // it first, so getReviewQueueForPlan is never even called.
  it('rejects an archived plan before consulting getReviewQueueForPlan when conceptIds is omitted', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'archived',
    });

    await expect(startInterview(USER_ID, { planId: PLAN_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_NOT_ACTIVE',
    });

    expect(mockedGetReviewQueueForPlan).not.toHaveBeenCalled();
  });

  it('rejects a plan with no document before any session row is created', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue(null);

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({ statusCode: 409, code: 'NO_MATERIAL' });

    // The whole point of #272: no zombie is left behind, so nothing has to be cleaned up.
    expect(mockedPrisma.interviewSession.create).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.delete).not.toHaveBeenCalled();
  });

  it('answers NO_MATERIAL every time, not just the first (the #118 copy stays reachable)', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue(null);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(
        startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
      ).rejects.toMatchObject({ statusCode: 409, code: 'NO_MATERIAL' });
    }

    // Never created ⇒ nothing for a later attempt to resume ⇒ no AE-03 dialog on attempt 2+.
    expect(mockedPrisma.interviewSession.create).not.toHaveBeenCalled();
  });

  it('refuses a doc-less plan that already carries a zombie session from before the fix', async () => {
    // The row #272 is named after: `active`, zero turns, created by a start that threw after
    // persisting. Checking material only before `create` would still hand this back as a resume,
    // so the plans already carrying one would never show the NO_MATERIAL copy again.
    mockedPrisma.document.findFirst.mockResolvedValue(null);
    mockedPrisma.interviewSession.findFirst.mockResolvedValue({
      ...sessionRow(),
      id: 'zombie-uuid',
    });

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({ statusCode: 409, code: 'NO_MATERIAL' });

    // Refused before the resume branch is even consulted.
    expect(mockedPrisma.interviewSession.findFirst).not.toHaveBeenCalled();
  });

  it('still resumes an unfinished session when the plan does have a document (AE-03 intact)', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({ id: 'doc-uuid' });
    mockedPrisma.interviewSession.findFirst.mockResolvedValue(sessionRow());

    const result = await startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] });

    expect(result.created).toBe(false);
    expect(result.message).toEqual(expect.any(String));
    expect(mockedPrisma.interviewSession.create).not.toHaveBeenCalled();
  });

  it('reports a missing text upload with a structured error and rolls the session back', async () => {
    mockedPrisma.document.findFirst
      .mockResolvedValueOnce({ id: 'doc-uuid' })
      .mockResolvedValueOnce({ fileKey: 'plans/plan-uuid/missing-document.txt' });
    mockedGetPlanMaterial.mockImplementationOnce((_planId: string, load: () => Promise<unknown>) =>
      load()
    );

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'DOCUMENT_FILE_MISSING',
      message: 'Document file is no longer available',
    });

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.delete).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('reports a missing binary upload with the same structured error', async () => {
    mockedPrisma.document.findFirst
      .mockResolvedValueOnce({ id: 'doc-uuid' })
      .mockResolvedValueOnce({ fileKey: 'plans/plan-uuid/missing-document.pdf' });
    mockedGetPlanMaterial.mockImplementationOnce((_planId: string, load: () => Promise<unknown>) =>
      load()
    );
    mockedUploadFile.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
    );

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({ statusCode: 404, code: 'DOCUMENT_FILE_MISSING' });

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.delete).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('rolls the session back when the first question fails for any other reason', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({ id: 'doc-uuid' });
    // e.g. an unexpected downstream failure after material loading succeeds.
    mockedGenerateQuestion.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toThrow('ENOENT: no such file or directory');

    expect(mockedPrisma.interviewSession.create).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.interviewTurn.count).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
    });
    expect(mockedPrisma.interviewSession.delete).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it('keeps a session that already recorded a turn, whatever else failed', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({ id: 'doc-uuid' });
    mockedGenerateQuestion.mockRejectedValue(new Error('boom'));
    mockedPrisma.interviewTurn.count.mockResolvedValue(1);

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toThrow('boom');

    // Graded work is never deleted to tidy up an error path.
    expect(mockedPrisma.interviewSession.delete).not.toHaveBeenCalled();
  });

  it('reports the original error even when the rollback itself fails', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({ id: 'doc-uuid' });
    mockedGenerateQuestion.mockRejectedValue(new AppError('upstream died', 503, 'UPSTREAM'));
    mockedPrisma.interviewSession.delete.mockRejectedValue(new Error('DB connection lost'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(
      startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] })
    ).rejects.toMatchObject({ statusCode: 503, code: 'UPSTREAM' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[interview] failed to roll back an unstarted session:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('still starts a session under USE_MOCK_AI, where a missing document is not a problem', async () => {
    process.env.USE_MOCK_AI = 'true';
    mockedPrisma.document.findFirst.mockResolvedValue(null);
    mockedPrisma.interviewTurn.create.mockResolvedValue({
      id: 'turn-uuid',
      sessionId: SESSION_ID,
      conceptId: CONCEPT_ID,
      concept: { name: 'Stack' },
      turnIndex: 1,
      questionText: 'What is a stack?',
      questionType: 'recall',
      answerText: null,
      score: null,
      feedback: null,
      verdict: null,
      source: 'ai',
      sourceDocumentId: null,
      sourcePageFrom: null,
      sourcePageTo: null,
      askedAt: new Date('2026-08-09T10:00:01.000Z'),
      answeredAt: null,
    });
    mockedGenerateQuestion.mockResolvedValue({
      question_text: 'What is a stack?',
      question_type: 'recall',
    });

    const result = await startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] });

    expect(result.created).toBe(true);
    // The pre-check must not even ask about documents in mock mode — mirroring loadMaterial's
    // own short-circuit, which returns MOCK_MATERIAL before touching prisma.document.
    expect(mockedPrisma.document.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.delete).not.toHaveBeenCalled();
  });
});

/**
 * The other half of the 03/09 change, and the one the mock above deliberately switches off for
 * every test in the file before this point: a deep link carrying ONE concept id opens a session
 * about a set of related concepts. `conceptEdge.findMany → []` keeps those suites one-concept,
 * which is right for them — but it also meant the headline behaviour of the commit had no
 * assertion anywhere. These give it one.
 */
describe('startInterview — a one-concept deep link is filled from the graph', () => {
  const NEIGHBOUR_A = 'neighbour-a';
  const NEIGHBOUR_B = 'neighbour-b';
  const originalUseMockAi = process.env.USE_MOCK_AI;

  /** The queue as `interviewSession.create` was asked to store it. */
  const createdQueue = (): string[] => {
    const call = mockedPrisma.interviewSession.create.mock.calls[0]?.[0] as
      { data: { conceptQueue: { conceptId: string }[] } } | undefined;
    return (call?.data.conceptQueue ?? []).map((entry) => entry.conceptId);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true';

    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'active',
    });
    mockedPrisma.interviewSession.findFirst.mockResolvedValue(null);
    mockedPrisma.interviewSession.create.mockResolvedValue(sessionRow());
    mockedPrisma.interviewSession.findUnique.mockResolvedValue(sessionRow());
    mockedPrisma.interviewTurn.count.mockResolvedValue(0);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([]);
    mockedPrisma.interviewTurn.create.mockResolvedValue({
      id: 'turn-uuid',
      sessionId: SESSION_ID,
      conceptId: CONCEPT_ID,
      turnIndex: 1,
      questionText: 'q',
      questionType: 'recall',
      mode: null,
      answerText: null,
      score: null,
      feedback: null,
      verdict: null,
      source: 'ai',
      sourceDocumentId: null,
      sourcePageFrom: null,
      sourcePageTo: null,
      askedAt: new Date('2026-08-09T10:00:01.000Z'),
      answeredAt: null,
      concept: { name: 'Stack' },
    });
    mockedPrisma.concept.findFirst.mockResolvedValue({ id: CONCEPT_ID, name: 'Stack' });
    mockedPrisma.conceptSourceRef.findFirst.mockResolvedValue(null);
    mockedPrisma.document.findMany.mockResolvedValue([]);
    mockedPrisma.questionCache.findMany.mockResolvedValue([]);
    mockedGenerateQuestion.mockResolvedValue({ question_text: 'q', question_type: 'recall' });

    const names: Record<string, number | null> = {
      [CONCEPT_ID]: 0.5,
      [NEIGHBOUR_A]: 0.1,
      [NEIGHBOUR_B]: 0.9,
    };
    mockedPrisma.concept.findMany.mockImplementation(
      async ({ where }: { where: { id?: { in: string[] } } }) =>
        (where.id?.in ?? Object.keys(names))
          .filter((id) => id in names)
          .map((id) => ({ id, name: `name-${id}`, masteryScore: names[id] ?? null }))
    );
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  it('🔴 opens with the seed plus its graph neighbours, prerequisite first', async () => {
    mockedPrisma.conceptEdge.findMany.mockResolvedValue([
      { fromConceptId: NEIGHBOUR_A, toConceptId: CONCEPT_ID }, // a prerequisite of the seed
      { fromConceptId: CONCEPT_ID, toConceptId: NEIGHBOUR_B }, // built on the seed
    ]);

    await startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] });

    // The clicked concept stays first — the student asked for it, and the fill is a supplement.
    expect(createdQueue()).toEqual([CONCEPT_ID, NEIGHBOUR_A, NEIGHBOUR_B]);
  });

  it('🔴 stays a one-concept session when the seed has no neighbours', async () => {
    mockedPrisma.conceptEdge.findMany.mockResolvedValue([]);

    await startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] });

    // Said as the exact list: "did not throw" is not the claim, "asked for nothing extra" is.
    expect(createdQueue()).toEqual([CONCEPT_ID]);
  });

  it('🔴 a deep link naming TWO concepts is respected as-is, not padded', async () => {
    mockedPrisma.conceptEdge.findMany.mockResolvedValue([
      { fromConceptId: NEIGHBOUR_A, toConceptId: CONCEPT_ID },
    ]);

    await startInterview(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID, NEIGHBOUR_B],
    });

    expect(createdQueue()).toEqual([CONCEPT_ID, NEIGHBOUR_B]);
    // And the graph is not even consulted, so a multi-concept link costs no extra query.
    expect(mockedPrisma.conceptEdge.findMany).not.toHaveBeenCalled();
  });

  it('🔴 every opened concept is stored as hop 0 and as NOT added, so none charges the budget', async () => {
    mockedPrisma.conceptEdge.findMany.mockResolvedValue([
      { fromConceptId: NEIGHBOUR_A, toConceptId: CONCEPT_ID },
    ]);

    await startInterview(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] });

    const call = mockedPrisma.interviewSession.create.mock.calls[0]?.[0] as {
      data: { conceptQueue: { hop: number; added: boolean; viaConceptId: string | null }[] };
    };
    expect(call.data.conceptQueue).toEqual(
      call.data.conceptQueue.map(() => ({
        conceptId: expect.any(String),
        hop: 0,
        viaConceptId: null,
        added: false,
      }))
    );
  });
});
