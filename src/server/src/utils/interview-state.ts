import type { QuestionMode, Verdict } from '../schemas/ai-interview.schema';
import { TURN_WEIGHTS } from './mastery';

/**
 * The Interview state machine (I6.3 / #115, UC-04 UC-11) — the one place that decides what
 * happens after a turn is graded.
 *
 * Pure function: no Prisma, no Gemini, no clock. Constraint C4 says this routing is
 * deterministic software logic and no prompt may ever ask the model "what should I do next",
 * and SDP risk R05 says that logic must stay provable with the database and the API key
 * switched off — which is only true if it lives in a module neither of them can reach.
 * `interview.service.ts` reads the state from the DB, calls this, and executes the answer.
 *
 * Lives in `utils/` for that reason, rather than inside `interview.service.ts` as #115's
 * sketch drew it: that file imports Prisma, so importing it from a test would need a
 * DATABASE_URL. Same split as `utils/interview-grading.ts` (I6.2) and `utils/mastery.ts` (I7.2).
 */

/** What the session does next. Ordered as the decision table in #115 reads. */
export type NextStep =
  'ask_deeper' | 'ask_probe' | 'ask_hint' | 'trace_back' | 'finish_concept' | 'finish_session';

/**
 * There is still deliberately **no** `finish_concept_with_traceback` (audit A5). Whether a
 * *finished* concept needs remediation is decided by `finalizeConceptResult()` (I7.2) from its
 * final weighted mastery score, not from one turn's verdict: a `deep → deep → wrong` concept
 * ends on `wrong` and still scores 0.65, above the 0.6 threshold, so the two conditions
 * genuinely disagree and only one of them may own that decision.
 *
 * `trace_back` does not reopen that argument, because it answers a different question. It never
 * finishes or scores anything: it puts the weak prerequisites of the concept the student is
 * *currently stuck on* in front of it, and the concept then closes later, through the same
 * mastery-score path as before, from everything the student answered about it. The scheduling
 * decision stays where audit A5 put it; only the order of the questions changes.
 */
export interface InterviewStateInput {
  /** Verdict of the turn that was just graded. */
  verdict: Verdict;
  /** 1-based index of that turn within the current concept. */
  turnIndex: number;
  /** The session's `maxTurnsPerConcept` — the C6 hard limit, read from the DB, never the client. */
  maxTurns: number;
  /** Concepts still queued *after* the current one. */
  remainingConcepts: number;
  /**
   * Whether the caller has a live traceback to offer: at least one weak prerequisite of this
   * concept that `planTracebackInsert` would actually add to the queue (`utils/interview-queue`).
   *
   * A boolean rather than the graph itself, so this function stays pure and knows nothing about
   * Prisma or about what a prerequisite is — the caller has already asked the graph and applied
   * every budget rule. Optional and defaulting to `false` so that every existing call site, and
   * every test written before live traceback, describes exactly the behaviour it always did.
   */
  tracebackAvailable?: boolean;
  /**
   * Whether this concept has ALREADY sent the session to its base and got it back.
   *
   * Changes what a `wrong` answer means. Before the detour it means "you are stuck" and the
   * right move is to narrow the question (#392). After it, the student has been taken through
   * the foundations and asked again — that is a fresh test of whether the remediation worked,
   * not the same question made easier, so it is routed to `ask_probe` and DOES count towards
   * mastery.
   *
   * Measured on a live run before this existed: a concept answered wrong, remediated, then
   * answered `deep` still scored 0.12, because the turn that proved the remediation had worked
   * was a `hint` and `countsTowardMastery` drops those. Live traceback that cannot move the
   * score is a feature with no consequence.
   */
  tracedBackAlready?: boolean;
}

/** Default N in "at most N turns per concept" (UC-11), overridable per session within C6. */
export const DEFAULT_MAX_TURNS_PER_CONCEPT = 3;

/**
 * The ceiling a session's `maxTurnsPerConcept` may not exceed, whatever the client asks for.
 *
 * Tied to the weighted-average formula rather than picked separately: `calculateMasteryScore`
 * has one weight per turn (`TURN_WEIGHTS`) and throws a RangeError past the last one, because
 * guessing a fourth weight would quietly produce a wrong mastery score — and mastery is what
 * drives remediation. C6 and that formula are the same limit seen from two sides.
 */
export const MAX_TURNS_PER_CONCEPT = TURN_WEIGHTS.length;

/**
 * How many concepts one session may cover ("Số khái niệm tối đa mỗi phiên" — UC-11's
 * State Machine limits). Every concept costs up to `maxTurns` pairs of Gemini calls, so this
 * is what keeps a session inside a sitting and inside the API budget.
 */
export const MAX_CONCEPTS_PER_SESSION = 5;

/** Concepts pulled from the review queue when the client doesn't name any (AE-01). */
export const DEFAULT_CONCEPTS_PER_SESSION = 3;

/**
 * Decides the next step after a turn is graded (#115's decision table, UC-11; revised by #392
 * phương án B — see AE-02 step 9):
 *
 * | verdict   | traceback? | turns left | step                              |
 * | --------- | ---------- | ---------- | --------------------------------- |
 * | `wrong`   | yes        | any        | `trace_back` — go to the base     |
 * | `wrong`   | been there | yes        | `ask_probe` — re-test, and it counts |
 * | `wrong`   | no         | yes        | `ask_hint` — narrow THIS question |
 * | `deep`    | —          | yes        | `ask_deeper` — same concept       |
 * | `shallow` | —          | yes        | `ask_probe` — same concept        |
 * | any       | no         | no         | end the concept (C6 hard limit)   |
 *
 * Ending a concept is reported as `finish_concept` while the queue still holds another one and
 * as `finish_session` on the last, but both mean "finalise this concept first": the caller runs
 * `finalizeConceptResult()` on either, so every concept gets its mastery score and its
 * spaced-repetition row even when the student answered it perfectly (audit A4).
 *
 * **`trace_back` is checked first, and it is not gated on `turnIndex`** — it spends no turn of
 * the current concept, so the C6 ceiling below is untouched by it. A `wrong` on the last allowed
 * turn therefore still visits the base before the concept closes, which is the case that needs it
 * most. Termination does not rely on the turn budget: the caller sets `tracebackAvailable` from
 * `planTracebackInsert`, which refuses to queue a concept already in the queue, so when the chain
 * walks back onto this concept there is nothing left to insert, the flag is `false`, and the rows
 * below take over.
 *
 * Ordering `trace_back` above `ask_hint` is the substance of the change (Quân, 03/09): a wrong
 * answer means "check what this is built on", and only when there is nothing to check does
 * narrowing the same question become the best remaining move. Keeping `ask_hint` as that fallback
 * matters — a root concept has no prerequisites, and dropping the ladder for it would return to
 * the pre-#392 rule where one wrong answer closed a concept outright (#384 measured 26/33
 * concept-visits ending after a single turn under that rule).
 *
 * #392: `wrong` no longer ends the concept on the spot — one answer must not get to decide a
 * concept's fate by itself (spike S0's R-A, independently reached by Quân and by #394's
 * examiner-design essay). It gets exactly the same "turns left?" treatment `deep`/`shallow`
 * already had, just routed to `ask_hint` instead of `ask_deeper`/`ask_probe`. This is also why no
 * separate "hint count" parameter exists here: `hasTurnsLeft` already IS that count, since a hint
 * consumes a turn the same as any other question. A run of `wrong`s can only ever produce up to
 * `maxTurns - 1` hints before the C6 ceiling below closes the concept — for the default
 * `maxTurns = 3` that is exactly the 2-hint cap #392 specifies, with no separate limit to keep in
 * sync. `decideNextStep` still does not know or care *why* a turn was a hint; that only matters to
 * `questionModeForStep` and the prompt it feeds.
 */
export function decideNextStep({
  verdict,
  turnIndex,
  maxTurns,
  remainingConcepts,
  tracebackAvailable = false,
  tracedBackAlready = false,
}: InterviewStateInput): NextStep {
  // Before the turn budget, and deliberately so: hopping to a prerequisite costs this concept
  // no turn, so C6 is not what should decide whether it happens.
  if (verdict === 'wrong' && tracebackAvailable) {
    return 'trace_back';
  }

  // C6: `turnIndex` is the turn just answered, so another one is only allowed while it is
  // strictly below the limit. `>=` here rather than `===` so a session whose limit was somehow
  // lowered mid-flight still stops instead of running away.
  const hasTurnsLeft = turnIndex < maxTurns;

  if (hasTurnsLeft) {
    // A concept that has been to its base and come back is probed, not hinted: the question is
    // asked again on the far side of a real intervention, so it is a rung of the ladder and must
    // reach `mastery_score`. Narrowing it instead would put the proof that remediation worked
    // into the one turn kind the formula throws away.
    if (verdict === 'wrong') return tracedBackAlready ? 'ask_probe' : 'ask_hint';
    return verdict === 'deep' ? 'ask_deeper' : 'ask_probe';
  }

  return remainingConcepts > 0 ? 'finish_concept' : 'finish_session';
}

/** The `generate_question` mode each continuing step asks for. The model never picks it (C4). */
const MODE_BY_STEP: Partial<Record<NextStep, QuestionMode>> = {
  ask_deeper: 'deeper',
  ask_probe: 'probe',
  ask_hint: 'hint',
};

/**
 * `null` for the two terminal steps and for `trace_back` — none of them asks a question of the
 * concept the session is currently on. `trace_back` rewrites the queue and hands control back to
 * the caller, which re-enters the state machine on the prerequisite it just put in front.
 */
export function questionModeForStep(step: NextStep): QuestionMode | null {
  return MODE_BY_STEP[step] ?? null;
}

/** True while `turnIndex` is a turn the session is allowed to ask (C6, checked server-side). */
export function isTurnWithinLimit(turnIndex: number, maxTurns: number): boolean {
  return turnIndex >= 1 && turnIndex <= Math.min(maxTurns, MAX_TURNS_PER_CONCEPT);
}

// --- AE-05 / AE-06: Flashcard fallback stepping ------------------------------------------

/** AE-06: at most 2 pre-generated flashcard questions per concept (R01 cost limit). */
export const MAX_CACHED_QUESTIONS_PER_CONCEPT = 2;

/** What the fallback flow does next for the current concept (UC-12). */
export type FallbackStep =
  | { type: 'ask_cached'; cacheIndex: number }
  | { type: 'finish_concept' }
  | { type: 'no_cache_available' };

export interface FallbackStateInput {
  /** How many `question_cache` rows exist for the current concept (capped upstream at 2). */
  cachedQuestionCount: number;
  /**
   * Turns of this concept already served *from the cache* (`source: 'cache_fallback'`) —
   * the 0-based index into the concept's cached rows. Deliberately NOT the same as "every turn
   * of this concept": grading failure (the common trigger for fallback, AE-02 E2) always fires
   * *after* a question was already asked by AI, so the concept typically already has one or more
   * `source: 'ai'` turns before fallback ever touches its cache — those must not be mistaken for
   * consumed cache slots, or a concept with two fresh, never-served cached questions finishes
   * having served zero of them.
   */
  cachedTurnsServed: number;
  /** Every turn of this concept in this session, whatever its `source` — for the E1 check and C6. */
  totalTurnsServed: number;
  /** The session's own C6 limit — the fallback path may not exceed it either. */
  maxTurns: number;
  /**
   * Verdict of the last graded turn for this concept, if any. When `'wrong'`, the concept ends
   * immediately — no hint ladder here (#392's hint mode is an AI-mode-only feature: fallback has
   * no live Gemini call to narrow a question with, only a fixed set of pre-generated flashcards).
   * A `wrong` self-grade means the student does not have this material, so spending more
   * questions on it is waste; `finalizeConceptResult` (I7.2) will run traceback if the concept
   * has prerequisites.
   *
   * Added to fix CF-03/CF-04: fallback mode previously ignored the verdict and kept serving
   * cached questions after a `wrong` self-grade, contradicting AE-02 basic flow step 9 as it
   * stood at the time (UC-04_AIExaminer.md). #392 later gave AI mode its own hint ladder on
   * `wrong`; fallback's immediate-stop rule did not follow it — see `resolveFallbackStep` below.
   */
  lastVerdict: Verdict | null;
}

/**
 * AE-05's flashcard-fallback stepping (UC-12): linear and deterministic. Mostly ignores
 * `deep`/`shallow` verdicts — a concept in fallback mode asks every cached question it has
 * left, in order, then finishes — and, since #392, also diverges from `decideNextStep` on
 * `wrong`: AI mode now narrows the question instead of stopping, but fallback still stops
 * immediately (CF-03/CF-04), because there is no live AI call in fallback to generate a
 * narrower question from — only a fixed, pre-generated set.
 *
 * `cachedTurnsServed` doubles as the 0-based index into the concept's cached rows (ordered by
 * `generatedAt`) — same "re-derive from what's stored" philosophy as `decideNextStep`, so a
 * resumed session picks up the same cached question a crashed request was about to serve.
 */
export function resolveFallbackStep({
  cachedQuestionCount,
  cachedTurnsServed,
  totalTurnsServed,
  maxTurns,
  lastVerdict,
}: FallbackStateInput): FallbackStep {
  // CF-03/CF-04: a `wrong` verdict ends the concept immediately — fallback has no hint ladder
  // (#392 is AI-mode only). The concept must have had at least one turn served (the one that
  // scored `wrong`), so `finish_concept` is safe — `finalizeConceptResult` will have scores to
  // average.
  if (lastVerdict === 'wrong' && totalTurnsServed > 0) {
    return { type: 'finish_concept' };
  }

  // UC-12 E1: this concept has never had a question served (AI or cache) and there is nothing
  // cached to fall back to either. Distinct from "cache ran out after one question" below.
  if (totalTurnsServed === 0 && cachedQuestionCount === 0) {
    return { type: 'no_cache_available' };
  }

  const cacheLimit = Math.min(cachedQuestionCount, MAX_CACHED_QUESTIONS_PER_CONCEPT);
  // C6: whatever mix of ai/cache_fallback turns already happened, the concept may not exceed
  // maxTurns in total — a cache with slots left over is not a licence to bypass that limit.
  const turnBudgetLeft = maxTurns - totalTurnsServed;
  if (cachedTurnsServed < cacheLimit && turnBudgetLeft > 0) {
    return { type: 'ask_cached', cacheIndex: cachedTurnsServed };
  }
  return { type: 'finish_concept' };
}

/** AE-05: what the student picked when self-grading a flashcard. */
export type SelfGrade = 'correct' | 'partial' | 'wrong';

/** Hard-coded mapping (UC-04 UC-12 step 5) — no free-form score input is ever allowed. */
export const SELF_GRADE_SCORE: Record<SelfGrade, number> = {
  correct: 1,
  partial: 0.5,
  wrong: 0,
};

/** Keeps the transcript's verdict column populated for a self-graded turn. */
export const SELF_GRADE_VERDICT: Record<SelfGrade, Verdict> = {
  correct: 'deep',
  partial: 'shallow',
  wrong: 'wrong',
};
