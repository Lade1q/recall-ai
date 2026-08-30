import type { ReviewReason } from '@prisma/client';
import { foldToRepresentatives, sortScheduleItems } from '../services/review-schedule.service';
import { MASTERY_THRESHOLD } from '../services/traceback.service';

/** Hàng thô tối thiểu mà luật gộp đọc tới. */
interface FoldRow {
  id: string;
  planId: string;
  conceptId: string;
  reason: ReviewReason;
  createdAt: Date;
  concept: { masteryScore: number | null };
}

function foldRow(
  id: string,
  planId: string,
  conceptId: string,
  createdAt: string,
  reason: ReviewReason = 'spaced_repetition',
  masteryScore: number | null = 0.5
): FoldRow {
  return {
    id,
    planId,
    conceptId,
    reason,
    createdAt: new Date(createdAt),
    concept: { masteryScore },
  };
}

function scheduleItem(id: string, dateKey: string, reason: ReviewReason, priority: number) {
  return { id, dateKey, reason, priority };
}

describe('foldToRepresentatives', () => {
  it('gives back exactly one row per (planId, conceptId)', () => {
    const rows = [
      foldRow('a1', 'p1', 'c1', '2026-08-01T00:00:00Z'),
      foldRow('a2', 'p1', 'c1', '2026-08-05T00:00:00Z'),
      foldRow('b1', 'p1', 'c2', '2026-08-01T00:00:00Z'),
    ];
    const folded = foldToRepresentatives(rows);
    expect(folded).toHaveLength(2);
    expect(new Set(folded.map((r) => r.conceptId))).toEqual(new Set(['c1', 'c2']));
  });

  // Cùng khái niệm nhưng khác kế hoạch là HAI cái hẹn khác nhau, không phải trùng lặp: khoá gộp
  // là cặp, không phải riêng `conceptId`. Gộp nhầm sẽ làm một kế hoạch nuốt mục của kế hoạch kia.
  it('keeps the same concept twice when it belongs to two plans', () => {
    const rows = [
      foldRow('a', 'p1', 'shared', '2026-08-01T00:00:00Z'),
      foldRow('b', 'p2', 'shared', '2026-08-01T00:00:00Z'),
    ];
    expect(foldToRepresentatives(rows)).toHaveLength(2);
  });

  it('keeps the newest row of a cluster when no row is a weak traceback', () => {
    const rows = [
      foldRow('old', 'p1', 'c1', '2026-08-01T00:00:00Z'),
      foldRow('new', 'p1', 'c1', '2026-08-09T00:00:00Z'),
    ];
    expect(foldToRepresentatives(rows).map((r) => r.id)).toEqual(['new']);
  });

  it('keeps a weak traceback row over a newer ordinary one', () => {
    const rows = [
      foldRow('traceback', 'p1', 'c1', '2026-08-01T00:00:00Z', 'traceback', 0.2),
      foldRow('newer', 'p1', 'c1', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.2),
    ];
    expect(foldToRepresentatives(rows).map((r) => r.id)).toEqual(['traceback']);
  });

  it('lets the newest row win once the concept reaches the bar', () => {
    const rows = [
      foldRow('traceback', 'p1', 'c1', '2026-08-01T00:00:00Z', 'traceback', MASTERY_THRESHOLD),
      foldRow('newer', 'p1', 'c1', '2026-08-09T00:00:00Z', 'spaced_repetition', MASTERY_THRESHOLD),
    ];
    expect(foldToRepresentatives(rows).map((r) => r.id)).toEqual(['newer']);
  });

  it('returns an empty list for no rows', () => {
    expect(foldToRepresentatives([])).toEqual([]);
  });
});

describe('sortScheduleItems', () => {
  it('orders by dateKey ascending', () => {
    const sorted = sortScheduleItems([
      scheduleItem('c', '2026-08-27', 'spaced_repetition', 0.5),
      scheduleItem('a', '2026-08-12', 'spaced_repetition', 0.5),
      scheduleItem('b', '2026-08-19', 'spaced_repetition', 0.5),
    ]);
    expect(sorted.map((i) => i.dateKey)).toEqual(['2026-08-12', '2026-08-19', '2026-08-27']);
  });

  // Luật hai tầng bên trong một ngày là của `sortReviewItems`, không cài lại ở đây — ca này ghim
  // rằng nó THẬT SỰ được áp dụng, chứ không phải mảng chỉ tình cờ đúng thứ tự.
  it('puts traceback first inside one day, then priority descending', () => {
    const sorted = sortScheduleItems([
      scheduleItem('low', '2026-08-20', 'spaced_repetition', 0.1),
      scheduleItem('high', '2026-08-20', 'spaced_repetition', 0.9),
      scheduleItem('traceback', '2026-08-20', 'traceback', 0.01),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['traceback', 'high', 'low']);
  });

  // Ngày nhỏ hơn phải đứng trước dù mục trong đó yếu hơn — hai tầng sắp KHÔNG được trộn vào nhau.
  it('never lets a high-priority later day jump ahead of an earlier day', () => {
    const sorted = sortScheduleItems([
      scheduleItem('later-traceback', '2026-08-27', 'traceback', 1),
      scheduleItem('earlier-weak', '2026-08-12', 'spaced_repetition', 0.01),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['earlier-weak', 'later-traceback']);
  });

  it('returns an empty list for no items', () => {
    expect(sortScheduleItems([])).toEqual([]);
  });
});
