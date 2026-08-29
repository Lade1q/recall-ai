/**
 * Cây cầu **duy nhất** giữa chuỗi `dateKey` và `Date` trong feature Lịch.
 *
 * Cả màn làm việc trên chuỗi `YYYY-MM-DD` do server cắt theo giờ VN; `Date` chỉ xuất hiện vì
 * `react-day-picker` bắt buộc. Tách riêng tệp này để cây cầu **có một chỗ duy nhất để đọc và để
 * test** — nó KHÔNG định nghĩa thêm một quy ước ngày thứ hai, chỉ đổi biểu diễn.
 *
 * ⚠️ `utils/schedule-date.ts` cũng dựng `Date` (`buildMonthCells`) và cũng tự xưng "chỗ duy
 * nhất" — **cả hai đều đúng, vì chúng ở hai không gian khác nhau.** Bên đó là **UTC-space**:
 * dựng bằng `Date.UTC`, đọc bằng `getUTC*`, nên `toISOString()` ở đó là ĐÚNG và độc lập múi giờ.
 * Tệp này là **local-space**: dựng và đọc bằng accessor giờ địa phương, vì `react-day-picker`
 * chỉ nói ngôn ngữ đó — và chính vì thế `toISOString()` ở đây là sai. Đừng chép cách làm qua lại
 * giữa hai tệp mà không đổi cả không gian.
 */

/**
 * `'2026-08-25'` → `Date` lúc 00:00 giờ **địa phương** (không phải UTC).
 *
 * `react-day-picker` làm việc trọn vẹn trong không gian giờ địa phương — nó đọc `getFullYear()`/
 * `getMonth()`/`getDate()`. ⛔ KHÔNG dùng `new Date(dateKey)`: chuỗi ISO được parse là 00:00
 * **UTC**, nên ở mọi múi giờ **âm** ngày địa phương lùi một hôm — `new Date('2026-08-25')` ở
 * `America/New_York` cho `getDate() === 24`. Lịch sẽ tô sai ô, người dùng bấm "đúng ngày đang
 * thấy" và dời lệch một ngày.
 */
export function dateKeyToLocalDate(dateKey: string): Date {
  return new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10))
  );
}

/**
 * Nghịch đảo: `Date` giờ **địa phương** → `'2026-08-25'`.
 *
 * ⛔ KHÔNG dùng `toISOString().slice(0, 10)`. Đây là nửa chịu lực đối với người dùng thật, và số
 * đo nói rõ hơn lời cấm: ở `Asia/Ho_Chi_Minh` (UTC+7), `new Date(2026, 7, 25)` là
 * `2026-08-24T17:00:00Z`, nên `toISOString()` trả **`'2026-08-24'`** — lệch đúng một ngày, về
 * phía trước, cho **mọi** người dùng Việt Nam.
 *
 * ⚠️ Ở UTC hai cách bằng nhau, nên CI (chạy UTC — `ci.yml` không đặt `TZ`) **không** phân biệt
 * được: test của cây cầu này phải tự ghim `TZ`, xem `picker-date.test.ts`.
 */
export function localDateToDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
