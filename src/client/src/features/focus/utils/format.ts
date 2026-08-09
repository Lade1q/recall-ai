/** `mm:ss`, làm tròn xuống — dùng cho vòng đồng hồ và mọi con số thời gian trên màn Focus. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** "22 phút" / "1 phút 35 giây" — dùng trong câu chữ hộp thoại, không phải đồng hồ. */
export function formatMinutesPhrase(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes} phút`;
}

export function formatMinutesSecondsPhrase(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} giây`;
  if (seconds === 0) return `${minutes} phút`;
  return `${minutes} phút ${seconds} giây`;
}

const VIETNAMESE_ORDINALS = [
  '',
  'Một',
  'Hai',
  'Ba',
  'Bốn',
  'Năm',
  'Sáu',
  'Bảy',
  'Tám',
  'Chín',
  'Mười',
];

/** "Bốn lượt" — chữ số nhỏ (1-10, khớp giới hạn `cycles` của schema) đánh vần theo mockup.
 *  Phòng thủ: `cycles` không nguyên/âm/NaN thì trả "0 lượt" thay vì "NaN lượt". */
export function cyclesToWords(cycles: number): string {
  if (!Number.isInteger(cycles) || cycles < 0) return '0 lượt';
  const word = VIETNAMESE_ORDINALS[cycles];
  return word ? `${word} lượt` : `${cycles} lượt`;
}

/** `HH:mm` giờ địa phương — dùng cho "còn 2 lượt... phiên xong khoảng 22:05". */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "20:14 hôm qua" / "20:14 hôm nay" — hộp thoại khôi phục phiên gián đoạn (AC ⑥). */
export function formatRelativeDayTime(date: Date, now: Date = new Date()): string {
  const time = formatClockTime(date);
  if (isSameCalendarDay(date, now)) return `${time} hôm nay`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return `${time} hôm qua`;
  const dateLabel = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${time} ngày ${dateLabel}`;
}

/**
 * Neo vị trí của một trích đoạn trong tệp gốc: `tr. 41` khi đoạn nằm gọn một trang, `tr. 41–43` khi
 * nó bắc qua nhiều trang. `null` khi không có neo — gọi là "tr. null" thì thà đừng hiện dòng nào.
 *
 * Gạch ngang là en dash (–) chứ không phải hyphen: đây là một KHOẢNG trang, cùng quy ước với khối
 * nguồn ở panel khái niệm (`ConceptSourceList`) — hai chỗ cùng nói một chuyện phải trông như nhau.
 */
export function formatPageAnchor(pageFrom: number | null, pageTo: number | null): string | null {
  if (pageFrom === null) return null;
  if (pageTo === null || pageTo === pageFrom) return `tr. ${pageFrom}`;
  return `tr. ${pageFrom}–${pageTo}`;
}
