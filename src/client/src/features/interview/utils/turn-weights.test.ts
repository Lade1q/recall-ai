import { describe, expect, it } from 'vitest';

import { normalizedTurnWeights, TURN_WEIGHTS, turnWeightLabel } from './turn-weights';
import { turnWeightLabeller, weightSlotsForConcept } from './turn-mode';
import type { InterviewTurnResponse } from '../types/interview.types';

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
  it('hiện trọng số theo SLOT trong công thức', () => {
    expect(turnWeightLabel(0, 3)).toBe('×0.2');
    expect(turnWeightLabel(1, 3)).toBe('×0.3');
    expect(turnWeightLabel(2, 3)).toBe('×0.5');
  });

  /**
   * `null` gộp hai ca, và cả hai đều là "thà im còn hơn gán sai": lượt gợi ý (không có slot) và
   * lượt CHƯA chấm (slot chưa biết được — nó phụ thuộc lượt ấy có thành gợi ý hay không).
   */
  it('im lặng khi không có slot', () => {
    expect(turnWeightLabel(null, 3)).toBeNull();
  });

  it('im lặng khi phiên không dùng trần mặc định, hoặc slot vượt mảng', () => {
    expect(turnWeightLabel(0, 2)).toBeNull();
    expect(turnWeightLabel(3, 3)).toBeNull();
  });
});

/**
 * 🔴 Ca đã ship hỏng ở head `3b6b5bd` và lane tĩnh bắt được: hàm nhận `turnIndex` nên lượt đứng
 * SAU một lượt gợi ý không tụt slot. Cùng một lượt, màn Lịch sử in `0.3` còn dải lượt màn vấn
 * đáp in `×0.5` — và `0.5` chuẩn hoá ra `0.714`, một con số không xuất hiện ở đâu cả.
 *
 * Test này phải đi qua CẢ `weightSlotsForConcept` lẫn `turnWeightLabel`: bug không nằm trong
 * hàm nào cả, nó nằm ở chỗ **đại lượng nào được truyền**. Ghim riêng từng hàm sẽ xanh cả hai.
 *
 * Và nó phải có ĐỦ HAI thế giới — chỉ ghim ca có gợi ý thì một hàm luôn trả `×0.3` cũng xanh.
 */
describe('slot → nhãn: lượt sau lượt gợi ý phải TỤT slot (#392 (c))', () => {
  const turn = (id: string, turnIndex: number, counts: boolean): InterviewTurnResponse =>
    ({
      id,
      conceptId: 'c1',
      conceptName: 'Ngăn xếp',
      turnIndex,
      questionText: 'q',
      questionType: 'recall',
      answerText: 'a',
      score: 0.5,
      feedback: null,
      verdict: 'shallow',
      askedAt: '2026-08-30T10:00:00.000Z',
      answeredAt: '2026-08-30T10:01:00.000Z',
      mode: counts ? 'initial' : 'hint',
      countsTowardMastery: counts,
      sourceCitation: null,
    }) satisfies InterviewTurnResponse;

  const labelOf = (turns: InterviewTurnResponse[], id: string) =>
    turnWeightLabel(weightSlotsForConcept(turns, 'c1').get(id) ?? null, 3);

  it('🔴 t1 tính · t2 gợi ý · t3 tính ⇒ lượt 3 ăn trọng số THỨ HAI', () => {
    const turns = [turn('t1', 1, true), turn('t2', 2, false), turn('t3', 3, true)];

    expect(labelOf(turns, 't1')).toBe('×0.2');
    expect(labelOf(turns, 't2')).toBeNull();
    // 0.3, KHÔNG phải 0.5 — đây là con số khớp với `normalizedTurnWeights(2) = [0.4, 0.6]` mà
    // màn Lịch sử và khối công thức đang dùng.
    expect(labelOf(turns, 't3')).toBe('×0.3');
  });

  it('không có lượt gợi ý ⇒ trục thô và trục nén trùng nhau, lượt 3 vẫn là 0.5', () => {
    const turns = [turn('t1', 1, true), turn('t2', 2, true), turn('t3', 3, true)];

    expect(labelOf(turns, 't3')).toBe('×0.5');
  });

  /**
   * Slot phải tính TRONG một khái niệm. Không lọc thì lượt 1 của khái niệm sau nối đuôi khái
   * niệm trước và ăn slot 3 — mỗi khái niệm có thang trọng số của riêng nó.
   */
  it('🔴 slot đếm trong TỪNG khái niệm, không nối đuôi qua khái niệm khác', () => {
    const other: InterviewTurnResponse = { ...turn('o1', 1, true), conceptId: 'c2' };
    const turns = [other, turn('t1', 1, true), turn('t2', 2, true)];

    expect(labelOf(turns, 't1')).toBe('×0.2');
    expect(labelOf(turns, 't2')).toBe('×0.3');
  });

  /**
   * 🔴 Dây nối, không phải đơn vị. Bug đã ship nằm ở chỗ call site tra sai đại lượng, và đo được:
   * đột biến truyền `turnIndex - 1` ở call site **sống qua cả suite** vì màn ấy không có test
   * render. `turnWeightLabeller` nhận CHÍNH lượt đó nên nay đường ấy là lỗi biên dịch — ca này
   * ghim hành vi của closure để bản vá không lặng lẽ mất tác dụng.
   */
  it('🔴 labeller nhận lượt, và lượt chưa chấm (undefined) ⇒ không nhãn', () => {
    const turns = [turn('t1', 1, true), turn('t2', 2, false), turn('t3', 3, true)];
    const labelFor = turnWeightLabeller(turns, 'c1', 3);

    expect(labelFor(turns[0])).toBe('×0.2');
    expect(labelFor(turns[1])).toBeNull();
    expect(labelFor(turns[2])).toBe('×0.3');
    expect(labelFor(undefined)).toBeNull();
  });
});
