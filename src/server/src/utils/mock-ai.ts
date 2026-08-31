import { AiExtractResponse } from '../schemas/ai-extract.schema';
import type {
  GenerateQuestionResponse,
  GradeAnswerResponse,
  SummarizeSessionResponse,
  QuestionMode,
} from '../schemas/ai-interview.schema';

// Fixed sample DAG (Variable -> Loop -> Array -> {Sorting, Recursion}) used when
// USE_MOCK_AI=true, so frontend/backend dev and demos don't consume Gemini quota.
//
// `checkpoints` (#329) follows the same rule the real prompt asks for: the harder concept gets
// more lines rather than a weight, so Recursion carries four where Variable carries two — which
// also makes the mock exercise a range of `C` for the coverage formula.
export const MOCK_EXTRACT_RESULT: AiExtractResponse = {
  concepts: [
    {
      name: 'Variable',
      difficulty: 1,
      description: 'Basic variables and data types',
      source_page: 1,
      source_excerpt:
        'A variable is a named location in memory that holds a value of a given type.',
      checkpoints: [
        'Say what a variable is: a named location in memory holding a value',
        'Explain why a variable has a type and what the type decides',
      ],
    },
    {
      name: 'Loop',
      difficulty: 2,
      description: 'for/while loops',
      source_page: 3,
      source_excerpt: 'A loop repeatedly executes a block of statements while a condition holds.',
      checkpoints: [
        'State that a loop repeats a block while its condition holds',
        'Identify the condition that ends a given loop',
        'Explain what makes a loop run forever',
      ],
    },
    {
      name: 'Array',
      difficulty: 2,
      description: 'Arrays and indexing',
      source_page: 5,
      source_excerpt:
        'An array stores a fixed-size sequence of elements accessed by a zero-based index.',
      checkpoints: [
        'State that an array holds a fixed-size sequence of elements',
        'Give the index of the first and the last element of an array of n elements',
        'Explain what happens when an index falls outside the array',
      ],
    },
    {
      name: 'Recursion',
      difficulty: 4,
      description: 'Functions that call themselves',
      source_page: 9,
      source_excerpt:
        'A recursive function solves a problem by calling itself on a smaller subproblem.',
      checkpoints: [
        'Say that a recursive function calls itself on a smaller subproblem',
        'Name the base case of a given recursive function and say why it is needed',
        'Show that each call moves towards the base case',
        'Explain what happens when the base case is never reached',
      ],
    },
    {
      name: 'Sorting',
      difficulty: 3,
      description: 'Sorting algorithms',
      source_page: 7,
      source_excerpt: 'Sorting arranges the elements of a collection into a defined order.',
      checkpoints: [
        'State that sorting arranges elements into a defined order',
        'Describe the steps of one sorting algorithm from the material',
        'Compare two sorting algorithms on the work they do',
      ],
    },
  ],
  edges: [
    { from: 'Variable', to: 'Loop' },
    { from: 'Loop', to: 'Array' },
    { from: 'Array', to: 'Sorting' },
    { from: 'Array', to: 'Recursion' },
  ],
  language_detected: 'en',
};

export const MOCK_EXTRACT_RESULT_CYCLE: AiExtractResponse = {
  concepts: [
    {
      name: 'Variable',
      difficulty: 1,
      checkpoints: [],
      description: 'Basic variables and data types',
      source_page: 1,
      source_excerpt: 'A variable is a named location.',
    },
    {
      name: 'Loop',
      difficulty: 2,
      checkpoints: [],
      description: 'for/while loops',
      source_page: 3,
      source_excerpt: 'A loop repeatedly executes.',
    },
    {
      name: 'Array',
      difficulty: 2,
      checkpoints: [],
      description: 'Arrays and indexing',
      source_page: 5,
      source_excerpt: 'An array stores elements.',
    },
  ],
  edges: [
    { from: 'Variable', to: 'Loop' },
    { from: 'Loop', to: 'Array' },
    { from: 'Array', to: 'Variable' }, // CYCLE: Array -> Variable -> Loop -> Array
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
  hint: (c) => `Let's narrow that: what is one specific case where ${c} applies?`,
};

const MOCK_QUESTION_TYPE_BY_MODE: Record<QuestionMode, GenerateQuestionResponse['question_type']> =
  {
    initial: 'recall',
    deeper: 'why',
    probe: 'application',
    hint: 'recall',
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

const MOCK_STRONG_THRESHOLD = 0.7;
const MOCK_WEAK_THRESHOLD = 0.6;

/**
 * Fixed sample session summary (I6.5 / AE-09), deterministic from the scores given — same
 * strengths/weaknesses thresholds the real prompt asks Gemini to use, so a developer on mocks
 * sees the same shape of report. Takes only `conceptName`/`masteryScore` (not the full
 * `SessionConceptSummaryInput`, which lives in `gemini.service.ts`) to avoid importing back
 * into the module that already imports this one.
 */
export function mockSummarizeSession(
  concepts: Array<{ conceptName: string; masteryScore: number | null }>
): SummarizeSessionResponse {
  const strengths = concepts
    .filter((c) => (c.masteryScore ?? 0) >= MOCK_STRONG_THRESHOLD)
    .map((c) => c.conceptName);
  const weaknesses = concepts
    .filter((c) => c.masteryScore !== null && c.masteryScore < MOCK_WEAK_THRESHOLD)
    .map((c) => c.conceptName);

  return {
    summary_text: `[mock] Bạn đã hoàn thành phiên với ${concepts.length} khái niệm được đánh giá.`,
    strengths,
    weaknesses,
    recommendations: weaknesses.slice(0, 3).map((name) => `Ôn lại khái niệm "${name}".`),
  };
}
