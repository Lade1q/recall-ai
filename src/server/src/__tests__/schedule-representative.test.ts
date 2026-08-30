import type { ReviewReason } from '@prisma/client';
import {
  isWeakTraceback,
  pickRepresentative,
  type RepresentativeRow,
} from '../utils/schedule-representative';
import { MASTERY_THRESHOLD } from '../services/traceback.service';

/** A row carrying an `id` so the assertions can name the winner instead of comparing objects. */
interface TestRow extends RepresentativeRow {
  id: string;
}

function row(
  id: string,
  createdAt: string,
  reason: ReviewReason,
  masteryScore: number | null
): TestRow {
  return { id, createdAt: new Date(createdAt), reason, concept: { masteryScore } };
}

describe('isWeakTraceback', () => {
  it('is true for a traceback row on a concept below the mastery bar', () => {
    expect(isWeakTraceback(row('a', '2026-08-01T00:00:00Z', 'traceback', 0.3))).toBe(true);
  });

  it('is false once the concept reaches the bar — the exact inverse of `tracebackSkipReason`', () => {
    expect(isWeakTraceback(row('a', '2026-08-01T00:00:00Z', 'traceback', MASTERY_THRESHOLD))).toBe(
      false
    );
  });

  it('treats `null` mastery as not-yet-mastered (`never_tested`), not as missing data', () => {
    expect(isWeakTraceback(row('a', '2026-08-01T00:00:00Z', 'traceback', null))).toBe(true);
  });

  // Ghim rằng ngưỡng ĐỌC từ `MASTERY_THRESHOLD`, không phải một `0.6` gõ cứng trùng giá trị. Gõ
  // cứng thì hôm nay vẫn xanh; ngày mốc dời (0.6 -> 0.7) màn Lịch lặng lẽ giữ mốc cũ và CI không
  // hé một chữ. Cặp ca này — ngay dưới mốc là "yếu", đúng mốc là "không" — kẹp cả hai hướng.
  it('reads the bar from MASTERY_THRESHOLD instead of a copy of its value', () => {
    expect(
      isWeakTraceback(row('a', '2026-08-01T00:00:00Z', 'traceback', MASTERY_THRESHOLD - 0.01))
    ).toBe(true);
  });

  it('is false for a non-traceback row however weak the concept is', () => {
    expect(isWeakTraceback(row('a', '2026-08-01T00:00:00Z', 'spaced_repetition', 0))).toBe(false);
  });
});

describe('pickRepresentative', () => {
  it('returns the only row of a one-row cluster', () => {
    const only = row('only', '2026-08-01T00:00:00Z', 'spaced_repetition', 0.5);
    expect(pickRepresentative([only])).toBe(only);
  });

  it('picks the newest row when every row is the same tier', () => {
    const rows = [
      row('old', '2026-08-01T00:00:00Z', 'spaced_repetition', 0.5),
      row('newest', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.5),
      row('middle', '2026-08-05T00:00:00Z', 'spaced_repetition', 0.5),
    ];
    expect(pickRepresentative(rows)?.id).toBe('newest');
  });

  it('keeps a weak traceback row even when a newer row exists — tier beats recency', () => {
    const rows = [
      row('traceback', '2026-08-01T00:00:00Z', 'traceback', 0.2),
      row('newer', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.2),
    ];
    expect(pickRepresentative(rows)?.id).toBe('traceback');
  });

  it('drops a traceback row to the newest once the concept is mastered', () => {
    const rows = [
      row('traceback', '2026-08-01T00:00:00Z', 'traceback', 0.85),
      row('newer', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.85),
    ];
    expect(pickRepresentative(rows)?.id).toBe('newer');
  });

  it('keeps a traceback row on an untested concept (`masteryScore: null`)', () => {
    const rows = [
      row('traceback', '2026-08-01T00:00:00Z', 'traceback', null),
      row('newer', '2026-08-09T00:00:00Z', 'spaced_repetition', null),
    ];
    expect(pickRepresentative(rows)?.id).toBe('traceback');
  });

  it('picks the newest among several weak traceback rows', () => {
    const rows = [
      row('older-traceback', '2026-08-01T00:00:00Z', 'traceback', 0.2),
      row('newer-traceback', '2026-08-06T00:00:00Z', 'traceback', 0.2),
      row('newest-but-not-traceback', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.2),
    ];
    expect(pickRepresentative(rows)?.id).toBe('newer-traceback');
  });

  it('does not depend on input order', () => {
    const rows = [
      row('traceback', '2026-08-01T00:00:00Z', 'traceback', 0.2),
      row('newer', '2026-08-09T00:00:00Z', 'spaced_repetition', 0.2),
    ];
    expect(pickRepresentative([...rows].reverse())?.id).toBe('traceback');
  });

  // Hoà `createdAt` gần như không tới được với dữ liệu thật, nhưng module này là hợp đồng cho 4
  // nhánh: `>` đổi thành `>=` phải làm test đỏ, không được lặng lẽ đảo người thắng.
  it('keeps the row seen first when two rows of the same tier tie on createdAt', () => {
    const at = '2026-08-05T00:00:00Z';
    const rows = [
      row('first', at, 'spaced_repetition', 0.5),
      row('second', at, 'spaced_repetition', 0.5),
    ];
    expect(pickRepresentative(rows)?.id).toBe('first');
    expect(pickRepresentative([...rows].reverse())?.id).toBe('second');
  });

  it('returns undefined for an empty cluster', () => {
    expect(pickRepresentative([])).toBeUndefined();
  });
});
