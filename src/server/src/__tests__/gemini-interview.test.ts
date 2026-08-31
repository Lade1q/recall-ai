const mockCreate = jest.fn();
const mockUpload = jest.fn();
const mockGet = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: { create: mockCreate },
    files: { upload: mockUpload, get: mockGet },
  })),
}));

import {
  generateQuestion,
  gradeAnswer,
  summarizeSession,
  uploadFile,
  GEMINI_TIMEOUT_MS,
  AiMaterial,
} from '../services/gemini.service';
import { AppError } from '../middleware/errorHandler';

/**
 * Covers the parts of I6.2 (#114) that a live Gemini call cannot demonstrate on demand:
 * the retry budget, the AI_BAD_FORMAT / AI_UNAVAILABLE mapping (AE-02 exception flows
 * E2 and E3), verdict reconciliation, and the USE_MOCK_AI short-circuit.
 */
const MATERIAL: AiMaterial = { kind: 'text', text: 'A stack is a LIFO structure.' };

const QUESTION_PARAMS = {
  conceptName: 'Stack',
  material: MATERIAL,
  turnIndex: 1,
  mode: 'initial' as const,
};

const GRADE_PARAMS = {
  conceptName: 'Stack',
  material: MATERIAL,
  questionText: 'What is a stack?',
  answerText: 'Last in, first out.',
};

const okQuestion = { question_text: 'What is a stack?', question_type: 'recall' };

const okExtract = {
  concepts: [{ name: 'Stack', difficulty: 1 }],
  edges: [],
  language_detected: 'en',
};

function reply(payload: unknown) {
  return { output_text: JSON.stringify(payload) };
}

/** Sets an env var, or deletes it when `value` is undefined — `= undefined` stringifies. */
function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('AI Examiner Gemini calls', () => {
  const originalMockFlag = process.env.USE_MOCK_AI;

  beforeEach(() => {
    mockCreate.mockReset();
    mockUpload.mockReset();
    mockGet.mockReset();
    process.env.USE_MOCK_AI = 'false';
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalMockFlag;
  });

  describe('generateQuestion', () => {
    it('returns the validated question on the first try', async () => {
      mockCreate.mockResolvedValueOnce(reply(okQuestion));

      await expect(generateQuestion(QUESTION_PARAMS)).resolves.toEqual(okQuestion);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('retries once when the first response is malformed JSON', async () => {
      mockCreate
        .mockResolvedValueOnce({ output_text: 'not json at all' })
        .mockResolvedValueOnce(reply(okQuestion));

      await expect(generateQuestion(QUESTION_PARAMS)).resolves.toEqual(okQuestion);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('gives up with AI_BAD_FORMAT after the retry also fails schema validation', async () => {
      mockCreate.mockResolvedValue(reply({ question_text: '', question_type: 'nonsense' }));

      await expect(generateQuestion(QUESTION_PARAMS)).rejects.toMatchObject({
        code: 'AI_BAD_FORMAT',
        statusCode: 502,
      });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('treats an empty response as a format failure', async () => {
      mockCreate.mockResolvedValue({ output_text: '' });

      await expect(generateQuestion(QUESTION_PARAMS)).rejects.toBeInstanceOf(AppError);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('reports a transport failure as AI_UNAVAILABLE, not AI_BAD_FORMAT', async () => {
      mockCreate.mockRejectedValue(new Error('socket hang up'));

      await expect(generateQuestion(QUESTION_PARAMS)).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
      });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('times out instead of hanging forever, and reports it as AI_UNAVAILABLE', async () => {
      jest.useFakeTimers();
      try {
        mockCreate.mockImplementation(() => new Promise(() => {})); // never resolves

        // Attach the rejection assertion before advancing timers, so the eventual reject
        // always has a handler already in place (an attach-after-reject window here would
        // surface as a Node unhandledRejection and fail the test even though this passes).
        const pending = expect(generateQuestion(QUESTION_PARAMS)).rejects.toMatchObject({
          code: 'AI_UNAVAILABLE',
        });
        // 2 attempts, each bounded by GEMINI_TIMEOUT_MS — advance past both.
        await jest.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS * 2);
        await pending;

        expect(mockCreate).toHaveBeenCalledTimes(2);
      } finally {
        // In a `finally` so a failed assertion above can't leak fake timers into later tests.
        jest.useRealTimers();
      }
    });

    it('passes the concept and mode steer in the prompt without asking the AI to route (C4)', async () => {
      mockCreate.mockResolvedValueOnce(reply(okQuestion));

      await generateQuestion({ ...QUESTION_PARAMS, mode: 'probe', conceptName: 'Recursion' });

      const { input, system_instruction } = mockCreate.mock.calls[0][0];
      expect(input).toContain('Recursion');
      expect(input).toContain('superficially');
      expect(system_instruction).toContain('Do not decide whether the interview should continue');
    });

    it('includes earlier turns so a deeper question can build on them', async () => {
      mockCreate.mockResolvedValueOnce(reply(okQuestion));

      await generateQuestion({
        ...QUESTION_PARAMS,
        turnIndex: 2,
        mode: 'deeper',
        previousTurns: [{ questionText: 'What is a stack?', answerText: 'LIFO', verdict: 'deep' }],
      });

      expect(mockCreate.mock.calls[0][0].input).toContain('LIFO');
    });

    /**
     * #392 phương án B: a `wrong` answer with turns left asks a `hint` question — narrower, not a
     * different question, and never carrying the answer.
     */
    it("narrows the same question on 'hint' mode, without revealing the answer (#392)", async () => {
      mockCreate.mockResolvedValueOnce(reply(okQuestion));

      await generateQuestion({
        ...QUESTION_PARAMS,
        turnIndex: 2,
        mode: 'hint',
        previousTurns: [
          { questionText: 'What is a stack?', answerText: 'A queue, FIFO', verdict: 'wrong' },
        ],
      });

      const { input } = mockCreate.mock.calls[0][0];
      expect(input).toContain('The student answered the most recent question incorrectly');
      expect(input).toContain('Narrow THAT SAME question');
      expect(input).toContain('Do NOT reveal or imply the answer');
      // The clause that actually distinguishes `hint` from `probe` (#392 review, item ②): without
      // it, narrowing a question and asking a follow-up about a *different* aspect of the concept
      // would both satisfy "Narrow THAT SAME question" loosely read.
      expect(input).toContain('do NOT ask a new question about a different aspect');
      expect(input).toContain('FIFO');
    });

    it('short-circuits to the mock without calling Gemini', async () => {
      process.env.USE_MOCK_AI = 'true';

      const result = await generateQuestion(QUESTION_PARAMS);

      expect(result.question_text).toContain('Stack');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    /**
     * #392 review item ②: `mock-ai.ts`'s `hint` branch could silently copy `deeper`'s question
     * text/type and this suite would stay green, since nothing pinned the two apart. A developer
     * on `USE_MOCK_AI=true` narrowing a `wrong` answer would then see a "go deeper" question
     * instead of a narrowed one — the opposite of what #392 promises.
     */
    it('mocks a distinct hint question, not a copy of deeper (#392)', async () => {
      process.env.USE_MOCK_AI = 'true';

      const hint = await generateQuestion({ ...QUESTION_PARAMS, mode: 'hint' });
      const deeper = await generateQuestion({ ...QUESTION_PARAMS, mode: 'deeper' });

      expect(hint.question_text).not.toBe(deeper.question_text);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('gradeAnswer', () => {
    /**
     * The PROMPT half of the index contract (#346). The resolver half is covered thickly in
     * `grade-evidence.test.ts`, but the numbering written into the prompt is what those indices
     * are resolved AGAINST — and its failure mode is silent: renumber or reorder here and every
     * index still lands inside `1..N`, every row still looks valid, and no counter moves. The
     * mismatch is undetectable after the fact, so it has to be pinned here or nowhere.
     */
    it('numbers the checkpoints 1-based, in the order given, without sorting them', async () => {
      mockCreate.mockResolvedValueOnce(
        reply({ score: 0.5, feedback: 'ok', verdict: 'shallow', evidence: [] })
      );

      // Deliberately in no natural order: alphabetical, length or any other sort would reorder
      // these, and the assertion below is what makes that reordering fail loudly.
      await gradeAnswer({
        ...GRADE_PARAMS,
        checkpoints: [{ text: 'zeta comes first' }, { text: 'alpha is second' }, { text: 'mu' }],
      });

      const { input } = mockCreate.mock.calls[0][0];
      expect(input).toContain('1. zeta comes first\n2. alpha is second\n3. mu');
    });

    it('asks for an empty evidence list when the concept has no checkpoints (C = 0)', async () => {
      mockCreate.mockResolvedValueOnce(
        reply({ score: 0.5, feedback: 'ok', verdict: 'shallow', evidence: [] })
      );

      await gradeAnswer({ ...GRADE_PARAMS, checkpoints: [] });

      const { input } = mockCreate.mock.calls[0][0];
      expect(input).toContain('no checkpoints');
      expect(input).not.toMatch(/^1\. /m);
    });

    it('still asks for the verbatim quote and the number, not a title or an id', async () => {
      mockCreate.mockResolvedValueOnce(
        reply({ score: 0.5, feedback: 'ok', verdict: 'shallow', evidence: [] })
      );

      await gradeAnswer({ ...GRADE_PARAMS, checkpoints: [{ text: 'one thing' }] });

      const { system_instruction } = mockCreate.mock.calls[0][0];
      expect(system_instruction).toContain('WORD FOR WORD');
      expect(system_instruction).toContain('Never a title, never an id');
    });

    it('includes earlier turns so a second/third grade is not blind to the first answer (#391)', async () => {
      mockCreate.mockResolvedValueOnce(
        reply({ score: 0.5, feedback: 'ok', verdict: 'shallow', evidence: [] })
      );

      await gradeAnswer({
        ...GRADE_PARAMS,
        previousTurns: [{ questionText: 'What is a stack?', answerText: 'LIFO', verdict: 'deep' }],
      });

      expect(mockCreate.mock.calls[0][0].input).toContain('LIFO');
    });

    it('returns score, feedback and verdict when they already agree', async () => {
      mockCreate.mockResolvedValueOnce(reply({ score: 0.9, feedback: 'Good.', verdict: 'deep' }));

      await expect(gradeAnswer(GRADE_PARAMS)).resolves.toEqual({
        score: 0.9,
        feedback: 'Good.',
        verdict: 'deep',
      });
    });

    it('overrides a verdict that contradicts the score, keeping the score', async () => {
      mockCreate.mockResolvedValueOnce(reply({ score: 0.3, feedback: 'Hmm.', verdict: 'deep' }));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await gradeAnswer(GRADE_PARAMS);

      expect(result).toEqual({ score: 0.3, feedback: 'Hmm.', verdict: 'wrong' });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('rejects an out-of-range score rather than passing it downstream', async () => {
      mockCreate.mockResolvedValue(reply({ score: 4.2, feedback: 'Good.', verdict: 'deep' }));

      await expect(gradeAnswer(GRADE_PARAMS)).rejects.toMatchObject({ code: 'AI_BAD_FORMAT' });
    });

    it('short-circuits to the mock without calling Gemini', async () => {
      process.env.USE_MOCK_AI = 'true';

      await expect(gradeAnswer(GRADE_PARAMS)).resolves.toMatchObject({ verdict: 'wrong' });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    // The mock grades by answer length so a developer on USE_MOCK_AI=true can still reach
    // every branch of the I6.3 state machine. All three verdicts must stay reachable.
    it('reaches all three verdicts in mock mode', async () => {
      process.env.USE_MOCK_AI = 'true';

      const verdicts = await Promise.all(
        ['too short', 'a'.repeat(50), 'a'.repeat(200)].map(
          async (answerText) => (await gradeAnswer({ ...GRADE_PARAMS, answerText })).verdict
        )
      );

      expect(verdicts).toEqual(['wrong', 'shallow', 'deep']);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('summarizeSession', () => {
    const okSummary = {
      summary_text: 'Solid session overall.',
      strengths: ['Stack'],
      weaknesses: ['Recursion'],
      recommendations: ['Review recursion base cases.'],
    };
    const CONCEPTS = [
      { conceptName: 'Stack', masteryScore: 0.85, verdicts: ['deep' as const] },
      { conceptName: 'Recursion', masteryScore: 0.4, verdicts: ['wrong' as const] },
    ];

    it('returns the validated report on the first try', async () => {
      mockCreate.mockResolvedValueOnce(reply(okSummary));

      await expect(summarizeSession({ concepts: CONCEPTS })).resolves.toEqual(okSummary);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('never sends the source material — only concept names, scores and verdicts', async () => {
      mockCreate.mockResolvedValueOnce(reply(okSummary));

      await summarizeSession({ concepts: CONCEPTS });

      const { input } = mockCreate.mock.calls[0][0];
      expect(typeof input).toBe('string');
      expect(input).toContain('Stack');
      expect(input).toContain('Recursion');
      expect(input).toContain('deep');
      expect(input).toContain('wrong');
    });

    it('reports a transport failure as AI_UNAVAILABLE (UC-14 E1 trigger)', async () => {
      mockCreate.mockRejectedValue(new Error('socket hang up'));

      await expect(summarizeSession({ concepts: CONCEPTS })).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
        statusCode: 502,
      });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('gives up with AI_BAD_FORMAT after the retry also fails schema validation', async () => {
      mockCreate.mockResolvedValue(reply({ summary_text: '', strengths: [], weaknesses: [] }));

      await expect(summarizeSession({ concepts: CONCEPTS })).rejects.toMatchObject({
        code: 'AI_BAD_FORMAT',
      });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('short-circuits to the mock without calling Gemini', async () => {
      process.env.USE_MOCK_AI = 'true';

      const result = await summarizeSession({ concepts: CONCEPTS });

      expect(result.strengths).toEqual(['Stack']);
      expect(result.weaknesses).toEqual(['Recursion']);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // The interview file path (loadMaterial → uploadFile) is gated by `isAiFailure`, which only
  // recognises AppErrors coded `AI_*`. This proves a hung upload surfaces as such an error, so a
  // Gemini File API hang on the first turn of a PDF/image plan degrades to the AE-05 flashcard
  // fallback instead of a bare 500 — the interview counterpart of the callStructured case above.
  describe('uploadFile', () => {
    it('bounds a hung upload and surfaces it as an AI_TIMEOUT error (degrades to AE-05)', async () => {
      jest.useFakeTimers();
      try {
        mockUpload.mockImplementation(() => new Promise(() => {})); // never resolves

        // Attach before advancing so the eventual reject always has a handler in place.
        const pending = expect(
          uploadFile('/tmp/material.pdf', 'application/pdf')
        ).rejects.toMatchObject({ code: 'AI_TIMEOUT', statusCode: 504 });
        await jest.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS + 1);
        await pending;

        expect(mockUpload).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // Both model IDs are read once at module load, so the fallback is only ever exercised by an
  // env that never set them — production, not the dev .env which pins both. A retired ID there
  // makes every call fail HTTP 404 rather than degrade, and the two defaults drifted apart once
  // already (extract kept the original pinned `gemini-2.5-flash`, since retired). So pin the
  // rule the README states — a rolling `-latest` alias, shared by both calls — not a literal.
  describe('model defaults', () => {
    const ORIGINAL_EXTRACT = process.env.GEMINI_MODEL_EXTRACT;
    const ORIGINAL_INTERVIEW = process.env.GEMINI_MODEL_INTERVIEW;

    afterEach(() => {
      restoreEnv('GEMINI_MODEL_EXTRACT', ORIGINAL_EXTRACT);
      restoreEnv('GEMINI_MODEL_INTERVIEW', ORIGINAL_INTERVIEW);
    });

    /** Re-imports the service with both model vars forced to `value` (unset when undefined). */
    async function loadServiceWithModelEnv(value: string | undefined) {
      restoreEnv('GEMINI_MODEL_EXTRACT', value);
      restoreEnv('GEMINI_MODEL_INTERVIEW', value);

      let service!: typeof import('../services/gemini.service');
      await jest.isolateModulesAsync(async () => {
        service = await import('../services/gemini.service');
      });
      return service;
    }

    /** The model each call actually sent, read off the SDK spy. */
    async function modelsSentBy(service: typeof import('../services/gemini.service')) {
      mockCreate.mockResolvedValue(reply(okExtract));
      await service.extractConcepts(MATERIAL);
      mockCreate.mockResolvedValue(reply(okQuestion));
      await service.generateQuestion(QUESTION_PARAMS);

      const [extract, interview] = mockCreate.mock.calls.map((call) => call[0].model);
      return { extract, interview };
    }

    it('falls back to one rolling -latest alias for both calls when neither var is set', async () => {
      const { extract, interview } = await modelsSentBy(await loadServiceWithModelEnv(undefined));

      expect(extract).toMatch(/-latest$/);
      expect(interview).toBe(extract);
    });

    it('treats a blank env value as unset instead of sending an empty model', async () => {
      const { extract, interview } = await modelsSentBy(await loadServiceWithModelEnv('   '));

      expect(extract).toMatch(/-latest$/);
      expect(interview).toBe(extract);
    });

    it('still honours an explicit override', async () => {
      const { extract, interview } = await modelsSentBy(
        await loadServiceWithModelEnv('gemini-3.5-flash')
      );

      expect(extract).toBe('gemini-3.5-flash');
      expect(interview).toBe('gemini-3.5-flash');
    });
  });
});
