import {
  DEFAULT_MAX_TURNS_PER_CONCEPT,
  MAX_CACHED_QUESTIONS_PER_CONCEPT,
  MAX_TURNS_PER_CONCEPT,
  SELF_GRADE_SCORE,
  SELF_GRADE_VERDICT,
  decideNextStep,
  isTurnWithinLimit,
  questionModeForStep,
  resolveFallbackStep,
  type NextStep,
  type SelfGrade,
} from '../utils/interview-state';
import { TURN_WEIGHTS } from '../utils/mastery';
import type { Verdict } from '../schemas/ai-interview.schema';

/**
 * The Interview state machine (I6.3 / #115) — the decision table of UC-11, tested as pure
 * logic. No Prisma, no Gemini, no clock: the whole point of C4 is that this is provable
 * software logic, and of risk R05 that it stays provable with the DB and API key switched off.
 */

const MAX_TURNS = DEFAULT_MAX_TURNS_PER_CONCEPT;

function step(
  verdict: Verdict,
  turnIndex: number,
  remainingConcepts = 1,
  maxTurns = MAX_TURNS
): NextStep {
  return decideNextStep({ verdict, turnIndex, maxTurns, remainingConcepts });
}

describe('decideNextStep — continuing the same concept', () => {
  it('asks a deeper question after a deep answer while turns remain', () => {
    expect(step('deep', 1)).toBe('ask_deeper');
    expect(step('deep', 2)).toBe('ask_deeper');
  });

  it('BR-AIEX-001: continues to turn 3 (ask_deeper) after turn 2 has verdict deep when maxTurns = 3', () => {
    expect(
      decideNextStep({
        verdict: 'deep',
        turnIndex: 2,
        maxTurns: 3,
        remainingConcepts: 0,
      })
    ).toBe('ask_deeper');
  });

  it('probes after a shallow answer while turns remain', () => {
    expect(step('shallow', 1)).toBe('ask_probe');
    expect(step('shallow', 2)).toBe('ask_probe');
  });

  /**
   * #392 phương án B: `wrong` no longer ends a concept on the spot. It gets the same
   * "turns left?" treatment as `deep`/`shallow` — just routed to `ask_hint`, which narrows the
   * very question just missed instead of moving on or ending.
   */
  it('hints after a wrong answer while turns remain, instead of ending the concept', () => {
    expect(step('wrong', 1)).toBe('ask_hint');
    expect(step('wrong', 2)).toBe('ask_hint');
  });

  it('maps each continuing step to the generate_question mode the caller must use', () => {
    expect(questionModeForStep('ask_deeper')).toBe('deeper');
    expect(questionModeForStep('ask_probe')).toBe('probe');
    expect(questionModeForStep('ask_hint')).toBe('hint');
  });

  it('has no mode for the two terminal steps — they end a concept instead of asking', () => {
    expect(questionModeForStep('finish_concept')).toBeNull();
    expect(questionModeForStep('finish_session')).toBeNull();
  });
});

describe('decideNextStep — ending a concept', () => {
  it('ends the concept when a wrong answer has no turns left to spend on a hint', () => {
    expect(step('wrong', MAX_TURNS)).toBe('finish_concept');
  });

  it('ends the session instead when that wrong answer was on the last concept', () => {
    expect(step('wrong', MAX_TURNS, 0)).toBe('finish_session');
  });

  it('ends the concept when the turn budget runs out, whatever the verdict (C6)', () => {
    expect(step('deep', MAX_TURNS)).toBe('finish_concept');
    expect(step('shallow', MAX_TURNS)).toBe('finish_concept');
    expect(step('wrong', MAX_TURNS)).toBe('finish_concept');
  });

  it('ends the session when the turn budget runs out on the last concept', () => {
    expect(step('deep', MAX_TURNS, 0)).toBe('finish_session');
  });

  it('honours a session-specific turn limit rather than the default', () => {
    expect(step('deep', 1, 1, 1)).toBe('finish_concept');
    expect(step('deep', 1, 1, 2)).toBe('ask_deeper');
  });

  it('still stops if a turnIndex somehow ran past the limit', () => {
    expect(step('deep', MAX_TURNS + 1)).toBe('finish_concept');
  });
});

describe('decideNextStep — the whole table (C6 hard limit)', () => {
  const verdicts: Verdict[] = ['deep', 'shallow', 'wrong'];

  it('never asks another question on the last allowed turn', () => {
    for (const verdict of verdicts) {
      for (let remaining = 0; remaining <= 2; remaining++) {
        const decision = step(verdict, MAX_TURNS, remaining);
        expect(['finish_concept', 'finish_session']).toContain(decision);
      }
    }
  });

  it('routes a wrong answer to ask_hint on every turn except the last (#392)', () => {
    for (let turnIndex = 1; turnIndex < MAX_TURNS; turnIndex++) {
      expect(questionModeForStep(step('wrong', turnIndex))).toBe('hint');
    }
    expect(questionModeForStep(step('wrong', MAX_TURNS))).toBeNull();
  });

  it('has no traceback branch — that decision belongs to finalizeConceptResult (audit A5)', () => {
    const decisions = new Set<NextStep>();
    for (const verdict of verdicts) {
      for (let turnIndex = 1; turnIndex <= MAX_TURNS; turnIndex++) {
        decisions.add(step(verdict, turnIndex, 1));
        decisions.add(step(verdict, turnIndex, 0));
      }
    }
    expect([...decisions].sort()).toEqual([
      'ask_deeper',
      'ask_hint',
      'ask_probe',
      'finish_concept',
      'finish_session',
    ]);
  });
});

/**
 * #392 phương án B — the hint ladder end to end: `wrong` narrows the same question instead of
 * ending the concept, up to the C6 ceiling; a good answer after a hint returns to the normal
 * `ask_deeper`/`ask_probe` rule (the PR's own confirmed default for AC item 3, since #392 leaves
 * that a "propose in the PR" call rather than a locked decision).
 */
describe('decideNextStep — the wrong→hint ladder (#392)', () => {
  it('wrong → hint → wrong → hint → closes at the C6 ceiling (2 hints max)', () => {
    // Turn 1 wrong: still 2 turns left (MAX_TURNS=3) → hint.
    expect(step('wrong', 1)).toBe('ask_hint');
    // Turn 2 (first hint) answered wrong again: 1 turn left → hint again.
    expect(step('wrong', 2)).toBe('ask_hint');
    // Turn 3 (second hint) answered wrong: 0 turns left → the C6 ceiling closes it, not a third hint.
    expect(step('wrong', MAX_TURNS)).toBe('finish_concept');
  });

  it('wrong → hint → deep → returns to the normal ask_deeper rule', () => {
    expect(step('wrong', 1)).toBe('ask_hint');
    // Turn 2 (the hint) answered deep, still a turn left → normal rule resumes.
    expect(step('deep', 2)).toBe('ask_deeper');
  });

  it('wrong → hint → shallow → returns to the normal ask_probe rule', () => {
    expect(step('wrong', 1)).toBe('ask_hint');
    expect(step('shallow', 2)).toBe('ask_probe');
  });

  it('a wrong answer on the very last C6 turn closes the concept, never a third hint', () => {
    expect(step('wrong', MAX_TURNS)).toBe('finish_concept');
    expect(step('wrong', MAX_TURNS, 0)).toBe('finish_session');
  });

  it('a session-specific lower turn limit shortens the ladder the same way (no hard-coded 2)', () => {
    // maxTurns = 2: turn 1 wrong still has a turn left → one hint; turn 2 wrong has none → closes.
    // Only 1 hint fits, not #392's usual 2 — the cap is `maxTurns - 1`, always derived, never a
    // separate constant that could drift out of sync with C6.
    expect(
      decideNextStep({ verdict: 'wrong', turnIndex: 1, maxTurns: 2, remainingConcepts: 1 })
    ).toBe('ask_hint');
    expect(
      decideNextStep({ verdict: 'wrong', turnIndex: 2, maxTurns: 2, remainingConcepts: 1 })
    ).toBe('finish_concept');
  });
});

describe('turn limits', () => {
  it('caps a concept at as many turns as the mastery formula has weights', () => {
    // If these ever diverge, calculateMasteryScore throws on the extra turn (RangeError) and
    // a session dies mid-concept. The two constants describe the same limit.
    expect(MAX_TURNS_PER_CONCEPT).toBe(TURN_WEIGHTS.length);
    expect(DEFAULT_MAX_TURNS_PER_CONCEPT).toBeLessThanOrEqual(MAX_TURNS_PER_CONCEPT);
  });

  it('accepts only turns inside the session limit', () => {
    expect(isTurnWithinLimit(1, 3)).toBe(true);
    expect(isTurnWithinLimit(3, 3)).toBe(true);
    expect(isTurnWithinLimit(4, 3)).toBe(false);
    expect(isTurnWithinLimit(0, 3)).toBe(false);
  });

  it('clamps to the global maximum even if a session row claims a bigger limit', () => {
    expect(isTurnWithinLimit(MAX_TURNS_PER_CONCEPT + 1, 10)).toBe(false);
  });
});

/**
 * AE-05's flashcard-fallback stepping (UC-12) — pure, same C4/R05 charter as `decideNextStep`
 * above. Mostly ignores `deep`/`shallow` verdicts: fallback mode asks every cached question it
 * has, in order, then finishes — but a `wrong` verdict still ends the concept early (CF-03/CF-04,
 * covered in the describe block below).
 */
describe('resolveFallbackStep', () => {
  it('is UC-12 E1 when the concept has never had a question served and none is cached', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 0,
        cachedTurnsServed: 0,
        totalTurnsServed: 0,
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'no_cache_available' });
  });

  it('asks the first cached question when none has been served yet', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 0,
        totalTurnsServed: 0,
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'ask_cached', cacheIndex: 0 });
  });

  it('asks the second cached question after the first has been served', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 1,
        totalTurnsServed: 1,
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'ask_cached', cacheIndex: 1 });
  });

  it('finishes the concept once every cached question has been served — not an error', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 2,
        totalTurnsServed: 2,
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'finish_concept' });
  });

  it('finishes early when only one question was ever cached for this concept', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 1,
        cachedTurnsServed: 1,
        totalTurnsServed: 1,
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'finish_concept' });
  });

  it('honours C6: a lower session maxTurns stops the fallback path too', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 1,
        totalTurnsServed: 1,
        maxTurns: 1,
        lastVerdict: null,
      })
    ).toEqual({ type: 'finish_concept' });
  });

  it('never asks past MAX_CACHED_QUESTIONS_PER_CONCEPT even if more rows were somehow cached', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 5,
        cachedTurnsServed: MAX_CACHED_QUESTIONS_PER_CONCEPT,
        totalTurnsServed: MAX_CACHED_QUESTIONS_PER_CONCEPT,
        maxTurns: 10,
        lastVerdict: null,
      })
    ).toEqual({ type: 'finish_concept' });
  });

  // Regression test for a real bug found via manual testing against live Gemini (2026-08-02):
  // grading failure — the common real-world trigger for fallback (AE-02 E2) — always fires
  // *after* a question was already asked by AI, so a concept typically enters fallback already
  // holding `source: 'ai'` turns. Cache use must be tracked separately from total turns served,
  // or a concept with two fresh, untouched cached questions finishes having served zero of them.
  it('still serves fresh cache when fallback starts mid-concept, after AI turns already happened', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 0, // no cache used yet — the 2 prior turns were both AI-sourced
        totalTurnsServed: 2, // ...but 2 turns of *some* kind already happened for this concept
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'ask_cached', cacheIndex: 0 });
  });

  it('still respects C6 in the mixed AI+cache scenario: no budget left, no more cache either', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 0,
        totalTurnsServed: 3, // maxTurns already reached by prior AI turns alone
        maxTurns: 3,
        lastVerdict: null,
      })
    ).toEqual({ type: 'finish_concept' });
  });
});

/**
 * CF-03/CF-04 regression: fallback mode must end a concept immediately on `wrong`, the same
 * rule AI mode enforces in `decideNextStep`. Before this fix, a `wrong` self-grade in fallback
 * mode was ignored and the next cached question was served — the student kept answering a
 * concept they had already shown they do not understand.
 */
describe('resolveFallbackStep — wrong verdict ends concept (CF-03/CF-04)', () => {
  it('ends the concept immediately when the last verdict is wrong, even with cache left', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 0,
        totalTurnsServed: 1,
        maxTurns: 3,
        lastVerdict: 'wrong',
      })
    ).toEqual({ type: 'finish_concept' });
  });

  it('ends the concept on wrong after AI turns + one cached turn', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 1,
        totalTurnsServed: 2, // 1 AI + 1 cache_fallback, last was wrong
        maxTurns: 3,
        lastVerdict: 'wrong',
      })
    ).toEqual({ type: 'finish_concept' });
  });

  it('still serves the next cached question when the last verdict is deep', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 1,
        totalTurnsServed: 1,
        maxTurns: 3,
        lastVerdict: 'deep',
      })
    ).toEqual({ type: 'ask_cached', cacheIndex: 1 });
  });

  it('still serves the next cached question when the last verdict is shallow', () => {
    expect(
      resolveFallbackStep({
        cachedQuestionCount: 2,
        cachedTurnsServed: 0,
        totalTurnsServed: 1,
        maxTurns: 3,
        lastVerdict: 'shallow',
      })
    ).toEqual({ type: 'ask_cached', cacheIndex: 0 });
  });
});

describe('self-grade mapping (AE-05, UC-12 step 5 — hard-coded, no free-form score)', () => {
  it.each<[SelfGrade, number]>([
    ['correct', 1],
    ['partial', 0.5],
    ['wrong', 0],
  ])('maps %s to score %s', (selfGrade, expectedScore) => {
    expect(SELF_GRADE_SCORE[selfGrade]).toBe(expectedScore);
  });

  it.each<[SelfGrade, string]>([
    ['correct', 'deep'],
    ['partial', 'shallow'],
    ['wrong', 'wrong'],
  ])('maps %s to verdict %s', (selfGrade, expectedVerdict) => {
    expect(SELF_GRADE_VERDICT[selfGrade]).toBe(expectedVerdict);
  });
});
