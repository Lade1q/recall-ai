import { z } from 'zod';

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

export const gradeAnswerResponseSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().min(1).max(2000),
  verdict: z.enum(['deep', 'shallow', 'wrong']),
});

export type GenerateQuestionResponse = z.infer<typeof generateQuestionResponseSchema>;
export type GradeAnswerResponse = z.infer<typeof gradeAnswerResponseSchema>;

export type QuestionType = GenerateQuestionResponse['question_type'];
export type Verdict = GradeAnswerResponse['verdict'];

/**
 * How the next question relates to the previous turn. The caller (I6.3) picks the mode;
 * Gemini is never asked whether to continue — that would violate C4.
 */
export type QuestionMode = 'initial' | 'deeper' | 'probe';

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
export const gradeAnswerJsonSchema = z.toJSONSchema(gradeAnswerResponseSchema);
export const summarizeSessionJsonSchema = z.toJSONSchema(summarizeSessionResponseSchema);
