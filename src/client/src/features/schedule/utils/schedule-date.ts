import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { ScheduleDay, ScheduleItem } from '../types/schedule.types';

/**
 * Tháng đang xem. Cả màn Lịch làm việc trên **chuỗi ngày `YYYY-MM-DD`** chứ không trên `Date`:
 * `dateKey` do server cắt theo giờ VN, mọi phép so sánh ngày ở client vì thế chỉ là so chuỗi.
 * `Date` chỉ xuất hiện đúng một chỗ — dựng 42 ô của lưới (#404) — và ở đó dùng `Date.UTC`.
 */
export interface MonthCursor {
  year: number;
  /** **1–12**, không phải chỉ số 0-based của `Date`. */
  month: number;
}

/** `'2026-08-18'` → `{ year: 2026, month: 8 }`. */
export function monthCursorFromDateKey(dateKey: string): MonthCursor {
  return { year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) };
}

/** Số thứ tự tháng tuyệt đối. Là chỗ DUY NHẤT biết "một năm có 12 tháng" trong feature này. */
function toMonthIndex(cursor: MonthCursor): number {
  return cursor.year * 12 + (cursor.month - 1);
}

/** Lùi/tiến `delta` tháng, tự cuộn năm. Không đi qua `Date` nên không có gì để lệch múi giờ. */
export function shiftMonthCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const zeroBased = toMonthIndex(cursor) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Cần cộng bao nhiêu tháng vào `from` để tới `to` (âm nếu `to` ở trước).
 *
 * Nghịch đảo của `shiftMonthCursor`, và tồn tại để số học tháng **không có nơi thứ hai biết**:
 * `MonthGrid` chỉ nhận `onShiftMonth(delta)`, nên nút "Hôm nay" của #404 viết là
 * `onShiftMonth(monthsBetween(monthCursor, monthCursorFromDateKey(todayDateKey)))` — chứ đừng tự
 * gõ `year * 12 + month` ở đó.
 */
export function monthsBetween(from: MonthCursor, to: MonthCursor): number {
  return toMonthIndex(to) - toMonthIndex(from);
}

/**
 * Nhóm phẳng → theo ngày. Lưới KHÔNG tự nhóm (hợp đồng `MonthGrid`), và việc nhóm chạy trên
 * TRỌN mảng chứ không trên tháng đang xem: nhờ thế đổi lưới-tháng sang dải-ngày về sau chỉ là
 * đổi một hàm render, không đụng dữ liệu.
 *
 * Thứ tự mục TRONG một ngày giữ nguyên thứ tự server trả (truy ngược trước, rồi `priority` giảm
 * dần) — luật hai tầng đó đã có ở server, cài lại ở client là mở đường cho hai nơi lệch nhau.
 *
 * Thứ tự CÁC NGÀY thì sắp lại tại đây thay vì thừa hưởng thứ tự mảng: "Còn nợ" của #405 đọc
 * `days.filter(isOverdue)` và hiện đúng thứ tự này, nên nó phải là một tính chất của hàm chứ
 * không phải một điều may mắn của response. So chuỗi ISO là so ngày.
 */
export function groupByDateKey(
  items: readonly ScheduleItem[],
  todayDateKey: string
): ScheduleDay[] {
  const byDate = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const bucket = byDate.get(item.dateKey);
    if (bucket) bucket.push(item);
    else byDate.set(item.dateKey, [item]);
  }

  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, dayItems]) => ({
      dateKey,
      items: dayItems,
      totalMinutes: dayItems.reduce((sum, item) => sum + item.estimatedMinutes, 0),
      // So chuỗi ISO là so ngày. Suy tại chỗ đọc thay vì nhận cờ từ server: một cờ tính sẵn sẽ sai
      // khi tab mở qua nửa đêm, còn `todayDateKey` thì refetch là đúng lại.
      isOverdue: dateKey < todayDateKey,
    }));
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/**
 * `'2026-08-20'` → `'T5, 20/08'`. Dựng `Date` ở UTC từ một `dateKey` đã là ngày VN: chỉ để lấy
 * thứ trong tuần, không có phép đổi múi giờ nào ở đây (đổi lần nữa là lệch một ngày).
 */
export function formatDayLabel(dateKey: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
  return `${weekday}, ${dateKey.slice(8)}/${dateKey.slice(5, 7)}`;
}

/** Một ô của lưới tháng (#404). Ô tràn của tháng trước/sau vẫn có `dateKey` thật. */
export interface MonthCell {
  dateKey: string;
  /** 1–31, tách sẵn để lưới không phải cắt lại chuỗi ở 42 chỗ. */
  dayOfMonth: number;
  /** `false` = ô tràn. Chúng vẫn hiện mục của mình nhưng không bấm được. */
  inMonth: boolean;
}

/** 6 hàng × 7 cột. Đủ phủ trọn mọi tháng, kể cả tháng 31 ngày bắt đầu Chủ nhật (6 + 31 = 37). */
const MONTH_GRID_CELL_COUNT = 42;

/**
 * 42 ô của `cursor`, tuần bắt đầu **thứ Hai**.
 *
 * Đây là chỗ DUY NHẤT trong feature dựng `Date` **trong không gian UTC**, và dựng bằng `Date.UTC`
 * — `dateKey` vốn đã là ngày VN do server cắt, nên mọi phép đổi múi giờ ở đây chỉ có thể làm lệch
 * một ngày. Đọc lại cũng bằng `getUTC*`/`toISOString()`, nên hàm này độc lập múi giờ. Ra khỏi hàm
 * là quay lại chuỗi `YYYY-MM-DD`.
 *
 * ⚠️ Có một chỗ thứ hai dựng `Date`, ở **không gian địa phương**: `utils/picker-date.ts`, cây cầu
 * cho `react-day-picker` (thư viện đó chỉ đọc `getFullYear`/`getMonth`/`getDate`). Ở bên đó
 * `toISOString()` **sai một ngày** với người dùng UTC+7. Hai tệp không mâu thuẫn — chúng làm việc
 * ở hai không gian; đừng bê cách làm của tệp này sang đó.
 *
 * Trả về ô cho TẤT CẢ 42 vị trí thay vì chỉ ngày trong tháng: lưới không được lọc dữ liệu theo
 * tháng (#400), nó chỉ tra `dateKey` — nên ô tràn phải mang `dateKey` thật thì mục ngày 01 của
 * tháng sau mới không biến mất ở hàng cuối.
 */
export function buildMonthCells(cursor: MonthCursor): MonthCell[] {
  const zeroBasedMonth = cursor.month - 1;
  // `getUTCDay()` đếm từ Chủ nhật; +6 %7 xoay về thứ Hai = 0.
  const leading = (new Date(Date.UTC(cursor.year, zeroBasedMonth, 1)).getUTCDay() + 6) % 7;

  return Array.from({ length: MONTH_GRID_CELL_COUNT }, (_, index) => {
    // `Date.UTC` tự tràn sang tháng/năm bên cạnh khi đối số ngày âm hoặc quá số ngày của tháng.
    const date = new Date(Date.UTC(cursor.year, zeroBasedMonth, 1 - leading + index));
    return {
      dateKey: date.toISOString().slice(0, 10),
      dayOfMonth: date.getUTCDate(),
      inMonth: date.getUTCMonth() === zeroBasedMonth,
    };
  });
}

/**
 * `{ year: 2026, month: 8 }` → `'Tháng 8 2026'`.
 *
 * Có năm ở mọi chỗ dùng, kể cả thẻ "chưa có buổi ôn nào" (mockup bỏ năm ở thẻ đó). Lịch cho phép
 * đi tới lui không giới hạn, nên "Tháng 9" một mình là câu mơ hồ ngay khi người dùng bấm ‹ quá 12
 * lần — và ca đó không có gì chặn.
 */
export function formatMonthLabel(cursor: MonthCursor): string {
  return `Tháng ${cursor.month} ${cursor.year}`;
}

/** Ngày này là hạn chót của bao nhiêu kế hoạch, và hạn đó đã trôi qua chưa (#439). */
export interface DeadlineMark {
  /** ≥1. Lưới chỉ ĐÁNH DẤU nên không vẽ con số này — nó sống ở `aria-label` và ở panel. */
  planCount: number;
  /** `dateKey < todayDateKey`. Suy đúng một chỗ, cùng phép so chuỗi ISO của `groupByDateKey`. */
  isPast: boolean;
}

/**
 * Ngày hạn chót của các kế hoạch ĐANG HIỆN trên lịch, tra được theo `dateKey`.
 *
 * 🔑 **Khoá ngày là `plan.deadline.slice(0, 10)` — KHÔNG đổi sang giờ VN.** Đây là chỗ duy nhất
 * trên màn Lịch đi ngược quy ước "ngày VN do server cắt", nên lý do phải nằm ngay đây: server ghi
 * deadline bằng cách lấy phần NGÀY người dùng gõ rồi ghim vào `T23:59:59.999Z`
 * (`plan.service.ts`). Nên ngày-UTC của mốc đó **chính là** ngày người dùng đã chọn, và `slice`
 * là **phép chiếu ngược của phép ghi đó** — không phải một phép đổi múi giờ.
 * Cắt sang VN thì `2026-08-30T23:59:59.999Z` thành `2026-08-31`: lệch một ngày, và chỉ lệch trên
 * hình dạng MỚI (hàng cũ lưu `T00:00:00.000Z` vẫn đúng) ⇒ hỏng một nửa, loại khó chẩn đoán nhất.
 *
 * Lọc `status === 'active'` vì `GET /plans` trả MỌI trạng thái còn lịch chỉ vẽ plan `active`; lọc
 * `hiddenPlanIds` vì tắt một kế hoạch ở bộ lọc mà lưới vẫn còn dấu thì bấm vào panel rỗng.
 * Dùng `PlanSummary` (`deadline: string | null`), KHÔNG phải `PlanDetails` (`deadline?: string`) —
 * nhầm thì `undefined` và `null` đi hai nhánh khác nhau mà TypeScript không kêu.
 */
export function buildDeadlineMarks(
  plans: readonly PlanSummary[],
  hiddenPlanIds: ReadonlySet<string>,
  todayDateKey: string
): Map<string, DeadlineMark> {
  const marks = new Map<string, DeadlineMark>();
  for (const plan of plans) {
    if (plan.status !== 'active' || plan.deadline === null) continue;
    if (hiddenPlanIds.has(plan.id)) continue;

    const dateKey = plan.deadline.slice(0, 10);
    const existing = marks.get(dateKey);
    if (existing === undefined) {
      marks.set(dateKey, { planCount: 1, isPast: dateKey < todayDateKey });
    } else {
      // Không tính lại `isPast`: cùng một `dateKey` thì cùng một phía của hôm nay, nên ca "một hạn
      // đã qua và một hạn sắp tới trong cùng ô" là bất khả.
      existing.planCount += 1;
    }
  }
  return marks;
}
