import { z } from 'zod';
import { MAX_CHECKPOINTS_PER_CONCEPT } from '../utils/checkpoint';

/**
 * Response shapes for the AI Examiner calls (I6.2 / #114, I6.5 / AE-09).
 *
 * Together with `extract_concepts` (#76) these are the only four AI calls the system is
 * allowed to make (UC-Overview.md §5.1) — `summarize_session` below is the fourth and last.
 * Nothing here decides what happens next in the interview — that routing is deterministic
 * code in I6.3 (constraint C4). `summarize_session` in particular only turns already-computed
 * scores into prose; it never produces or adjusts a `mastery_score` itself.
 */

export const generateQuestionResponseSchema = z.object({
  question_text: z.string().min(1).max(1000),
  question_type: z.enum(['recall', 'application', 'why']),
});

/** Longest quote we ask for. A quote is a span of the student's own answer, not a retelling. */
export const EVIDENCE_QUOTE_MAX_CHARS = 1000;

/**
 * One checkpoint's worth of evidence, as `grade_answer` is ASKED to produce it (#346).
 *
 * `checkpoint` is a 1-based INDEX into the checkpoint list serialised into that same prompt —
 * never an id and never the checkpoint's text. Two reasons, and the first is the deciding one:
 *   - an index is CHECKABLE deterministically (`1 ≤ i ≤ N` is arithmetic), whereas "is this uuid
 *     real?" is not checkable cheaply — and `InterviewEvidence.checkpointId` is deliberately NOT a
 *     foreign key (#330), so an invented uuid WRITES SUCCESSFULLY. The index turns an
 *     undetectable error into an arithmetic one. This is the cost side of the non-FK decision
 *     coming due.
 *   - matching on text would stand up a SECOND normalisation pipeline over model output, on top
 *     of `checkpointKey` — exactly what #330 avoided.
 *
 * ⚠️ The index is only meaningful against the array that was serialised INTO the prompt. Resolving
 * it must read that same array in the same request — see `mapGradeEvidence` (`utils/grade-evidence.ts`),
 * which is where that rule is enforced and explained.
 */
const gradeAnswerEvidenceItemSchema = z.object({
  checkpoint: z.number().int().min(1),
  status: z.enum(['covered', 'contradicted']),
  quote: z.string().min(1).max(EVIDENCE_QUOTE_MAX_CHARS),
});

const gradeAnswerCoreShape = {
  score: z.number().min(0).max(1),
  feedback: z.string().min(1).max(2000),
  verdict: z.enum(['deep', 'shallow', 'wrong']),
};

/**
 * What `grade_answer` is ASKED for. Used for ONE thing: deriving the JSON Schema handed to
 * Gemini's structured output. It is never used to parse a response — see the asymmetry note on
 * `gradeAnswerResponseSchema`.
 *
 * Exported so a test can assert the JSON Schema still declares the full item shape: dropping a
 * field here is behaviour-neutral for every existing test (the response schema would not change),
 * so nothing else would go red.
 */
export const gradeAnswerAskSchema = z.object({
  ...gradeAnswerCoreShape,
  evidence: z.array(gradeAnswerEvidenceItemSchema).max(MAX_CHECKPOINTS_PER_CONCEPT),
});

/**
 * What `grade_answer` is ACCEPTED as — deliberately NOT the schema above, for exactly one field.
 *
 * `evidence` is `unknown` here because `callStructured` treats a Zod failure as `AI_BAD_FORMAT`,
 * which drops the whole response and sends the session into `gradingUnavailable`. A single
 * malformed evidence entry would then cost the student an answer that was graded correctly —
 * evidence is ADDITIVE (#346) and must never be able to take the grade down with it. So the shape
 * is checked per item, downstream, by `mapGradeEvidence`, which counts what it rejects instead of
 * throwing.
 *
 * The strictness lives in the JSON Schema (`gradeAnswerJsonSchema`, derived from
 * `gradeAnswerAskSchema`) — structured output is what actually keeps the model on the rails; the
 * looseness here only stops a deviation from being fatal. Asking strictly and accepting leniently
 * is the point, not an oversight: keep both, and keep them different.
 */
export const gradeAnswerResponseSchema = z.object({
  ...gradeAnswerCoreShape,
  evidence: z.unknown().optional(),
});

export type GenerateQuestionResponse = z.infer<typeof generateQuestionResponseSchema>;
export type GradeAnswerResponse = z.infer<typeof gradeAnswerResponseSchema>;

export type QuestionType = GenerateQuestionResponse['question_type'];
export type Verdict = GradeAnswerResponse['verdict'];

/**
 * How the next question relates to the previous turn. The caller (I6.3) picks the mode;
 * Gemini is never asked whether to continue — that would violate C4.
 *
 * `hint` (#392, phương án B): the answer to the current question was `wrong`, and turns remain —
 * narrow THAT SAME question one notch instead of ending the concept. Distinct from `probe`, which
 * follows a `shallow` (not wrong) answer and stays open-ended about what to press on.
 */
export type QuestionMode = 'initial' | 'deeper' | 'probe' | 'hint';

/**
 * `summarize_session` (I6.5 / AE-09) — the fourth and final AI call. Takes only the scores
 * and verdicts already computed by I6.3/I7.2 and turns them into prose; `strengths`/
 * `weaknesses` are the AI's own read of the same numbers (not recomputed by this app), and
 * `recommendations` is free-text study advice — none of it feeds back into `mastery_score`.
 */
export const summarizeSessionResponseSchema = z.object({
  summary_text: z.string().min(1).max(3000),
  strengths: z.array(z.string()).max(10),
  weaknesses: z.array(z.string()).max(10),
  recommendations: z.array(z.string()).max(10),
});

export type SummarizeSessionResponse = z.infer<typeof summarizeSessionResponseSchema>;

// JSON Schemas passed to Gemini's response_format, derived from the Zod schemas above so
// the contract is written once (DRY / Platform Leverage Ladder), same as ai-extract.schema.ts.
export const generateQuestionJsonSchema = z.toJSONSchema(generateQuestionResponseSchema);
// Derived from the ASK schema, not the response schema: `grade_answer` is the one call where the
// two differ on purpose (#346). See the note on `gradeAnswerResponseSchema`.
export const gradeAnswerJsonSchema = z.toJSONSchema(gradeAnswerAskSchema);
export const summarizeSessionJsonSchema = z.toJSONSchema(summarizeSessionResponseSchema);
