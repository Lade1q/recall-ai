import { getInterview, submitAnswer, submitSelfGrade } from '../services/interview.service';
import prisma from '../config/prisma';
import { generateQuestion, gradeAnswer } from '../services/gemini.service';
import { finalizeConceptResult } from '../services/concept-result.service';
import { AppError } from '../middleware/errorHandler';

// Only reached by the #392 "wrong on the last available turn" tests below (finishConcept ->
// finalizeConceptResult), which need the concept to actually close rather than test scheduling
// math this file has no other mocks for (reviewQueueItem, traceback, the transaction client).
jest.mock('../services/concept-result.service', () => ({
  finalizeConceptResult: jest.fn(),
}));

/**
 * AE-05 (I6.4) — direct unit tests of `interview.service.ts`'s flashcard-fallback branching.
 * This file is the first direct unit test of this module: everything else exercises it only
 * indirectly through the controller mock or the pure state-machine helpers. USE_MOCK_AI=true
 * makes the private `loadMaterial()` return a fixed material without touching `prisma.document`
 * at all, so the Prisma mock below only needs the session/turn/concept/cache tables this
 * feature actually touches.
 *
 * `interviewTurn` and `interviewSession` are backed by tiny in-memory fakes rather than
 * call-order-dependent `mockResolvedValueOnce` chains: this module reloads its own view from
 * the "database" multiple times per request (buildView → act → reloadView), and a stateful fake
 * is what makes that reload actually see what the action just wrote, the same way Postgres would.
 */
jest.mock('../config/prisma', () => {
  const client: Record<string, unknown> = {
    interviewSession: { findUnique: jest.fn(), update: jest.fn() },
    interviewTurn: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    concept: { findFirst: jest.fn() },
    conceptSourceRef: { findFirst: jest.fn() },
    document: { findMany: jest.fn() },
    questionCache: { findMany: jest.fn() },
  };
  // gradingUnavailable (#288) uses the interactive form `$transaction(async (tx) => ...)`: run
  // the callback against this same mocked client. The array form resolves its members, as Prisma does.
  client.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(client)
      : Promise.all(arg as Array<Promise<unknown>>)
  );
  return { __esModule: true, default: client };
});
jest.mock('../services/gemini.service', () => ({
  generateQuestion: jest.fn(),
  gradeAnswer: jest.fn(),
  getPlanMaterial: jest.fn(),
  uploadFile: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  interviewSession: { findUnique: jest.Mock; update: jest.Mock };
  interviewTurn: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
  };
  concept: { findFirst: jest.Mock };
  conceptSourceRef: { findFirst: jest.Mock };
  document: { findMany: jest.Mock };
  questionCache: { findMany: jest.Mock };
};
const mockedGenerateQuestion = generateQuestion as jest.Mock;
const mockedGradeAnswer = gradeAnswer as jest.Mock;
const mockedFinalizeConceptResult = finalizeConceptResult as jest.Mock;

const USER_ID = 'user-uuid';
const SESSION_ID = 'session-uuid';
const PLAN_ID = 'plan-uuid';
const CONCEPT_ID = 'concept-uuid';
const CONCEPT_NAME = 'Recursion';
const DOCUMENT_ID = 'doc-uuid';

/**
 * The concept's C5 anchor and the document behind it (#239, #240). Both are dated well before
 * any turn or cache row this file creates, so a citation coming back `null` below is always the
 * rule under test firing — never an anchor that happened to be too new to snapshot.
 */
const CONCEPT_ANCHOR = {
  documentId: DOCUMENT_ID,
  pageFrom: 7,
  pageTo: 7,
  createdAt: new Date(2023, 0, 1),
};
const DOCUMENT_ROW = {
  id: DOCUMENT_ID,
  filename: 'giai-tich-1.pdf',
  kind: 'pdf',
  updatedAt: new Date(2023, 0, 1),
};
const EXPECTED_CITATION = {
  documentId: DOCUMENT_ID,
  filename: 'giai-tich-1.pdf',
  kind: 'pdf',
  pageFrom: 7,
  pageTo: 7,
};

interface FakeTurn {
  id: string;
  sessionId: string;
  conceptId: string;
  turnIndex: number;
  questionText: string;
  questionType: string | null;
  answerText: string | null;
  score: number | null;
  feedback: string | null;
  verdict: string | null;
  source: string;
  sourceDocumentId: string | null;
  sourcePageFrom: number | null;
  sourcePageTo: number | null;
  askedAt: Date;
  answeredAt: Date | null;
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
  startedAt: Date;
  endedAt: Date | null;
  plan: { languageDetected: string | null };
};
let turns: FakeTurn[];
let turnIdSeq: number;

function toTurnRow(t: FakeTurn) {
  return { ...t, concept: { name: CONCEPT_NAME } };
}

function seedPendingTurn(overrides: Partial<FakeTurn> = {}): FakeTurn {
  const turn: FakeTurn = {
    id: `turn-${++turnIdSeq}`,
    sessionId: SESSION_ID,
    conceptId: CONCEPT_ID,
    turnIndex: turns.length + 1,
    questionText: 'Existing question',
    questionType: 'recall',
    answerText: null,
    score: null,
    feedback: null,
    verdict: null,
    source: 'ai',
    // Seeded turns bypass `askQuestion`, so they carry the snapshot it would have written.
    sourceDocumentId: DOCUMENT_ID,
    sourcePageFrom: 7,
    sourcePageTo: 7,
    askedAt: new Date(),
    answeredAt: null,
    ...overrides,
  };
  turns.push(turn);
  return turn;
}

describe('interview.service — AE-05 flashcard fallback', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true';

    turns = [];
    turnIdSeq = 0;
    sessionRow = {
      id: SESSION_ID,
      userId: USER_ID,
      planId: PLAN_ID,
      status: 'active',
      conceptQueue: [CONCEPT_ID],
      currentConceptIdx: 0,
      maxTurnsPerConcept: 3,
      fallbackMode: false,
      startedAt: new Date(),
      endedAt: null,
      plan: { languageDetected: 'vi' },
    };

    mockedPrisma.interviewSession.findUnique.mockImplementation(() =>
      Promise.resolve({ ...sessionRow })
    );
    mockedPrisma.interviewSession.update.mockImplementation(
      ({ data }: { data: Partial<typeof sessionRow> }) => {
        Object.assign(sessionRow, data);
        return Promise.resolve({ ...sessionRow });
      }
    );
    mockedPrisma.concept.findFirst.mockImplementation(
      ({ where }: { where: { id: string; planId: string } }) =>
        Promise.resolve(
          where.id === CONCEPT_ID && where.planId === PLAN_ID
            ? { id: CONCEPT_ID, name: CONCEPT_NAME }
            : null
        )
    );
    // Write side: the anchor `askQuestion` / `askCachedQuestion` freeze onto a new turn.
    mockedPrisma.conceptSourceRef.findFirst.mockResolvedValue({ ...CONCEPT_ANCHOR });
    // Read side: the document a turn's snapshot points at, looked up by id (#240).
    mockedPrisma.document.findMany.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.includes(DOCUMENT_ID) ? [{ ...DOCUMENT_ROW }] : [])
    );
    mockedPrisma.interviewTurn.findMany.mockImplementation(
      ({ where }: { where: { sessionId: string; conceptId?: string } }) =>
        Promise.resolve(
          turns
            .filter((t) => t.sessionId === where.sessionId)
            .filter((t) => !where.conceptId || t.conceptId === where.conceptId)
            .map(toTurnRow)
        )
    );
    mockedPrisma.interviewTurn.create.mockImplementation(
      ({
        data,
      }: {
        data: {
          sessionId: string;
          conceptId: string;
          turnIndex: number;
          questionText: string;
          questionType: string | null;
          source?: string;
          sourceDocumentId?: string | null;
          sourcePageFrom?: number | null;
          sourcePageTo?: number | null;
        };
      }) => {
        const turn: FakeTurn = {
          id: `turn-${++turnIdSeq}`,
          sessionId: data.sessionId,
          conceptId: data.conceptId,
          turnIndex: data.turnIndex,
          questionText: data.questionText,
          questionType: data.questionType ?? null,
          answerText: null,
          score: null,
          feedback: null,
          verdict: null,
          source: data.source ?? 'ai',
          sourceDocumentId: data.sourceDocumentId ?? null,
          sourcePageFrom: data.sourcePageFrom ?? null,
          sourcePageTo: data.sourcePageTo ?? null,
          askedAt: new Date(),
          answeredAt: null,
        };
        turns.push(turn);
        return Promise.resolve(toTurnRow(turn));
      }
    );
    mockedPrisma.interviewTurn.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Partial<FakeTurn> }) => {
        const turn = turns.find((t) => t.id === where.id);
        if (!turn) throw new Error(`fake DB: turn ${where.id} not found`);
        Object.assign(turn, data);
        return Promise.resolve(toTurnRow(turn));
      }
    );
    mockedPrisma.interviewTurn.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: {
          id: string;
          verdict?: null;
          answeredAt?: Date;
          OR?: Array<{ answeredAt: null | { lt: Date } }>;
        };
        data: Partial<FakeTurn>;
      }) => {
        const turn = turns.find((t) => t.id === where.id);
        if (!turn) return Promise.resolve({ count: 0 });

        if (where.OR === undefined && !(where.answeredAt instanceof Date)) {
          throw new Error(
            `unrecognised interviewTurn.updateMany where-shape: ${JSON.stringify(where)} — ` +
              'a grade write must stay bound to its claim mark (#288)'
          );
        }

        // Grade-write shape (#288): a claim-bound optimistic lock `{ id, answeredAt: <claim mark> }`
        // with no `OR`/`verdict`. It writes only while the turn still carries this request's own
        // claim; a stale-reclaim by a newer request moves `answeredAt` and makes this a no-op.
        if (where.OR === undefined && where.answeredAt instanceof Date) {
          const holdsClaim =
            turn.answeredAt !== null && turn.answeredAt.getTime() === where.answeredAt.getTime();
          if (!holdsClaim) return Promise.resolve({ count: 0 });
          Object.assign(turn, data);
          return Promise.resolve({ count: 1 });
        }

        // Claim shape: `{ id, verdict: null, OR: [{ answeredAt: null }, { answeredAt: { lt } }] }`.
        if (turn.verdict !== null || where.OR === undefined) return Promise.resolve({ count: 0 });
        const claimable = where.OR.some((cond) =>
          cond.answeredAt === null
            ? turn.answeredAt === null
            : turn.answeredAt !== null && turn.answeredAt < cond.answeredAt!.lt
        );
        if (!claimable) return Promise.resolve({ count: 0 });
        Object.assign(turn, data);
        return Promise.resolve({ count: 1 });
      }
    );
    mockedPrisma.interviewTurn.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: {
          id?: string;
          sessionId_conceptId_turnIndex?: {
            sessionId: string;
            conceptId: string;
            turnIndex: number;
          };
        };
      }) => {
        if (where.id) {
          const turn = turns.find((t) => t.id === where.id);
          return Promise.resolve(turn ? toTurnRow(turn) : null);
        }
        if (where.sessionId_conceptId_turnIndex) {
          const { sessionId, conceptId, turnIndex } = where.sessionId_conceptId_turnIndex;
          const turn = turns.find(
            (t) =>
              t.sessionId === sessionId && t.conceptId === conceptId && t.turnIndex === turnIndex
          );
          return Promise.resolve(turn ? toTurnRow(turn) : null);
        }
        return Promise.resolve(null);
      }
    );
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  it('submitAnswer rejects with FALLBACK_MODE_ACTIVE once the session is in fallback mode', async () => {
    sessionRow.fallbackMode = true;
    seedPendingTurn();

    const error = await submitAnswer(SESSION_ID, USER_ID, 'một câu trả lời').catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409, code: 'FALLBACK_MODE_ACTIVE' });
    expect(mockedGradeAnswer).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewTurn.updateMany).not.toHaveBeenCalled();
  });

  it('submitSelfGrade rejects with NOT_IN_FALLBACK_MODE while the session is still on AI grading', async () => {
    sessionRow.fallbackMode = false;
    seedPendingTurn();

    const error = await submitSelfGrade(SESSION_ID, USER_ID, 'correct').catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409, code: 'NOT_IN_FALLBACK_MODE' });
    expect(mockedPrisma.interviewTurn.updateMany).not.toHaveBeenCalled();
  });

  /**
   * #391 regression: `submitAnswer` must pass the concept's prior turns into `gradeAnswer`, and
   * must exclude the turn currently being graded from that history. A caller that drops the
   * `previousTurns:` argument, or drops the `.filter((turn) => turn.id !== pending.id)` before it,
   * still passes the whole suite elsewhere (nothing else asserts on `gradeAnswer`'s call args) —
   * this is the one test that would catch either regression.
   */
  it('submitAnswer passes turn 1 as history when grading turn 2, and only turn 1', async () => {
    sessionRow.fallbackMode = false;
    seedPendingTurn({ turnIndex: 1 });

    // `shallow` here is arbitrary, not a requirement: since #392, `wrong` also leaves a turn 2 to
    // grade (it asks a hint instead of ending the concept) — see the `wrong` ladder tests below.
    mockedGradeAnswer.mockResolvedValueOnce({
      score: 0.75,
      feedback: 'turn 1 feedback',
      verdict: 'shallow',
    });
    mockedGenerateQuestion.mockResolvedValueOnce({
      question_text: 'Turn 2 question',
      question_type: 'recall',
    });

    const first = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời lượt 1');
    expect(mockedGradeAnswer.mock.calls[0][0].previousTurns).toEqual([]);
    expect(first.nextQuestion).not.toBeNull();

    mockedGradeAnswer.mockResolvedValueOnce({
      score: 0.9,
      feedback: 'turn 2 feedback',
      verdict: 'deep',
    });
    // 'deep' with a turn still left (2 < maxTurnsPerConcept 3) asks a turn 3 — irrelevant to this
    // test, but `advanceToNextQuestion` still generates it before `submitAnswer` returns.
    mockedGenerateQuestion.mockResolvedValueOnce({
      question_text: 'Turn 3 question',
      question_type: 'recall',
    });

    await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời lượt 2');

    expect(mockedGradeAnswer).toHaveBeenCalledTimes(2);
    const { previousTurns } = mockedGradeAnswer.mock.calls[1][0];
    expect(previousTurns).toHaveLength(1);
    expect(previousTurns[0]).toMatchObject({
      questionText: 'Existing question',
      answerText: 'câu trả lời lượt 1',
      verdict: 'shallow',
    });
  });

  /**
   * #392 review item ②: nothing end-to-end pinned that `decideNextStep`'s `ask_hint` step
   * actually reaches Gemini as `mode: 'hint'` — a mutant that hard-codes `mode = 'initial'` at
   * the `askQuestion` call site survived the full suite. `interview-state.test.ts` only proves
   * the pure function picks the right STEP; this is the one test that proves the step's mode
   * is the one actually sent.
   */
  it('submitAnswer sends mode: "hint" to generateQuestion after a wrong grade with turns left (#392)', async () => {
    sessionRow.fallbackMode = false;
    seedPendingTurn({ turnIndex: 1 });

    mockedGradeAnswer.mockResolvedValueOnce({
      score: 0.1,
      feedback: 'sai rồi',
      verdict: 'wrong',
    });
    mockedGenerateQuestion.mockResolvedValueOnce({
      question_text: 'Turn 2 hint question',
      question_type: 'recall',
    });

    const result = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời sai');

    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(1);
    expect(mockedGenerateQuestion.mock.calls[0][0]).toMatchObject({ mode: 'hint' });
    // The concept stayed open — a hint, not a close.
    expect(result.nextQuestion).not.toBeNull();
    expect(result.conceptCompleted).toBeNull();
  });

  /**
   * #392 review item ②: `decideNextStep`'s `maxTurns` comes from `session.maxTurnsPerConcept`
   * at the call site in `advanceToNextQuestion` — nothing pinned that either, and a mutant
   * hard-coding the call site's `maxTurns` to `3` also survived the full suite (it happened to
   * agree with the default session config every other test in this file uses). A session
   * configured BELOW the C6 ceiling is the one input where the hard-coded constant and the real
   * session value disagree on whether a turn is left, so it is the only case that can catch it.
   */
  it("closes the concept on a wrong answer once the SESSION's own turn limit is spent, not a hard-coded 3 (#392)", async () => {
    sessionRow.fallbackMode = false;
    sessionRow.maxTurnsPerConcept = 1;
    seedPendingTurn({ turnIndex: 1 });

    mockedGradeAnswer.mockResolvedValueOnce({
      score: 0,
      feedback: 'sai rồi',
      verdict: 'wrong',
    });
    mockedFinalizeConceptResult.mockResolvedValueOnce({
      conceptId: CONCEPT_ID,
      masteryScore: 0,
      reviewInDays: 1,
      scheduledFor: new Date('2026-01-02T00:00:00.000Z'),
      prerequisites: [],
      tracebackSkipReason: null,
    });

    const result = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời sai');

    // maxTurnsPerConcept: 1 means turn 1 already used the session's only turn — no hint to spend,
    // whatever `wrong`'s usual (2 hints) allowance would be under the C6 default.
    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(result.conceptCompleted).not.toBeNull();
    expect(result.conceptCompleted?.conceptId).toBe(CONCEPT_ID);
  });

  /**
   * #288 regression: the grade write is bound to the exact claim the request took
   * (`updateMany where { id, answeredAt: <claim mark> }`). A request whose slow Gemini call
   * outlasted ANSWER_CLAIM_STALE_MS loses its claim to a stale-reclaim; it must NOT overwrite
   * the winner's verdict and — the part that actually corrupts a session — must NOT advance the
   * state machine a second time (which would silently skip a concept). It replays instead.
   */
  describe('#288 — grade write is bound to the claim it took', () => {
    it('AI path: a request that lost its claim mid-grade replays instead of double-advancing', async () => {
      sessionRow.fallbackMode = false;
      const turn = seedPendingTurn();

      // While this request awaits Gemini, a newer identical request reclaims the turn (its claim
      // moves `answeredAt`) and finishes grading it first — the classic #288 timeline.
      mockedGradeAnswer.mockImplementationOnce(async () => {
        turn.answeredAt = new Date(turn.answeredAt!.getTime() + 5 * 60 * 1000); // someone else's claim
        turn.score = 1;
        turn.feedback = 'winner feedback';
        turn.verdict = 'deep';
        return { score: 0.2, feedback: 'loser feedback', verdict: 'shallow' }; // this request's own grade
      });

      const result = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời');

      // The loser replays the winner's result rather than throwing or writing its own.
      expect(result.replayed).toBe(true);
      expect(result.grading).toEqual({ score: 1, feedback: 'winner feedback', verdict: 'deep' });
      // Its own grade never landed: the turn still carries the winner's verdict...
      expect(turn.verdict).toBe('deep');
      expect(turn.score).toBe(1);
      // ...and the state machine did not advance a second time (no extra turn was created).
      expect(turns).toHaveLength(1);
    });

    it('self-grade path: a lost claim replays instead of writing/advancing', async () => {
      sessionRow.fallbackMode = true;
      const turn = seedPendingTurn({ source: 'cache_fallback' });

      // First updateMany = claim (wins); second = the grade write, which finds the claim gone.
      let call = 0;
      mockedPrisma.interviewTurn.updateMany.mockImplementation(
        ({ where, data }: { where: { answeredAt?: Date }; data: Partial<FakeTurn> }) => {
          call += 1;
          if (call === 1) {
            Object.assign(turn, data); // claim sets answeredAt
            return Promise.resolve({ count: 1 });
          }
          // The concurrent winner already graded + advanced this turn.
          turn.score = 1;
          turn.verdict = 'deep';
          void where;
          return Promise.resolve({ count: 0 });
        }
      );

      const result = await submitSelfGrade(SESSION_ID, USER_ID, 'wrong');

      expect(result.replayed).toBe(true);
      expect(result.grading).toEqual({ score: 1, feedback: null, verdict: 'deep' });
      // The loser's `wrong` self-grade did not overwrite the winner's verdict.
      expect(turn.verdict).toBe('deep');
      expect(turns).toHaveLength(1);
    });
  });

  /**
   * #288 (gradingUnavailable): flipping the whole session to fallback and releasing the turn is
   * also a claim-bound action. A request that still holds its claim does it; a request that lost
   * its claim to a stale-reclaim must not — otherwise a spent request drags a session that
   * another request may be grading fine into flashcard mode for the rest of the session.
   */
  describe('#288 — gradingUnavailable only fires for the request holding the claim', () => {
    it('a held-claim AI failure flips the session to fallback and releases the turn', async () => {
      sessionRow.fallbackMode = false;
      const turn = seedPendingTurn();
      mockedGradeAnswer.mockRejectedValueOnce(new AppError('AI down', 503, 'AI_UNAVAILABLE'));

      const result = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời');

      expect(result.fallback).toEqual({
        reason: 'grading_unavailable',
        message: expect.any(String),
      });
      expect(sessionRow.fallbackMode).toBe(true); // session flipped to flashcard mode
      expect(turn.answeredAt).toBeNull(); // claim released so the turn can be self-graded
      expect(turn.verdict).toBeNull(); // nothing was graded
    });

    it('a lost-claim AI failure does NOT flip the session and replays instead', async () => {
      sessionRow.fallbackMode = false;
      const turn = seedPendingTurn();

      // While this request awaits Gemini, a newer request reclaims the turn and grades it; then
      // this request's own Gemini call fails. It must not flip fallback off the back of that.
      mockedGradeAnswer.mockImplementationOnce(async () => {
        turn.answeredAt = new Date(turn.answeredAt!.getTime() + 5 * 60 * 1000); // someone else's claim
        turn.score = 1;
        turn.verdict = 'deep';
        throw new AppError('AI down', 503, 'AI_UNAVAILABLE');
      });

      const result = await submitAnswer(SESSION_ID, USER_ID, 'câu trả lời');

      expect(sessionRow.fallbackMode).toBe(false); // session stayed in AI mode — B is handling it
      expect(result.replayed).toBe(true); // the loser replayed the winner's result
      expect(result.grading).toEqual({ score: 1, feedback: null, verdict: 'deep' });
      expect(turn.verdict).toBe('deep'); // winner's verdict intact
      expect(turn.answeredAt).not.toBeNull(); // winner's claim mark was not wiped
    });
  });

  it('serves a cached question instead of calling Gemini once fallbackMode is true', async () => {
    sessionRow.fallbackMode = true;
    mockedPrisma.questionCache.findMany.mockResolvedValue([
      {
        questionText: 'Cached question 1',
        questionType: 'recall',
        generatedAt: new Date(2024, 0, 1),
      },
      { questionText: 'Cached question 2', questionType: 'why', generatedAt: new Date(2024, 0, 2) },
    ]);

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(mockedGradeAnswer).not.toHaveBeenCalled();
    expect(result.currentQuestion).toMatchObject({
      questionText: 'Cached question 1',
      source: 'cache_fallback',
      // C5 (#240): the anchor predates the cache row, so the cached question still describes
      // the document it was generated from and gets to cite it. #239 hid this arm outright.
      sourceCitation: EXPECTED_CITATION,
    });
    expect(mockedPrisma.interviewTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conceptId: CONCEPT_ID,
          turnIndex: 1,
          questionText: 'Cached question 1',
          source: 'cache_fallback',
        }),
      })
    );
  });

  it('UC-12 E1: ends the session gracefully with the exact message when nothing is cached', async () => {
    sessionRow.fallbackMode = true;
    mockedPrisma.questionCache.findMany.mockResolvedValue([]);

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(result.currentQuestion).toBeNull();
    expect(result.fallback).toEqual({
      reason: 'no_cached_questions',
      message:
        'Không thể chuyển sang chế độ Flashcard do chưa có câu hỏi sẵn. Vui lòng thử lại sau khi AI khả dụng.',
    });
    expect(sessionRow.status).toBe('completed');
  });

  it('submitSelfGrade grades an AI-authored turn left pending by a grading failure (source: ai)', async () => {
    sessionRow.fallbackMode = true;
    seedPendingTurn({ source: 'ai', questionText: 'AI question whose grading failed' });
    mockedPrisma.questionCache.findMany.mockResolvedValue([
      {
        questionText: 'Cached question A',
        questionType: 'recall',
        generatedAt: new Date(2024, 0, 1),
      },
      { questionText: 'Cached question B', questionType: 'why', generatedAt: new Date(2024, 0, 2) },
    ]);

    const result = await submitSelfGrade(SESSION_ID, USER_ID, 'partial');

    expect(result.grading).toEqual({ score: 0.5, feedback: null, verdict: 'shallow' });
    expect(mockedGradeAnswer).not.toHaveBeenCalled();
    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    // The state machine kept going in fallback mode: the next turn comes from the cache too.
    // Starts at cache[0] ('Cached question A'), not cache[1] — the one prior turn was
    // `source: 'ai'`, so zero cache questions have actually been served yet (regression guard
    // for the mixed ai+cache_fallback bug found via manual testing against live Gemini).
    expect(result.nextQuestion).toMatchObject({
      questionText: 'Cached question A',
      source: 'cache_fallback',
    });
  });

  /**
   * C5 (#239, #240). The choose-or-withhold rules live in `utils/question-citation.ts` and are
   * proven there; what these cover is the wiring the pure tests cannot see — that the anchor is
   * actually frozen onto the row at ask time, and that the read path resolves the snapshot for
   * both the pending question and the transcript.
   */
  it('cites the source document on an AI question and on the answered turns', async () => {
    seedPendingTurn({ source: 'ai', questionText: 'AI question awaiting an answer' });

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(result.currentQuestion).toMatchObject({ sourceCitation: EXPECTED_CITATION });
    expect(result.turns).toEqual([expect.objectContaining({ sourceCitation: EXPECTED_CITATION })]);
    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
  });

  it('freezes the concept anchor onto the turn when a cached question is asked', async () => {
    // The snapshot is the whole point of #240: what the row records at ask time is what the
    // transcript will cite forever, whatever happens to the concept's anchors afterwards.
    sessionRow.fallbackMode = true;
    mockedPrisma.questionCache.findMany.mockResolvedValue([
      {
        questionText: 'Cached question 1',
        questionType: 'recall',
        generatedAt: new Date(2024, 0, 1),
      },
    ]);

    await getInterview(SESSION_ID, USER_ID);

    expect(mockedPrisma.interviewTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceDocumentId: DOCUMENT_ID,
          sourcePageFrom: 7,
          sourcePageTo: 7,
        }),
      })
    );
  });

  it('records no anchor on a cached question whose concept was re-analysed since', async () => {
    // Lỗ hổng A's dangerous half: the cache row is from document v1, the anchor now on the
    // concept was rewritten by a later re-analysis and describes v2. The turn cites nothing
    // rather than lending a v1 question a v2 page number.
    sessionRow.fallbackMode = true;
    mockedPrisma.conceptSourceRef.findFirst.mockResolvedValue({
      ...CONCEPT_ANCHOR,
      createdAt: new Date(2025, 0, 1),
    });
    mockedPrisma.questionCache.findMany.mockResolvedValue([
      {
        questionText: 'Cached question 1',
        questionType: 'recall',
        generatedAt: new Date(2024, 0, 1),
      },
    ]);

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(result.currentQuestion).toMatchObject({ sourceCitation: null });
    expect(mockedPrisma.interviewTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceDocumentId: null }) })
    );
  });

  it('leaves sourceCitation null for a concept the analysis never anchored', async () => {
    // A concept added by hand (#172), or one extract_concepts gave neither page nor excerpt
    // for: a valid state, not an error — the client just renders no citation block.
    seedPendingTurn({
      source: 'ai',
      questionText: 'AI question awaiting an answer',
      sourceDocumentId: null,
      sourcePageFrom: null,
      sourcePageTo: null,
    });

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(result.currentQuestion).toMatchObject({ sourceCitation: null });
    // Nothing to resolve, so the read path does not go looking for documents at all.
    expect(mockedPrisma.document.findMany).not.toHaveBeenCalled();
  });

  it('hides the citation once the document has been swapped out from under the turn', async () => {
    // Lỗ hổng B (#240): SP-04 change-document updates the row in place, so the id on the turn
    // still resolves — to a different file. Re-deriving anchors would have renumbered every
    // earlier turn onto the new document without a trace.
    seedPendingTurn({ source: 'ai', questionText: 'Asked before the document was replaced' });
    mockedPrisma.document.findMany.mockResolvedValue([
      {
        ...DOCUMENT_ROW,
        filename: 'dai-so-tuyen-tinh.pdf',
        updatedAt: new Date(Date.now() + 60_000),
      },
    ]);

    const result = await getInterview(SESSION_ID, USER_ID);

    expect(result.currentQuestion).toMatchObject({ sourceCitation: null });
  });

  /**
   * Idempotency (#115): a double-click sends two identical `POST /answers`. Only one request
   * claims the turn (`updateMany` count 1); the other must not see a bare 409 while grading is
   * still in flight — it polls (`replayAnswer`) and either replays the winner's result or, if
   * the winner never finishes inside the poll window, reports `ANSWER_IN_PROGRESS`.
   */
  describe('submitAnswer — replaying a concurrent double-submit', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("replays the winner's grade once it lands inside the poll window", async () => {
      const turn = seedPendingTurn();
      // The winner already claimed this turn (answeredAt set) but Gemini has not graded it yet.
      turn.answeredAt = new Date();

      const resultPromise = submitAnswer(SESSION_ID, USER_ID, 'câu trả lời trùng lặp');

      // Let one poll cycle pass, then have the winner's grade land.
      await jest.advanceTimersByTimeAsync(2_000);
      Object.assign(turn, { score: 1, feedback: 'Tốt', verdict: 'deep' });
      await jest.advanceTimersByTimeAsync(2_000);

      const result = await resultPromise;

      expect(result.replayed).toBe(true);
      expect(result.grading).toEqual({ score: 1, feedback: 'Tốt', verdict: 'deep' });
      // The loser never calls Gemini itself — it only ever reads the winner's row.
      expect(mockedGradeAnswer).not.toHaveBeenCalled();
    });

    it('gives up with ANSWER_IN_PROGRESS if the winner never finishes inside the poll window', async () => {
      const turn = seedPendingTurn();
      turn.answeredAt = new Date();

      const resultPromise = submitAnswer(SESSION_ID, USER_ID, 'câu trả lời trùng lặp').catch(
        (e) => e
      );

      // Comfortably longer than REPLAY_POLL_ATTEMPTS × REPLAY_POLL_INTERVAL_MS — the winner
      // never grades, so the loser must give up rather than poll forever.
      await jest.advanceTimersByTimeAsync(30_000);

      const error = await resultPromise;

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 409, code: 'ANSWER_IN_PROGRESS' });
    });
  });
});
