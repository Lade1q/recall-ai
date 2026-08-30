/**
 * `GET /api/v1/review-queue/schedule` (#402) — mọi mục ôn của user, mỗi mục kèm NGÀY.
 *
 * Engine đã ghi `ReviewQueueItem.scheduledFor` từ lâu, nhưng cột đó chưa bao giờ ra khỏi server:
 * hai endpoint đang chạy chỉ dùng nó làm **bộ lọc**. Đây là thiết bị xuất còn thiếu, không phải
 * tính năng mới.
 *
 * ⛔ **Đường đọc RIÊNG — cố ý không đi qua `resolvePlanQueue`.** Hàm đó phục vụ
 * `GET /review-queue` và `/review-queue/today` đang chạy live; nhét thêm tham số vào nó để dùng
 * chung là đổi lấy một rủi ro hồi quy trên hai bề mặt, để tiết kiệm một truy vấn.
 *
 * Không có mã lỗi nào: endpoint không nhận param, không nhận body ⇒ chỉ `401` đã tồn tại. Giữ
 * được tính chất đó thì test hợp đồng 44 mã không phải đụng tới.
 */

import type { ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import { toVnDateKey } from '../utils/dashboard-stats';
import { pickRepresentative, type RepresentativeRow } from '../utils/schedule-representative';
import {
  ACTIVE_CONCEPT_WHERE,
  ON_SCHEDULE_WHERE,
  sortReviewItems,
  toResponseItems,
  type QueuePlan,
  type QueueRow,
  type ReviewQueueItemResponse,
} from './scheduling.service';

/**
 * Một mục trên lịch = `ReviewQueueItemResponse` + đúng hai trường.
 *
 * `id` siết về `string`: `null` bên kia dành cho gợi ý ảo A3, mà mục ảo **không có
 * `scheduledFor`** nên không bao giờ đặt lên lịch được — endpoint này không dựng mục ảo nào.
 */
export interface ScheduleItemResponse extends Omit<ReviewQueueItemResponse, 'id'> {
  id: string;
  scheduledFor: Date;
  /** Ngày lịch VN của `scheduledFor`, do SERVER cắt — xem `getReviewSchedule`. */
  dateKey: string;
}

export interface ReviewScheduleResponse {
  todayDateKey: string;
  items: ScheduleItemResponse[];
}

/**
 * Hàng thô của đường đọc này: **siêu tập** của `QueueRow` (để truyền thẳng vào
 * `toResponseItems`) và của `RepresentativeRow` (để truyền thẳng vào `pickRepresentative`).
 * Cả hai nhận superset nhờ structural typing, nên một truy vấn nuôi được cả hai.
 *
 * `QueueRow` không mang `planId`/`createdAt`/`scheduledFor` — đó là lý do type này tồn tại chứ
 * không dùng thẳng `QueueRow`.
 */
interface ScheduleRow extends Omit<QueueRow, 'concept'> {
  planId: string;
  createdAt: Date;
  /** Đã lọc `not: null` ở tầng truy vấn rồi thu hẹp kiểu — xem `withScheduledFor`. */
  scheduledFor: Date;
  /**
   * Khai tường minh thay vì `extends QueueRow, RepresentativeRow`: hai bên khai `concept` khác
   * nhau (`{name, masteryScore}` vs `{masteryScore}`) nên TypeScript từ chối kế thừa cả hai.
   * Shape này gán được cho **cả hai**, đúng thứ cần.
   */
  concept: { name: string; masteryScore: number | null };
}

/**
 * `QUEUE_ROW_INCLUDE` của `scheduling.service` **không** được export (AC của #401 chốt đúng ba
 * export), nên select của khái niệm khai lại ở đây. Hai chỗ phải mang cùng hai trường
 * `name`/`masteryScore`: `name` cho response, `masteryScore` cho luật đại diện.
 */
const SCHEDULE_CONCEPT_SELECT = {
  concept: { select: { name: true, masteryScore: true } },
} as const;

/**
 * Toàn bộ lịch ôn của một user, phẳng và trọn bộ.
 *
 * **Không cắt theo khoảng thời gian, không kế thừa limit, không `dueOnly`.** Thanh "Còn nợ" của
 * màn Lịch cần mọi mục quá hạn bất kể tháng đang xem, nên cắt ở server là tự bắn chân; và cùng
 * một payload phục vụ được cả lưới tháng lẫn dải ngày, tức đổi hình ở FE không đụng BE. Trần đã
 * đo: 92 mục kể cả khi mọi khái niệm active của mọi plan đều đã được chấm.
 *
 * `now` truyền vào chứ không đọc trong đây, giống `updateReviewQueueItemStatus`: mốc ngày vẫn
 * unit-test được (R05).
 */
export async function getReviewSchedule(
  userId: string,
  now: Date
): Promise<ReviewScheduleResponse> {
  const rows = await prisma.reviewQueueItem.findMany({
    where: {
      // Plan không `active` không đóng góp mục nào — cùng luật với `/today`.
      plan: { userId, status: 'active' },
      // Hai bộ lọc bắt buộc của mọi đường ĐỌC hàng đợi, khác trục nhau: mục sinh viên đã gỡ
      // (#224) và khái niệm tài liệu đã bỏ dạy (#343). Thiếu một cái là lỗi im lặng — tombstone
      // sống dậy trên lịch, hoặc mục đã gỡ vẫn hiện.
      ...ON_SCHEDULE_WHERE,
      ...ACTIVE_CONCEPT_WHERE,
      // Mục chưa có ngày thì không đặt lên lịch được. Cột nullable trong schema; trên DB dev
      // hiện 0 hàng dính bộ lọc này, nhưng thiếu nó thì một hàng `null` sẽ thành `dateKey` rác.
      scheduledFor: { not: null },
    },
    select: {
      id: true,
      planId: true,
      conceptId: true,
      reason: true,
      depth: true,
      status: true,
      sourceConceptId: true,
      sourceSessionId: true,
      createdAt: true,
      scheduledFor: true,
      plan: { select: { id: true, name: true, deadline: true } },
      ...SCHEDULE_CONCEPT_SELECT,
    },
    // `pickRepresentative` phá hoà bằng "giữ hàng thấy trước", nên KHÔNG có `orderBy` thì người
    // phá hoà là Postgres — và ngày 20/08 trên DB dev đang có đúng một cụm hoà cả hai khoá sắp
    // (2 mục traceback, cùng `priority`), tức hai mục đổi chỗ được giữa hai lần tải.
    //
    // ⚠️ Đây KHÔNG phải cách cài luật đại diện — cảnh báo của #400 vẫn đúng: một `orderBy` không
    // tạo ra luật, và luật vẫn nằm trọn trong fold thuần. `orderBy` ở đây chỉ làm **tất định**
    // phần mà luật cố ý để mở.
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });

  const plansById = new Map<string, QueuePlan>();
  for (const row of rows) plansById.set(row.plan.id, row.plan);

  // Fold chạy trên HÀNG THÔ, trước khi map sang response: luật đại diện đọc `createdAt`, mà
  // `ReviewQueueItemResponse` không mang trường đó.
  const representatives = foldToRepresentatives(rows.filter(withScheduledFor));

  // `toResponseItems` nhận một plan mỗi lần (nó tính `daysUntilDeadline` cho cả trang), nên
  // gộp theo plan rồi gọi song song.
  const byPlan = groupBy(representatives, (row) => row.planId);
  const perPlan = await Promise.all(
    [...byPlan].map(async ([planId, planRows]) => {
      const responses = await toResponseItems(planRows, plansById.get(planId)!, now);
      // Ghép theo `id`, KHÔNG theo chỉ số. Zip-theo-chỉ-số hôm nay vẫn đúng — `toResponseItems`
      // là `rows.map(...)` thuần thứ tự — nhưng thứ giữ nó đúng khi đó chỉ là một comment, và
      // comment không chạy trong CI. Hai kiểu vỡ rất khác nhau: lệch ĐỘ DÀI thì `id!` ném lỗi,
      // ồn ào, sửa được; đổi THỨ TỰ thì `scheduledFor`/`dateKey` gắn nhầm mục và im lặng tuyệt
      // đối. Tra map đóng luôn cửa thứ hai.
      const rowsById = new Map(planRows.map((row) => [row.id, row]));
      return responses.map((item) => toScheduleItem(item, rowsById.get(item.id!)!));
    })
  );

  return {
    todayDateKey: toVnDateKey(now),
    items: sortScheduleItems(perPlan.flat()),
  };
}

/** Thu hẹp `Date | null` của Prisma sau khi đã lọc `not: null` ở tầng truy vấn. */
function withScheduledFor<T extends { scheduledFor: Date | null }>(
  row: T
): row is T & { scheduledFor: Date } {
  return row.scheduledFor !== null;
}

function toScheduleItem(item: ReviewQueueItemResponse, row: ScheduleRow): ScheduleItemResponse {
  return {
    ...item,
    // Hàng thật luôn có `id`; `null` chỉ thuộc về mục ảo A3, thứ đường đọc này không dựng.
    id: item.id!,
    scheduledFor: row.scheduledFor,
    // `dateKey` do SERVER cắt. Client không có chỗ nào biết `Asia/Ho_Chi_Minh` (một hit trong cả
    // cây, và là comment), nên để client tự cắt là đẻ quy ước ngày thứ tư trong repo.
    dateKey: toVnDateKey(row.scheduledFor),
  };
}

/**
 * Một mục cho mỗi `(planId, conceptId)` — xem luật ở `utils/schedule-representative.ts`.
 *
 * Thuần, không Prisma, không đồng hồ (R05).
 */
export function foldToRepresentatives<
  T extends RepresentativeRow & { planId: string; conceptId: string },
>(rows: readonly T[]): T[] {
  const clusters = groupBy(rows, (row) => `${row.planId}:${row.conceptId}`);
  return [...clusters.values()].map((cluster) => pickRepresentative(cluster)!);
}

/**
 * Thứ tự cam kết của endpoint: `dateKey` tăng dần, trong cùng ngày theo `sortReviewItems`
 * (truy ngược trước, rồi `priority` giảm dần).
 *
 * Sắp ở server để client `groupBy` là xong, **không phải cài lại luật hai tầng** — luật đó đã
 * sống ở `sortReviewItems` và hai nơi cùng biết nó là hai nơi sẽ lệch.
 *
 * Thuần (R05).
 */
export function sortScheduleItems<
  T extends { dateKey: string; reason: ReviewReason; priority: number },
>(items: readonly T[]): T[] {
  const byDate = groupBy(items, (item) => item.dateKey);
  return [...byDate.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((dateKey) => sortReviewItems(byDate.get(dateKey)!));
}

/** Gom theo khoá, giữ thứ tự xuất hiện đầu tiên của mỗi khoá. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
