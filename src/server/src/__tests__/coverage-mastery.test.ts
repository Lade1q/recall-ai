import { coverageMasteryScore, MIN_COVERAGE } from '../utils/mastery';

describe('coverageMasteryScore — checkpoint-coverage grain (§2.3)', () => {
  it('scores the share of resolved checkpoints that were correct, above the floor', () => {
    // C=4, resolved 3 (coverage 0.75 ≥ 0.7), all covered → 3/3 = 1.0
    expect(coverageMasteryScore(3, 0, 4)).toBe(1);
    // 2 covered + 1 contradicted of 4 → coverage 0.75, score 2/3 = 0.67
    expect(coverageMasteryScore(2, 1, 4)).toBe(0.67);
  });

  it('the 2/4-stall case is null, not 1.0 — this is why MIN_COVERAGE is 0.7 not 0.5', () => {
    // solved 2 of 4 then stalled: coverage 0.5 < 0.7 → null (would over-credit to 2/2 = 1.0 at 0.5)
    expect(coverageMasteryScore(2, 0, 4)).toBeNull();
  });

  it('MIN_COVERAGE is 0.7 and the floor is inclusive (exactly 0.7 passes)', () => {
    expect(MIN_COVERAGE).toBe(0.7);
    expect(coverageMasteryScore(7, 0, 10)).toBe(1); // 7/10 = 0.7 → passes, 7/7 = 1.0
    expect(coverageMasteryScore(6, 0, 10)).toBeNull(); // 6/10 = 0.6 < 0.7 → null
  });

  it('null when nothing resolved, and null (not a crash) when no checkpoints committed', () => {
    expect(coverageMasteryScore(0, 0, 4)).toBeNull(); // coverage 0 < 0.7
    expect(coverageMasteryScore(3, 0, 0)).toBeNull(); // committed 0 → not voice-assessable (§2.4)
  });

  it('null ≠ 0 at the coverage layer: full coverage all-wrong is 0, not null', () => {
    expect(coverageMasteryScore(4, 0, 4)).toBe(1); // all correct
    expect(coverageMasteryScore(0, 4, 4)).toBe(0); // coverage 1.0, 0/4 = 0 — assessed and wrong
  });

  it('a malformed tally is unassessable (null), never a manufactured 1.0 — matters once fed from DB _count', () => {
    expect(coverageMasteryScore(2, 0, Number.NaN)).toBeNull(); // NaN slips both gates otherwise (NaN<0.7 is false)
    expect(coverageMasteryScore(7, 0, 4)).toBeNull(); // resolved 7 > committed 4
    expect(coverageMasteryScore(5, -2, 4)).toBeNull(); // negative tally → not 1.67 out of range
    expect(coverageMasteryScore(2, 0, 2.5)).toBeNull(); // non-integer committed
  });
});
