import type { PandaPose } from './panda-sprites';

/**
 * Kịch bản cảnh "Gấu Trúc khiêng khái niệm rồi quăng cạnh".
 *
 * Cố ý viết thành HÀM THUẦN `tick → trạng thái` thay vì một chuỗi @keyframes
 * dài với mốc phần trăm chỉnh tay: bản keyframe muốn đổi nhịp là phải tính
 * lại mười mấy con số và không cách nào kiểm tự động. Bản này test được, và
 * đọc ra ngay nhân vật đang làm gì ở nhịp nào.
 */

/** Bốn khái niệm được khiêng, đúng thứ tự xuất hiện trong đoạn văn. */
export const CARRY_LABELS = [
  'Chuẩn hoá 2NF',
  'Phụ thuộc hàm',
  'Chuẩn hoá 3NF',
  'Khoá chính',
] as const;

/** Chỗ đứng của từng khái niệm trong sân khấu 460×250 (góc trên-trái). */
export const CARRY_SLOTS = [
  { x: 58, y: 104 },
  { x: 262, y: 26 },
  { x: 262, y: 182 },
  { x: 30, y: 12 },
] as const;

/** Cạnh nối: [chỉ số nền, chỉ số phụ thuộc]. */
export const CARRY_EDGES = [
  [3, 0],
  [1, 0],
  [0, 2],
] as const;

export const CHIP_W = 132;
export const CHIP_H = 32;

const CARRY_TICKS = CARRY_LABELS.length * 2; // đi + về cho mỗi khái niệm
const WALK_OVER_TICK = CARRY_TICKS; // sang chân thang, tay không
/**
 * Nhịp TRÈO, tách hẳn khỏi nhịp gắn.
 *
 * Gộp chung thì Gấu vừa chớm leo đã giơ tay và cạnh đã nối xong — nó gắn mũi
 * tên trong lúc còn lơ lửng giữa thang. Trèo là một việc, gắn là việc sau đó.
 */
const CLIMB_TICK = WALK_OVER_TICK + 1;
const THROW_TICKS = CARRY_EDGES.length;
const CHEER_TICKS = 2;
/**
 * Nhịp CUỐI: đi về chỗ trang tài liệu, tay không, và dọn sạch đồ thị.
 *
 * Thiếu nhịp này thì vòng lặp hỏng: ăn mừng xong Gấu đang đứng ở phía đồ thị,
 * mà nhịp 0 lại cũng là "ở phía đồ thị, đang ôm khái niệm đầu tiên" — nên nó
 * không đi đâu cả, chỉ bỗng dưng ôm sẵn một khái niệm ngay mép phải. Phải có
 * một chặng về tay không thì chuyến khiêng kế tiếp mới có chỗ mà bắt đầu.
 */
const RESET_TICKS = 1;

export const SEQUENCE_LENGTH = CARRY_TICKS + 1 + 1 + THROW_TICKS + CHEER_TICKS + RESET_TICKS;

export interface CarryFrame {
  /** Gấu đang ở phía trang tài liệu hay phía đồ thị. */
  side: 'doc' | 'graph';
  /** Chỉ số khái niệm đang đội trên đầu, `null` nếu đi tay không. */
  carrying: number | null;
  /** Số khái niệm ĐÃ đặt xuống đồ thị. */
  placed: number;
  /** Số cạnh đã nối xong. */
  edges: number;
  /** Gấu đang ở TRÊN CAO (đã trèo lên). */
  onLadder: boolean;
  /**
   * Thang có đang dựng không.
   *
   * Tách khỏi `onLadder` vì thang phải còn đứng đó LÂU HƠN: lúc Gấu tụt
   * xuống thì nó chưa ở trên cao nữa nhưng thang thì vẫn phải còn, không thì
   * thang biến mất trong khi Gấu còn lơ lửng giữa chừng.
   */
  ladderUp: boolean;
  pose: PandaPose;
}

/**
 * Trạng thái tại nhịp `tick` (tự lặp vòng).
 *
 * Nhịp chẵn = đi sang đồ thị mang theo khái niệm; nhịp lẻ = quay về tay
 * không, và ĐÚNG lúc quay đầu thì khái niệm vừa mang đã nằm trên đồ thị —
 * nên `placed` tăng ở nhịp lẻ chứ không phải nhịp chẵn.
 */
export function carryFrame(tick: number): CarryFrame {
  const t = ((tick % SEQUENCE_LENGTH) + SEQUENCE_LENGTH) % SEQUENCE_LENGTH;

  if (t < CARRY_TICKS) {
    const index = Math.floor(t / 2);
    const outbound = t % 2 === 0;
    return {
      side: outbound ? 'graph' : 'doc',
      carrying: outbound ? index : null,
      placed: outbound ? index : index + 1,
      edges: 0,
      onLadder: false,
      ladderUp: false,
      pose: 'walk',
    };
  }

  const all = CARRY_LABELS.length;

  /* Đi tới chân thang, vẫn dưới đất. */
  if (t === WALK_OVER_TICK) {
    return {
      side: 'graph',
      carrying: null,
      placed: all,
      edges: 0,
      onLadder: false,
      ladderUp: false,
      pose: 'walk',
    };
  }

  /* Trèo lên — hai tay còn bận bám bậc, CHƯA nối cạnh nào. */
  if (t === CLIMB_TICK) {
    return {
      side: 'graph',
      carrying: null,
      placed: all,
      edges: 0,
      onLadder: true,
      ladderUp: true,
      pose: 'climb',
    };
  }

  const afterClimb = t - CLIMB_TICK - 1;
  /* Đã lên tới ngọn thang rồi mới với tay gắn từng mũi tên một. */
  if (afterClimb < THROW_TICKS) {
    return {
      side: 'graph',
      carrying: null,
      placed: all,
      edges: afterClimb + 1,
      onLadder: true,
      ladderUp: true,
      pose: 'throw',
    };
  }

  /*
   * Gắn xong thì tụt xuống đất mới ăn mừng.
   *
   * Thang vẫn ĐỨNG NGUYÊN suốt nhịp ăn mừng ĐẦU — đó chính là nhịp Gấu đang
   * tụt xuống. Cất thang ngay lúc `onLadder` tắt thì thang biến mất khi Gấu
   * còn lơ lửng giữa chừng; chỉ tới nhịp ăn mừng THỨ HAI, khi nó đã chạm đất,
   * thang mới được dọn đi.
   */
  if (afterClimb < THROW_TICKS + CHEER_TICKS) {
    const vuaTut = afterClimb === THROW_TICKS;
    return {
      side: 'graph',
      carrying: null,
      placed: all,
      edges: THROW_TICKS,
      onLadder: false,
      ladderUp: vuaTut,
      pose: 'cheer',
    };
  }

  /* Về chỗ cũ, tay không, sân khấu dọn sạch — sẵn sàng cho vòng sau. */
  return {
    side: 'doc',
    carrying: null,
    placed: 0,
    edges: 0,
    onLadder: false,
    ladderUp: false,
    pose: 'walk',
  };
}

/**
 * Nhịp để ĐÓNG BĂNG cảnh khi người dùng bật giảm chuyển động.
 *
 * Không phải nhịp cuối vòng lặp. Nhịp cuối là nhịp DỌN SẠCH sân khấu để chuyến
 * sau có chỗ bắt đầu — đóng băng ở đó thì người xem nhận một đồ thị trống
 * không. Nhịp áp cuối mới là lúc đồ thị đã dựng xong, thang đã cất, Gấu đang
 * ăn mừng: đó là bức ảnh đáng để đứng yên.
 *
 * Hằng số này từng tên là `FINAL_FRAME` và trỏ vào `SEQUENCE_LENGTH - 1`. Cái
 * tên nghe như "khung kết thúc" nên không ai buồn kiểm nó chứa gì, và
 * `ExtractScene` đã đóng băng đúng vào khung rỗng suốt một thời gian. Tên bây
 * giờ nói ĐÚNG công dụng, để lần sau không ai với tay nhầm.
 */
export const FROZEN_TICK = SEQUENCE_LENGTH - 2;

/** Khung tương ứng với `FROZEN_TICK` — export để test soi được nội dung của nó. */
export const FROZEN_FRAME: CarryFrame = carryFrame(FROZEN_TICK);

interface Point {
  x: number;
  y: number;
}

/**
 * Cắt một đầu đoạn thẳng lại ở mép chip rồi chừa thêm `pad`.
 *
 * Không cắt thì mũi tên nằm lọt dưới cái chip và không ai nhìn thấy. Tìm mặt
 * hộp mà tia chạm trước: trục nào chạm sớm hơn thì trục đó quyết định.
 */
export function trimToChip(from: Point, to: Point, pad: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx !== 0 ? CHIP_W / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? CHIP_H / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty) + pad / len;
  return { x: to.x - dx * t, y: to.y - dy * t };
}

export interface CarryEdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Ba đỉnh mũi tên, dạng chuỗi `points` của <polygon>. */
  arrow: string;
}

/** Toạ độ ba cạnh, tính từ CÙNG mảng slot với chip nên không thể lệch nhau. */
export function carryEdgeGeometry(): CarryEdgeGeometry[] {
  return CARRY_EDGES.map(([fromIdx, toIdx]) => {
    const a = CARRY_SLOTS[fromIdx];
    const b = CARRY_SLOTS[toIdx];
    const ca = { x: a.x + CHIP_W / 2, y: a.y + CHIP_H / 2 };
    const cb = { x: b.x + CHIP_W / 2, y: b.y + CHIP_H / 2 };
    const start = trimToChip(cb, ca, 4);
    const end = trimToChip(ca, cb, 9);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = 10;
    const bx = end.x - ux * size;
    const by = end.y - uy * size;
    const half = size * 0.5;

    return {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      arrow: [
        `${end.x.toFixed(1)},${end.y.toFixed(1)}`,
        `${(bx - uy * half).toFixed(1)},${(by + ux * half).toFixed(1)}`,
        `${(bx + uy * half).toFixed(1)},${(by - ux * half).toFixed(1)}`,
      ].join(' '),
    };
  });
}
