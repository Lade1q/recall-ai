import { z } from 'zod';
import { MAX_CONCEPTS_PER_SESSION, MAX_TURNS_PER_CONCEPT } from '../utils/interview-state';

/**
 * Request bodies of the Interview API (I6.3 / #115). Validated in the controller before the
 * service is reached, per coding-conventions §4.4.
 */

/**
 * POST /interviews — AE-01. `conceptIds` omitted means "pick for me": the service takes the
 * top-K of the review queue (I7.3).
 *
 * `maxTurnsPerConcept` is capped at `MAX_TURNS_PER_CONCEPT` here *and* re-checked server-side
 * when a turn is created (C6: the limit is enforced on the server, the client is never
 * trusted). The cap is the number of weights the weighted-average mastery formula has — a
 * fourth turn has no weight to be scored with.
 */
export const createInterviewSchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
  conceptIds: z
    .array(z.string().uuid('conceptIds must contain valid UUIDs'))
    .min(1, 'conceptIds must not be empty')
    .max(MAX_CONCEPTS_PER_SESSION, `A session covers at most ${MAX_CONCEPTS_PER_SESSION} concepts`)
    .optional(),
  maxTurnsPerConcept: z.coerce
    .number()
    .int('maxTurnsPerConcept must be an integer')
    .min(1, 'maxTurnsPerConcept must be at least 1')
    .max(MAX_TURNS_PER_CONCEPT, `maxTurnsPerConcept must be at most ${MAX_TURNS_PER_CONCEPT}`)
    .optional(),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

/**
 * POST /interviews/:id/answers — AE-02. One field: what the student typed (or what the browser
 * transcribed, I6.9 — the server sees text either way).
 *
 * Trimmed before the length check so a whitespace-only submit is rejected instead of being
 * sent to `grade_answer`, which would spend a Gemini call to be told it is wrong.
 */
export const submitAnswerSchema = z.object({
  answerText: z
    .string()
    .trim()
    .min(1, 'answerText must not be empty')
    .max(5000, 'answerText is too long'),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

/**
 * POST /interviews/:id/answers in flashcard fallback mode — AE-05. Hard-coded self-grade only;
 * no free-form score is ever accepted (UC-12 step 5).
 *
 * `.strict()` so a body accidentally carrying both `answerText` and `selfGrade` is rejected by
 * Zod with a clear validation error rather than the controller silently picking one field over
 * the other (see the routing in `interview.controller.ts`).
 */
export const submitSelfGradeSchema = z
  .object({
    selfGrade: z.enum(['correct', 'partial', 'wrong'], {
      message: 'selfGrade must be one of: correct, partial, wrong',
    }),
  })
  .strict();

export type SubmitSelfGradeInput = z.infer<typeof submitSelfGradeSchema>;

/**
 * Params dùng chung cho mọi route /interviews/:id — `InterviewSession.id` là `@db.Uuid` trong
 * Prisma nên một `id` không phải UUID sẽ ném `P2023` (chưa được errorHandler map → rớt xuống
 * 500) nếu không chặn ở đây trước khi gọi service. Cùng lớp lỗi #165/#191 đã vá cho /plans và
 * #192 cho /review-queue.
 */
export const interviewIdParamSchema = z.object({
  id: z.string().uuid('Interview ID must be a valid UUID'),
});

export type InterviewIdParam = z.infer<typeof interviewIdParamSchema>;
