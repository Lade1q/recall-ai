import { reconcileVerdict, DEEP_MIN_SCORE, WRONG_MAX_SCORE } from '../utils/interview-grading';

/**
 * Unit tests for verdict <-> score reconciliation (I6.2 / #114).
 * Pure function, no API key and no DB: the rule that decides the final verdict is
 * deterministic software logic (C4), so it must be provable on its own.
 */
describe('reconcileVerdict', () => {
  describe('leaves a consistent verdict untouched', () => {
    it.each([
      ['deep', 0.9],
      ['deep', DEEP_MIN_SCORE],
      ['shallow', 0.55],
      ['wrong', 0.1],
      ['wrong', 0.0],
    ] as const)('keeps %s at score %s', (verdict, score) => {
      expect(reconcileVerdict(score, verdict)).toEqual({ verdict, corrected: false });
    });
  });

  describe('trusts the score when the two contradict', () => {
    it('downgrades deep to shallow when the score is mid-range', () => {
      expect(reconcileVerdict(0.5, 'deep')).toEqual({ verdict: 'shallow', corrected: true });
    });

    it('downgrades deep to wrong when the score is low', () => {
      expect(reconcileVerdict(0.2, 'deep')).toEqual({ verdict: 'wrong', corrected: true });
    });

    it('upgrades wrong to shallow when the score is mid-range', () => {
      expect(reconcileVerdict(0.5, 'wrong')).toEqual({ verdict: 'shallow', corrected: true });
    });

    it('upgrades wrong to deep when the score is high', () => {
      expect(reconcileVerdict(0.85, 'wrong')).toEqual({ verdict: 'deep', corrected: true });
    });
  });

  describe('boundary values', () => {
    it(`treats ${DEEP_MIN_SCORE} as deep enough`, () => {
      expect(reconcileVerdict(DEEP_MIN_SCORE, 'deep').corrected).toBe(false);
    });

    it(`rejects deep just below ${DEEP_MIN_SCORE}`, () => {
      expect(reconcileVerdict(0.69, 'deep')).toEqual({ verdict: 'shallow', corrected: true });
    });

    it(`rejects wrong at exactly ${WRONG_MAX_SCORE}`, () => {
      expect(reconcileVerdict(WRONG_MAX_SCORE, 'wrong')).toEqual({
        verdict: 'shallow',
        corrected: true,
      });
    });

    it(`accepts wrong just below ${WRONG_MAX_SCORE}`, () => {
      expect(reconcileVerdict(0.39, 'wrong').corrected).toBe(false);
    });
  });

  // A high-scoring answer that only restates a definition is still shallow — the AI's
  // judgement about the shape of the answer is kept, since no invariant is violated.
  it('keeps shallow at a high score rather than promoting it to deep', () => {
    expect(reconcileVerdict(0.95, 'shallow')).toEqual({ verdict: 'shallow', corrected: false });
  });

  it('keeps shallow at a low score rather than demoting it to wrong', () => {
    expect(reconcileVerdict(0.05, 'shallow')).toEqual({ verdict: 'shallow', corrected: false });
  });
});
