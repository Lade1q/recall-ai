/**
 * Which of a concept's queue rows represents it on the calendar (#400 "Luật chọn mục đại diện").
 *
 * A concept does not own one appointment — it owns a *version history* of one. Every graded
 * session writes another `ReviewQueueItem` (`@@unique([sourceSessionId, conceptId])` only stops
 * a repeat *within* a session) and nothing ever prunes the older rows: one concept came back
 * with 15 rows written by 15 sessions inside 87 minutes, their `scheduledFor` spread across
 * 08/08 → 20/08. Drawing all 15 would put one concept on twelve different days.
 *
 * So the calendar folds each `(planId, conceptId)` cluster down to a single row:
 *
 *   tier = weak traceback ? 0 : 1,  then `createdAt` descending
 *
 * "The traceback row represents the concept for as long as the concept is still weak; once it
 * is no longer weak, the newest measurement represents it." That inverts the predicate that
 * produced the row in the first place: `tracebackSkipReason()` (`concept-schedule.service.ts`)
 * stops writing traceback rows at `>= MASTERY_THRESHOLD`, so the same bar decides both when a
 * row is born and when it stops speaking for its concept. The two do differ on `null`, and
 * deliberately — see `isWeakTraceback()`.
 *
 * 🪤 This is deliberately NOT `orderBy: { createdAt: 'desc' }` on the query. The existing read
 * path re-sorts its input through `sortReviewItems()` on `dedupeByConcept()`'s first line, so a
 * query-level ordering is overwritten before it decides anything — a change that looks right,
 * keeps every test green, and alters no behaviour at all.
 *
 * Pure: no Prisma, no clock, no randomness (SDP risk R05 — provable with `DATABASE_URL` and
 * `GEMINI_API_KEY` stripped).
 */

import type { ReviewReason } from '@prisma/client';
import { MASTERY_THRESHOLD } from '../services/traceback.service';

/**
 * The three fields the rule reads, shaped like the Prisma row it will be handed so callers can
 * pass their query result straight through (structural typing — a superset is fine).
 */
export interface RepresentativeRow {
  reason: ReviewReason;
  createdAt: Date;
  concept: { masteryScore: number | null };
}

/**
 * A traceback row on a concept that is still below the mastery bar — tier 0, the row that keeps
 * representing its concept no matter how many newer rows pile up behind it.
 *
 * `masteryScore ?? 0` folds `null` into "not yet mastered" ON PURPOSE, against the repo-wide
 * "null ≠ 0" doctrine in `utils/mastery.ts`. `null` means the concept was never tested, which is
 * precisely the `TracebackReason: 'never_tested'` case — never tested is not evidence of
 * mastery, and treating it as a 0 keeps the untested prerequisite visible instead of quietly
 * promoting it to "fine". Do not "fix" this into `masteryScore !== null && ... < THRESHOLD`:
 * that flips every untested traceback row to tier 1 and hides the gap the traceback found.
 */
export function isWeakTraceback(row: RepresentativeRow): boolean {
  return row.reason === 'traceback' && (row.concept.masteryScore ?? 0) < MASTERY_THRESHOLD;
}

/**
 * The one row that stands for a `(planId, conceptId)` cluster. Callers group first; this decides
 * only *within* a group, so it never has to know how the grouping was keyed.
 *
 * Returns `undefined` for an empty input rather than throwing — an empty group is not a thing a
 * caller can build by grouping, so the only way here is a programming error the type already
 * describes.
 */
export function pickRepresentative<T extends RepresentativeRow>(rows: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const row of rows) {
    if (best === undefined || beats(row, best)) best = row;
  }
  return best;
}

/**
 * Does `challenger` represent the concept better than `holder`? Tier first, then recency —
 * strictly, so a tie on `createdAt` keeps the row seen first and the fold stays a function of
 * its input rather than of a sort's stability.
 */
function beats(challenger: RepresentativeRow, holder: RepresentativeRow): boolean {
  const challengerIsWeakTraceback = isWeakTraceback(challenger);
  if (challengerIsWeakTraceback !== isWeakTraceback(holder)) return challengerIsWeakTraceback;
  return challenger.createdAt.getTime() > holder.createdAt.getTime();
}
