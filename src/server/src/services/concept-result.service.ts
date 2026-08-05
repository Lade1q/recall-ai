import type { Prisma, ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { MASTERY_THRESHOLD, traceback, type TracebackResult } from './traceback.service';
import {
  addDays,
  calculateMasteryScore,
  daysUntil,
  reviewIntervalDays,
  reviewPriority,
} from '../utils/mastery';

/**
 * Closes the book on one concept of an interview (I7.2 / #123). This is the seam the SDP calls
 * "connect the grading results to the Concept Graph Engine built in Sprint 3": turn scores in,
 * a mastery score and a review schedule out.
 *
 * Called once per concept, when that concept *finishes* — not after every turn — so a
 * three-turn concept schedules one review instead of three, and traceback runs once.
 */

export interface FinalizeConceptResultInput {
  sessionId: string;
  conceptId: string;
  /** Scores of the turns that were graded, in turn order. Empty if none could be. */
  turnScores: number[];
}

/**
 * Why no prerequisite was queued. `null` means traceback ran; the UI needs the distinction
 * because "your foundations are fine" and "traceback is switched off" are different messages.
 */
export type TracebackSkipReason = 'disabled' | 'not_graded' | 'mastered';

export interface FinalizeConceptResultOutput {
  conceptId: string;
  /** `null` when no turn could be graded — the stored score was then left untouched. */
  masteryScore: number | null;
  reviewInDays: number;
  scheduledFor: Date;
  /** Weak prerequisites queued ahead of this concept, nearest first. */
  prerequisites: TracebackResult[];
  tracebackSkipReason: TracebackSkipReason | null;
}

interface ReviewItemDraft {
  planId: string;
  conceptId: string;
  sourceSessionId: string;
  sourceConceptId: string | null;
  reason: ReviewReason;
  priority: number;
  depth: number | null;
  scheduledFor: Date;
}

/**
 * Writes one review-queue row, keyed on `(sourceSessionId, conceptId)` — the unique pair added
 * in #113 (audit A1). That makes the whole function replayable: finalising the same concept of
 * the same session twice updates the row instead of stacking duplicates, and a prerequisite
 * already queued by an earlier concept of this session gets its priority raised rather than a
 * second row.
 *
 * `status` is deliberately only set on insert — same code as before #224, different reason. It
 * is no longer "don't overwrite the student's approval": there is no approval step any more, and
 * the `create` branch not naming `status` is exactly how the concept lands on the schedule at
 * `@default(pending)` inside the grading transaction, before the student sees anything. What the
 * `update` branch must still not touch is a *removal*: a concept the student took off their
 * schedule stays off it, however many later sessions re-queue the same prerequisite.
 */
async function upsertReviewItem(tx: Prisma.TransactionClient, draft: ReviewItemDraft) {
  const { planId, conceptId, sourceSessionId, ...schedule } = draft;
  await tx.reviewQueueItem.upsert({
    where: { sourceSessionId_conceptId: { sourceSessionId, conceptId } },
    create: { planId, conceptId, sourceSessionId, ...schedule },
    update: schedule,
  });
}

/**
 * Writes the concept's mastery score and schedules its review, plus the reviews of any weak
 * prerequisites underneath it.
 *
 * Every concept gets a spaced-repetition row **whatever it scored** (audit A4): the "CÓ" branch
 * of the UC-Overview §4 loop is "schedule review C after X days", so a concept the student
 * answered well must stay on the calendar instead of dropping out of the plan entirely.
 * Traceback is the *extra* step for a weak score, never a replacement for that row.
 *
 * Traceback fires on the final mastery score, not on a single `wrong` verdict (audit A5): the
 * state machine ends a concept early on `wrong`, but whether that concept needs remediation is
 * decided here, from everything the student answered about it.
 */
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
    // Scoped by planId as well as id: this both fetches the previous score and refuses to
    // schedule a review on a concept that belongs to somebody else's plan.
    const concept = await tx.concept.findFirst({
      where: { id: conceptId, planId },
      select: { masteryScore: true },
    });
    if (!concept) {
      throw new AppError('Concept not found in this study plan', 404, 'NOT_FOUND');
    }

    // No turn could be graded — the concept was skipped, or the AI was unavailable for all of
    // it. Writing `null` over a score an earlier session proved would be data loss, and
    // `last_tested_at` would claim an assessment that never happened, so both stay as they are
    // and only the review schedule is refreshed.
    if (gradedMastery !== null) {
      await tx.concept.update({
        where: { id: conceptId },
        data: { masteryScore: gradedMastery, lastTestedAt: now },
      });
    }

    const effectiveMastery = gradedMastery ?? concept.masteryScore;
    const reviewInDays = reviewIntervalDays(effectiveMastery, daysUntil(plan.deadline, now));
    const scheduledFor = addDays(now, reviewInDays);

    await upsertReviewItem(tx, {
      planId,
      conceptId,
      sourceSessionId: sessionId,
      sourceConceptId: null,
      reason: 'spaced_repetition',
      priority: reviewPriority({ masteryScore: effectiveMastery, depth: null }),
      depth: null,
      scheduledFor,
    });

    const skipReason = tracebackSkipReason(gradedMastery, plan.tracebackEnabled);
    const masteryLabel = gradedMastery === null ? 'not_graded' : gradedMastery.toFixed(2);

    if (skipReason !== null) {
      logTraceback(
        `concept=${conceptId} mastery=${masteryLabel} → skipped (${skipReason}), review in ${reviewInDays}d`
      );
      return {
        conceptId,
        masteryScore: gradedMastery,
        reviewInDays,
        scheduledFor,
        prerequisites: [],
        tracebackSkipReason: skipReason,
      };
    }

    // Read sequentially rather than in parallel: both queries share this transaction's single
    // connection, and the graph is small enough that it makes no measurable difference.
    const concepts = await tx.concept.findMany({
      where: { planId },
      select: { id: true, name: true, masteryScore: true },
    });
    const edges = await tx.conceptEdge.findMany({
      where: { planId },
      select: { fromConceptId: true, toConceptId: true },
    });

    const prerequisites = traceback({ rootConceptId: conceptId, concepts, edges });

    for (const prerequisite of prerequisites) {
      await upsertReviewItem(tx, {
        planId,
        conceptId: prerequisite.conceptId,
        sourceSessionId: sessionId,
        sourceConceptId: conceptId,
        reason: 'traceback',
        priority: reviewPriority({
          masteryScore: prerequisite.masteryScore,
          depth: prerequisite.depth,
        }),
        depth: prerequisite.depth,
        // Due immediately, unlike the concept they came from: AE-07 step 6 puts the
        // prerequisites at the *head* of the queue so the next session rebuilds the base first.
        scheduledFor: now,
      });
    }

    const depths = prerequisites.map((prerequisite) => prerequisite.depth).join(',');
    logTraceback(
      `concept=${conceptId} mastery=${masteryLabel} → found ${prerequisites.length} prereqs` +
        (prerequisites.length > 0 ? ` (depth ${depths})` : '')
    );

    return {
      conceptId,
      masteryScore: gradedMastery,
      reviewInDays,
      scheduledFor,
      prerequisites,
      tracebackSkipReason: null,
    };
  });
}

/**
 * The remediation decision, one line per concept: which concept, what it scored, and what came
 * back. I7.2 asks for it by name — it is the only window into why the next session looks the way
 * it does, both on demo day and when a review queue turns out wrong.
 *
 * `no-console` is disabled once here rather than at each call site: this output is part of the
 * spec, not leftover debugging, and the rule exists to stop the latter.
 */
function logTraceback(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[traceback] ${message}`);
}

function tracebackSkipReason(
  gradedMastery: number | null,
  tracebackEnabled: boolean
): TracebackSkipReason | null {
  // The plan-level switch wins: with traceback off, the student never gets prerequisite
  // suggestions, whatever they scored.
  if (!tracebackEnabled) return 'disabled';
  // Nothing was graded, so there is no evidence of a weak foundation to act on. The concept
  // still keeps its spaced-repetition row above.
  if (gradedMastery === null) return 'not_graded';
  if (gradedMastery >= MASTERY_THRESHOLD) return 'mastered';
  return null;
}
