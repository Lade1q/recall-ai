import { describe, expect, it } from 'vitest';
import {
  CARRY_EDGES,
  CARRY_LABELS,
  CARRY_SLOTS,
  CHIP_H,
  CHIP_W,
  FROZEN_FRAME,
  FROZEN_TICK,
  SEQUENCE_LENGTH,
  carryEdgeGeometry,
  carryFrame,
} from './carry-sequence';

const STAGE_W = 460;
const STAGE_H = 250;

describe('kịch bản khiêng khái niệm', () => {
  it('nhịp đầu: đi sang đồ thị, đội khái niệm đầu tiên, chưa đặt gì', () => {
    expect(carryFrame(0)).toMatchObject({
      side: 'graph',
      carrying: 0,
      placed: 0,
      edges: 0,
      pose: 'walk',
    });
  });

  /** Khái niệm phải nằm trên đồ thị ĐÚNG lúc Gấu quay đầu đi về, không sớm hơn. */
  it('đặt khái niệm xuống đúng nhịp quay đầu', () => {
    expect(carryFrame(1)).toMatchObject({ side: 'doc', carrying: null, placed: 1 });
  });

  it('khiêng đủ bốn khái niệm rồi mới quăng cạnh', () => {
    const beforeThrow = carryFrame(CARRY_LABELS.length * 2);
    expect(beforeThrow.placed).toBe(CARRY_LABELS.length);
    expect(beforeThrow.edges).toBe(0);
  });

  it('nối lần lượt từng cạnh một, và chỉ khi đã ở trên thang', () => {
    const start = CARRY_LABELS.length * 2 + 2;
    for (let i = 0; i < CARRY_EDGES.length; i += 1) {
      const frame = carryFrame(start + i);
      expect(frame.pose).toBe('throw');
      expect(frame.onLadder).toBe(true);
      expect(frame.edges).toBe(i + 1);
    }
  });

  /**
   * Hồi quy: tư thế gắn và cạnh nối từng bật CÙNG nhịp với lúc bắt đầu trèo,
   * nên Gấu giơ tay và cạnh nối xong trong khi nó còn lơ lửng giữa thang.
   * Trèo là một nhịp riêng, gắn là nhịp sau đó.
   */
  it('có một nhịp TRÈO riêng: đã lên thang nhưng chưa nối cạnh nào', () => {
    const climb = carryFrame(CARRY_LABELS.length * 2 + 1);

    expect(climb.pose).toBe('climb');
    expect(climb.onLadder).toBe(true);
    expect(climb.edges).toBe(0);
  });

  /**
   * Ghim đúng THỜI ĐIỂM cạnh được thêm, không phải lúc nó tồn tại: gắn xong
   * Gấu tụt xuống đất ăn mừng, khi đó ba cạnh vẫn còn trên đồ thị mà nó không
   * còn ở trên thang — điều đó đúng.
   */
  it('cạnh chỉ được nối thêm khi Gấu đang ở trên thang và đang với tay', () => {
    for (let t = 1; t <= SEQUENCE_LENGTH; t += 1) {
      const before = carryFrame(t - 1);
      const now = carryFrame(t);
      if (now.edges > before.edges) {
        expect(now.onLadder).toBe(true);
        expect(now.pose).toBe('throw');
      }
    }
  });

  it('không bao giờ vừa trèo vừa gắn: tư thế climb thì tay còn bận bám bậc', () => {
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      const frame = carryFrame(t);
      if (frame.pose === 'climb') expect(frame.edges).toBe(0);
    }
  });

  /**
   * Hồi quy: thang và Gấu từng cùng đọc một cờ, mà thang mờ đi trong 250ms còn
   * Gấu tụt xuống mất 1200ms — thang biến mất khi Gấu còn lơ lửng giữa chừng.
   */
  it('thang vẫn đứng ở nhịp Gấu tụt xuống, chỉ cất đi khi nó đã chạm đất', () => {
    const dangTut = carryFrame(CARRY_LABELS.length * 2 + 2 + CARRY_EDGES.length);
    const daXuong = carryFrame(CARRY_LABELS.length * 2 + 3 + CARRY_EDGES.length);

    expect(dangTut).toMatchObject({ pose: 'cheer', onLadder: false, ladderUp: true });
    expect(daXuong).toMatchObject({ pose: 'cheer', onLadder: false, ladderUp: false });
  });

  it('Gấu không bao giờ ở trên cao mà thang lại không có', () => {
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      const frame = carryFrame(t);
      if (frame.onLadder) expect(frame.ladderUp).toBe(true);
    }
  });

  it('ăn mừng với đồ thị đã dựng xong trước khi về', () => {
    const cheer = carryFrame(SEQUENCE_LENGTH - 2);
    expect(cheer).toMatchObject({
      pose: 'cheer',
      placed: CARRY_LABELS.length,
      edges: CARRY_EDGES.length,
    });
  });

  /**
   * Hồi quy: vòng lặp từng hỏng vì thiếu chặng về.
   *
   * Ăn mừng xong Gấu đứng ở phía đồ thị, mà nhịp 0 cũng là "ở phía đồ thị,
   * đang ôm khái niệm đầu tiên" — nên nó không đi đâu cả, chỉ bỗng dưng ôm sẵn
   * một khái niệm ngay mép phải. Hai khẳng định dưới đây khoá lại đúng chỗ đó.
   */
  it('nhịp cuối đưa Gấu VỀ phía tài liệu, tay không, sân khấu dọn sạch', () => {
    expect(carryFrame(SEQUENCE_LENGTH - 1)).toMatchObject({
      side: 'doc',
      carrying: null,
      placed: 0,
      edges: 0,
    });
  });

  /**
   * Hồi quy: nhịp để ĐÓNG BĂNG không được là nhịp cuối vòng lặp.
   *
   * Hằng số này từng tên `FINAL_FRAME` và trỏ vào `SEQUENCE_LENGTH - 1`. Nghe
   * như "khung kết thúc" nên không ai kiểm nó chứa gì — mà nó chứa đúng cái
   * sân khấu vừa dọn sạch ở ca trên. Hai khẳng định dưới đây khoá cả nội dung
   * lẫn việc nó KHÁC nhịp cuối.
   */
  it('khung đóng băng còn nguyên nội dung: đồ thị dựng xong, thang đã cất', () => {
    expect(FROZEN_FRAME).toMatchObject({
      placed: CARRY_LABELS.length,
      edges: CARRY_EDGES.length,
      onLadder: false,
      ladderUp: false,
      pose: 'cheer',
    });
  });

  it('khung đóng băng không phải nhịp dọn sạch', () => {
    expect(FROZEN_TICK).not.toBe(SEQUENCE_LENGTH - 1);
  });

  it('không bao giờ ôm sẵn khái niệm khi đang đứng ở phía đồ thị', () => {
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      const prev = carryFrame(t - 1);
      const now = carryFrame(t);
      if (now.carrying === null) continue;
      /* Muốn ôm được khái niệm thì nhịp trước phải đang đứng ở phía tài liệu —
         tức là nó vừa nhặt lên và đang khiêng đi, chứ không phải tự dưng có. */
      expect(prev.side).toBe('doc');
    }
  });

  it('lặp vòng, và chịu được tick âm', () => {
    expect(carryFrame(SEQUENCE_LENGTH)).toEqual(carryFrame(0));
    expect(carryFrame(-1)).toEqual(carryFrame(SEQUENCE_LENGTH - 1));
  });

  it('không nhịp nào đặt nhiều hơn số khái niệm đang có', () => {
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      const frame = carryFrame(t);
      expect(frame.placed).toBeLessThanOrEqual(CARRY_LABELS.length);
      expect(frame.edges).toBeLessThanOrEqual(CARRY_EDGES.length);
      if (frame.carrying !== null) {
        expect(frame.carrying).toBeLessThan(CARRY_LABELS.length);
      }
    }
  });
});

/**
 * Bản dựng trước vẽ cạnh trong một viewBox bị kéo giãn còn chip thì định vị
 * bằng pixel CSS — hai hệ toạ độ khác nhau nên mũi tên không bao giờ cắm
 * trúng chip. Test này ghim lại: cạnh phải cắt ở mép chip, không chạy vào tâm
 * và không đâm xuyên ra ngoài sân khấu.
 */
describe('hình học cạnh nối', () => {
  const edges = carryEdgeGeometry();

  it('sinh đúng một hình cho mỗi cạnh', () => {
    expect(edges).toHaveLength(CARRY_EDGES.length);
  });

  it('cắt lại ở mép chip chứ không chạy vào tâm', () => {
    edges.forEach((edge, i) => {
      const [fromIdx, toIdx] = CARRY_EDGES[i];
      const centerFrom = {
        x: CARRY_SLOTS[fromIdx].x + CHIP_W / 2,
        y: CARRY_SLOTS[fromIdx].y + CHIP_H / 2,
      };
      const centerTo = {
        x: CARRY_SLOTS[toIdx].x + CHIP_W / 2,
        y: CARRY_SLOTS[toIdx].y + CHIP_H / 2,
      };
      expect(Math.hypot(edge.x1 - centerFrom.x, edge.y1 - centerFrom.y)).toBeGreaterThan(4);
      expect(Math.hypot(edge.x2 - centerTo.x, edge.y2 - centerTo.y)).toBeGreaterThan(9);
    });
  });

  it('mọi đầu mút nằm trong sân khấu', () => {
    for (const edge of edges) {
      for (const [x, y] of [
        [edge.x1, edge.y1],
        [edge.x2, edge.y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(STAGE_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(STAGE_H);
      }
    }
  });

  it('mũi tên là tam giác ba đỉnh', () => {
    for (const edge of edges) {
      expect(edge.arrow.split(' ')).toHaveLength(3);
    }
  });
});

describe('bố cục sân khấu', () => {
  it('mọi chip nằm gọn trong sân khấu 460×250', () => {
    for (const slot of CARRY_SLOTS) {
      expect(slot.x + CHIP_W).toBeLessThanOrEqual(STAGE_W);
      expect(slot.y + CHIP_H).toBeLessThanOrEqual(STAGE_H);
    }
  });

  it('mỗi khái niệm có đúng một chỗ đứng', () => {
    expect(CARRY_SLOTS).toHaveLength(CARRY_LABELS.length);
  });
});
