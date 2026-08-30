import { submitAnswer } from '../services/interview.service';
import prisma from '../config/prisma';
import { generateQuestion, gradeAnswer, getPlanMaterial } from '../services/gemini.service';
import { mockGradeAnswer } from '../utils/mock-ai';

/**
 * #346 — `grade_answer` → evidence on the TEXT path, wired end to end through `submitAnswer`.
 *
 * The three properties this file exists to pin, in order of how expensive they are to get wrong:
 *   1. the evidence write happens BELOW the claim-bound verdict guard. A request that lost its
 *      claim holds a grade that was thrown away; letting it write would upsert over the WINNER's
 *      evidence for the same cell — bug #288, reappearing at a different table.
 *   2. the checkpoint id comes from the ruler this request read, never from the model.
 *   3. evidence is ADDITIVE: no payload the model can produce may cost the student a grade that
 *      was computed correctly.
 *
 * `USE_MOCK_AI` is 'false' here — unlike `interview-service.test.ts`, which runs on mocks and
 * therefore never asks for evidence at all. `getPlanMaterial` is mocked so nothing touches the
 * filesystem or `prisma.document` despite that.
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
    conceptCheckpoint: { findMany: jest.fn() },
    interviewEvidence: { upsert: jest.fn() },
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
  conceptCheckpoint: { findMany: jest.Mock };
  interviewEvidence: { upsert: jest.Mock };
  document: { findMany: jest.Mock };
  questionCache: { findMany: jest.Mock };
};
const mockedGenerateQuestion = generateQuestion as jest.Mock;
const mockedGradeAnswer = gradeAnswer as jest.Mock;
const mockedGetPlanMaterial = getPlanMaterial as jest.Mock;

const USER_ID = 'user-uuid';
const SESSION_ID = 'session-uuid';
const PLAN_ID = 'plan-uuid';
const CONCEPT_ID = 'concept-uuid';

/** The committed ruler, in the order `listConceptCheckpoints` returns it and the prompt shows it. */
const RULER = [
  { id: 'cp-1', text: 'Nói được biến là một ô nhớ có tên', orderIndex: 0 },
  { id: 'cp-2', text: 'Giải thích vì sao biến có kiểu', orderIndex: 1 },
];

const ANSWER = 'Biến là một ô nhớ có tên, và kiểu của nó quyết định phép toán nào dùng được.';

const GRADE = { score: 0.55, feedback: 'Bạn mới nêu định nghĩa.', verdict: 'shallow' as const };

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

let turns: FakeTurn[];
let turnIdSeq: number;
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

function toTurnRow(t: FakeTurn) {
  return { ...t, concept: { name: 'Variable' } };
}

function seedPendingTurn(): FakeTurn {
  const turn: FakeTurn = {
    id: `turn-${++turnIdSeq}`,
    sessionId: SESSION_ID,
    conceptId: CONCEPT_ID,
    turnIndex: turns.length + 1,
    questionText: 'Biến là gì?',
    questionType: 'recall',
    answerText: null,
    score: null,
    feedback: null,
    verdict: null,
    source: 'ai',
    sourceDocumentId: null,
    sourcePageFrom: null,
    sourcePageTo: null,
    askedAt: new Date(),
    answeredAt: null,
  };
  turns.push(turn);
  return turn;
}

/** The arguments of every evidence upsert this request made, in call order. */
function upsertCalls() {
  return mockedPrisma.interviewEvidence.upsert.mock.calls.map(
    (call) => call[0] as { where: unknown; create: Record<string, unknown> }
  );
}

const originalUseMockAi = process.env.USE_MOCK_AI;

beforeEach(() => {
  jest.clearAllMocks();
  // Evidence is only asked for outside mock mode — mock grading has no evidence to give.
  process.env.USE_MOCK_AI = 'false';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});

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

  mockedGetPlanMaterial.mockResolvedValue({ kind: 'text', text: '[material]' });
  mockedGenerateQuestion.mockResolvedValue({
    question_text: 'Vì sao biến cần có kiểu?',
    question_type: 'why',
  });
  mockedGradeAnswer.mockResolvedValue({
    ...GRADE,
    evidence: [{ checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên' }],
  });

  mockedPrisma.conceptCheckpoint.findMany.mockResolvedValue(RULER.map((cp) => ({ ...cp })));
  mockedPrisma.interviewEvidence.upsert.mockResolvedValue({ id: 'evidence-row' });
  mockedPrisma.questionCache.findMany.mockResolvedValue([]);
  mockedPrisma.document.findMany.mockResolvedValue([]);
  mockedPrisma.conceptSourceRef.findFirst.mockResolvedValue(null);
  mockedPrisma.interviewSession.findUnique.mockImplementation(() =>
    Promise.resolve({ ...sessionRow })
  );
  mockedPrisma.interviewSession.update.mockImplementation(
    ({ data }: { data: Partial<typeof sessionRow> }) => {
      Object.assign(sessionRow, data);
      return Promise.resolve({ ...sessionRow });
    }
  );
  mockedPrisma.concept.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === CONCEPT_ID ? { id: CONCEPT_ID, name: 'Variable' } : null)
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
    ({ data }: { data: Record<string, unknown> }) => {
      const turn: FakeTurn = {
        id: `turn-${++turnIdSeq}`,
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
        sourceDocumentId: null,
        sourcePageFrom: null,
        sourcePageTo: null,
        askedAt: new Date(),
        answeredAt: null,
      };
      turns.push(turn);
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

      // Grade-write shape (#288): claim-bound, no `OR`. Writes only while the turn still carries
      // this request's own claim mark.
      if (where.OR === undefined && where.answeredAt instanceof Date) {
        const holdsClaim =
          turn.answeredAt !== null && turn.answeredAt.getTime() === where.answeredAt.getTime();
        if (!holdsClaim) return Promise.resolve({ count: 0 });
        Object.assign(turn, data);
        return Promise.resolve({ count: 1 });
      }

      // Claim shape.
      if (turn.verdict !== null || where.OR === undefined) return Promise.resolve({ count: 0 });
      Object.assign(turn, data);
      return Promise.resolve({ count: 1 });
    }
  );
  mockedPrisma.interviewTurn.findUnique.mockImplementation(
    ({ where }: { where: { id?: string } }) => {
      const turn = turns.find((t) => t.id === where.id);
      return Promise.resolve(turn ? toTurnRow(turn) : null);
    }
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  process.env.USE_MOCK_AI = originalUseMockAi;
});

describe('submitAnswer — recording evidence for the graded turn', () => {
  it('writes the evidence to the cell the ruler names, tagged with the turn it came from', async () => {
    const pending = seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]!.create).toEqual({
      sessionId: SESSION_ID,
      conceptId: CONCEPT_ID,
      // From `listConceptCheckpoints`, not from the model — the model only sent the number 1.
      checkpointId: 'cp-1',
      checkpointText: 'Nói được biến là một ô nhớ có tên',
      status: 'covered',
      quote: 'Biến là một ô nhớ có tên',
      turnRef: pending.id,
    });
  });

  it('reads the ruler once, and hands that same array to grade_answer for numbering', async () => {
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    // One read. A second one is the whole failure mode: two reads ordered by a non-unique column
    // can disagree, and then every index resolves to the wrong checkpoint, silently.
    expect(mockedPrisma.conceptCheckpoint.findMany).toHaveBeenCalledTimes(1);
    expect(mockedGradeAnswer.mock.calls[0]![0].checkpoints).toEqual(RULER);
  });

  it('resolves the index against the ruler, so entry 2 lands on the second checkpoint', async () => {
    mockedGradeAnswer.mockResolvedValue({
      ...GRADE,
      evidence: [{ checkpoint: 2, status: 'covered', quote: 'kiểu của nó quyết định phép toán' }],
    });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(upsertCalls()[0]!.create).toMatchObject({
      checkpointId: 'cp-2',
      checkpointText: 'Giải thích vì sao biến có kiểu',
    });
  });

  it('ignores any checkpoint id the model tries to send alongside the index', async () => {
    mockedGradeAnswer.mockResolvedValue({
      ...GRADE,
      evidence: [
        {
          checkpoint: 1,
          checkpointId: 'cp-forged',
          status: 'covered',
          quote: 'Biến là một ô nhớ có tên',
        },
      ],
    });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    // `checkpointId` is NOT a foreign key (#330), so a forged uuid would have written happily.
    expect(upsertCalls()[0]!.create).toMatchObject({ checkpointId: 'cp-1' });
  });
});

describe('submitAnswer — evidence never reaches the table unguarded', () => {
  /**
   * Each case names the guard it expects to fire and asserts THAT guard, not just "nothing was
   * written". Two things forced this, both found by measurement rather than by reading:
   *   - two guards can reject the same entry, and the first live run showed a quote carrying a
   *     hedge the student never typed is rejected as UNGROUNDED — it never reaches the marker
   *     guard. Labelling that case "INV-2 downgrade" would have been measuring something else.
   *   - `stringContaining(reason)` on its own asserts NOTHING: the per-turn summary line names all
   *     three reasons (`quote_not_found=0` …), so it matches on every run. Mislabelling the reason
   *     in the source left that version green. The em dash is what pins the per-item line.
   */
  it.each([
    [
      'an index outside the ruler',
      'bad_index',
      { checkpoint: 9, status: 'covered', quote: 'Biến là một ô nhớ có tên' },
    ],
    [
      'a quote the student never said',
      'quote_not_found',
      { checkpoint: 1, status: 'covered', quote: 'biến được cấp phát động' },
    ],
    ['an entry with no quote at all', 'parse_failed', { checkpoint: 1, status: 'covered' }],
  ])('writes nothing for %s, and counts it as %s', async (_label, reason, entry) => {
    mockedGradeAnswer.mockResolvedValue({ ...GRADE, evidence: [entry] });
    seedPendingTurn();

    const result = await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`${reason} —`));
    // Positive control on the same request: the grade still landed, so "no write" is the guard
    // firing and not the request having failed somewhere earlier.
    expect(result.grading).toEqual(GRADE);
  });

  // Both quotes below are verbatim in `hedged`, on purpose: only a GROUNDED entry ever reaches
  // `sanitizeEvidence`, so that is the only way to measure the guards these cases are named for.
  const HEDGED = 'Biến là một ô nhớ có tên, nhưng em không chắc về phần kiểu.';

  it.each([
    // The enum case uses a MARKER-FREE quote deliberately. With a hedged quote it would come out
    // `dropped` only because the enum check happens to run before the marker check inside
    // `sanitizeEvidence` — one reordering away from silently measuring the other guard.
    ['a status outside the enum', 'dropped=1', 'Running', 'Biến là một ô nhớ có tên'],
    [
      'an uncertainty marker on a contradicted (INV-2)',
      'downgraded=1',
      'contradicted',
      'em không chắc về phần kiểu',
    ],
  ])(
    'writes nothing for %s, and the per-turn line reports %s',
    async (_label, counter, status, quote) => {
      mockedGradeAnswer.mockResolvedValue({
        ...GRADE,
        evidence: [{ checkpoint: 1, status, quote }],
      });
      seedPendingTurn();

      const result = await submitAnswer(SESSION_ID, USER_ID, HEDGED);

      expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(counter));
      expect(result.grading).toEqual(GRADE);
    }
  );
});

describe('submitAnswer — a lost claim writes no evidence (#288 at a second table)', () => {
  it('skips the evidence write entirely when the verdict write finds the claim gone', async () => {
    const pending = seedPendingTurn();

    // A newer request reclaims the turn while Gemini is still grading, and finishes first. This is
    // the exact window #288 was about: this request comes back holding a valid grade whose score
    // is about to be discarded.
    mockedGradeAnswer.mockImplementation(async () => {
      pending.answeredAt = new Date(Date.now() + 60_000);
      pending.verdict = 'deep';
      pending.score = 0.9;
      pending.feedback = 'câu trả lời của người thắng';
      return {
        ...GRADE,
        evidence: [{ checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên' }],
      };
    });

    const result = await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(result.replayed).toBe(true);
    // Evidence upserts on (session, concept, checkpoint). Writing here would have overwritten the
    // winner's evidence for that cell with a grading that was thrown away.
    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
  });
});

describe('submitAnswer — evidence is additive and can never cost the grade', () => {
  it.each([
    ['the field is absent', undefined],
    ['the field is not a list', 'covered'],
    ['an entry is a bare string', ['covered']],
    ['an entry has no quote', [{ checkpoint: 1, status: 'covered' }]],
    ['an entry is null', [null]],
  ])('still grades the turn and moves the session on when %s', async (_label, evidence) => {
    mockedGradeAnswer.mockResolvedValue({ ...GRADE, evidence });
    const pending = seedPendingTurn();

    const result = await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(result.grading).toEqual(GRADE);
    expect(result.replayed).toBe(false);
    expect(turns.find((t) => t.id === pending.id)).toMatchObject({
      verdict: 'shallow',
      score: 0.55,
    });
    // The state machine still ran: a probe question was asked for the next turn.
    expect(result.nextQuestion).not.toBeNull();
    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
  });

  it('keeps the good entries of a batch whose other entries are malformed', async () => {
    mockedGradeAnswer.mockResolvedValue({
      ...GRADE,
      evidence: [
        null,
        { checkpoint: 99, status: 'covered', quote: 'Biến là một ô nhớ có tên' },
        { checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên' },
      ],
    });
    seedPendingTurn();

    const result = await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]!.create).toMatchObject({ checkpointId: 'cp-1' });
    expect(result.grading).toEqual(GRADE);
  });

  it('survives a failing evidence write, and counts it apart from the model failures', async () => {
    mockedPrisma.interviewEvidence.upsert.mockRejectedValue(new Error('connection lost'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    seedPendingTurn();

    const result = await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(result.grading).toEqual(GRADE);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('write failed'));
    // The counter has to stay OUT of the model's rejection reasons: a database outage folded into
    // `dropped` or `parse_failed` sends whoever reads these numbers off to fix a prompt. That
    // separation is the only reason `write_failed` exists, so it is asserted rather than assumed.
    // ⚠️ Anchoring on the WHOLE cluster is deliberate: it fails if a count lands on a neighbouring
    // counter, which a single `write_failed=1` would not. It is also brittle by design — adding a
    // reason breaks it. When that happens, EXTEND the cluster; do not relax it into a
    // `stringContaining` of one fragment, which is how this assertion stops asserting anything.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'dropped=0 bad_index=0 parse_failed=0 quote_not_found=0 self_contradicted=0 ' +
          'over_limit=0 write_failed=1'
      )
    );
  });

  it('still counts enum leakage on a checkpoint that also contradicted itself', async () => {
    // The correlation is the point: a response that both disagrees with itself AND leaves the enum
    // is the model failing hardest, and it was the one case where `dropped` read 0.
    mockedGradeAnswer.mockResolvedValue({
      ...GRADE,
      evidence: [
        { checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên' },
        { checkpoint: 1, status: 'contradicted', quote: 'ô nhớ có tên' },
        { checkpoint: 1, status: 'Running', quote: 'một ô nhớ' },
      ],
    });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'dropped=1 bad_index=0 parse_failed=0 quote_not_found=0 ' + 'self_contradicted=1'
      )
    );
  });

  it('reports a missing evidence field on the per-turn line instead of staying silent', async () => {
    // `evidence` is REQUIRED by the JSON schema, so its absence is a deviation — and it used to be
    // the one deviation that printed nothing at all, indistinguishable from mock mode. #346 exists
    // so the first real run is a measurement; a silent deviation defeats exactly that.
    mockedGradeAnswer.mockResolvedValue({ ...GRADE });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('field=absent'));
  });
});

/**
 * What the SUMMARY line is for, and therefore when it appears.
 *
 * Per-entry rejections are logged unconditionally elsewhere, so no deviation depends on this line
 * to be visible. What it adds is the one thing a per-entry log cannot say: whether a count of zero
 * means "nothing to reject" or "never ran". A zero is only a measurement if it is printed.
 *
 * It therefore prints when there was something to measure — a ruler existed, or the model sent
 * entries anyway — and stays quiet otherwise. The rejected alternative is pinned below: firing on
 * "the field was present" would emit an all-zero line on every turn of every checkpoint-less
 * concept, which is noise on the ordinary path bought for a rare case.
 */
describe('submitAnswer — when the summary line appears', () => {
  it('prints for a C = 0 concept whose model answered anyway', async () => {
    // An empty checkpoint list is a legal committed state (#333) and the prompt asks for an empty
    // `evidence` list in that case. A model that ignores it puts every entry in `bad_index`, and
    // that turn is worth a total.
    mockedPrisma.conceptCheckpoint.findMany.mockResolvedValue([]);
    mockedGradeAnswer.mockResolvedValue({
      ...GRADE,
      evidence: [{ checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên' }],
    });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('bad_index=1'));
    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
  });

  it('stays quiet for a C = 0 concept whose model complied with the empty list', async () => {
    // Nothing was asked for and nothing came back, so there is no total worth printing. This is the
    // case that rules out gating on "the field was present": that version fires here, on every turn
    // of every concept without checkpoints.
    mockedPrisma.conceptCheckpoint.findMany.mockResolvedValue([]);
    mockedGradeAnswer.mockResolvedValue({ ...GRADE, evidence: [] });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('[evidence]'));
  });
});

describe('submitAnswer — mock mode asks for no evidence at all', () => {
  it('reads no ruler and writes no evidence under USE_MOCK_AI', async () => {
    process.env.USE_MOCK_AI = 'true';
    // Match what mock mode really produces: `mockGradeAnswer` has no `evidence` field at all. The
    // shared fixture returns one, which no mock-mode request could.
    mockedGradeAnswer.mockResolvedValue({ ...GRADE });
    seedPendingTurn();

    await submitAnswer(SESSION_ID, USER_ID, ANSWER);

    expect(mockedPrisma.conceptCheckpoint.findMany).not.toHaveBeenCalled();
    expect(mockedGradeAnswer.mock.calls[0]![0].checkpoints).toEqual([]);
    expect(mockedPrisma.interviewEvidence.upsert).not.toHaveBeenCalled();
    // And no summary line either: nothing was asked for and nothing came back.
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('[evidence]'));
  });

  it('rests on a real property of mockGradeAnswer, and checks it rather than assuming it', () => {
    // ⚠️ The silence above depends on `mockGradeAnswer` producing NO `evidence` field. The test
    // above cannot see that dependency: this suite `jest.mock`s `gemini.service`, so it MIRRORS the
    // mock's shape by hand instead of being bound to it. A mirror that drifts goes green — measured:
    // adding `evidence: []` to `mockGradeAnswer` left all 800 tests passing, and adding real entries
    // did too, while actually BREAKING mock-mode silence (an empty ruler turns every entry into
    // `bad_index`, so both the per-item and summary lines fire).
    //
    // So the dependency is asserted against the real function, imported directly — `mock-ai` is a
    // different module from the one being mocked, so nothing intercepts it. It is synchronous, so
    // there is no promise here for `not.toHaveProperty` to pass vacuously against.
    //
    // Asserted as an EXACT shape rather than "does not have `evidence`", because the negative form
    // was only strong while the function stayed synchronous — and nothing guards that. Make
    // `mockGradeAnswer` async to match the real `gradeAnswer` signature (an easy, plausible edit)
    // and `not.toHaveProperty` passes on the Promise, silently asserting nothing. An exact shape
    // states the proposition we actually mean — *the mock IS a `GradeAnswerResponse`* — and fails on
    // both the extra field and the wrong kind of object.
    //
    // (`evidence: undefined` would still pass, since `toEqual` ignores undefined properties. That
    // is correct rather than a gap: an undefined field reads as `absent` downstream, which is the
    // silence this test is about.)
    //
    // All three verdict branches, because a future edit could add the field to only one of them.
    for (const answer of ['ngắn', 'một câu trả lời vừa đủ dài để thành shallow', 'x'.repeat(200)]) {
      expect(mockGradeAnswer(answer)).toEqual({
        score: expect.any(Number),
        feedback: expect.any(String),
        verdict: expect.any(String),
      });
    }
  });
});
