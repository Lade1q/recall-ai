import { getSessionSummary } from '../services/session-summary.service';
import prisma from '../config/prisma';
import { loadSession } from '../services/interview.service';
import { summarizeSession } from '../services/gemini.service';
import { AppError } from '../middleware/errorHandler';

/**
 * AE-09 (I6.5) — `getSessionSummary()` against mocked Prisma / Gemini / `interview.service`.
 * `interview.service.ts` is a 900-line module with its own heavy dependency tree — mocked down
 * to `loadSession`, the one function this file reuses from it, same DRY-reuse pattern as
 * `question-cache.service.ts` reusing `loadMaterial`.
 *
 * `parseConceptQueue` is deliberately NOT mocked: it is pure and lives in `utils/`, so the real
 * one runs here. It used to be mocked with a hand-written copy that still had the pre-traceback
 * `typeof id === 'string'` filter, which meant this suite would have stayed green while the
 * result screen listed no concepts for every session written in the object form.
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    concept: { findMany: jest.fn() },
    interviewTurn: { findMany: jest.fn() },
    reviewQueueItem: { findMany: jest.fn() },
    interviewSession: { update: jest.fn() },
  },
}));
jest.mock('../services/interview.service', () => ({
  loadSession: jest.fn(),
}));
jest.mock('../services/gemini.service', () => ({
  summarizeSession: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  concept: { findMany: jest.Mock };
  interviewTurn: { findMany: jest.Mock };
  reviewQueueItem: { findMany: jest.Mock };
  interviewSession: { update: jest.Mock };
};
const mockedLoadSession = loadSession as jest.Mock;
const mockedSummarizeSession = summarizeSession as jest.Mock;

const SESSION_ID = 'session-uuid';
const USER_ID = 'user-uuid';
const CONCEPT_A = 'concept-a';
const CONCEPT_B = 'concept-b';
/** Traceback rows are all due immediately (AE-07 step 6), so they share one timestamp. */
const TRACEBACK_DUE = new Date('2026-08-04T10:12:00.000Z');

/** One `ReviewQueueItem` row as the widened `findMany` selects it (#119). */
function reviewRow(overrides: {
  conceptId: string;
  name: string;
  reason: 'traceback' | 'spaced_repetition';
  id?: string;
  depth?: number | null;
  status?: string;
  scheduledFor?: Date | null;
  sourceConceptId?: string | null;
}) {
  const { name, ...rest } = overrides;
  return {
    // Distinct from `conceptId` on purpose: the two are different ids and #310 must not swap them.
    id: `item-${overrides.conceptId}`,
    depth: null,
    status: 'pending',
    scheduledFor: overrides.reason === 'traceback' ? TRACEBACK_DUE : null,
    sourceConceptId: null,
    ...rest,
    concept: { name },
  };
}

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    planId: 'plan-uuid',
    status: 'completed',
    // The OBJECT form, which is what every session written since live traceback stores. The
    // default fixture uses it rather than the legacy `string[]` so the whole suite runs against
    // the shape production actually has; the legacy shape gets its own test below.
    conceptQueue: [
      { conceptId: CONCEPT_A, hop: 0, viaConceptId: null, added: false },
      { conceptId: CONCEPT_B, hop: 0, viaConceptId: null, added: false },
    ],
    currentConceptIdx: 2,
    maxTurnsPerConcept: 3,
    fallbackMode: false,
    summaryText: null,
    startedAt: new Date('2026-08-04T10:00:00.000Z'),
    endedAt: new Date('2026-08-04T10:12:00.000Z'),
    plan: { languageDetected: 'vi' },
    ...overrides,
  };
}

describe('getSessionSummary — the queue column is read, not re-implemented', () => {
  /**
   * AE-09 lists the session's concepts in queue order, and the queue is a JSON column that has
   * had two shapes. Both suites that read it used to `jest.mock` a hand-written copy of
   * `parseConceptQueue` carrying the pre-traceback `typeof id === 'string'` filter, so an
   * object-form queue read as `[]` — a finished session whose result screen lists nothing —
   * while the suite stayed green. The mock is gone; these two pin both shapes.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: CONCEPT_A, name: 'Stack', masteryScore: 0.5 },
    ]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      { conceptId: CONCEPT_A, turnIndex: 1, score: 0.5, verdict: 'shallow', mode: null },
    ]);
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });
  });

  it('🔴 lists the concepts of a queue stored in the OBJECT form (post-traceback sessions)', async () => {
    mockedLoadSession.mockResolvedValue(
      baseSession({
        conceptQueue: [{ conceptId: CONCEPT_A, hop: 0, viaConceptId: null, added: false }],
      })
    );

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    // Stated as a number, not as "not empty": zero is the exact regression being guarded.
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]?.conceptId).toBe(CONCEPT_A);
  });

  it('🔴 still lists them for a queue stored in the legacy string[] form', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]?.conceptId).toBe(CONCEPT_A);
  });
});

describe('getSessionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Concept.masteryScore is deliberately a decoy, unrelated to the turn scores below: the
    // live concept score can belong to a *later* session by the time an old summary is read,
    // so every assertion in this file that still expects 0.85 / 0.4 only passes if the code
    // derives masteryScore from this session's own turns, not from this mock field.
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: CONCEPT_A, name: 'Stack', masteryScore: 0.01 },
      { id: CONCEPT_B, name: 'Recursion', masteryScore: 0.99 },
    ]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      { conceptId: CONCEPT_A, turnIndex: 1, score: 0.85, verdict: 'deep', mode: null },
      { conceptId: CONCEPT_B, turnIndex: 1, score: 0.4, verdict: 'wrong', mode: null },
    ]);
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([]);
    mockedPrisma.interviewSession.update.mockResolvedValue({});
  });

  it('propagates the 404 loadSession already throws for a missing/foreign session', async () => {
    mockedLoadSession.mockRejectedValue(
      new AppError('Interview session not found', 404, 'NOT_FOUND')
    );

    await expect(getSessionSummary(SESSION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('rejects with 409 when the session has not finished yet (active)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ status: 'active' }));

    await expect(getSessionSummary(SESSION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SESSION_NOT_COMPLETED',
    });
    expect(mockedSummarizeSession).not.toHaveBeenCalled();
  });

  it('still rejects with 409 for a paused session — nothing finished to summarise yet', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ status: 'paused' }));

    await expect(getSessionSummary(SESSION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SESSION_NOT_COMPLETED',
    });
    expect(mockedSummarizeSession).not.toHaveBeenCalled();
  });

  it('accepts an abandoned session (SPEC_DB-03) but never calls summarize_session for it (AF3)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ status: 'abandoned' }));

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.status).toBe('abandoned');
    expect(result.summary).toEqual({
      text: null,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      generatedByAi: false,
      message: null,
    });
    expect(mockedSummarizeSession).not.toHaveBeenCalled();
    // The score table itself is unaffected — same concepts/turns as any other session.
    expect(result.concepts).toHaveLength(2);
  });

  it('does not reuse the AI-unavailable message for an abandoned session (different reason, AF3 vs UC-14 E1)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ status: 'abandoned' }));

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.summary.message).toBeNull();
  });

  it('calls Gemini once, caches the result, and returns the full breakdown', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'Great work on Stack, review Recursion.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Redo the recursion exercises.'],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(mockedSummarizeSession).toHaveBeenCalledTimes(1);
    expect(mockedSummarizeSession).toHaveBeenCalledWith({
      concepts: [
        { conceptName: 'Stack', masteryScore: 0.85, verdicts: ['deep'] },
        { conceptName: 'Recursion', masteryScore: 0.4, verdicts: ['wrong'] },
      ],
      language: 'vi',
    });
    expect(result.summary).toEqual({
      text: 'Great work on Stack, review Recursion.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Redo the recursion exercises.'],
      generatedByAi: true,
      message: null,
    });
    expect(result.durationMinutes).toBe(12);
    expect(result.concepts).toEqual([
      {
        conceptId: CONCEPT_A,
        name: 'Stack',
        masteryScore: 0.85,
        turns: [
          { turnIndex: 1, score: 0.85, verdict: 'deep', mode: null, countsTowardMastery: true },
        ],
      },
      {
        conceptId: CONCEPT_B,
        name: 'Recursion',
        masteryScore: 0.4,
        turns: [
          { turnIndex: 1, score: 0.4, verdict: 'wrong', mode: null, countsTowardMastery: true },
        ],
      },
    ]);

    // Cached as JSON in the single summaryText column — see session-summary.service.ts for why.
    expect(mockedPrisma.interviewSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        summaryText: JSON.stringify({
          summaryText: 'Great work on Stack, review Recursion.',
          strengths: ['Stack'],
          weaknesses: ['Recursion'],
          recommendations: ['Redo the recursion exercises.'],
        }),
      },
    });
  });

  it('reads from the cache on a second call and never calls Gemini again (R01)', async () => {
    const cached = JSON.stringify({
      summaryText: 'Cached report.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Redo recursion.'],
    });
    mockedLoadSession.mockResolvedValue(baseSession({ summaryText: cached }));

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(mockedSummarizeSession).not.toHaveBeenCalled();
    expect(mockedPrisma.interviewSession.update).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      text: 'Cached report.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Redo recursion.'],
      generatedByAi: true,
      message: null,
    });
  });

  it('falls back to a structured-only report when summarize_session fails (UC-14 E1)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedSummarizeSession.mockRejectedValue(new AppError('down', 502, 'AI_UNAVAILABLE'));

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.summary).toEqual({
      text: null,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      generatedByAi: false,
      message: 'Không thể tổng hợp nhận xét lúc này.',
    });
    // The score table is still real even though the AI text is not.
    expect(result.concepts).toHaveLength(2);
    expect(mockedPrisma.interviewSession.update).not.toHaveBeenCalled();
  });

  it('re-throws a non-AI error from summarize_session rather than masking it as unavailable', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedSummarizeSession.mockRejectedValue(new Error('unexpected bug'));

    await expect(getSessionSummary(SESSION_ID, USER_ID)).rejects.toThrow('unexpected bug');
  });

  it('never calls Gemini when no concept was ever graded (E1 ended the session immediately)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([]);

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(mockedSummarizeSession).not.toHaveBeenCalled();
    expect(result.summary.generatedByAi).toBe(false);
    expect(result.concepts.every((c) => c.turns.length === 0)).toBe(true);
    // No turn to grade -> null, never the decoy live Concept.masteryScore from the mock above.
    expect(result.concepts.every((c) => c.masteryScore === null)).toBe(true);
  });

  it('skips a concept whose row was deleted since (re-analysis) without crashing', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: CONCEPT_A, name: 'Stack', masteryScore: 0.01 },
      // CONCEPT_B missing entirely.
    ]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.concepts.map((c) => c.conceptId)).toEqual([CONCEPT_A]);
  });

  it('assembles the traceback block from ReviewQueueItem, resolving the source concept name', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([
      {
        id: 'queue-item-uuid',
        conceptId: 'prereq-uuid',
        reason: 'traceback',
        depth: 1,
        status: 'pending',
        scheduledFor: TRACEBACK_DUE,
        sourceConceptId: CONCEPT_A,
        concept: { name: 'Giới hạn hàm số' },
      },
    ]);
    mockedPrisma.concept.findMany
      .mockResolvedValueOnce([
        { id: CONCEPT_A, name: 'Stack', masteryScore: 0.01 },
        { id: CONCEPT_B, name: 'Recursion', masteryScore: 0.99 },
      ])
      .mockResolvedValueOnce([{ id: CONCEPT_A, name: 'Stack' }]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.reviewSchedule).toEqual([
      {
        id: 'queue-item-uuid',
        conceptId: 'prereq-uuid',
        name: 'Giới hạn hàm số',
        reason: 'traceback',
        depth: 1,
        sourceConceptId: CONCEPT_A,
        sourceConceptName: 'Stack',
        status: 'pending',
        scheduledFor: TRACEBACK_DUE,
      },
    ]);
  });

  /**
   * #119 Gap 2: the query used to filter `reason: 'traceback'`, which dropped the
   * spaced-repetition schedule I7.2 writes for every finished concept. The three cases below
   * pin the widened read — both reasons, in the queue order the summary screen renders.
   */
  it('reads every review row of the session, not just the traceback ones', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    await getSessionSummary(SESSION_ID, USER_ID);

    expect(mockedPrisma.reviewQueueItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceSessionId: SESSION_ID } })
    );
  });

  it('puts traceback prerequisites ahead of the spaced-repetition schedule, each in its own order', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    // Deliberately shuffled: deep prerequisite, late review, shallow prerequisite, early review.
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([
      reviewRow({ conceptId: 'prereq-deep', name: 'Đệ quy nền', reason: 'traceback', depth: 2 }),
      reviewRow({
        conceptId: CONCEPT_B,
        name: 'Recursion',
        reason: 'spaced_repetition',
        scheduledFor: new Date('2026-08-18T10:00:00.000Z'),
      }),
      reviewRow({
        conceptId: 'prereq-shallow',
        name: 'Giới hạn hàm số',
        reason: 'traceback',
        depth: 1,
      }),
      reviewRow({
        conceptId: CONCEPT_A,
        name: 'Stack',
        reason: 'spaced_repetition',
        scheduledFor: new Date('2026-08-06T10:00:00.000Z'),
      }),
    ]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.reviewSchedule.map((item) => [item.reason, item.name])).toEqual([
      ['traceback', 'Giới hạn hàm số'],
      ['traceback', 'Đệ quy nền'],
      ['spaced_repetition', 'Stack'],
      ['spaced_repetition', 'Recursion'],
    ]);
    // The dates the "Phiên kế tiếp" section counts days from must survive the read.
    expect(result.reviewSchedule.map((item) => item.scheduledFor)).toEqual([
      TRACEBACK_DUE,
      TRACEBACK_DUE,
      new Date('2026-08-06T10:00:00.000Z'),
      new Date('2026-08-18T10:00:00.000Z'),
    ]);
  });

  it('returns the spaced-repetition schedule for a session that triggered no traceback', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([
      reviewRow({
        conceptId: CONCEPT_A,
        name: 'Stack',
        reason: 'spaced_repetition',
        scheduledFor: new Date('2026-08-16T10:00:00.000Z'),
      }),
    ]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    // The whole point of the widening: a student who did well used to get [] here.
    expect(result.reviewSchedule).toEqual([
      {
        id: `item-${CONCEPT_A}`,
        conceptId: CONCEPT_A,
        name: 'Stack',
        reason: 'spaced_repetition',
        depth: null,
        sourceConceptId: null,
        sourceConceptName: null,
        status: 'pending',
        scheduledFor: new Date('2026-08-16T10:00:00.000Z'),
      },
    ]);
  });

  /**
   * #310: the summary screen used to have neither identifier, so it re-fetched the whole
   * `/review-queue` and matched rows back by `conceptId` to find the `itemId` its "Bỏ khỏi lịch"
   * button needs. Both ids now come straight out of the row.
   */
  it('carries each row own id (the itemId a PATCH takes) and its sourceConceptId', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([
      reviewRow({
        id: 'item-prereq',
        conceptId: 'prereq-uuid',
        name: 'Giới hạn hàm số',
        reason: 'traceback',
        depth: 1,
        sourceConceptId: CONCEPT_A,
      }),
      reviewRow({ conceptId: CONCEPT_B, name: 'Recursion', reason: 'spaced_repetition' }),
    ]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.reviewSchedule.map((item) => [item.id, item.conceptId])).toEqual([
      ['item-prereq', 'prereq-uuid'],
      [`item-${CONCEPT_B}`, CONCEPT_B],
    ]);
    // Grouping the traceback block by this id (not by the name) is what survives a name collision.
    expect(result.reviewSchedule.map((item) => item.sourceConceptId)).toEqual([CONCEPT_A, null]);
  });

  /**
   * The two source fields are independent: the id is the row's own column and survives, while the
   * name is a soft-reference lookup that comes back empty once the source concept is deleted.
   */
  it('keeps sourceConceptId when the source concept it points at is gone', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([
      reviewRow({
        conceptId: 'prereq-uuid',
        name: 'Giới hạn hàm số',
        reason: 'traceback',
        depth: 1,
        sourceConceptId: 'deleted-concept-uuid',
      }),
    ]);
    // Second call is the batched source lookup: the concept no longer exists.
    mockedPrisma.concept.findMany
      .mockResolvedValueOnce([
        { id: CONCEPT_A, name: 'Stack', masteryScore: 0.85 },
        { id: CONCEPT_B, name: 'Recursion', masteryScore: 0.4 },
      ])
      .mockResolvedValueOnce([]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.reviewSchedule[0]).toMatchObject({
      sourceConceptId: 'deleted-concept-uuid',
      sourceConceptName: null,
    });
  });

  it('returns an empty schedule when the session queued nothing at all', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.reviewQueueItem.findMany.mockResolvedValue([]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.reviewSchedule).toEqual([]);
    // No source-concept lookup to make, so only loadConceptSummaries' own query ran.
    expect(mockedPrisma.concept.findMany).toHaveBeenCalledTimes(1);
  });

  it('reports durationMinutes as 0 for the defensive case of a missing endedAt', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ endedAt: null }));
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.durationMinutes).toBe(0);
  });

  it('still returns the AI result when the cache write fails (best-effort, R01 quota)', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'Great work.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Practice more.'],
    });
    mockedPrisma.interviewSession.update.mockRejectedValue(new Error('DB connection lost'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.summary).toEqual({
      text: 'Great work.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Practice more.'],
      generatedByAi: true,
      message: null,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[session-summary] failed to cache summary to DB:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  /**
   * masteryScore staleness bug (Sprint 5, DB-03 prep): loadConceptSummaries used to return
   * Concept.masteryScore — the concept's *live* score — instead of deriving it from this
   * session's own turns. The cases below pin the fix.
   */
  describe("masteryScore is derived from this session's own turns", () => {
    /**
     * #392 (c) end-to-end through `/summary`: a hint turn is graded, is still listed, and is
     * still LEFT OUT of the number. Both halves matter — a fix that hid the turn entirely would
     * also produce the right score while destroying the thing the screen exists for (showing a
     * student how their score was reached).
     *
     * `countsTowardMastery` ships as its own field rather than being re-derived from `mode` in
     * the client: two copies of the scoring rule in two languages is exactly the drift #430's
     * review warned about.
     */
    it('🔴 leaves a hint turn out of the score but keeps it in the list, flagged (#392 (c))', async () => {
      mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));
      mockedPrisma.interviewTurn.findMany.mockResolvedValue([
        { conceptId: CONCEPT_A, turnIndex: 1, score: 0.4, verdict: 'wrong', mode: 'initial' },
        { conceptId: CONCEPT_A, turnIndex: 2, score: 1.0, verdict: 'deep', mode: 'hint' },
      ]);

      const result = await getSessionSummary(SESSION_ID, USER_ID);

      // Một lượt được tính ⇒ trọng số chuẩn hoá về [1.0] ⇒ đúng điểm của lượt đó.
      expect(result.concepts[0]?.masteryScore).toBe(0.4);
      // Con số của bản KHÔNG lọc, để assertion trên phân biệt được hai bản: 0.4×0.4 + 1.0×0.6.
      expect(result.concepts[0]?.masteryScore).not.toBe(0.76);

      // Vẫn hiện đủ hai lượt — và nói rõ lượt nào không vào công thức.
      expect(result.concepts[0]?.turns).toEqual([
        { turnIndex: 1, score: 0.4, verdict: 'wrong', mode: 'initial', countsTowardMastery: true },
        { turnIndex: 2, score: 1.0, verdict: 'deep', mode: 'hint', countsTowardMastery: false },
      ]);
    });

    it("weights this session's 3 graded turns [0.2, 0.3, 0.5]", async () => {
      mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));
      mockedPrisma.interviewTurn.findMany.mockResolvedValue([
        { conceptId: CONCEPT_A, turnIndex: 1, score: 1.0, verdict: 'deep', mode: null },
        { conceptId: CONCEPT_A, turnIndex: 2, score: 0.5, verdict: 'shallow', mode: null },
        { conceptId: CONCEPT_A, turnIndex: 3, score: 0.0, verdict: 'wrong', mode: null },
      ]);
      mockedSummarizeSession.mockResolvedValue({
        summary_text: 'ok',
        strengths: [],
        weaknesses: [],
        recommendations: [],
      });

      const result = await getSessionSummary(SESSION_ID, USER_ID);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0]?.masteryScore).toBe(0.35);
    });

    it('renormalises to [0.4, 0.6] for a session with 2 graded turns', async () => {
      mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));
      mockedPrisma.interviewTurn.findMany.mockResolvedValue([
        { conceptId: CONCEPT_A, turnIndex: 1, score: 1.0, verdict: 'deep', mode: null },
        { conceptId: CONCEPT_A, turnIndex: 2, score: 0.0, verdict: 'wrong', mode: null },
      ]);
      mockedSummarizeSession.mockResolvedValue({
        summary_text: 'ok',
        strengths: [],
        weaknesses: [],
        recommendations: [],
      });

      const result = await getSessionSummary(SESSION_ID, USER_ID);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0]?.masteryScore).toBe(0.4);
    });

    it('returns null, not the live Concept score, when this session graded 0 turns', async () => {
      mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));
      mockedPrisma.interviewTurn.findMany.mockResolvedValue([
        { conceptId: CONCEPT_A, turnIndex: 1, score: null, verdict: null, mode: null },
      ]);
      mockedSummarizeSession.mockResolvedValue({
        summary_text: 'ok',
        strengths: [],
        weaknesses: [],
        recommendations: [],
      });

      const result = await getSessionSummary(SESSION_ID, USER_ID);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0]?.masteryScore).toBeNull();
    });

    it("still reports this session's own score after the concept was re-tested in a later session (bug regression)", async () => {
      mockedLoadSession.mockResolvedValue(baseSession({ conceptQueue: [CONCEPT_A] }));
      // Concept.masteryScore already belongs to a session AFTER the one being viewed here.
      mockedPrisma.concept.findMany.mockResolvedValue([
        { id: CONCEPT_A, name: 'Stack', masteryScore: 0.95 },
      ]);
      // This session's own turn scored much lower.
      mockedPrisma.interviewTurn.findMany.mockResolvedValue([
        { conceptId: CONCEPT_A, turnIndex: 1, score: 0.3, verdict: 'wrong', mode: null },
      ]);
      mockedSummarizeSession.mockResolvedValue({
        summary_text: 'ok',
        strengths: [],
        weaknesses: [],
        recommendations: [],
      });

      const result = await getSessionSummary(SESSION_ID, USER_ID);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0]?.masteryScore).toBe(0.3);
    });
  });
});
