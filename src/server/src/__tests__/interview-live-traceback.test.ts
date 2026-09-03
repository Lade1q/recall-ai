import prisma from '../config/prisma';
import { submitAnswer } from '../services/interview.service';
import { finalizeConceptResult } from '../services/concept-result.service';
import { generateQuestion, gradeAnswer } from '../services/gemini.service';
import { countsTowardMastery } from '../utils/mastery';

/**
 * Live traceback at the service seam (Quân, 03/09): a wrong answer puts the concept's weak
 * foundations in front of it and the session asks about them straight away.
 *
 * The pure rules are covered by `interview-queue.test.ts` and `interview-state.test.ts`. What
 * only this level can prove is the wiring, and specifically the two invariants that would fail
 * silently: the cursor must NOT move when the queue grows in front of it, and the concept the
 * student stumbled on must NOT be finalised on the way past.
 */

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const P = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';

const NAMES: Record<string, string> = {
  [C]: 'Duyệt đồ thị DFS',
  [D]: 'Sắp xếp tô-pô',
  [P]: 'Danh sách kề',
};

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
    concept: { findFirst: jest.fn(), findMany: jest.fn() },
    conceptEdge: { findMany: jest.fn() },
    studyPlan: { findUnique: jest.fn() },
    conceptSourceRef: { findFirst: jest.fn() },
    document: { findMany: jest.fn() },
    questionCache: { findMany: jest.fn() },
  };
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
jest.mock('../services/concept-result.service', () => ({ finalizeConceptResult: jest.fn() }));
jest.mock('../services/checkpoint.service', () => ({
  listConceptCheckpoints: jest.fn(async () => []),
}));
jest.mock('../services/interview-evidence.service', () => ({
  recordTurnEvidence: jest.fn(async () => undefined),
}));

/** `noUncheckedIndexedAccess` is on, so every mocked delegate is named rather than index-typed. */
const db = prisma as unknown as {
  interviewSession: { findUnique: jest.Mock; update: jest.Mock };
  interviewTurn: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
  };
  concept: { findFirst: jest.Mock; findMany: jest.Mock };
  conceptEdge: { findMany: jest.Mock };
  studyPlan: { findUnique: jest.Mock };
  conceptSourceRef: { findFirst: jest.Mock };
  document: { findMany: jest.Mock };
  questionCache: { findMany: jest.Mock };
};
const mockedGenerateQuestion = generateQuestion as jest.Mock;
const mockedGradeAnswer = gradeAnswer as jest.Mock;
const mockedFinalize = finalizeConceptResult as jest.Mock;

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
  mode: string | null;
  sourceDocumentId: string | null;
  sourcePageFrom: number | null;
  sourcePageTo: number | null;
  askedAt: Date;
  answeredAt: Date | null;
}

let session: {
  id: string;
  userId: string;
  planId: string;
  status: string;
  conceptQueue: unknown;
  currentConceptIdx: number;
  maxTurnsPerConcept: number;
  fallbackMode: boolean;
  startedAt: Date;
  endedAt: Date | null;
  plan: { languageDetected: string | null };
};
let turns: FakeTurn[];
/** Mastery of each concept; `P` weak by default so traceback has somewhere to go. */
let mastery: Record<string, number | null>;
/** `from` is a prerequisite of `to`. `P -> C` by default. */
let edges: { fromConceptId: string; toConceptId: string }[];

const row = (t: FakeTurn) => ({
  ...t,
  concept: { name: NAMES[t.conceptId] },
  gradingFeedbacks: [],
});

function seedPendingTurn(conceptId: string, turnIndex: number): FakeTurn {
  const turn: FakeTurn = {
    id: `turn-${turns.length + 1}`,
    sessionId: SESSION_ID,
    conceptId,
    turnIndex,
    questionText: 'Câu hỏi đang chờ',
    questionType: 'recall',
    answerText: null,
    score: null,
    feedback: null,
    verdict: null,
    source: 'ai',
    mode: 'initial',
    sourceDocumentId: null,
    sourcePageFrom: null,
    sourcePageTo: null,
    askedAt: new Date(),
    answeredAt: null,
  };
  turns.push(turn);
  return turn;
}

const queueIds = (): string[] =>
  (session.conceptQueue as { conceptId: string }[]).map((entry) => entry.conceptId);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USE_MOCK_AI = 'true';

  turns = [];
  mastery = { [C]: 0.4, [D]: null, [P]: 0.1 };
  edges = [{ fromConceptId: P, toConceptId: C }];
  session = {
    id: SESSION_ID,
    userId: USER_ID,
    planId: PLAN_ID,
    status: 'active',
    conceptQueue: [
      { conceptId: C, hop: 0, viaConceptId: null },
      { conceptId: D, hop: 0, viaConceptId: null },
    ],
    currentConceptIdx: 0,
    maxTurnsPerConcept: 3,
    fallbackMode: false,
    startedAt: new Date(),
    endedAt: null,
    plan: { languageDetected: 'vi' },
  };

  db.interviewSession.findUnique.mockImplementation(async () => ({ ...session }));
  db.interviewSession.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(session, data);
      return { ...session };
    }
  );
  db.concept.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    NAMES[where.id] ? { id: where.id, name: NAMES[where.id] } : null
  );
  db.concept.findMany.mockImplementation(
    async ({ where }: { where: { id?: { in: string[] } } }) => {
      const ids = where.id?.in ?? Object.keys(NAMES);
      return ids
        .filter((id) => NAMES[id])
        .map((id) => ({ id, name: NAMES[id], masteryScore: mastery[id] ?? null }));
    }
  );
  db.conceptEdge.findMany.mockImplementation(async () => edges);
  db.studyPlan.findUnique.mockResolvedValue({ tracebackEnabled: true });
  db.conceptSourceRef.findFirst.mockResolvedValue(null);
  db.document.findMany.mockResolvedValue([]);
  db.questionCache.findMany.mockResolvedValue([]);
  db.interviewTurn.findMany.mockImplementation(
    async ({ where }: { where: { sessionId: string; conceptId?: string } }) =>
      turns
        .filter((t) => t.sessionId === where.sessionId)
        .filter((t) => !where.conceptId || t.conceptId === where.conceptId)
        .map(row)
  );
  db.interviewTurn.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const found = turns.find((t) => t.id === where.id);
    return found ? row(found) : null;
  });
  db.interviewTurn.updateMany.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const found = turns.find((t) => t.id === where.id);
      if (!found) return { count: 0 };
      Object.assign(found, data);
      return { count: 1 };
    }
  );
  db.interviewTurn.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const found = turns.find((t) => t.id === where.id);
      if (found) Object.assign(found, data);
      return row(found as FakeTurn);
    }
  );
  db.interviewTurn.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const turn: FakeTurn = {
        id: `turn-${turns.length + 1}`,
        sessionId: data.sessionId as string,
        conceptId: data.conceptId as string,
        turnIndex: data.turnIndex as number,
        questionText: data.questionText as string,
        questionType: (data.questionType as string) ?? null,
        answerText: null,
        score: null,
        feedback: null,
        verdict: null,
        source: (data.source as string) ?? 'ai',
        mode: (data.mode as string) ?? null,
        sourceDocumentId: null,
        sourcePageFrom: null,
        sourcePageTo: null,
        askedAt: new Date(),
        answeredAt: null,
      };
      turns.push(turn);
      return row(turn);
    }
  );

  mockedGenerateQuestion.mockResolvedValue({
    question_text: 'Câu hỏi mới',
    question_type: 'recall',
  });
  mockedGradeAnswer.mockResolvedValue({
    score: 0.1,
    feedback: 'Chưa đúng',
    verdict: 'wrong',
    evidence: [],
  });
  mockedFinalize.mockResolvedValue({
    conceptId: C,
    masteryScore: 0.1,
    reviewInDays: 1,
    scheduledFor: new Date(),
    prerequisites: [],
    tracebackSkipReason: null,
  });
});

describe('a wrong answer hops to the weak prerequisite instead of narrowing the question', () => {
  it('inserts the prerequisite BEFORE the failing concept and leaves the cursor where it was', async () => {
    seedPendingTurn(C, 1);

    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(queueIds()).toEqual([P, C, D]);
    // The load-bearing assertion. The cursor used to address C at index 0; after the insert
    // index 0 is P. Advancing it here would step straight over the base we just queued.
    expect(session.currentConceptIdx).toBe(0);
    expect(result.session.currentConcept).toEqual({ id: P, name: NAMES[P] });
  });

  it('does not finalise the concept it hopped away from — no score, no review row', async () => {
    seedPendingTurn(C, 1);
    await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');
    expect(mockedFinalize).not.toHaveBeenCalled();
  });

  it('reports the hop once, naming the concept and the base it came from', async () => {
    seedPendingTurn(C, 1);
    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.tracedBack).toEqual({
      fromConceptId: C,
      fromConceptName: NAMES[C],
      prerequisites: [
        { conceptId: P, name: NAMES[P], reason: 'below_threshold', masteryScore: 0.1 },
      ],
    });
  });

  it('asks the next question about the prerequisite, at its own turn 1', async () => {
    seedPendingTurn(C, 1);
    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.nextQuestion?.conceptId).toBe(P);
    expect(result.nextQuestion?.turnIndex).toBe(1);
    expect(mockedGenerateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ conceptName: NAMES[P], mode: 'initial' })
    );
  });

  it('names the whole queue, so the rail can say which concept is the base of which', async () => {
    seedPendingTurn(C, 1);
    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.session.queue).toEqual([
      { conceptId: P, name: NAMES[P], hop: 1, viaConceptId: C, viaConceptName: NAMES[C] },
      { conceptId: C, name: NAMES[C], hop: 0, viaConceptId: null, viaConceptName: null },
      { conceptId: D, name: NAMES[D], hop: 0, viaConceptId: null, viaConceptName: null },
    ]);
  });

  it('C6 survives the detour: the concept resumes at turn 2, it does not restart', async () => {
    seedPendingTurn(C, 1);
    await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    // Walk the chain: the prerequisite is answered well and closes, so the cursor lands back on C.
    mockedGradeAnswer.mockResolvedValue({
      score: 0.9,
      feedback: 'Tốt',
      verdict: 'deep',
      evidence: [],
    });
    const pending = turns.find((t) => t.conceptId === P && t.verdict === null);
    expect(pending).toBeDefined();
    for (let i = 0; i < session.maxTurnsPerConcept; i++) {
      const open = turns.find((t) => t.verdict === null);
      if (!open) break;
      await submitAnswer(SESSION_ID, USER_ID, 'trả lời tốt');
    }

    const cTurns = turns.filter((t) => t.conceptId === C);
    // One wrong turn before the detour plus the turn it resumes on — numbering CONTINUES, so the
    // C6 ceiling is spent across the whole visit rather than reset by the hop.
    expect(cTurns.map((t) => t.turnIndex)).toEqual([1, 2]);
    expect(new Set(cTurns.map((t) => t.turnIndex)).size).toBe(cTurns.length);
  });
});

describe('when there is nothing to hop to, the #392 hint ladder still runs', () => {
  it('falls back to ask_hint for a concept with no prerequisites', async () => {
    edges = [];
    seedPendingTurn(C, 1);

    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.tracedBack).toBeNull();
    expect(queueIds()).toEqual([C, D]);
    expect(mockedGenerateQuestion).toHaveBeenCalledWith(expect.objectContaining({ mode: 'hint' }));
  });

  it('falls back when the only prerequisite is already mastered (AE-07 AF1)', async () => {
    mastery[P] = 0.9;
    seedPendingTurn(C, 1);

    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.tracedBack).toBeNull();
    expect(queueIds()).toEqual([C, D]);
  });

  it('falls back when the plan has traceback switched off', async () => {
    db.studyPlan.findUnique.mockResolvedValue({ tracebackEnabled: false });
    seedPendingTurn(C, 1);

    const result = await submitAnswer(SESSION_ID, USER_ID, 'sai rồi');

    expect(result.tracedBack).toBeNull();
    expect(queueIds()).toEqual([C, D]);
    // The switch is checked BEFORE the graph is read, so a student who turned remediation off
    // does not pay two queries per wrong answer for a feature they disabled. (The fixture itself
    // is known to be able to hop — the first describe block traces back on exactly this data.)
    expect(db.conceptEdge.findMany).not.toHaveBeenCalled();
  });

  it('does not trace back a second time from the same concept — it re-tests instead, and that turn COUNTS', async () => {
    session.conceptQueue = [
      { conceptId: P, hop: 1, viaConceptId: C },
      { conceptId: C, hop: 0, viaConceptId: null },
    ];
    session.currentConceptIdx = 1;
    // Turn 1 is the wrong answer that sent the session to the base; turn 2 is the re-ask it came
    // back to. Seeding both is what makes the numbering match a real return from a detour.
    const first = seedPendingTurn(C, 1);
    Object.assign(first, {
      answerText: 'sai',
      score: 0,
      feedback: '...',
      verdict: 'wrong',
      answeredAt: new Date(),
    });
    seedPendingTurn(C, 2);

    const result = await submitAnswer(SESSION_ID, USER_ID, 'lại sai');

    expect(result.tracedBack).toBeNull();
    expect(queueIds()).toEqual([P, C]);
    // `probe`, NOT `hint`. Measured on a live run: with `hint` here, a concept that was
    // remediated and then answered `deep` still scored 0.12, because `countsTowardMastery`
    // (`utils/mastery.ts`) drops hint turns. The turn that proves the remediation worked has to
    // be able to move the number, or live traceback is a feature with no consequence.
    expect(mockedGenerateQuestion).toHaveBeenCalledWith(expect.objectContaining({ mode: 'probe' }));
    const written = turns.find((t) => t.conceptId === C && t.turnIndex === 3);
    expect(written?.mode).toBe('probe');
    expect(countsTowardMastery({ mode: written?.mode as never })).toBe(true);
  });

  it('skips the graph queries entirely on a concept that already traced back', async () => {
    // `hasTracedBackFrom` is a COST guard, not a correctness one: with it removed the outcome
    // above is identical, because `planTracebackInsert` refuses to re-queue a concept already in
    // the queue. Measured by deleting the guard and watching every other test stay green — so
    // what it does has to be asserted directly, or nothing is holding it in place.
    session.conceptQueue = [
      { conceptId: P, hop: 1, viaConceptId: C },
      { conceptId: C, hop: 0, viaConceptId: null },
    ];
    session.currentConceptIdx = 1;
    seedPendingTurn(C, 2);

    await submitAnswer(SESSION_ID, USER_ID, 'lại sai');

    expect(db.studyPlan.findUnique).not.toHaveBeenCalled();
    expect(db.conceptEdge.findMany).not.toHaveBeenCalled();
  });
});
