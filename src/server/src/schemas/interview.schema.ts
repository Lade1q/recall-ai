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

/**
 * Params for /interviews/turns/:turnId/... — `InterviewTurn.id` is `@db.Uuid`, so a non-UUID
 * would reach Prisma as `P2023` and fall through to a 500. Same guard as
 * `interviewIdParamSchema`, on a different param name.
 */
export const turnIdParamSchema = z.object({
  turnId: z.string().uuid('Turn ID must be a valid UUID'),
});

export type TurnIdParam = z.infer<typeof turnIdParamSchema>;

/**
 * POST /interviews/turns/:turnId/feedback — AE-10 (#248). The student disagrees with the score
 * of one graded turn.
 *
 * `reasons` stays a free string list rather than an enum of the three mockup chips: the table is
 * a log a HUMAN reads when tuning the rubric (UC-15 puts the decision on a person, not the
 * system), and pinning the chip wording into a server-side enum would make every copy change a
 * migration. Length caps, not vocabulary, are what this schema owes.
 *
 * The `refine` is the 400 the issue asks for: reasons and note are each optional, but a body
 * that carries neither has nothing to log. `.trim()` runs first, so a whitespace-only note is
 * empty here — otherwise `"   "` would satisfy the check and store a blank row.
 */
export const gradingFeedbackSchema = z
  .object({
    reasons: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'reasons must not contain empty strings')
          .max(100, 'each reason must be at most 100 characters')
      )
      .max(10, 'reasons must contain at most 10 entries')
      .default([]),
    note: z.string().trim().max(1000, 'note must be at most 1000 characters').optional(),
  })
  .strict()
  .refine((body) => body.reasons.length > 0 || (body.note ?? '').length > 0, {
    message: 'Provide at least one reason or a note',
  });

export type GradingFeedbackInput = z.infer<typeof gradingFeedbackSchema>;

/** GET /interviews (SPEC_DB-03) — limit/offset, same shape as `listFocusSessionsQuerySchema`. */
export const listInterviewsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .positive('limit must be greater than 0')
    .max(50, 'limit must be at most 50')
    .optional(),
  offset: z.coerce
    .number()
    .int('offset must be an integer')
    .min(0, 'offset must not be negative')
    .optional(),
  planId: z.string().uuid('planId must be a valid UUID').optional(),
});

export type ListInterviewsQuery = z.infer<typeof listInterviewsQuerySchema>;
