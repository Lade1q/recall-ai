import type { Verdict } from '../schemas/ai-interview.schema';

/**
 * Keeps `verdict` and `score` consistent after a grade_answer call (I6.2 / #114).
 *
 * The model occasionally returns a verdict that contradicts its own score. The score is
 * the value everything downstream reads (mastery, traceback thresholds in I7.x), so when
 * the two disagree we trust `score` and rewrite `verdict`.
 *
 * Kept as a pure function, with no AI or DB in reach, because the reconciliation is
 * deterministic software logic (C4) and must stay provable without an API key (risk R05).
 */

/** A `deep` verdict claims real understanding — it needs a score at or above this. */
export const DEEP_MIN_SCORE = 0.7;
/** A `wrong` verdict claims the answer is incorrect — it only holds below this. */
export const WRONG_MAX_SCORE = 0.4;

/** The verdict a score implies on its own, used only when the returned one is untenable. */
function verdictFromScore(score: number): Verdict {
  if (score >= DEEP_MIN_SCORE) return 'deep';
  if (score < WRONG_MAX_SCORE) return 'wrong';
  return 'shallow';
}

export interface ReconciledVerdict {
  verdict: Verdict;
  /** True when the AI's verdict was overridden — the caller logs a warning on this. */
  corrected: boolean;
}

/**
 * Enforces the two invariants I6.3 relies on: `wrong` implies score < 0.4, and `deep`
 * implies score >= 0.7.
 *
 * A `shallow` verdict is deliberately left alone at any score: "restates a definition
 * without understanding" is a judgement about the *shape* of an answer, not its
 * correctness, so a well-worded but unexplained answer can legitimately score high and
 * still be shallow. Overriding it would make verdict a redundant copy of score.
 */
export function reconcileVerdict(score: number, verdict: Verdict): ReconciledVerdict {
  const deepTooLow = verdict === 'deep' && score < DEEP_MIN_SCORE;
  const wrongTooHigh = verdict === 'wrong' && score >= WRONG_MAX_SCORE;

  if (!deepTooLow && !wrongTooHigh) {
    return { verdict, corrected: false };
  }
  return { verdict: verdictFromScore(score), corrected: true };
}
