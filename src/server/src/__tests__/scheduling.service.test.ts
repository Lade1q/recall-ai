import {
  DEFAULT_DEADLINE_HORIZON_DAYS,
  buildReasonText,
  calculatePriority,
  sortReviewItems,
} from '../services/scheduling.service';

/**
 * Unit tests for the deterministic half of I7.3 (#124). No Prisma, no clock — same "provable
 * from plain data" bar as I7.2's mastery.test.ts (SDP risk R05).
 */

describe('calculatePriority', () => {
  it('matches the UC-19 formula for a plain case', () => {
    // (1 / 5) * (1 - 0.5) = 0.1
    expect(
      calculatePriority({ masteryScore: 0.5, daysUntilDeadline: 5, reason: 'spaced_repetition' })
    ).toBe(0.1);
  });

  it('uses a 30-day horizon when the plan has no deadline', () => {
    expect(
      calculatePriority({ masteryScore: 0, daysUntilDeadline: null, reason: 'spaced_repetition' })
    ).toBe(
      calculatePriority({
        masteryScore: 0,
        daysUntilDeadline: DEFAULT_DEADLINE_HORIZON_DAYS,
        reason: 'spaced_repetition',
      })
    );
  });

  it('treats a never-tested concept (null mastery) as the most urgent, same as mastery 0', () => {
    expect(
      calculatePriority({ masteryScore: null, daysUntilDeadline: 10, reason: 'traceback' })
    ).toBe(calculatePriority({ masteryScore: 0, daysUntilDeadline: 10, reason: 'traceback' }));
  });

  it('clamps a passed deadline to 1 remaining day instead of going negative or divide-by-zero', () => {
    const overdue = calculatePriority({
      masteryScore: 0.5,
      daysUntilDeadline: -3,
      reason: 'traceback',
    });
    const dueToday = calculatePriority({
      masteryScore: 0.5,
      daysUntilDeadline: 0,
      reason: 'traceback',
    });
    const dueTomorrow = calculatePriority({
      masteryScore: 0.5,
      daysUntilDeadline: 1,
      reason: 'traceback',
    });
    expect(overdue).toBe(dueToday);
    expect(overdue).toBe(dueTomorrow);
    expect(overdue).toBe(0.5);
  });

  it('is 0 for a fully mastered concept, whatever the deadline', () => {
    expect(
      calculatePriority({ masteryScore: 1, daysUntilDeadline: 1, reason: 'spaced_repetition' })
    ).toBe(0);
  });

  it('rounds to two decimals', () => {
    // (1 / 3) * (1 - 0.4) = 0.2 -> exact; use a case that actually needs rounding
    // (1 / 7) * (1 - 0.2) = 0.11428571... -> 0.11
    expect(
      calculatePriority({ masteryScore: 0.2, daysUntilDeadline: 7, reason: 'traceback' })
    ).toBe(0.11);
  });

  it('satisfies UC-19 E2 without a special case: with no deadline anywhere, ordering collapses to mastery ascending', () => {
    const items = [
      { masteryScore: 0.9, daysUntilDeadline: null, reason: 'spaced_repetition' as const },
      { masteryScore: 0.1, daysUntilDeadline: null, reason: 'spaced_repetition' as const },
      { masteryScore: 0.5, daysUntilDeadline: null, reason: 'spaced_repetition' as const },
    ];
    const priorities = items.map(calculatePriority);
    // Weakest mastery (0.1) must score the highest priority when the deadline term is constant.
    expect(priorities[1]).toBeGreaterThan(priorities[2] as number);
    expect(priorities[2]).toBeGreaterThan(priorities[0] as number);
  });
});

describe('buildReasonText', () => {
  it("names the source concept for a traceback item (#124's own example)", () => {
    expect(
      buildReasonText('traceback', { masteryScore: null, sourceConceptName: 'Đạo hàm riêng' })
    ).toBe("Nền tảng của 'Đạo hàm riêng' mà bạn còn yếu");
  });

  it('marks a never-tested spaced-repetition concept distinctly (A3 fallback wording)', () => {
    expect(
      buildReasonText('spaced_repetition', { masteryScore: null, sourceConceptName: null })
    ).toBe('Khái niệm chưa được kiểm tra');
  });

  it('gives an already-tested spaced-repetition concept a different message', () => {
    const text = buildReasonText('spaced_repetition', {
      masteryScore: 0.5,
      sourceConceptName: null,
    });
    expect(text).not.toBe('Khái niệm chưa được kiểm tra');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('sortReviewItems', () => {
  it('audit B4 regression: puts every traceback item ahead of every other item, regardless of priority magnitude', () => {
    const items = [
      { reason: 'spaced_repetition' as const, priority: 1.0 },
      { reason: 'traceback' as const, priority: 0.05 },
    ];
    expect(sortReviewItems(items).map((item) => item.reason)).toEqual([
      'traceback',
      'spaced_repetition',
    ]);
  });

  it('sorts by priority descending within the same tier', () => {
    const items = [
      { reason: 'spaced_repetition' as const, priority: 0.2 },
      { reason: 'spaced_repetition' as const, priority: 0.8 },
      { reason: 'spaced_repetition' as const, priority: 0.5 },
    ];
    expect(sortReviewItems(items).map((item) => item.priority)).toEqual([0.8, 0.5, 0.2]);
  });

  it('does not mutate the input array', () => {
    const items = [
      { reason: 'spaced_repetition' as const, priority: 0.2 },
      { reason: 'traceback' as const, priority: 0.1 },
    ];
    const original = [...items];
    sortReviewItems(items);
    expect(items).toEqual(original);
  });
});
