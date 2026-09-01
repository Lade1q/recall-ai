import type { Prisma, TurnSource, TurnVerdict } from '@prisma/client';
import type { QuestionMode } from '../schemas/ai-interview.schema';
import type { GradingFeedbackResponse } from '../types/interview.types';
import { countsTowardMastery } from './mastery';

/**
 * Pure rules of AE-10 (#248) — no Prisma, no I/O, so both `grading-feedback.service.ts` (the
 * write path) and `interview.service.ts` (the read path) can call them without one service
 * importing the other. Same placement as `mastery.ts`, for the same reason.
 */

/** The shape the appeal gate needs. Structural so tests can pass a literal. */
export type AppealableTurn = {
  verdict: TurnVerdict | null;
  source: TurnSource;
  mode: QuestionMode | null;
};

/**
 * Can this turn be appealed at all?
 *
 * Three exclusions, each for its own reason:
 * - `verdict === null` — not graded yet, so there is no score to disagree with.
 * - `source === 'cache_fallback'` — the student set that score themselves (AE-05). Appealing
 *   your own grade is meaningless. This cannot be folded into the `verdict` check: a flashcard
 *   turn carries a real `verdict` written from `SELF_GRADE_VERDICT`.
 * - not counting toward mastery — a hint turn is graded but never enters the weighted average,
 *   so its score is not the number the appeal would be about.
 *
 * The third clause calls `countsTowardMastery` rather than re-testing `mode !== 'hint'`: that
 * function's docblock claims to be the ONE place the rule lives, and a second copy here would
 * make the claim false the moment the rule grows a fourth rung.
 */
export function isTurnAppealable(turn: AppealableTurn): boolean {
  return turn.verdict !== null && turn.source !== 'cache_fallback' && countsTowardMastery(turn);
}

/**
 * `reasons` is a `Json` column, so Prisma hands it back as `JsonValue`. Written as a filter
 * rather than a cast so a hand-edited row cannot put a non-string on the wire under a
 * `string[]` annotation.
 *
 * NOTE: the same `Array.isArray(...) ? ... : []` coercion exists in `parseConceptQueue`
 * (interview.service.ts), `parseConceptIds` (session-note.service.ts) and `toConceptIds`
 * (focus-session.service.ts). Folding all four into one helper is a worthwhile follow-up; it
 * touches three features unrelated to #248, so it is deliberately not done here.
 */
export function toGradingFeedbackResponse(row: {
  reasons: Prisma.JsonValue;
  note: string | null;
}): GradingFeedbackResponse {
  return {
    reasons: Array.isArray(row.reasons)
      ? row.reasons.filter((entry): entry is string => typeof entry === 'string')
      : [],
    note: row.note,
  };
}
