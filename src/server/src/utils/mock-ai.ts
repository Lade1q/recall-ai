import { AiExtractResponse } from '../schemas/ai-extract.schema';
import type {
  GenerateQuestionResponse,
  GradeAnswerResponse,
  SummarizeSessionResponse,
  QuestionMode,
} from '../schemas/ai-interview.schema';

// Sample DAGs used when USE_MOCK_AI=true, so frontend/backend dev and demos don't consume
// Gemini quota.
//
// There are three banks, not one, because a plan can now hold several documents and each is
// extracted by its own call. A single shared constant would give every document the SAME
// concepts, which renders as N topics where N-1 are duplicates and no ordering is visible —
// i.e. the offline fallback would break exactly the two-level graph it exists to demo.
// `mockExtractForFile` picks a bank deterministically from the file key, so the same upload
// always yields the same graph and tests stay reproducible.
//
// `checkpoints` (#329) follows the same rule the real prompt asks for: the harder concept gets
// more lines rather than a weight, so Recursion carries four where Variable carries two — which
// also makes the mock exercise a range of `C` for the coverage formula.
const BANK_PROGRAMMING: AiExtractResponse = {
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
  topic_edges: [],
};

const BANK_PROCESS: AiExtractResponse = {
  concepts: [
    {
      name: 'Software Process',
      difficulty: 1,
      description: 'The structured set of activities that produce a software system',
      source_page: 2,
      source_excerpt:
        'A software process is a structured set of activities required to develop a software system.',
      checkpoints: [
        'Say that a software process is a structured set of development activities',
        'Name two activities every process includes',
      ],
    },
    {
      name: 'Waterfall Model',
      difficulty: 2,
      description: 'A plan-driven process with separate, sequential phases',
      source_page: 8,
      source_excerpt:
        'The waterfall model has separate and distinct phases of specification and development.',
      checkpoints: [
        'List the phases of the waterfall model in order',
        'Explain why a phase must finish before the next one starts',
        'Say which kind of project the model suits',
      ],
    },
    {
      name: 'Incremental Development',
      difficulty: 3,
      description: 'Specification, development and validation interleaved',
      source_page: 14,
      source_excerpt:
        'In incremental development, specification, development and validation are interleaved.',
      checkpoints: [
        'Say what is interleaved in incremental development',
        'Give one advantage over a plan-driven process',
        'Give one situation where it is a poor fit',
      ],
    },
  ],
  edges: [
    { from: 'Software Process', to: 'Waterfall Model' },
    { from: 'Software Process', to: 'Incremental Development' },
  ],
  language_detected: 'en',
  topic_edges: [],
};

const BANK_TESTING: AiExtractResponse = {
  concepts: [
    {
      name: 'Software Testing',
      difficulty: 1,
      description: 'Showing that a program does what it is intended to do',
      source_page: 3,
      source_excerpt:
        'Testing is intended to show that a program does what it is intended to do and to discover defects.',
      checkpoints: ['State the two goals of testing', 'Distinguish a defect from a failure'],
    },
    {
      name: 'Development Testing',
      difficulty: 2,
      description: 'Testing carried out by the team building the system',
      source_page: 9,
      source_excerpt:
        'Development testing includes all testing activities carried out by the team developing the system.',
      checkpoints: [
        'Say who performs development testing',
        'Name the three levels it is usually split into',
        'Explain why it happens before release testing',
      ],
    },
    {
      name: 'Release Testing',
      difficulty: 3,
      description: 'Testing a release intended for use outside the team',
      source_page: 21,
      source_excerpt:
        'Release testing is the process of testing a particular release of a system intended for use outside of the development team.',
      checkpoints: [
        'Say what distinguishes release testing from development testing',
        'Explain who the audience of a release is',
        'Give one thing release testing checks that unit tests cannot',
      ],
    },
  ],
  edges: [
    { from: 'Software Testing', to: 'Development Testing' },
    { from: 'Development Testing', to: 'Release Testing' },
  ],
  language_detected: 'en',
  topic_edges: [],
};

const MOCK_EXTRACT_BANKS = [BANK_PROGRAMMING, BANK_PROCESS, BANK_TESTING] as const;

/**
 * Bank 0, kept as a named export because several tests assert against this exact graph.
 * `mockExtractForFile` is what production code should call.
 */
export const MOCK_EXTRACT_RESULT: AiExtractResponse = BANK_PROGRAMMING;

/**
 * Deterministic bank per document: same input, same graph, every run.
 *
 * PASS `index` WHENEVER THE CALLER KNOWS THE DOCUMENT'S POSITION IN ITS PLAN. Hashing the file
 * key alone does not spread reliably over so few banks: measured on the three CNPM PDFs in the
 * dev database (2026-09-03) their keys hash to banks 1, 1 and 0 — two of the three documents
 * would draw the SAME concepts, which is exactly the failure this table exists to avoid.
 * `index` makes the first `MOCK_EXTRACT_BANKS.length` documents of a plan distinct by
 * construction; beyond that they wrap, which is fine for a demo fallback.
 *
 * The hash is only the single-document fallback, where nothing can collide.
 */
export function mockExtractForFile(fileKey: string, index?: number): AiExtractResponse {
  let slot: number;
  if (index !== undefined) {
    slot =
      ((index % MOCK_EXTRACT_BANKS.length) + MOCK_EXTRACT_BANKS.length) % MOCK_EXTRACT_BANKS.length;
  } else {
    let sum = 0;
    for (let i = 0; i < fileKey.length; i++) sum += fileKey.charCodeAt(i);
    slot = sum % MOCK_EXTRACT_BANKS.length;
  }
  // `slot` is always in range; the fallback is only here because `noUncheckedIndexedAccess`
  // widens every index to `| undefined`.
  return MOCK_EXTRACT_BANKS[slot] ?? BANK_PROGRAMMING;
}

/** How many distinct mock graphs exist — a plan with more documents than this repeats them. */
export const MOCK_EXTRACT_BANK_COUNT = MOCK_EXTRACT_BANKS.length;

/**
 * The topic order phase 2 would return, for `USE_MOCK_AI=true`.
 *
 * Exists because the offline fallback was not actually offline: `runPhaseTwo` called the real
 * `linkTopics` regardless of the flag, so with no API key the call threw, the catch swallowed it,
 * and the plan rendered as N unconnected topics. That looked like "the mock has no topic edges
 * yet" — a missing feature — when it was a live call failing quietly on the offline path.
 *
 * A chain in upload order is the honest answer for a mock: it is the only ordering derivable
 * without reading a single page, and it is what a student implicitly asserts by picking the files
 * in that order. It never invents an order the caller did not already supply.
 *
 * Returns filenames, matching what the real `linkTopics` returns — the caller maps them to ids.
 */
export function mockTopicEdgesForDocuments(
  filenames: readonly string[]
): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  for (let i = 0; i + 1 < filenames.length; i++) {
    const from = filenames[i];
    const to = filenames[i + 1];
    // Two documents uploaded under one name would make a self-loop, which the DAG fixer drops
    // anyway — skipping here keeps the mock from producing an edge it knows is nonsense.
    if (from && to && from !== to) edges.push({ from, to });
  }
  return edges;
}

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
