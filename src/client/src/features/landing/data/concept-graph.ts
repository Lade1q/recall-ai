/**
 * Đồ thị khái niệm mẫu cho landing, kèm bản rút gọn của thuật toán truy ngược.
 *
 * ⚠️ Đây là DỮ LIỆU TRÌNH DIỄN, không phải engine thật. Engine tất định sống ở
 * `src/server/src/services/traceback.service.ts`; bản ở đây chỉ diễn lại đúng
 * hình dạng của nó (BFS theo cạnh tiên quyết, trần 2 tầng, ngưỡng 0.60) để
 * khách chưa đăng nhập bấm thử được mà không cần tài khoản.
 *
 * Giữ hai luật quan trọng giống hệt bản thật, vì chúng là điều landing đang
 * đi quảng cáo — nói sai ở đây thì trang tự phản bội chính mình:
 *   · `masteryScore === null` nghĩa là CHƯA KIỂM, không phải 0 điểm;
 *   · chưa kiểm vẫn tính là chưa đạt nền, nhưng câu chữ phải khác "còn yếu".
 */

export const MASTERY_THRESHOLD = 0.6;

export interface DemoConcept {
  id: string;
  label: string;
  /** Toạ độ trong hệ 640×400 của SVG đồ thị. */
  x: number;
  y: number;
  /** `null` = chưa kiểm lần nào. */
  score: number | null;
  /** Các khái niệm phải hiểu TRƯỚC khái niệm này. */
  prereqs: readonly string[];
  /**
   * Chỗ Gấu Trúc đứng khi truy ngược dừng ở khái niệm này, lệch so với tâm node.
   *
   * Là DỮ LIỆU TỪNG NODE chứ không phải một hằng số dùng chung, vì không tồn
   * tại hằng số nào dùng chung được: mỗi node có nhãn ở trên và điểm số ở dưới,
   * ba node lại nằm sát rìa khung 640×400 — quét toàn bộ lưới vị trí thì mỗi
   * node riêng lẻ có hàng nghìn chỗ sạch, nhưng GIAO của bảy tập đó rỗng.
   *
   * Bốn node giữa dùng chung `(-60, 24)`; ba node còn lại lệch đi vì hết chỗ.
   * Con số chọn bằng cách đo bbox thật của MỌI vật cản rồi tìm ô trống gần dáng
   * đứng ưa thích nhất, chừa thêm 4 đơn vị cho thoáng.
   *
   * "Mọi vật cản" gồm cả VÒNG TIÊU ĐIỂM, không chỉ nhãn. Vòng focus chỉ hiện
   * khi node được chọn bằng bàn phím, nhưng nó hiện ở node ĐANG CHỌN trong khi
   * Gấu còn đứng ở node TRƯỚC — nên hai thứ gặp nhau thật. Bản đầu chỉ đo theo
   * nhãn và bỏ sót chuyện này.
   *
   * ⚠️ Dời `x`/`y` của node, đổi nhãn dài hơn, hay đổi cỡ sprite thì phải đo
   * lại chỗ này — không có test nào bắt được, vì bề rộng chữ chỉ có thật trong
   * trình duyệt.
   */
  walker: { dx: number; dy: number };
}

export const DEMO_GRAPH: Record<string, DemoConcept> = {
  'quan-he': {
    id: 'quan-he',
    label: 'Quan hệ',
    x: 88,
    y: 214,
    score: 0.88,
    prereqs: [],
    walker: { dx: -52, dy: 62 },
  },
  'khoa-chinh': {
    id: 'khoa-chinh',
    label: 'Khoá chính',
    x: 216,
    y: 100,
    score: 0.81,
    prereqs: ['quan-he'],
    walker: { dx: -60, dy: 24 },
  },
  'phu-thuoc-ham': {
    id: 'phu-thuoc-ham',
    label: 'Phụ thuộc hàm',
    x: 214,
    y: 322,
    score: 0.42,
    prereqs: ['quan-he'],
    walker: { dx: -60, dy: 24 },
  },
  nf1: {
    id: 'nf1',
    label: 'Chuẩn hoá 1NF',
    x: 356,
    y: 88,
    score: 0.79,
    prereqs: ['khoa-chinh'],
    walker: { dx: -60, dy: 24 },
  },
  nf2: {
    id: 'nf2',
    label: 'Chuẩn hoá 2NF',
    x: 360,
    y: 216,
    score: 0.68,
    prereqs: ['nf1', 'phu-thuoc-ham'],
    walker: { dx: -60, dy: 24 },
  },
  nf3: {
    id: 'nf3',
    label: 'Chuẩn hoá 3NF',
    x: 500,
    y: 148,
    score: null,
    prereqs: ['nf2'],
    walker: { dx: -52, dy: 76 },
  },
  bcnf: {
    id: 'bcnf',
    label: 'BCNF',
    x: 570,
    y: 306,
    score: null,
    prereqs: ['nf3'],
    walker: { dx: -66, dy: 24 },
  },
};

export const DEMO_CONCEPT_IDS = Object.keys(DEMO_GRAPH);

export type MasteryBand = 'strong' | 'learning' | 'weak' | 'untested';

export function masteryBand(score: number | null): MasteryBand {
  if (score === null) return 'untested';
  if (score < MASTERY_THRESHOLD) return 'weak';
  if (score < 0.8) return 'learning';
  return 'strong';
}

export interface TracebackResult {
  /** Khái niệm nền gây ra lỗi, `null` nếu mọi nền đều đã vững. */
  rootId: string | null;
  /** Tầng tìm thấy (1 hoặc 2), `null` khi không tìm ra. */
  depth: number | null;
  /** Chuỗi đi từ khái niệm bị sai xuống tới nền — linh vật đi theo đúng chuỗi này. */
  chain: string[];
}

/**
 * Lần ngược đồ thị tiên quyết theo BFS, tối đa 2 tầng, dừng ở khái niệm nền
 * đầu tiên chưa đạt ngưỡng.
 *
 * `(score ?? 0) < THRESHOLD` — `null` gộp vào nhóm chưa đạt là CỐ Ý, không
 * phải quên xử lý: một khái niệm chưa bao giờ kiểm thì cũng chưa thể làm nền
 * vững cho khái niệm khác. Câu chữ hiển thị mới là chỗ phân biệt hai ca.
 */
export function traceback(startId: string): TracebackResult {
  let frontier = [startId];
  const chain = [startId];

  for (let depth = 1; depth <= 2; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of DEMO_GRAPH[id].prereqs) {
        if (!next.includes(p)) next.push(p);
      }
    }
    if (next.length === 0) break;

    const hit = next.find((id) => (DEMO_GRAPH[id].score ?? 0) < MASTERY_THRESHOLD);
    if (hit !== undefined) {
      chain.push(hit);
      return { rootId: hit, depth, chain };
    }
    chain.push(next[0]);
    frontier = next;
  }

  return { rootId: null, depth: null, chain: [startId] };
}

/** Câu kết luận hiển thị cho người dùng. Ba ca, ba giọng khác nhau. */
export function tracebackVerdict(startId: string, result: TracebackResult): string {
  const start = DEMO_GRAPH[startId].label;
  if (result.rootId === null) {
    return `Mọi khái niệm nền của “${start}” đều đã vững. Sai ở đây là sai ở chính nó.`;
  }
  const root = DEMO_GRAPH[result.rootId];
  if (root.score === null) {
    return `“${root.label}” chưa được kiểm lần nào, nên chưa thể kết luận về “${start}”. Kiểm nền trước — chưa kiểm không phải là điểm 0.`;
  }
  return `Nguyên nhân không nằm ở “${start}”. Nó nằm ở “${root.label}” (${root.score.toFixed(2)}) — đã chèn lên trước trong lịch ôn.`;
}
