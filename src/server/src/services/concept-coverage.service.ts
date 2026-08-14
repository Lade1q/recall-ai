import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { listConceptCheckpoints } from './checkpoint.service';
import { scheduleConceptReview, type ConceptReviewSchedule } from './concept-schedule.service';
import { tallyConceptEvidence, type CoverageTally } from '../utils/evidence-tally';
import { coverageMasteryScore } from '../utils/mastery';

/**
 * Closing one concept of an Interview v2 session: read its evidence, derive its mastery score,
 * write it down and put the concept back on the calendar (#331 + #340, §2.1/§2.3).
 *
 * The AI never emitted a score — it emitted evidence, one checkpoint at a time (#330) — so the
 * score is computed here, deterministically, out of what is stored. Everything downstream of the
 * score is literally the text path's code: `scheduleConceptReview` (`concept-schedule.service.ts`)
 * is shared by both grains, which is how §2.3's "the engine downstream does not change" stops
 * being a claim and starts being a call.
 *
 * Scope note — this still has NO caller. The trigger for "the concept is finished" belongs to the
 * voice conductor over the WS proxy, which does not exist yet, and the text path keeps scoring
 * from turns until the §7 cutover. What #340 removed is the gap BEHIND that trigger: before it,
 * a concept scored here was never scheduled, so the `null` case §2.3 promises will return to the
 * queue was unreachable code.
 */

export interface ConceptCoverageResult {
  conceptId: string;
  /**
   * What the concept scored, or `null` when too little of it was resolved to judge — "not
   * assessed", not a low score (§2.3). `null` is also exactly when no score is written.
   */
  masteryScore: number | null;
  /** The counts the score came from, including how many checkpoints went unanswered. */
  tally: CoverageTally;
}

/**
 * Scores ONE concept of ONE session from its stored evidence. Reads only.
 *
 * The number is derived ONCE, at close, and stored by the caller — the read paths (summary,
 * engine, graph) read the stored number and must not recompute this. A mastery score is a function
 * of the ruler as it stood when the concept was scored, and the ruler is not immutable: a
 * re-analysis weeks later adds or deletes checkpoints, so recomputing at read time would silently
 * restate what an old session scored. (The same class of bug the `sourceDocumentId` note warns
 * about: the evidence is immutable, the thing it is measured against is not.) The text path is
 * immune to this because a turn is immutable; this path is not, which is why the score is written
 * at all rather than computed on demand.
 *
 * `C` is the size of the checkpoint set that was just read, NOT a second
 * `countConceptCheckpoints` query: the denominator and the id set the evidence is joined against
 * then come out of one statement, atomically, which is what makes `resolved <= committed`
 * structural instead of hopeful.
 *
 * The evidence is a second, independent statement. What makes two statements safe enough is that
 * neither side can be caught mid-change: evidence within a session only ever appears or is
 * rewritten in place (never deleted), and a re-analysis commits a concept's whole checkpoint set
 * inside one transaction (`persistCheckpoints`, in `analysis.service.ts`), so no read can see half
 * a ruler. The score is then what the ruler in force when it was read says about every conclusion
 * recorded up to the moment the evidence was read.
 *
 * ⚠️ Passing a transaction client in `db` does NOT close the gap between those two statements.
 * Postgres reads at READ COMMITTED by default, INSIDE a transaction as much as outside it: every
 * statement takes its own snapshot, so a plain `$transaction` here buys exactly nothing. Only
 * REPEATABLE READ puts both reads on one snapshot — and it brings `P2034` write conflicts, and so
 * a retry policy, with it. `db` is here for the WRITE that follows (one transaction for score and
 * schedule), not as a fix for the read window.
 *
 * Residual, written down rather than papered over: a re-analysis that GROWS the ruler between the
 * two reads is scored as ruler-old-SMALL against evidence-new-MANY, which can clear the coverage
 * floor that NEITHER consistent state clears — an over-credit, the wrong direction. It needs a
 * writer landing evidence concurrently with a re-analysis, which no caller does yet; the caller
 * that changes that is the one that has to choose the fix.
 *
 * The reads are sequential, not `Promise.all`: on a transaction client they would share one
 * connection and serialise anyway, and one shape for both call styles beats branching on which
 * client was handed in. The cost is one extra round-trip of window, inside a window that is
 * already unreachable.
 *
 * That safety leans on a file this one does not import. If `persistCheckpoints` ever stops being
 * committed atomically, this breaks AT A DISTANCE: a partly written ruler reads as a small `C`,
 * a small `C` reads as high coverage, and a score gets written where the honest answer was
 * `null`.
 *
 * A concept with no checkpoints scores `null` — coverage is undefined without a ruler, and such a
 * concept belongs on the text path anyway (the §2.4 guard, not this function's job).
 */
export async function scoreConceptFromEvidence(
  sessionId: string,
  conceptId: string,
  db: Prisma.TransactionClient = prisma
): Promise<ConceptCoverageResult> {
  const checkpoints = await listConceptCheckpoints(conceptId, db);
  const evidence = await db.interviewEvidence.findMany({
    where: { sessionId, conceptId },
    select: { checkpointId: true, status: true },
  });

  const tally = tallyConceptEvidence(
    evidence,
    checkpoints.map((checkpoint) => checkpoint.id)
  );

  // The inner join keeps a stale or fabricated row out of the score, and it does that silently —
  // without this line, evidence could stop counting for a whole plan and nothing would say so.
  // It reports one direction only: rows that fell OUT of the ruler. A ruler that GROWS changes
  // what the next derivation says without warning about anything, which is correct — growth is a
  // legitimate re-analysis, not a fault, and a score already written is protected by being derived
  // once rather than by this line.
  if (tally.orphanedCheckpointIds.length > 0) {
    console.warn(
      `[coverage] session ${sessionId} concept ${conceptId}: ${tally.orphanedCheckpointIds.length} evidence row(s) reference checkpoints this concept no longer commits, not counted (${tally.orphanedCheckpointIds.join(', ')})`
    );
  }

  const masteryScore = coverageMasteryScore(tally.evCovered, tally.evContradicted, tally.committed);

  return { conceptId, masteryScore, tally };
}

export interface FinalizeConceptCoverageInput {
  sessionId: string;
  conceptId: string;
}

/**
 * The result of closing a concept on the coverage grain.
 *
 * A union rather than a row of nullable fields, so `skipped` cannot be mistaken for
 * `masteryScore: null`. They mean opposite things: `null` is a concept that WAS measured and came
 * out unassessable, and belongs back in the queue; `skipped` is a concept that was never measured
 * because it is no longer part of the plan.
 */
export type ConceptCloseResult =
  | ({ outcome: 'closed'; schedule: ConceptReviewSchedule } & ConceptCoverageResult)
  | { outcome: 'skipped'; conceptId: string; reason: 'deprecated' };

/**
 * Closes one concept of a voice session: score it, store the score, schedule the review, trace
 * back weak prerequisites (#340).
 *
 * Score and schedule share ONE transaction and ONE `now`. Split, a crash in between leaves a
 * concept marked assessed with nothing on the calendar — assessed and invisible is worse than
 * neither, because nothing later goes looking for it.
 *
 * The score write belongs to `scheduleConceptReview`, not to `scoreConceptFromEvidence`: the
 * helper reads the previous score before it overwrites it (that read is also the ownership check),
 * so read-prior-then-write is one function's internal invariant instead of a rule two files have
 * to keep in step.
 *
 * ⚠️ `masteryScore === null` still schedules. It is the `MIN_COVERAGE` case — the student talked
 * about too little of the concept to judge — and §2.3 answers it by putting the concept back in
 * the queue on its PREVIOUS score. Guarding the call with `if (masteryScore !== null)` deletes
 * exactly that promise; see the gating notes on `scheduleConceptReview`.
 */
export async function finalizeConceptCoverage(
  input: FinalizeConceptCoverageInput
): Promise<ConceptCloseResult> {
  const { sessionId, conceptId } = input;

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
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Re-analysis is not blocked while a session is running, so a concept can be deprecated out
    // from under the interview that is discussing it. Scoring it anyway would write a fresh
    // mastery score onto a concept the plan no longer contains and queue a review the student can
    // never be shown — the review queue reads by plan and does not filter on `status`. The
    // evidence rows stay where they are; only the conclusions drawn from them are withheld.
    //
    // This closes the window it can see, not the whole window: this read and the prior-read inside
    // `scheduleConceptReview` are separate statements at READ COMMITTED, so a `deprecate` that
    // commits between them still gets through. Making it airtight means one snapshot (REPEATABLE
    // READ) plus the retry policy that comes with it — the same decision the read window above is
    // waiting on, and it belongs to whoever first runs these paths concurrently.
    const concept = await tx.concept.findFirst({
      where: { id: conceptId, planId },
      select: { status: true },
    });
    if (!concept) {
      throw new AppError('Concept not found in this study plan', 404, 'NOT_FOUND');
    }
    if (concept.status === 'deprecated') {
      console.warn(
        `[coverage] session ${sessionId} concept ${conceptId}: deprecated during the session, not scored and not scheduled`
      );
      return { outcome: 'skipped', conceptId, reason: 'deprecated' };
    }

    const scored = await scoreConceptFromEvidence(sessionId, conceptId, tx);

    const schedule = await scheduleConceptReview(tx, {
      sessionId,
      conceptId,
      planId,
      gradedMastery: scored.masteryScore,
      deadline: plan.deadline,
      tracebackEnabled: plan.tracebackEnabled,
      now,
    });

    return { outcome: 'closed', ...scored, schedule };
  });
}
