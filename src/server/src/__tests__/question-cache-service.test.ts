import type { Prisma } from '@prisma/client';
import { pregenerateForPlan, clearQuestionCacheForPlan } from '../services/question-cache.service';
import prisma from '../config/prisma';
import { generateQuestion } from '../services/gemini.service';
import { loadMaterial } from '../services/interview.service';

/**
 * AE-06 (I6.4) — question-cache.service.ts's pregeneration, tested against mocked Prisma /
 * Gemini / material-loading (same manual-mock style as process-analysis-job.test.ts). No real
 * DB, no real Gemini call, no real fs/File-API upload.
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    concept: { findMany: jest.fn() },
    questionCache: { groupBy: jest.fn(), create: jest.fn(), count: jest.fn() },
    studyPlan: { findUnique: jest.fn() },
  },
}));
jest.mock('../services/gemini.service', () => ({
  generateQuestion: jest.fn(),
}));
// interview.service.ts is a 900-line module with its own heavy dependency tree — mocked down to
// the one function question-cache.service.ts actually reuses from it (`loadMaterial`, per the
// plan's DRY decision to share material-loading instead of duplicating it).
jest.mock('../services/interview.service', () => ({
  loadMaterial: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  concept: { findMany: jest.Mock };
  questionCache: { groupBy: jest.Mock; create: jest.Mock; count: jest.Mock };
  studyPlan: { findUnique: jest.Mock };
};
const mockedGenerateQuestion = generateQuestion as jest.Mock;
const mockedLoadMaterial = loadMaterial as jest.Mock;

const PLAN_ID = 'plan-uuid';
const MATERIAL = { kind: 'text', text: '[material]' };

describe('pregenerateForPlan', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true'; // no throttle delay slowing down the test suite
    mockedLoadMaterial.mockResolvedValue(MATERIAL);
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ languageDetected: 'vi' });
    mockedPrisma.questionCache.create.mockResolvedValue({});
    // Default: the re-check before each Gemini call always sees "not at the cap yet" — tests
    // that care about the race-mitigation behavior override this per case.
    mockedPrisma.questionCache.count.mockResolvedValue(0);
    mockedGenerateQuestion.mockImplementation(({ turnIndex }: { turnIndex: number }) =>
      Promise.resolve({ question_text: `Question ${turnIndex}`, question_type: 'recall' })
    );
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  it('does nothing when the plan has no active concepts', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([]);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID, status: 'active' },
      // `primaryDocumentId` rides along: pre-generation grounds each concept in the file it is
      // filed under, so it needs to know which one that is (§4 multi-document plans).
      select: { id: true, name: true, primaryDocumentId: true },
    });
    expect(mockedPrisma.questionCache.groupBy).not.toHaveBeenCalled();
    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
  });

  it('generates up to 2 questions for a concept with none cached', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);

    // `pregenerateForPlan` reuses (and keeps mutating) one `previousTurns` array across both
    // calls, exactly like the real `generateQuestion` reads it — so a call is snapshotted here
    // at the moment it happens, rather than trusting jest's `mock.calls` to hold a stale
    // reference to an array this same test loop goes on to mutate further.
    const seenCalls: Array<Record<string, unknown>> = [];
    mockedGenerateQuestion.mockImplementation(
      (params: { turnIndex: number; previousTurns: unknown[] }) => {
        seenCalls.push({ ...params, previousTurns: [...params.previousTurns] });
        return Promise.resolve({
          question_text: `Question ${params.turnIndex}`,
          question_type: 'recall',
        });
      }
    );

    await pregenerateForPlan(PLAN_ID);

    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(2);
    expect(seenCalls[0]).toMatchObject({
      conceptName: 'Loop',
      turnIndex: 1,
      mode: 'initial',
      previousTurns: [],
      language: 'vi',
    });
    expect(seenCalls[1]).toMatchObject({
      conceptName: 'Loop',
      turnIndex: 2,
      mode: 'initial',
      previousTurns: [{ questionText: 'Question 1' }],
    });
    expect(mockedPrisma.questionCache.create).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.questionCache.create).toHaveBeenCalledWith({
      data: {
        conceptId: 'c1',
        questionText: 'Question 1',
        questionType: 'recall',
        answerHint: null,
      },
    });
  });

  it('generates only the missing question for a concept already at 1 cached', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([
      { conceptId: 'c1', _count: { _all: 1 } },
    ]);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(1);
    expect(mockedGenerateQuestion).toHaveBeenCalledWith(expect.objectContaining({ turnIndex: 2 }));
  });

  it('skips a concept already at the cap — idempotent, no Gemini call spent re-checking it', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([
      { conceptId: 'c1', _count: { _all: 2 } },
    ]);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    // Nothing left to do for any concept, so material isn't even loaded.
    expect(mockedLoadMaterial).not.toHaveBeenCalled();
  });

  it("one concept's Gemini failure does not stop the next concept, and never throws", async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'c1', name: 'Broken' },
      { id: 'c2', name: 'Fine' },
    ]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);
    mockedGenerateQuestion.mockImplementation(
      ({ conceptName, turnIndex }: { conceptName: string; turnIndex: number }) => {
        if (conceptName === 'Broken') return Promise.reject(new Error('AI unavailable'));
        return Promise.resolve({ question_text: `Question ${turnIndex}`, question_type: 'why' });
      }
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(pregenerateForPlan(PLAN_ID)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Broken'), expect.any(Error));
    expect(mockedPrisma.questionCache.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ conceptId: 'c2' }) })
    );
    expect(mockedPrisma.questionCache.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ conceptId: 'c1' }) })
    );

    warnSpy.mockRestore();
  });

  it('resolves without creating any rows when loadMaterial fails (e.g. no source document)', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);
    mockedLoadMaterial.mockRejectedValue(new Error('NO_MATERIAL'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(pregenerateForPlan(PLAN_ID)).resolves.toBeUndefined();

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(mockedPrisma.questionCache.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(PLAN_ID), expect.any(Error));

    warnSpy.mockRestore();
  });

  // Regression tests for the race a code review found: two `pregenerateForPlan` runs for the
  // same plan (e.g. two reanalyze requests close together) can both read the same initial
  // count and each generate up to 2 questions, leaving up to 4 cached rows for one concept.
  it('never calls generateQuestion when a concurrent run already filled the cache first', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]); // initial read: nothing cached yet
    // Simulates another pregenerateForPlan run finishing both slots for this concept between
    // the initial groupBy count above and this run reaching its first loop iteration.
    mockedPrisma.questionCache.count.mockResolvedValue(2);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
    expect(mockedPrisma.questionCache.create).not.toHaveBeenCalled();
  });

  it('stops after the first question if a concurrent run fills the cache mid-loop', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);
    // Re-check before turn 1: still 0 cached, proceed. Re-check before turn 2: a concurrent
    // run has since filled both slots, so this run must not spend a second Gemini call.
    mockedPrisma.questionCache.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.questionCache.create).toHaveBeenCalledTimes(1);
  });

  it('every created row has answerHint: null (no hint field in generate_question today)', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);

    await pregenerateForPlan(PLAN_ID);

    for (const call of mockedPrisma.questionCache.create.mock.calls) {
      expect(call[0].data.answerHint).toBeNull();
    }
  });

  it('waits between Gemini calls when a real API is in play (not under USE_MOCK_AI)', async () => {
    jest.useFakeTimers();
    process.env.USE_MOCK_AI = 'false';
    process.env.QUESTION_CACHE_DELAY_MS = '5000';
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: 'c1', name: 'Loop' }]);
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);

    const done = pregenerateForPlan(PLAN_ID);

    // First call fires immediately (no delay before the very first Gemini call of the run) —
    // advancing by 0ms still flushes the microtask chain in front of it (concept lookup,
    // groupBy, material load, plan lookup) without triggering the throttle timer itself.
    await jest.advanceTimersByTimeAsync(0);
    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(1);

    // Second call is gated behind the throttle delay until the timer is advanced.
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(mockedGenerateQuestion).toHaveBeenCalledTimes(2);

    delete process.env.QUESTION_CACHE_DELAY_MS;
    jest.useRealTimers();
  });
});

describe('clearQuestionCacheForPlan', () => {
  it("deletes every cached question belonging to the plan's concepts", async () => {
    const tx = { questionCache: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };

    await clearQuestionCacheForPlan(tx as unknown as Prisma.TransactionClient, PLAN_ID);

    expect(tx.questionCache.deleteMany).toHaveBeenCalledWith({
      where: { concept: { planId: PLAN_ID } },
    });
  });
});

/**
 * §4 / multi-document plans: pre-generation is grounded per TOPIC.
 *
 * A single whole-plan load used to happen once up front. On a plan holding a whole subject that
 * pre-warmed every concept from the plan's first file — so the cached question a student sees
 * when Gemini is down was written about the wrong chapter, with no way to tell.
 */
describe('pregenerateForPlan — material per topic', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true'; // zero throttle delay
    mockedPrisma.questionCache.groupBy.mockResolvedValue([]);
    mockedPrisma.questionCache.count.mockResolvedValue(0);
    mockedPrisma.questionCache.create.mockResolvedValue({});
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ languageDetected: 'vi' });
    mockedGenerateQuestion.mockResolvedValue({
      question_text: 'Nêu định nghĩa?',
      question_type: 'definition',
    });
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  it('loads each concept’s own document', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'c1', name: 'Software Process', primaryDocumentId: 'doc-ln02' },
      { id: 'c2', name: 'Integration testing', primaryDocumentId: 'doc-ln08' },
    ]);
    mockedLoadMaterial.mockResolvedValue(MATERIAL);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedLoadMaterial).toHaveBeenCalledWith(PLAN_ID, 'doc-ln02');
    expect(mockedLoadMaterial).toHaveBeenCalledWith(PLAN_ID, 'doc-ln08');
  });

  it('loads a shared document once, however many concepts sit under it', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', primaryDocumentId: 'doc-ln02' },
      { id: 'c2', name: 'B', primaryDocumentId: 'doc-ln02' },
      { id: 'c3', name: 'C', primaryDocumentId: 'doc-ln02' },
    ]);
    mockedLoadMaterial.mockResolvedValue(MATERIAL);

    await pregenerateForPlan(PLAN_ID);

    expect(mockedLoadMaterial).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 One unreadable file must cost only its own topic. The old whole-plan load returned early,
   * so a single missing chapter left the entire subject with no cached questions — and the cache
   * is precisely the fallback for when the live call is unavailable.
   */
  it('skips only the concepts of a topic whose file cannot be read', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'c1', name: 'Broken topic', primaryDocumentId: 'doc-missing' },
      { id: 'c2', name: 'Healthy topic', primaryDocumentId: 'doc-ok' },
    ]);
    mockedLoadMaterial.mockImplementation((_planId: string, documentId: string | null) =>
      documentId === 'doc-missing' ? Promise.reject(new Error('ENOENT')) : Promise.resolve(MATERIAL)
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await pregenerateForPlan(PLAN_ID);
    } finally {
      warn.mockRestore();
    }

    const askedFor = mockedGenerateQuestion.mock.calls.map((call) => call[0].conceptName);
    expect(askedFor).not.toContain('Broken topic');
    expect(askedFor).toContain('Healthy topic');
  });

  it('warns once per broken document, not once per concept under it', async () => {
    mockedPrisma.concept.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', primaryDocumentId: 'doc-missing' },
      { id: 'c2', name: 'B', primaryDocumentId: 'doc-missing' },
      { id: 'c3', name: 'C', primaryDocumentId: 'doc-missing' },
    ]);
    mockedLoadMaterial.mockRejectedValue(new Error('ENOENT'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let warnings: unknown[][];
    try {
      await pregenerateForPlan(PLAN_ID);
      warnings = warn.mock.calls.filter((call) => String(call[0]).includes('could not load'));
    } finally {
      warn.mockRestore();
    }

    expect(warnings).toHaveLength(1);
    expect(mockedGenerateQuestion).not.toHaveBeenCalled();
  });
});
