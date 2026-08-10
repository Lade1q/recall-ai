import {
  MASTERY_STRONG_THRESHOLD,
  MAX_REVIEW_INTERVAL_DAYS,
  MIN_REVIEW_INTERVAL_DAYS,
  TURN_WEIGHTS,
  addDays,
  calculateMasteryScore,
  classifyMastery,
  daysUntil,
  gradedTurnScores,
  reviewIntervalDays,
  reviewPriority,
  sessionMasteryScore,
  summariseMasteryDistribution,
} from '../utils/mastery';
import { MASTERY_THRESHOLD } from '../services/traceback.service';

/**
 * Unit tests for the deterministic half of I7.2 (#123). No DB, no API key — the whole point
 * of keeping these functions pure (SDP risk R05).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-30T10:00:00.000Z');

/** A plan deadline as `plan.service.ts` stores it: end of the chosen day, in UTC. */
function deadlineInDays(days: number): Date {
  const date = new Date(NOW.getTime() + days * MS_PER_DAY);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

describe('calculateMasteryScore', () => {
  it('weights the three turns 0.2 / 0.3 / 0.5 (UC-Overview §5.4)', () => {
    // 0.2*1.0 + 0.3*0.5 + 0.5*0.0
    expect(calculateMasteryScore([1.0, 0.5, 0.0])).toBe(0.35);
  });

  it('returns 1 when every turn is perfect', () => {
    expect(calculateMasteryScore([1.0, 1.0, 1.0])).toBe(1);
  });

  it('returns 0 when every turn is wrong', () => {
    expect(calculateMasteryScore([0.0, 0.0, 0.0])).toBe(0);
  });

  it('makes the last turn count more than the first', () => {
    // The deeper question is the one that says something about understanding.
    expect(calculateMasteryScore([0.0, 0.0, 1.0])).toBeGreaterThan(
      calculateMasteryScore([1.0, 0.0, 0.0]) as number
    );
  });

  it('renormalises the weights for two turns instead of using [0.2, 0.3] as-is', () => {
    // [0.2, 0.3] normalised is [0.4, 0.6]. Dividing by the full 1.0 would give 0.2 and punish
    // a concept for ending early on a `wrong` verdict.
    expect(calculateMasteryScore([1.0, 0.0])).toBe(0.4);
    expect(calculateMasteryScore([0.0, 1.0])).toBe(0.6);
  });

  it('gives a single turn the full weight', () => {
    expect(calculateMasteryScore([0.7])).toBe(0.7);
  });

  it('returns null — not 0 — when no turn could be graded', () => {
    // "never assessed" and "answered completely wrong" drive different decisions downstream.
    expect(calculateMasteryScore([])).toBeNull();
    expect(calculateMasteryScore([])).not.toBe(0);
  });

  it('rounds to two decimals', () => {
    // 0.2*1.0 + 0.3*0.5 + 0.5*0.33 = 0.515
    expect(calculateMasteryScore([1.0, 0.5, 0.33])).toBe(0.52);
  });

  it('stays within [0, 1] for every combination of turn scores', () => {
    const samples = [0, 0.33, 0.5, 0.67, 1];
    for (const a of samples) {
      for (const b of samples) {
        for (const c of samples) {
          const score = calculateMasteryScore([a, b, c]) as number;
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('throws on more turns than C6 allows rather than inventing a weight', () => {
    expect(() => calculateMasteryScore([1, 1, 1, 1])).toThrow(RangeError);
    expect(TURN_WEIGHTS).toHaveLength(3);
  });

  it('clamps dirty scores outside [0, 1] to the boundaries', () => {
    // Test case required by Phase 4 for handling invalid scores out of bounds
    expect(calculateMasteryScore([1.5])).toBe(1);
    expect(calculateMasteryScore([-0.5])).toBe(0);
    // A heavily negative start followed by positive scores will still be clamped appropriately
    expect(calculateMasteryScore([-1.0, 0.0, -0.5])).toBe(0);
    expect(calculateMasteryScore([2.0, 1.5, 3.0])).toBe(1);
  });
});

describe('gradedTurnScores', () => {
  it('keeps the graded turns in the order they were asked', () => {
    expect(gradedTurnScores([{ score: 0.5 }, { score: 1 }])).toEqual([0.5, 1]);
  });

  it('drops an ungraded turn instead of reading it as a zero', () => {
    // The half-finished concept of a session ended early (#243): turn 3 was never answered,
    // so the score is the two-turn one, not a three-turn average dragged down by a phantom 0.
    const scores = gradedTurnScores([{ score: 0.5 }, { score: 1 }, { score: null }]);

    expect(scores).toEqual([0.5, 1]);
    expect(calculateMasteryScore(scores)).toBe(0.8);
    expect(calculateMasteryScore([0.5, 1, 0])).not.toBe(0.8);
  });

  it('returns an empty array when nothing was graded, which reads as "never assessed"', () => {
    expect(gradedTurnScores([{ score: null }])).toEqual([]);
    expect(calculateMasteryScore(gradedTurnScores([{ score: null }]))).toBeNull();
  });

  it('keeps a genuine 0 — answered and completely wrong is not the same as ungraded', () => {
    expect(gradedTurnScores([{ score: 0 }])).toEqual([0]);
  });
});

describe('sessionMasteryScore', () => {
  it("derives the score from this session's own 3 graded turns, weighted [0.2, 0.3, 0.5]", () => {
    const turns = [
      { turnIndex: 1, score: 1.0 },
      { turnIndex: 2, score: 0.5 },
      { turnIndex: 3, score: 0.0 },
    ];
    expect(sessionMasteryScore(turns)).toBe(0.35);
  });

  it('renormalises to [0.4, 0.6] for a 2-turn concept', () => {
    const turns = [
      { turnIndex: 1, score: 1.0 },
      { turnIndex: 2, score: 0.0 },
    ];
    expect(sessionMasteryScore(turns)).toBe(0.4);
  });

  it('returns null — not 0 — when no turn of this concept could be graded', () => {
    const turns = [
      { turnIndex: 1, score: null },
      { turnIndex: 2, score: null },
    ];
    expect(sessionMasteryScore(turns)).toBeNull();
  });

  it('sorts by turnIndex before weighting, regardless of input order', () => {
    const inOrder = sessionMasteryScore([
      { turnIndex: 1, score: 1.0 },
      { turnIndex: 2, score: 0.5 },
      { turnIndex: 3, score: 0.0 },
    ]);
    const shuffled = sessionMasteryScore([
      { turnIndex: 3, score: 0.0 },
      { turnIndex: 1, score: 1.0 },
      { turnIndex: 2, score: 0.5 },
    ]);
    expect(shuffled).toBe(inOrder);
  });

  it('falls back to a plain mean instead of throwing when given more turns than C6 allows', () => {
    // A read path over whatever the database holds: a summary must not 500 just because the
    // data violates an invariant that should have been enforced elsewhere.
    const turns = [
      { turnIndex: 1, score: 1.0 },
      { turnIndex: 2, score: 1.0 },
      { turnIndex: 3, score: 1.0 },
      { turnIndex: 4, score: 0.0 },
    ];
    expect(sessionMasteryScore(turns)).toBe(0.75);
  });
});

describe('daysUntil', () => {
  it('returns null for a plan with no deadline', () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('counts whole days left', () => {
    expect(daysUntil(new Date(NOW.getTime() + 3 * MS_PER_DAY), NOW)).toBe(3);
  });

  it('floors a partial day so a review still lands before the deadline', () => {
    // Deadline is 1.58 days out (today 10:00 -> tomorrow 23:59): only one usable day.
    expect(daysUntil(deadlineInDays(1), NOW)).toBe(1);
  });

  it('goes negative once the deadline is past', () => {
    expect(daysUntil(new Date(NOW.getTime() - 2 * MS_PER_DAY), NOW)).toBeLessThan(0);
  });
});

describe('reviewIntervalDays', () => {
  it('brings a completely failed concept back tomorrow', () => {
    expect(reviewIntervalDays(0, null)).toBe(MIN_REVIEW_INTERVAL_DAYS);
  });

  it('pushes a fully mastered concept out two weeks', () => {
    expect(reviewIntervalDays(1, null)).toBe(MAX_REVIEW_INTERVAL_DAYS);
  });

  it('treats a never-tested concept as urgently as a failed one', () => {
    expect(reviewIntervalDays(null, null)).toBe(reviewIntervalDays(0, null));
  });

  it('scales linearly in between', () => {
    // round(1 + 0.35 * 13) = round(5.55)
    expect(reviewIntervalDays(0.35, null)).toBe(6);
  });

  it('still separates high scores instead of saturating at 14 days (audit B5)', () => {
    // The replaced formula, round(3 * mastery * 7), hit the 14-day cap for every mastery
    // >= 0.67, collapsing most of the range into one interval.
    const intervals = [0.7, 0.8, 0.9, 1].map((mastery) => reviewIntervalDays(mastery, null));
    expect(new Set(intervals).size).toBe(intervals.length);
  });

  it('never schedules a review after the plan deadline', () => {
    expect(reviewIntervalDays(1, 3)).toBe(3);
  });

  it('leaves the interval alone when the deadline is further out than it', () => {
    expect(reviewIntervalDays(0.35, 30)).toBe(6);
  });

  it('still returns at least one day when the deadline has passed', () => {
    expect(reviewIntervalDays(0.9, -5)).toBe(MIN_REVIEW_INTERVAL_DAYS);
    expect(reviewIntervalDays(0.9, 0)).toBe(MIN_REVIEW_INTERVAL_DAYS);
  });
});

describe('reviewPriority', () => {
  /** What traceback can actually report: below the mastery threshold, or never tested. */
  const WEAK_SCORES: (number | null)[] = [null, 0, 0.3, 0.59];

  it('ranks a concept by how little of it is mastered', () => {
    expect(reviewPriority({ masteryScore: 0.8, depth: null })).toBe(0.2);
    expect(reviewPriority({ masteryScore: 0.3, depth: null })).toBe(0.7);
  });

  it('treats a never-tested concept as the most urgent', () => {
    expect(reviewPriority({ masteryScore: null, depth: null })).toBe(1);
  });

  it('puts every depth-1 prerequisite ahead of every depth-2 one', () => {
    const depth1 = WEAK_SCORES.map((masteryScore) => reviewPriority({ masteryScore, depth: 1 }));
    const depth2 = WEAK_SCORES.map((masteryScore) => reviewPriority({ masteryScore, depth: 2 }));
    expect(Math.min(...depth1)).toBeGreaterThan(Math.max(...depth2));
  });

  it('puts every traced prerequisite ahead of any concept scheduled for spaced repetition', () => {
    // AE-07 step 6: the prerequisite is learnt *before* the concept it was traced from, and
    // that must not depend on how badly the student did on either one.
    const traced = WEAK_SCORES.flatMap((masteryScore) => [
      reviewPriority({ masteryScore, depth: 1 }),
      reviewPriority({ masteryScore, depth: 2 }),
    ]);
    const baseline = [null, 0, 0.5, 1].map((masteryScore) =>
      reviewPriority({ masteryScore, depth: null })
    );
    expect(Math.min(...traced)).toBeGreaterThan(Math.max(...baseline));
  });

  it('orders prerequisites at the same depth by weakness', () => {
    expect(reviewPriority({ masteryScore: 0.1, depth: 1 })).toBeGreaterThan(
      reviewPriority({ masteryScore: 0.5, depth: 1 })
    );
  });

  it('keeps the weakest prerequisite at the top of the queue', () => {
    expect(reviewPriority({ masteryScore: null, depth: 1 })).toBe(3);
    expect(MASTERY_THRESHOLD).toBe(0.6);
  });
});

describe('classifyMastery', () => {
  it('splits the score range at 0.6 and 0.8', () => {
    expect(classifyMastery(1)).toBe('strong');
    expect(classifyMastery(MASTERY_STRONG_THRESHOLD)).toBe('strong');
    expect(classifyMastery(0.79)).toBe('learning');
    expect(classifyMastery(MASTERY_THRESHOLD)).toBe('learning');
    expect(classifyMastery(0.59)).toBe('weak');
    expect(classifyMastery(0)).toBe('weak');
  });

  it('keeps never-tested apart from scored-zero', () => {
    // Collapsing these would tell a user they are failing material nobody asked them about.
    expect(classifyMastery(null)).toBe('untested');
    expect(classifyMastery(0)).toBe('weak');
  });
});

describe('summariseMasteryDistribution', () => {
  it('counts every concept into exactly one band', () => {
    const scores = [0.95, 0.8, 0.7, 0.6, 0.3, null, null];
    const distribution = summariseMasteryDistribution(scores);

    expect(distribution).toEqual({ strong: 2, learning: 2, weak: 1, untested: 2 });
    const total = Object.values(distribution).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(scores.length);
  });

  it('returns all four bands at zero for a plan with no concepts', () => {
    // The legend renders from these keys, so a missing band would drop a row from the card.
    expect(summariseMasteryDistribution([])).toEqual({
      strong: 0,
      learning: 0,
      weak: 0,
      untested: 0,
    });
  });
});

describe('addDays', () => {
  it('shifts a timestamp forward by whole days', () => {
    expect(addDays(NOW, 3).toISOString()).toBe('2026-08-02T10:00:00.000Z');
  });

  it('does not mutate the date it is given', () => {
    const before = NOW.toISOString();
    addDays(NOW, 5);
    expect(NOW.toISOString()).toBe(before);
  });
});
