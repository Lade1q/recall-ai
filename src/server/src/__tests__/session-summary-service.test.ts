import { getSessionSummary } from '../services/session-summary.service';
import prisma from '../config/prisma';
import { loadSession } from '../services/interview.service';
import { summarizeSession } from '../services/gemini.service';
import { AppError } from '../middleware/errorHandler';

/**
 * AE-09 (I6.5) — `getSessionSummary()` against mocked Prisma / Gemini / `interview.service`.
 * `interview.service.ts` is a 900-line module with its own heavy dependency tree — mocked down
 * to the two functions this file actually reuses from it (`loadSession`, `parseConceptQueue`),
 * same DRY-reuse pattern as `question-cache.service.ts` reusing `loadMaterial`.
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
  parseConceptQueue: jest.fn((value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  ),
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

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    planId: 'plan-uuid',
    status: 'completed',
    conceptQueue: [CONCEPT_A, CONCEPT_B],
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

describe('getSessionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: CONCEPT_A, name: 'Stack', masteryScore: 0.85 },
      { id: CONCEPT_B, name: 'Recursion', masteryScore: 0.4 },
    ]);
    mockedPrisma.interviewTurn.findMany.mockResolvedValue([
      { conceptId: CONCEPT_A, turnIndex: 1, score: 0.85, verdict: 'deep' },
      { conceptId: CONCEPT_B, turnIndex: 1, score: 0.4, verdict: 'wrong' },
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

  it('rejects with 409 when the session has not finished yet', async () => {
    mockedLoadSession.mockResolvedValue(baseSession({ status: 'active' }));

    await expect(getSessionSummary(SESSION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SESSION_NOT_COMPLETED',
    });
    expect(mockedSummarizeSession).not.toHaveBeenCalled();
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
        turns: [{ turnIndex: 1, score: 0.85, verdict: 'deep' }],
      },
      {
        conceptId: CONCEPT_B,
        name: 'Recursion',
        masteryScore: 0.4,
        turns: [{ turnIndex: 1, score: 0.4, verdict: 'wrong' }],
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
  });

  it('skips a concept whose row was deleted since (re-analysis) without crashing', async () => {
    mockedLoadSession.mockResolvedValue(baseSession());
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: CONCEPT_A, name: 'Stack', masteryScore: 0.85 },
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
        conceptId: 'prereq-uuid',
        depth: 1,
        status: 'pending',
        sourceConceptId: CONCEPT_A,
        concept: { name: 'Giới hạn hàm số' },
      },
    ]);
    mockedPrisma.concept.findMany
      .mockResolvedValueOnce([
        { id: CONCEPT_A, name: 'Stack', masteryScore: 0.85 },
        { id: CONCEPT_B, name: 'Recursion', masteryScore: 0.4 },
      ])
      .mockResolvedValueOnce([{ id: CONCEPT_A, name: 'Stack' }]);
    mockedSummarizeSession.mockResolvedValue({
      summary_text: 'ok',
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });

    const result = await getSessionSummary(SESSION_ID, USER_ID);

    expect(result.traceback).toEqual([
      {
        conceptId: 'prereq-uuid',
        name: 'Giới hạn hàm số',
        reason: 'traceback',
        depth: 1,
        sourceConceptName: 'Stack',
        status: 'pending',
      },
    ]);
    expect(mockedPrisma.reviewQueueItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceSessionId: SESSION_ID, reason: 'traceback' } })
    );
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
});
