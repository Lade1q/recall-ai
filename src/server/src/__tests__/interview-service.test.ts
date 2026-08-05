import { getInterview, submitAnswer, submitSelfGrade } from '../services/interview.service';
import prisma from '../config/prisma';
import { generateQuestion, gradeAnswer } from '../services/gemini.service';
import { AppError } from '../middleware/errorHandler';

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
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
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
  },
}));
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
          verdict: null;
          OR: Array<{ answeredAt: null | { lt: Date } }>;
        };
        data: Partial<FakeTurn>;
      }) => {
        const turn = turns.find((t) => t.id === where.id);
        if (!turn || turn.verdict !== null) return Promise.resolve({ count: 0 });
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
});
