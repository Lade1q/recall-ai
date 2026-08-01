import { AiExtractResponse } from '../schemas/ai-extract.schema';
import type {
  GenerateQuestionResponse,
  GradeAnswerResponse,
  QuestionMode,
} from '../schemas/ai-interview.schema';

// Fixed sample DAG (Variable -> Loop -> Array -> {Sorting, Recursion}) used when
// USE_MOCK_AI=true, so frontend/backend dev and demos don't consume Gemini quota.
export const MOCK_EXTRACT_RESULT: AiExtractResponse = {
  concepts: [
    // prettier-ignore
    { name: 'Variable', difficulty: 1, description: 'Basic variables and data types', source_page: 1, source_excerpt: 'A variable is a named location in memory that holds a value of a given type.' },
    // prettier-ignore
    { name: 'Loop', difficulty: 2, description: 'for/while loops', source_page: 3, source_excerpt: 'A loop repeatedly executes a block of statements while a condition holds.' },
    // prettier-ignore
    { name: 'Array', difficulty: 2, description: 'Arrays and indexing', source_page: 5, source_excerpt: 'An array stores a fixed-size sequence of elements accessed by a zero-based index.' },
    // prettier-ignore
    { name: 'Recursion', difficulty: 4, description: 'Functions that call themselves', source_page: 9, source_excerpt: 'A recursive function solves a problem by calling itself on a smaller subproblem.' },
    // prettier-ignore
    { name: 'Sorting', difficulty: 3, description: 'Sorting algorithms', source_page: 7, source_excerpt: 'Sorting arranges the elements of a collection into a defined order.' },
  ],
  edges: [
    { from: 'Variable', to: 'Loop' },
    { from: 'Loop', to: 'Array' },
    { from: 'Array', to: 'Sorting' },
    { from: 'Array', to: 'Recursion' },
  ],
  language_detected: 'en',
};

// --- AI Examiner mocks (I6.2 / #114) ---------------------------------------------
// USE_MOCK_AI=true must exercise the whole interview flow without spending quota, so
// these mirror the real return shapes exactly. Both are pure functions of their input:
// same input, same output, no clock and no randomness, so I6.3's state machine can be
// tested against them.

const MOCK_QUESTION_BY_MODE: Record<QuestionMode, (conceptName: string) => string> = {
  initial: (c) => `What is ${c}, and what problem does it solve?`,
  deeper: (c) => `Why does ${c} work the way it does? Explain the mechanism behind it.`,
  probe: (c) => `You mentioned ${c} only in passing — can you make that concrete?`,
};

const MOCK_QUESTION_TYPE_BY_MODE: Record<QuestionMode, GenerateQuestionResponse['question_type']> =
  {
    initial: 'recall',
    deeper: 'why',
    probe: 'application',
  };

/** Fixed sample question, varied by mode so the three prompt branches stay distinguishable. */
export function mockGenerateQuestion(
  conceptName: string,
  mode: QuestionMode
): GenerateQuestionResponse {
  return {
    question_text: MOCK_QUESTION_BY_MODE[mode](conceptName),
    question_type: MOCK_QUESTION_TYPE_BY_MODE[mode],
  };
}

// Answer length is a crude stand-in for answer quality. It is not a grading heuristic we
// believe in — it exists so a developer running on mocks can still reach all three
// verdicts (deep / shallow / wrong) and see every branch of the I6.3 state machine.
const MOCK_SHALLOW_MIN_CHARS = 20;
const MOCK_DEEP_MIN_CHARS = 120;

/** Fixed sample grade, derived from answer length so all three verdicts are reachable. */
export function mockGradeAnswer(answerText: string): GradeAnswerResponse {
  const length = answerText.trim().length;

  if (length >= MOCK_DEEP_MIN_CHARS) {
    return {
      score: 0.85,
      feedback: '[mock] Solid answer — you explained the mechanism, not just the definition.',
      verdict: 'deep',
    };
  }
  if (length >= MOCK_SHALLOW_MIN_CHARS) {
    return {
      score: 0.55,
      feedback: '[mock] You restated the definition. Try explaining why it behaves that way.',
      verdict: 'shallow',
    };
  }
  return {
    score: 0.15,
    feedback: '[mock] That does not answer the question — revisit this concept in the material.',
    verdict: 'wrong',
  };
}
