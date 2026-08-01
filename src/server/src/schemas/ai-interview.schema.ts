import { z } from 'zod';

/**
 * Response shapes for the two AI Examiner calls (I6.2 / #114).
 *
 * Together with `extract_concepts` (#76) and `summarize_session` (I6.5) these are the
 * only four AI calls the system is allowed to make (UC-Overview.md §5.1). Nothing here
 * decides what happens next in the interview — that routing is deterministic code in
 * I6.3 (constraint C4).
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

// JSON Schemas passed to Gemini's response_format, derived from the Zod schemas above so
// the contract is written once (DRY / Platform Leverage Ladder), same as ai-extract.schema.ts.
export const generateQuestionJsonSchema = z.toJSONSchema(generateQuestionResponseSchema);
export const gradeAnswerJsonSchema = z.toJSONSchema(gradeAnswerResponseSchema);
