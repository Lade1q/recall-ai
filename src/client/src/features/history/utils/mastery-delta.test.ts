import { describe, expect, it } from 'vitest';
import { readMasteryDelta, formatDifference, formatScore } from './mastery-delta';
import type { InterviewSessionListConceptDelta } from '../types/history.types';

function concept(
  overrides: Partial<InterviewSessionListConceptDelta> = {}
): InterviewSessionListConceptDelta {
  return {
    conceptId: 'c1',
    name: 'Duyệt đồ thị BFS',
    masteryBefore: 0.58,
    masteryAfter: 0.72,
    isFirstAssessment: false,
    ...overrides,
  };
}

describe('readMasteryDelta — "chưa đo" không được biến thành mức tăng', () => {
  it('điểm trước NULL ⇒ "lần đầu", KHÔNG phải mức tăng tính từ 0', () => {
    const delta = readMasteryDelta(
      concept({ masteryBefore: null, masteryAfter: 0.72, isFirstAssessment: true })
    );

    expect(delta.kind).toBe('first');
    expect(delta.after).toBe(0.72);
    // Đây là cả lý do tồn tại của hàm này: `masteryBefore ?? 0` rồi vẽ `+0.72` là bịa ra một
    // điểm xuất phát mà chưa ai từng đo (SPEC_DB-03 bước #4 / UC-Overview §5.3).
    expect(delta.difference).toBeNull();
    expect(delta.before).toBeNull();
  });

  it('điểm trước 0.0 là đã đo và sai hoàn toàn ⇒ vẫn tính mức tăng bình thường', () => {
    const delta = readMasteryDelta(
      concept({ masteryBefore: 0, masteryAfter: 0.4, isFirstAssessment: false })
    );

    expect(delta.kind).toBe('changed');
    expect(delta.difference).toBeCloseTo(0.4, 5);
  });

  it('điểm trước NULL vẫn ra "lần đầu" kể cả khi server quên bật isFirstAssessment', () => {
    const delta = readMasteryDelta(
      concept({ masteryBefore: null, masteryAfter: 0.5, isFirstAssessment: false })
    );

    expect(delta.kind).toBe('first');
  });

  it('phiên không chấm được khái niệm ⇒ ungraded, không phải điểm 0', () => {
    const delta = readMasteryDelta(concept({ masteryAfter: null }));

    expect(delta.kind).toBe('ungraded');
    expect(delta.after).toBeNull();
  });

  it('điểm giảm giữ dấu âm', () => {
    const delta = readMasteryDelta(concept({ masteryBefore: 0.62, masteryAfter: 0.58 }));

    expect(delta.kind).toBe('changed');
    expect(delta.difference).toBeLessThan(0);
  });
});

describe('formatDifference', () => {
  it('dùng dấu trừ thật (U+2212) cho số âm, không phải hyphen', () => {
    expect(formatDifference(-0.04)).toBe('−0.04');
    expect(formatDifference(-0.04).includes('-')).toBe(false);
  });

  it('luôn có dấu + cho số dương và giữ 2 chữ số thập phân', () => {
    expect(formatDifference(0.14)).toBe('+0.14');
    expect(formatDifference(0.1)).toBe('+0.10');
  });

  it('sai số dấu phẩy động không rò ra giao diện', () => {
    expect(formatDifference(0.72 - 0.58)).toBe('+0.14');
  });
});

describe('formatScore', () => {
  it('null hiện gạch ngang, không hiện 0.00', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(0)).toBe('0.00');
  });
});
