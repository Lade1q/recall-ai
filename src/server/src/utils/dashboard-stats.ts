/**
 * Dashboard "Thống kê nhanh" (DB-01 / #230): study streak, week boundary. Pure functions — no
 * Prisma, no clock. `now` is always passed in, same contract as `mastery.ts` (SDP risk R05).
 *
 * MVP chốt timezone Asia/Ho_Chi_Minh cho "hôm nay"/"tuần này" — so sánh streak bằng Date UTC
 * thô sẽ đổi ngày sai cho phiên học lúc 0h-7h sáng giờ VN (vẫn là tối hôm trước theo UTC).
 */

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** VN không quan sát DST, offset cố định — an toàn để hardcode thay vì tính lại mỗi lần. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * "Ngày VN" của một thời điểm, dạng `'YYYY-MM-DD'` so sánh được bằng string.
 *
 * Dùng `formatToParts` thay vì `.format()` trực tiếp: `en-CA` thường cho ra `YYYY-MM-DD` nhưng
 * separator phụ thuộc bản ICU đi kèm Node — ráp thủ công từ các phần đảm bảo đúng định dạng bất
 * kể ICU build nào.
 */
export function toVnDateKey(date: Date): string {
  const parts = vnDateFormatter.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Tách `'YYYY-MM-DD'` thành số — nội bộ, chỉ nhận key do `toVnDateKey`/`shiftVnDateKey` sinh ra. */
function parseVnDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

/** Dịch một date-key đi `deltaDays` ngày lịch — thuần arithmetic trên Y-M-D, không lệ thuộc timezone. */
export function shiftVnDateKey(dateKey: string, deltaDays: number): string {
  const { year, month, day } = parseVnDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day) + deltaDays * MS_PER_DAY);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Thời điểm UTC ứng với 00:00 thứ 2 (giờ VN) của tuần chứa `now`. Dùng làm cận dưới cho
 * `weeklyStudyMinutes` (`startedAt >= gte`).
 *
 * Thứ trong tuần là thuộc tính thuần của bộ Y-M-D (không lệ thuộc timezone hiển thị), nên tính
 * qua `Date.UTC` của ngày VN rồi lùi về thứ 2 là đủ; trừ thêm `VN_OFFSET_MS` để chuyển từ "mốc
 * UTC danh nghĩa của ngày đó" sang đúng thời điểm UTC thực của 00:00 giờ VN.
 */
export function getVnWeekStartUtc(now: Date): Date {
  const { year, month, day } = parseVnDateKey(toVnDateKey(now));
  const utcMidnightOfDay = Date.UTC(year, month - 1, day);
  const dayOfWeek = new Date(utcMidnightOfDay).getUTCDay(); // 0 = Chủ nhật .. 6 = thứ 7
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(utcMidnightOfDay - daysSinceMonday * MS_PER_DAY - VN_OFFSET_MS);
}

/**
 * Streak không thể dài hơn số ngày này — giới hạn cửa sổ quét lịch sử hoạt động để chi phí
 * không tăng tuyến tính theo tuổi tài khoản (mỗi lần vào Dashboard đều quét lại). Đủ lớn (>1
 * năm) để không bao giờ cắt cụt một streak thật.
 */
export const STREAK_LOOKBACK_DAYS = 400;

/** Cận dưới `startedAt` dùng khi truy vấn hoạt động cho streak — xem `STREAK_LOOKBACK_DAYS`. */
export function getStreakLookbackStartUtc(now: Date): Date {
  return new Date(now.getTime() - STREAK_LOOKBACK_DAYS * MS_PER_DAY);
}

/**
 * Chuỗi ngày liên tiếp gần nhất có hoạt động, tính tới `now` (giờ VN).
 *
 * Mốc là hôm nay: có hoạt động hôm nay → đếm lùi liên tục từ hôm nay. Chưa có hoạt động hôm nay
 * nhưng hôm qua có → streak vẫn "còn sống", đếm lùi liên tục từ hôm qua (chưa học hôm nay không
 * có nghĩa là đứt chuỗi, ngày vẫn chưa kết thúc). Không có hoạt động ở cả hai ngày → `0`.
 */
export function computeStreakDays(activeDateKeys: ReadonlySet<string>, now: Date): number {
  const todayKey = toVnDateKey(now);
  let cursor: string;
  if (activeDateKeys.has(todayKey)) {
    cursor = todayKey;
  } else {
    const yesterdayKey = shiftVnDateKey(todayKey, -1);
    if (!activeDateKeys.has(yesterdayKey)) {
      return 0;
    }
    cursor = yesterdayKey;
  }

  let streak = 0;
  while (activeDateKeys.has(cursor)) {
    streak += 1;
    cursor = shiftVnDateKey(cursor, -1);
  }
  return streak;
}
