import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { scheduleConceptReview, type ConceptReviewSchedule } from './concept-schedule.service';
import { calculateMasteryScore } from '../utils/mastery';

/**
 * Closes the book on one concept of an interview (I7.2 / #123). This is the seam the SDP calls
 * "connect the grading results to the Concept Graph Engine built in Sprint 3": turn scores in,
 * a mastery score and a review schedule out.
 *
 * Called once per concept, when that concept *finishes* — not after every turn — so a
 * three-turn concept schedules one review instead of three, and traceback runs once.
 *
 * What remains here is the TEXT grain: turning turn scores into a number. Everything after that
 * number — the score write, the spaced-repetition row, traceback — moved to
 * `concept-schedule.service.ts` in #340 so the coverage grain can reach the same engine. This
 * function is now one of its two callers.
 */

export interface FinalizeConceptResultInput {
  sessionId: string;
  conceptId: string;
  /** Scores of the turns that were graded, in turn order. Empty if none could be. */
  turnScores: number[];
}

export interface FinalizeConceptResultOutput extends ConceptReviewSchedule {
  conceptId: string;
  /** `null` when no turn could be graded — the stored score was then left untouched. */
  masteryScore: number | null;
}

export async function finalizeConceptResult(
  input: FinalizeConceptResultInput
): Promise<FinalizeConceptResultOutput> {
  const { sessionId, conceptId, turnScores } = input;

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    select: {
      planId: true,
      plan: { select: { deadline: true, tracebackEnabled: true } },
    },
  });
  if (!session) {
    throw new AppError('Interview session not found', 404, 'NOT_FOUND');
  }

  const { planId, plan } = session;
  const gradedMastery = calculateMasteryScore(turnScores);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const schedule = await scheduleConceptReview(tx, {
      sessionId,
      conceptId,
      planId,
      gradedMastery,
      deadline: plan.deadline,
      tracebackEnabled: plan.tracebackEnabled,
      now,
    });

    return { conceptId, masteryScore: gradedMastery, ...schedule };
  });
}
