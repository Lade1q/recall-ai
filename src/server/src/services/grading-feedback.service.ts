import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import type { GradingFeedbackInput } from '../schemas/interview.schema';
import type { GradingFeedbackResponse } from '../types/interview.types';
import { isTurnAppealable, toGradingFeedbackResponse } from '../utils/grading-feedback';

/**
 * AE-10 (#248) — the student disagrees with the score of one graded turn.
 *
 * MVP scope is a LOG. Nothing in this file writes `interview_turns.score` or
 * `concepts.mastery_score`, and nothing calls Gemini: UC-15 puts rubric changes on a person, and
 * C4 fixes the system at four AI calls. The issue is explicit that an AC about the UI is not
 * enough to guarantee that — the guarantee is that no write path to those columns exists here.
 *
 * The gate and the response mapper live in `utils/grading-feedback.ts` so the read path can use
 * them without importing this service.
 */

/**
 * POST /api/v1/interviews/turns/:turnId/feedback.
 *
 * Ownership runs through the session, not the turn: `InterviewTurn` has no `userId` of its own.
 * A turn belonging to someone else is reported as 404, never 403 — the rule from #115, so the
 * endpoint does not leak which turn ids exist.
 *
 * Upsert on `(turnId, userId)`: re-submitting edits the existing row instead of adding a second
 * one ("một lượt một phản hồi").
 */
export async function submitGradingFeedback(
  turnId: string,
  userId: string,
  input: GradingFeedbackInput
): Promise<GradingFeedbackResponse> {
  const turn = await prisma.interviewTurn.findUnique({
    where: { id: turnId },
    select: {
      id: true,
      verdict: true,
      source: true,
      mode: true,
      session: { select: { userId: true } },
    },
  });

  if (!turn || turn.session.userId !== userId) {
    throw new AppError('Interview turn not found', 404, 'NOT_FOUND');
  }

  if (!isTurnAppealable(turn)) {
    throw new AppError(
      'This turn cannot be appealed: it is ungraded, self-graded, or a hint turn',
      409,
      'TURN_NOT_APPEALABLE'
    );
  }

  // `||`, not `??`: Zod's `.trim()` turns a whitespace-only note into `''`, which is NOT nullish,
  // so `??` would store an empty string. This table is read by a PERSON tuning the rubric (UC-15)
  // and `WHERE note IS NOT NULL` must not drag back blank rows — one spelling of "no note".
  const note = input.note || null;
  const reasons = input.reasons as Prisma.InputJsonValue;

  const row = await prisma.gradingFeedback.upsert({
    where: { turnId_userId: { turnId, userId } },
    create: { turnId, userId, reasons, note },
    update: { reasons, note },
    select: { reasons: true, note: true },
  });

  return toGradingFeedbackResponse(row);
}
