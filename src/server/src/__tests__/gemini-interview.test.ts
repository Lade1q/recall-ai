const mockCreate = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: { create: mockCreate },
    files: { upload: jest.fn(), get: jest.fn() },
  })),
}));

import { generateQuestion, gradeAnswer, AiMaterial } from '../services/gemini.service';
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

function reply(payload: unknown) {
  return { output_text: JSON.stringify(payload) };
}

describe('AI Examiner Gemini calls', () => {
  const originalMockFlag = process.env.USE_MOCK_AI;

  beforeEach(() => {
    mockCreate.mockReset();
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

    it('short-circuits to the mock without calling Gemini', async () => {
      process.env.USE_MOCK_AI = 'true';

      const result = await generateQuestion(QUESTION_PARAMS);

      expect(result.question_text).toContain('Stack');
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('gradeAnswer', () => {
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
});
