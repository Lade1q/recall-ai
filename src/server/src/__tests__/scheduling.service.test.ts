import type { ReviewQueueItemResponse } from '../services/scheduling.service';
import {
  ALL_PLANS_ARCHIVED_MESSAGE,
  DEFAULT_DEADLINE_HORIZON_DAYS,
  DEFAULT_TODAY_LIMIT,
  MINUTES_PER_TURN,
  NO_PLAN_MESSAGE,
  PLAN_ARCHIVED_MESSAGE,
  PLAN_AWAITING_CONFIRMATION_MESSAGE,
  TRACEBACK_RELEARN_MINUTES,
  buildInactivePlanMessage,
  buildNoActivePlanMessage,
  buildReasonText,
  calculatePriority,
  dedupeByConcept,
  estimateReviewMinutes,
  sortReviewItems,
} from '../services/scheduling.service';
import { DEFAULT_MAX_TURNS_PER_CONCEPT } from '../utils/interview-state';

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

  it('prioritizes traceback over spaced_repetition when they have the exact same priority (same mastery score)', () => {
    // Required by Phase 5: testing identical priority values
    const items = [
      { reason: 'spaced_repetition' as const, priority: 0.5 },
      { reason: 'traceback' as const, priority: 0.5 },
    ];
    // Traceback should be hoisted to the top
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

describe('estimateReviewMinutes', () => {
  it('is answering time alone for a non-traceback item', () => {
    expect(
      estimateReviewMinutes({
        reason: 'spaced_repetition',
        depth: null,
        maxTurnsPerConcept: 3,
      })
    ).toBe(3 * MINUTES_PER_TURN);
  });

  it('falls back to the schema default when no source session set the turn count', () => {
    expect(
      estimateReviewMinutes({
        reason: 'spaced_repetition',
        depth: null,
        maxTurnsPerConcept: null,
      })
    ).toBe(
      estimateReviewMinutes({
        reason: 'spaced_repetition',
        depth: null,
        maxTurnsPerConcept: DEFAULT_MAX_TURNS_PER_CONCEPT,
      })
    );
  });

  it("scales with the session's maxTurnsPerConcept (a 1-turn session is cheaper than a 3-turn one)", () => {
    const short = estimateReviewMinutes({
      reason: 'spaced_repetition',
      depth: null,
      maxTurnsPerConcept: 1,
    });
    const long = estimateReviewMinutes({
      reason: 'spaced_repetition',
      depth: null,
      maxTurnsPerConcept: 3,
    });
    expect(long - short).toBe(2 * MINUTES_PER_TURN);
  });

  it('adds re-learning time for a traceback item, more of it deeper in the prerequisite chain', () => {
    const base = { reason: 'traceback' as const, maxTurnsPerConcept: 3 };
    const plain = estimateReviewMinutes({
      reason: 'spaced_repetition',
      depth: null,
      maxTurnsPerConcept: 3,
    });

    expect(estimateReviewMinutes({ ...base, depth: 1 })).toBe(plain + TRACEBACK_RELEARN_MINUTES);
    expect(estimateReviewMinutes({ ...base, depth: 2 })).toBe(
      plain + 2 * TRACEBACK_RELEARN_MINUTES
    );
  });

  it('treats a traceback item with unknown depth as depth 1 rather than free', () => {
    const base = { reason: 'traceback' as const, maxTurnsPerConcept: 3 };
    expect(estimateReviewMinutes({ ...base, depth: null })).toBe(
      estimateReviewMinutes({ ...base, depth: 1 })
    );
  });

  it('ignores depth on a non-traceback item (no reason to re-read a prerequisite)', () => {
    expect(
      estimateReviewMinutes({ reason: 'spaced_repetition', depth: 2, maxTurnsPerConcept: 3 })
    ).toBe(
      estimateReviewMinutes({ reason: 'spaced_repetition', depth: null, maxTurnsPerConcept: 3 })
    );
  });

  // Calibration guard for the two constants: the mockup header reads "Hàng đợi hôm nay · ≈ 50
  // phút" for a default /today page (docs/analysis and design/claude-design/screen-dashboard.html
  // line 440). Changing MINUTES_PER_TURN or TRACEBACK_RELEARN_MINUTES should fail here first.
  it("adds up to the mockup's ≈50 minutes over a default today page", () => {
    const page = [
      { reason: 'traceback' as const, depth: 1, maxTurnsPerConcept: null },
      ...Array.from({ length: DEFAULT_TODAY_LIMIT - 1 }, () => ({
        reason: 'spaced_repetition' as const,
        depth: null,
        maxTurnsPerConcept: null,
      })),
    ];

    expect(page.reduce((total, item) => total + estimateReviewMinutes(item), 0)).toBe(50);
  });
});

function queueItem(
  overrides: Partial<ReviewQueueItemResponse> & { id: string; conceptId: string }
): ReviewQueueItemResponse {
  return {
    name: 'Cây AVL',
    planId: 'plan-uuid',
    planName: 'Cấu trúc dữ liệu',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.5,
    status: 'pending',
    estimatedMinutes: 9,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

describe('dedupeByConcept', () => {
  it('returns one item per concept when several sessions queued the same one (#232)', () => {
    const items = [
      queueItem({ id: 'item-1', conceptId: 'concept-avl' }),
      queueItem({ id: 'item-2', conceptId: 'concept-avl' }),
      queueItem({ id: 'item-3', conceptId: 'concept-avl' }),
      queueItem({ id: 'item-4', conceptId: 'concept-dfs' }),
    ];

    expect(dedupeByConcept(items).map((item) => item.conceptId)).toEqual([
      'concept-avl',
      'concept-dfs',
    ]);
  });

  // The survivor must be the row that would have been at the top anyway, or folding the
  // duplicates away would quietly reorder the queue.
  it('keeps the traceback row when one of the duplicates is a traceback', () => {
    const items = [
      queueItem({ id: 'item-plain', conceptId: 'concept-avl', priority: 0.9 }),
      queueItem({
        id: 'item-traceback',
        conceptId: 'concept-avl',
        reason: 'traceback',
        priority: 0.1,
      }),
    ];

    expect(dedupeByConcept(items)[0]?.id).toBe('item-traceback');
  });

  it('keeps the highest-priority row within the same tier', () => {
    const items = [
      queueItem({ id: 'item-low', conceptId: 'concept-avl', priority: 0.1 }),
      queueItem({ id: 'item-high', conceptId: 'concept-avl', priority: 0.8 }),
    ];

    expect(dedupeByConcept(items)[0]?.id).toBe('item-high');
  });

  it('leaves an already-distinct list alone, and does not mutate the input', () => {
    const items = [
      queueItem({ id: 'item-1', conceptId: 'concept-avl', priority: 0.2 }),
      queueItem({ id: 'item-2', conceptId: 'concept-dfs', priority: 0.7 }),
    ];
    const original = [...items];

    expect(dedupeByConcept(items)).toHaveLength(2);
    expect(items).toEqual(original);
  });

  it('handles an empty queue', () => {
    expect(dedupeByConcept([])).toEqual([]);
  });
});

describe('buildInactivePlanMessage', () => {
  it('tells a plan waiting for graph confirmation apart from an archived one (#232, after #265)', () => {
    expect(buildInactivePlanMessage('draft')).toBe(PLAN_AWAITING_CONFIRMATION_MESSAGE);
    expect(buildInactivePlanMessage('archived')).toBe(PLAN_ARCHIVED_MESSAGE);
    expect(buildInactivePlanMessage('draft')).not.toBe(buildInactivePlanMessage('archived'));
  });

  it('names the thing the student still owes the plan, not the status of the row', () => {
    expect(buildInactivePlanMessage('draft')).toMatch(/xác nhận/);
    expect(buildInactivePlanMessage('archived')).toMatch(/lưu trữ/);
  });
});

describe('buildNoActivePlanMessage', () => {
  it('invites a user with no plans at all to make one', () => {
    expect(buildNoActivePlanMessage([])).toBe(NO_PLAN_MESSAGE);
  });

  it('points a user whose only plans are drafts at the confirmation step, with a count', () => {
    const message = buildNoActivePlanMessage(['draft', 'draft']);

    expect(message).toContain('2 kế hoạch');
    expect(message).toMatch(/xác nhận/);
    expect(message).not.toBe(NO_PLAN_MESSAGE);
  });

  it('counts only the drafts, not every plan the user has', () => {
    expect(buildNoActivePlanMessage(['draft', 'archived', 'archived'])).toContain('1 kế hoạch');
  });

  it('prefers the draft sentence when there are both — it is the one with something to do', () => {
    expect(buildNoActivePlanMessage(['archived', 'draft'])).toBe(
      buildNoActivePlanMessage(['draft'])
    );
  });

  it('says archived when every plan is archived', () => {
    expect(buildNoActivePlanMessage(['archived', 'archived'])).toBe(ALL_PLANS_ARCHIVED_MESSAGE);
  });

  it('gives the three cases three different sentences', () => {
    const messages = new Set([
      buildNoActivePlanMessage([]),
      buildNoActivePlanMessage(['draft']),
      buildNoActivePlanMessage(['archived']),
    ]);

    expect(messages.size).toBe(3);
  });
});
