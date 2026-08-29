import type { FocusSessionListItem } from '@/features/focus/types/focus.types';

/**
 * Nhóm lịch sử phiên học theo TỪNG NGÀY, kèm tổng thời lượng của ngày đó (DB-08 · #247).
 *
 * ⚠️ Đây KHÔNG phải `groupSessionsByTime` của tab Phiên kiểm tra. Hàm kia nhóm theo *thùng*
 * ("Hôm nay / Tuần này / Tuần trước / Tháng N") và không cộng gì cả. Mockup của tab này
 * (`screen-history.html:1473-1505`) nhóm theo ngày và in tổng phút ngay trên tiêu đề nhóm —
 * hai ngữ nghĩa khác nhau, nên đây là hàm riêng chứ không phải bản generic hoá của hàm kia.
 *
 * `now` truyền vào chứ không đọc đồng hồ máy, để test ghim được biên "Hôm nay" mà không phải
 * giả lập giờ hệ thống — cùng thủ pháp với `group-sessions.ts`.
 */

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Số phút của một phiên được tính vào **tổng của ngày**: luôn là `durationMinutes`, không bao
 * giờ là `focusedSeconds`.
 *
 * Phiên `cancelled` vì thế đóng góp `0` — nhưng đó là do **server đã quyết** (FS-01 Alt flow 4:
 * *"Hủy phiên: không tính thời gian vào lịch sử học tập, dù `focusedSeconds` vẫn được lưu
 * nguyên"*), không phải do hàm này lọc. Đừng thêm nhánh `if (status === 'cancelled') return 0`:
 * nó là no-op trên mọi dữ liệu server gửi, và một nhánh không bao giờ đổi kết quả sẽ khiến
 * người sau tin rằng chính sách nằm ở client.
 *
 * Dải chỉ số FS-07 phía trên tab cũng cộng theo cột này. Hai chỗ cộng hai cột khác nhau là cách
 * chắc chắn nhất để tổng tuần không bao giờ khớp tổng ngày.
 *
 * 🔴 **QUYẾT ĐỊNH CÒN MỞ (#247).** Mockup vẽ phiên hủy là "17:40 · 7 phút" và **cộng 7 phút đó
 * vào tiêu đề ngày** (`24/07 — 32 phút` = 25 + 7). Theo hợp đồng thì con số đúng là 25. Đáng
 * chú ý hơn: lý do mockup đưa ra để HIỆN phiên hủy — *"giấu nó đi thì tổng thời gian trong tuần
 * sẽ không bao giờ khớp với danh sách"* — chỉ đứng vững nếu phiên hủy có phút; với
 * `durationMinutes = 0` thì tổng vốn đã không đếm nó.
 *
 * Ở đây theo hợp đồng, vì code đang chạy thắng mockup khi hai bên lệch. Nếu Quân chốt theo
 * mockup thì việc phải làm là **cộng `focusedSeconds` cho hàng `cancelled`** — một thay đổi
 * thật ở hàm này, không phải bật một lá cờ.
 */
export function minutesTowardDayTotal(session: FocusSessionListItem): number {
  return session.durationMinutes;
}

/** `Hôm nay · 27/07` cho ngày hiện tại, `26/07` cho mọi ngày khác — theo mockup. */
export function dayLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  // Một hàng có ngày hỏng không được làm sập cả danh sách — gom về nhóm riêng, cùng cách
  // `timeBucketLabel` xử lý.
  if (Number.isNaN(started.getTime())) return 'Không rõ thời gian';

  const date = `${pad(started.getDate())}/${pad(started.getMonth() + 1)}`;
  return startOfDay(started) === startOfDay(now) ? `Hôm nay · ${date}` : date;
}

export interface FocusDayGroup {
  /** Khoá nhóm — mốc 00:00 địa phương của ngày, hoặc `NaN` cho nhóm ngày hỏng. */
  dayStart: number;
  label: string;
  totalMinutes: number;
  sessions: FocusSessionListItem[];
}

/**
 * Giữ nguyên thứ tự server đã sắp (`startedAt` giảm dần), chỉ mở nhóm mới khi sang ngày khác.
 * Không sắp lại phía client: sắp lại một trang cục bộ làm thứ tự nhảy mỗi lần tải thêm trang.
 *
 * Hệ quả cố ý của việc "chỉ mở nhóm khi ĐỔI ngày": nếu server trả về thứ tự không đơn điệu thì
 * một ngày có thể xuất hiện hai nhóm. Đó là phản ánh trung thực dữ liệu nhận được, tốt hơn là
 * gộp lại rồi che mất một hợp đồng đã vỡ.
 */
export function groupFocusSessionsByDay(
  sessions: readonly FocusSessionListItem[],
  now: Date
): FocusDayGroup[] {
  const groups: FocusDayGroup[] = [];

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    const dayStart = Number.isNaN(started.getTime()) ? Number.NaN : startOfDay(started);
    const last = groups[groups.length - 1];

    // `NaN !== NaN` nên mọi hàng ngày-hỏng tự mở nhóm riêng thay vì dồn vào một nhóm chung.
    // Chấp nhận: chúng hiếm, và gộp chúng lại đòi một nhánh riêng cho một ca không ai thấy.
    if (last !== undefined && last.dayStart === dayStart) {
      last.sessions.push(session);
      last.totalMinutes += minutesTowardDayTotal(session);
    } else {
      groups.push({
        dayStart,
        label: dayLabel(session.startedAt, now),
        totalMinutes: minutesTowardDayTotal(session),
        sessions: [session],
      });
    }
  }

  return groups;
}

/** `50 phút` · `1 giờ 20 phút` — tiêu đề nhóm ngày. Mockup dùng dạng phút cho số nhỏ. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}
