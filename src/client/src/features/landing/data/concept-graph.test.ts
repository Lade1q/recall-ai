import { describe, expect, it } from 'vitest';
import {
  DEMO_GRAPH,
  MASTERY_THRESHOLD,
  masteryBand,
  traceback,
  tracebackVerdict,
} from './concept-graph';

/**
 * Đồ thị mẫu của landing phải diễn lại ĐÚNG hình dạng engine thật, vì trang
 * này đang đi quảng cáo chính engine đó. Sai ở đây thì trang tự phản bội nội
 * dung nó đang khẳng định — nên hai bất biến dưới đây được ghim bằng test.
 */
describe('traceback trên đồ thị mẫu', () => {
  it('lần xuống hai tầng để tìm nền yếu thật sự, không dừng ở khái niệm bị sai', () => {
    const result = traceback('nf3');

    expect(result.rootId).toBe('phu-thuoc-ham');
    expect(result.depth).toBe(2);
    expect(result.chain).toEqual(['nf3', 'nf2', 'phu-thuoc-ham']);
  });

  it('không bao giờ vượt quá trần 2 tầng', () => {
    for (const id of Object.keys(DEMO_GRAPH)) {
      const { depth, chain } = traceback(id);
      expect(depth === null || depth <= 2).toBe(true);
      expect(chain.length).toBeLessThanOrEqual(3);
    }
  });

  it('báo nền đã vững khi mọi tiên quyết đều đạt ngưỡng', () => {
    const result = traceback('khoa-chinh');

    expect(result.rootId).toBeNull();
    expect(result.depth).toBeNull();
    expect(tracebackVerdict('khoa-chinh', result)).toContain('đều đã vững');
  });

  it('chuỗi luôn bắt đầu bằng chính khái niệm được hỏi', () => {
    for (const id of Object.keys(DEMO_GRAPH)) {
      expect(traceback(id).chain[0]).toBe(id);
    }
  });
});

/**
 * `null` KHÔNG phải 0 điểm — đây là bất biến mà cả cảnh 3 của trang dựng lên
 * để nói. Nó vẫn tính là chưa đủ làm nền, nhưng câu chữ phải khác hẳn "còn
 * yếu", nếu không trang nói sai về chính sản phẩm.
 */
describe('null ≠ 0.0', () => {
  it('xếp “chưa kiểm” vào băng riêng, không phải băng yếu', () => {
    expect(masteryBand(null)).toBe('untested');
    expect(masteryBand(0)).toBe('weak');
  });

  it('vẫn coi khái niệm chưa kiểm là chưa đủ làm nền', () => {
    const result = traceback('bcnf');

    expect(DEMO_GRAPH[result.rootId as string].score).toBeNull();
    expect(result.rootId).toBe('nf3');
  });

  it('dùng câu chữ khác hẳn cho “chưa kiểm” so với “còn yếu”', () => {
    const chuaKiem = tracebackVerdict('bcnf', traceback('bcnf'));
    const conYeu = tracebackVerdict('nf3', traceback('nf3'));

    expect(chuaKiem).toContain('chưa được kiểm lần nào');
    expect(chuaKiem).toContain('không phải là điểm 0');
    expect(conYeu).not.toContain('chưa được kiểm lần nào');
    expect(conYeu).toContain('0.42');
  });
});

describe('ngưỡng mastery', () => {
  it('cắt băng đúng tại ngưỡng 0.60 của engine', () => {
    expect(MASTERY_THRESHOLD).toBe(0.6);
    expect(masteryBand(0.59)).toBe('weak');
    expect(masteryBand(0.6)).toBe('learning');
    expect(masteryBand(0.8)).toBe('strong');
  });
});
