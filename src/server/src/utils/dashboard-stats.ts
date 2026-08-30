/**
 * Dashboard "Thống kê nhanh" (DB-01 / #230): study streak, week boundary. Pure functions — no
 * Prisma, no clock. `now` is always passed in, same contract as `mastery.ts` (SDP risk R05).
 *
 * MVP chốt timezone Asia/Ho_Chi_Minh cho "hôm nay"/"tuần này" — so sánh streak bằng Date UTC
 * thô sẽ đổi ngày sai cho phiên học lúc 0h-7h sáng giờ VN (vẫn là tối hôm trước theo UTC).
 *
 * Đây cũng là **nhà duy nhất** của mốc ngày VN trong repo: DB-09 (#233, "Hoãn đến mai") dời
 * `scheduledFor` sang đầu ngày mai và phải là *cùng* biên ngày mà streak dùng, nếu không hai
 * màn hình sẽ bất đồng về việc "mai" bắt đầu lúc nào. Tách file riêng cho nó chỉ tạo hai nhà
 * cho một khái niệm, nên helper của #233 nằm ngay đây thay vì ở `utils/vn-date.ts` mới.
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
 * Thời điểm UTC ứng với 00:00 ngày MAI (giờ VN) tính từ `now`. Mốc "đến mai" của DB-09 (#233):
 * một mục được hoãn phải rời `GET /review-queue/today` (lọc `scheduledFor <= now`) cho hết hôm
 * nay, rồi quay lại ngay khi ngày VN mới bắt đầu.
 *
 * Không dùng `now + 24h`: hoãn lúc 23:30 giờ VN mà cộng 24 giờ thì mục quay lại vào 23:30 ngày
 * mai — mất gần trọn ngày đáng lẽ được nhắc. Biên là ngày lịch VN, nên tính qua date-key rồi
 * dịch một ngày, đúng phép mà `getVnWeekStartUtc` dùng để về 00:00 thứ 2.
 */
export function getVnTomorrowStartUtc(now: Date): Date {
  const { year, month, day } = parseVnDateKey(shiftVnDateKey(toVnDateKey(now), 1));
  return new Date(Date.UTC(year, month - 1, day) - VN_OFFSET_MS);
}

/**
 * Thời điểm UTC "giữa ngày" (10:00 giờ VN, 03:00Z) ứng với một ngày lịch VN dạng `'YYYY-MM-DD'`.
 * Mốc ghi cho PATCH `{scheduledFor}` (#403): client chỉ gửi NGÀY, server sở hữu instant.
 *
 * Không neo vào 00:00 VN như `getVnTomorrowStartUtc`: nửa đêm VN nằm sát biên ngày (= 17:00Z hôm
 * trước), nên một lệch đồng hồ vài tiếng giữa client/server dễ rơi nhầm sang ngày kế bên. 03:00Z
 * nằm giữa cửa sổ UTC của ngày đó (`[D-1 17:00Z, D 17:00Z)`), đúng quy ước đã dùng sẵn cho
 * `scheduledFor` ở khắp repo (fixture `schedule-sample.ts`, `review-schedule-service.test.ts`).
 */
export function getVnDateInstant(dateKey: string): Date {
  const { year, month, day } = parseVnDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
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
