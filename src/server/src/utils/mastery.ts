import { MASTERY_THRESHOLD, MAX_TRACEBACK_DEPTH } from '../services/traceback.service';

/**
 * Everything a finished concept's score decides (I7.2 / #123): the score itself, when the
 * concept comes back for review, where its review-queue row sits in the ordering, and which
 * colour band it reads as on screen.
 *
 * Pure functions — no Prisma, no Gemini, no clock. `now` is always passed in. The scheduling
 * decision is deterministic software logic (C4) and must stay provable from mock data with
 * the database and the API key switched off (SDP risk R05). Writing the rows is
 * `concept-result.service.ts`'s job, not this file's.
 */

/**
 * UC-Overview §5.4: `mastery_score(C) = weighted_avg(turn_scores, weights = [0.2, 0.3, 0.5])`.
 * A later turn weighs more because its question digs deeper — getting turn 3 right says more
 * about understanding than getting the opening recall question right.
 */
export const TURN_WEIGHTS = [0.2, 0.3, 0.5] as const;

/** A reviewed concept never comes back sooner than tomorrow or later than two weeks. */
export const MIN_REVIEW_INTERVAL_DAYS = 1;
export const MAX_REVIEW_INTERVAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Scores are stored and compared to two decimals; floating-point noise is not signal. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Weighted average of the turn scores of one concept, in `[0, 1]` rounded to two decimals.
 *
 * Fewer than three turns is normal — a `wrong` verdict ends the concept early (AE-02), and a
 * concept can be skipped — so the weights are **renormalised** over the turns that happened
 * rather than applied as-is: two turns use `[0.2, 0.3] / 0.5 = [0.4, 0.6]`, one turn uses
 * `[1.0]`. Dividing by the full `1.0` instead would silently punish an early finish.
 *
 * Returns `null` for no turns at all, which is not the same as `0`: `0` means "answered and
 * got it completely wrong", `null` means "never assessed". The caller must not collapse the
 * two — see `finalizeConceptResult`.
 *
 * @throws RangeError if given more scores than there are weights. C6 caps a concept at three
 * turns, so a fourth score is a caller bug; guessing a weight for it would produce a quietly
 * wrong mastery score, and mastery is what drives remediation.
 */
export function calculateMasteryScore(turnScores: number[]): number | null {
  if (turnScores.length === 0) {
    return null;
  }
  if (turnScores.length > TURN_WEIGHTS.length) {
    throw new RangeError(
      `calculateMasteryScore received ${turnScores.length} turn scores but C6 caps a concept at ${TURN_WEIGHTS.length} turns`
    );
  }

  // Same length as `turnScores` by the guard above, so no weight is ever missing.
  const weights = TURN_WEIGHTS.slice(0, turnScores.length);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedSum = weights.reduce(
    (sum, weight, index) => sum + weight * (turnScores[index] ?? 0),
    0
  );

  return round2(clamp(weightedSum / totalWeight, 0, 1));
}

/**
 * The turn scores of one concept that count towards its mastery, in the order they were asked —
 * exactly what `calculateMasteryScore` above takes.
 *
 * An ungraded turn (`score === null`) is dropped rather than read as a zero: it is either the
 * question the student is still looking at, or one the AI could not grade (AE-05). Dropping it
 * is what lets the weights renormalise over the turns that actually happened, which is the whole
 * reason a session ended early (#243) can still be scored honestly.
 */
export function gradedTurnScores(turns: readonly { score: number | null }[]): number[] {
  return turns.map((turn) => turn.score).filter((score): score is number => score !== null);
}

/** At or above this, a concept reads as fully mastered rather than still being learned. */
export const MASTERY_STRONG_THRESHOLD = 0.8;

/**
 * The four states a concept can be in on the plan list and the concept graph (SP-03, DB-05).
 * Named after the `--mastery-*` design tokens so a band maps onto a colour without a lookup
 * table in the client.
 */
export type MasteryBand = 'strong' | 'learning' | 'weak' | 'untested';

/** How many concepts of a plan sit in each band. Sums to the plan's concept count. */
export interface MasteryDistribution {
  strong: number;
  learning: number;
  weak: number;
  untested: number;
}

/**
 * Which band a concept's score falls in.
 *
 * `null` is `untested`, never `weak`: "never assessed" and "assessed and got it wrong" look
 * the same on a progress bar only if you are willing to tell a user they are failing material
 * they have not been asked about yet. The two boundaries are the ones already in force
 * elsewhere — `MASTERY_THRESHOLD` (0.6) is what traceback treats as mastered-enough to stop
 * walking, and 0.8 is where the UI's green starts.
 */
export function classifyMastery(masteryScore: number | null): MasteryBand {
  if (masteryScore === null) {
    return 'untested';
  }
  if (masteryScore >= MASTERY_STRONG_THRESHOLD) {
    return 'strong';
  }
  if (masteryScore >= MASTERY_THRESHOLD) {
    return 'learning';
  }
  return 'weak';
}

/**
 * Counts a plan's concepts into the four bands, for the distribution bar on the plan card.
 *
 * Returns all four keys even when a band is empty, so the client renders a stable legend
 * ("0 yếu" stays in place) instead of a row whose items shuffle as scores change.
 */
export function summariseMasteryDistribution(
  masteryScores: readonly (number | null)[]
): MasteryDistribution {
  const distribution: MasteryDistribution = { strong: 0, learning: 0, weak: 0, untested: 0 };
  for (const score of masteryScores) {
    distribution[classifyMastery(score)] += 1;
  }
  return distribution;
}

/**
 * Whole days left until `deadline`, or `null` when the plan has none. Negative once the
 * deadline is past — the caller decides what that means rather than having it hidden here.
 *
 * Floored on purpose: a deadline 1.6 days away leaves one *usable* day. Rounding up would
 * schedule the review after the deadline it is supposed to beat.
 */
export function daysUntil(deadline: Date | null, now: Date): number | null {
  if (deadline === null) {
    return null;
  }
  return Math.floor((deadline.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * How many days from now the concept should be reviewed again.
 *
 * `X = clamp(round(1 + mastery * 13), 1, 14)` — linear, so the whole `[0, 1]` mastery range
 * maps onto a distinct interval. (The earlier `3 * mastery * 7` saturated at 14 days for every
 * mastery >= 0.67, which made most of the range meaningless — audit B5.)
 *
 * A never-tested concept (`null`) is treated as the most urgent, same as mastery `0`. A plan
 * deadline caps the interval: there is no point scheduling a review for after the exam.
 */
export function reviewIntervalDays(
  masteryScore: number | null,
  daysUntilDeadline: number | null
): number {
  const mastery = clamp(masteryScore ?? 0, 0, 1);
  const interval = clamp(
    Math.round(1 + mastery * 13),
    MIN_REVIEW_INTERVAL_DAYS,
    MAX_REVIEW_INTERVAL_DAYS
  );

  if (daysUntilDeadline === null) {
    return interval;
  }
  // A deadline already past still yields tomorrow, not a date in the past: the queue reads
  // "scheduled for" as "due from", and a stale row would sit at the top of every day forever.
  return clamp(
    Math.min(interval, daysUntilDeadline),
    MIN_REVIEW_INTERVAL_DAYS,
    MAX_REVIEW_INTERVAL_DAYS
  );
}

export interface ReviewPriorityInput {
  masteryScore: number | null;
  /** Traceback depth (1 or 2), or `null` for a concept's own spaced-repetition row. */
  depth: number | null;
}

/**
 * The `priority` stored on a review-queue row: higher is reviewed first.
 *
 * Banded, so the ordering AE-07 requires holds on the number alone: for the scores traceback
 * can actually return (below `MASTERY_THRESHOLD`, or never tested) a depth-1 prerequisite lands
 * in `(2.4, 3]`, a depth-2 one in `(1.4, 2]`, and a concept's own spaced-repetition row in
 * `[0, 1]` — so nearer prerequisites are always reviewed first and both come before the concept
 * they were traced from. Within a band the least-mastered concept wins, with a never-tested one
 * (`null`) counted as the most urgent, matching #124's `1 - COALESCE(mastery, 0)`.
 *
 * Deliberately **not** the same number as #124's `calculatePriority()`: that one folds in
 * `1 / days_until_deadline` and is recomputed on every read, because a stored value would go
 * stale as the deadline approaches. This is the part of the ordering that only changes when
 * the concept is next tested, so it is safe to persist. #124 sorts `reason = 'traceback'`
 * first anyway (audit B4), which makes the traceback-before-baseline guarantee independent of
 * both numbers.
 */
export function reviewPriority({ masteryScore, depth }: ReviewPriorityInput): number {
  const urgency = 1 - clamp(masteryScore ?? 0, 0, 1);
  const band = depth === null ? 0 : MAX_TRACEBACK_DEPTH + 1 - depth;
  return round2(band + urgency);
}

/** `now` shifted forward by whole days, used to turn a review interval into a timestamp. */
export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * MS_PER_DAY);
}
