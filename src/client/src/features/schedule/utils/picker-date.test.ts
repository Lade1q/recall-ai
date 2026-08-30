import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKeyToLocalDate, localDateToDateKey } from './picker-date';

/**
 * Cây cầu `dateKey ↔ Date` — nơi DUY NHẤT feature này rời khỏi không gian chuỗi `YYYY-MM-DD`.
 *
 * 🔴 Mỗi khối dưới đây **tự ghim `TZ`**, và ghim HAI múi giờ có dấu ngược nhau. Lý do là một số
 * đo, không phải sự cẩn thận thừa: CI chạy ở **UTC** (`ci.yml` không đặt `TZ`), và ở UTC thì cả
 * hai lối cài sai — `new Date(dateKey)` và `toISOString().slice(0, 10)` — đều cho **đúng** kết
 * quả. Một test không ghim `TZ` vì thế là phép đo *không thể sai*: nó xanh cho cả bản đúng lẫn
 * bản hỏng, và để lại đúng thứ lưới làm người sau yên tâm nhầm.
 *
 * Hai chiều hỏng ở hai phía khác nhau, nên phải có cả hai zone:
 * - offset **âm** (`America/New_York`) bắt chiều `dateKey → Date`;
 * - offset **dương** (`Asia/Ho_Chi_Minh`, người dùng thật) bắt chiều `Date → dateKey`.
 *
 * Mỗi khối kèm một **đối chứng âm**: khẳng định thẳng rằng lối cài sai LỆCH ở zone đó. Nếu ngày
 * nào đó đối chứng âm ngừng lệch thì chính bài test này mất tác dụng, và nó sẽ đỏ để báo.
 */
/**
 * `vi.stubEnv` chứ không gán thẳng `process.env.TZ`: `unstubAllEnvs` **xoá** khoá khi trước đó nó
 * vắng mặt, còn gán tay thì trả lại chuỗi `"undefined"` và rò múi giờ sang mọi tệp test chạy sau
 * trong cùng worker. Nó cũng giữ tệp này không phải nhắc tới `process` — `tsconfig.app.json`
 * không nạp type của Node, nên `tsc -b` sẽ đỏ.
 */
function setTz(tz: string): void {
  vi.stubEnv('TZ', tz);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cầu dateKey ↔ Date ở America/New_York (offset ÂM)', () => {
  beforeEach(() => setTz('America/New_York'));

  it('dateKeyToLocalDate trả đúng NGÀY ĐỊA PHƯƠNG, không lùi một ngày', () => {
    const date = dateKeyToLocalDate('2026-08-25');
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 25]);
  });

  it('ĐỐI CHỨNG ÂM: `new Date(dateKey)` lệch một ngày ở đây', () => {
    // Parse theo ISO là 00:00 UTC ⇒ ở offset âm, ngày địa phương lùi về 24.
    expect(new Date('2026-08-25').getDate()).toBe(24);
    expect(dateKeyToLocalDate('2026-08-25').getDate()).not.toBe(new Date('2026-08-25').getDate());
  });

  it('khứ hồi giữ nguyên khoá', () => {
    for (const key of ['2026-01-01', '2026-08-25', '2026-12-31', '2027-03-01']) {
      expect(localDateToDateKey(dateKeyToLocalDate(key))).toBe(key);
    }
  });
});

describe('cầu dateKey ↔ Date ở Asia/Ho_Chi_Minh (người dùng thật)', () => {
  beforeEach(() => setTz('Asia/Ho_Chi_Minh'));

  it('localDateToDateKey trả đúng ngày địa phương', () => {
    expect(localDateToDateKey(new Date(2026, 7, 25))).toBe('2026-08-25');
  });

  it('ĐỐI CHỨNG ÂM: `toISOString().slice(0, 10)` lệch một ngày ở đây', () => {
    // `new Date(2026, 7, 25)` = 2026-08-24T17:00:00Z ở UTC+7 ⇒ ISO nói 24, không phải 25.
    const localMidnight = new Date(2026, 7, 25);
    expect(localMidnight.toISOString().slice(0, 10)).toBe('2026-08-24');
    expect(localDateToDateKey(localMidnight)).not.toBe(localMidnight.toISOString().slice(0, 10));
  });

  it('đệm 0 cho tháng và ngày một chữ số', () => {
    expect(localDateToDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('khứ hồi giữ nguyên khoá', () => {
    for (const key of ['2026-01-01', '2026-08-25', '2026-12-31', '2027-03-01']) {
      expect(localDateToDateKey(dateKeyToLocalDate(key))).toBe(key);
    }
  });
});
