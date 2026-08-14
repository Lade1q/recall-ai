import type { Prisma, ReviewReason } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { MASTERY_THRESHOLD, traceback, type TracebackResult } from './traceback.service';
import { addDays, daysUntil, reviewIntervalDays, reviewPriority } from '../utils/mastery';

/**
 * Everything that happens to a concept AFTER it has been scored: the score is written down, a
 * spaced-repetition row is queued, and weak prerequisites are traced back (#340).
 *
 * Lifted out of `finalizeConceptResult` unchanged, because Interview v2 introduced a second way to
 * arrive at a score. The text grain averages turn scores; the coverage grain counts evidence
 * against a concept's checkpoints (`concept-coverage.service.ts`). §2.3 promises the engine
 * downstream of the score does not change between the two — this file is that promise made literal:
 * one implementation, two callers, and the seam is a `number | null`. It knows nothing about turns,
 * evidence or checkpoints, and must stay that way.
 */

/**
 * Why no prerequisite was queued. `null` means traceback ran; the UI needs the distinction
 * because "your foundations are fine" and "traceback is switched off" are different messages.
 */
export type TracebackSkipReason = 'disabled' | 'not_graded' | 'mastered';

export interface ScheduleConceptReviewInput {
  sessionId: string;
  conceptId: string;
  planId: string;
  /**
   * What THIS session measured, or `null` when it could measure nothing — no turn could be graded
   * (text), or too little of the concept was resolved to judge (coverage). It is deliberately the
   * only thing about the measurement that reaches this file.
   */
  gradedMastery: number | null;
  deadline: Date | null;
  tracebackEnabled: boolean;
  /** One instant for the whole close, so `lastTestedAt` and `scheduledFor` cannot disagree. */
  now: Date;
}

/** What the caller needs to tell the student, once the concept is on the calendar. */
export interface ConceptReviewSchedule {
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
 *
 * ⚠️ The three writes below are gated DIFFERENTLY, and getting that wrong is how the `null` case
 * quietly disappears:
 *   - the score write is CONDITIONAL — `null` leaves the stored score alone (below);
 *   - the spaced-repetition row is UNCONDITIONAL, priced off the PRIOR score when this session
 *     measured nothing — that is the only way an unassessed concept comes back at all;
 *   - traceback is gated on `gradedMastery`, so `null` skips it (`not_graded`): there is no
 *     evidence of a weak foundation to act on.
 * Wrapping the call site in `if (masteryScore !== null)` is therefore broken — it drops exactly
 * the concept §2.3 promises will return to the queue.
 *
 * Runs entirely on the caller's transaction client: the score write and the queue rows commit
 * together, or not at all. Split across a transaction boundary they would leave a concept marked
 * assessed with nothing on the calendar.
 */
export async function scheduleConceptReview(
  tx: Prisma.TransactionClient,
  input: ScheduleConceptReviewInput
): Promise<ConceptReviewSchedule> {
  const { sessionId, conceptId, planId, gradedMastery, deadline, tracebackEnabled, now } = input;

  // Scoped by planId as well as id: this both fetches the previous score and refuses to
  // schedule a review on a concept that belongs to somebody else's plan. The prior is read HERE
  // rather than accepted as an argument precisely so no caller can skip that check — and reading
  // it before the write below is what keeps it the PREVIOUS score.
  const concept = await tx.concept.findFirst({
    where: { id: conceptId, planId },
    select: { masteryScore: true },
  });
  if (!concept) {
    throw new AppError('Concept not found in this study plan', 404, 'NOT_FOUND');
  }

  // Nothing could be measured — the concept was skipped, the AI was unavailable for all of it, or
  // too little of it was resolved to judge. Writing `null` over a score an earlier session proved
  // would be data loss, and `last_tested_at` would claim an assessment that never happened, so
  // both stay as they are and only the review schedule is refreshed.
  if (gradedMastery !== null) {
    await tx.concept.update({
      where: { id: conceptId },
      data: { masteryScore: gradedMastery, lastTestedAt: now },
    });
  }

  const effectiveMastery = gradedMastery ?? concept.masteryScore;
  const reviewInDays = reviewIntervalDays(effectiveMastery, daysUntil(deadline, now));
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

  const skipReason = tracebackSkipReason(gradedMastery, tracebackEnabled);
  const masteryLabel = gradedMastery === null ? 'not_graded' : gradedMastery.toFixed(2);

  if (skipReason !== null) {
    logTraceback(
      `concept=${conceptId} mastery=${masteryLabel} → skipped (${skipReason}), review in ${reviewInDays}d`
    );
    return {
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
    reviewInDays,
    scheduledFor,
    prerequisites,
    tracebackSkipReason: null,
  };
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
