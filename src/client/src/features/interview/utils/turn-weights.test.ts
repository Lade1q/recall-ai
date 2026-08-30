import { describe, expect, it } from 'vitest';

import { normalizedTurnWeights, TURN_WEIGHTS, turnWeightLabel } from './turn-weights';

describe('normalizedTurnWeights', () => {
  it('chia lại cho khái niệm dưới 3 lượt, không chia cho đủ 1.0', () => {
    expect(normalizedTurnWeights(3)).toEqual([...TURN_WEIGHTS]);
    expect(normalizedTurnWeights(2)).toEqual([0.4, 0.6]);
    expect(normalizedTurnWeights(1)).toEqual([1]);
  });

  it('trả null thay vì một công thức sai khi số lượt vượt mảng trọng số', () => {
    expect(normalizedTurnWeights(0)).toBeNull();
    expect(normalizedTurnWeights(4)).toBeNull();
  });
});

describe('turnWeightLabel', () => {
  it('hiện trọng số của lượt trên phiên dùng trần mặc định', () => {
    expect(turnWeightLabel(1, 3, true)).toBe('×0.2');
    expect(turnWeightLabel(3, 3, true)).toBe('×0.5');
  });

  /**
   * 🔴 #392 (c). Lượt gợi ý KHÔNG có trọng số nào — và đây là màn sinh viên đang trả lời, nên
   * một con số sai ở đây là lời nói dối đúng lúc họ đang tin nó nhất. Ba màn hiển thị trọng số
   * (`ScoreBreakdown`, `QaTranscript`, dải lượt của màn vấn đáp) phải cùng một luật; brief chỉ
   * kê hai màn đầu, màn này tìm ra bằng cách grep NGƯỜI DÙNG của `TURN_WEIGHTS`.
   */
  it('🔴 im lặng cho lượt gợi ý thay vì gán cho nó một trọng số', () => {
    expect(turnWeightLabel(2, 3, false)).toBeNull();
    // Đối chứng: cùng lượt đó, nếu nó có tính thì vẫn hiện bình thường.
    expect(turnWeightLabel(2, 3, true)).toBe('×0.3');
  });

  it('im lặng khi phiên không dùng trần mặc định, hoặc lượt vượt mảng', () => {
    expect(turnWeightLabel(1, 2, true)).toBeNull();
    expect(turnWeightLabel(4, 3, true)).toBeNull();
  });
});
