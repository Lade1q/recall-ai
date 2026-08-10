/** Lời chào theo buổi trong ngày, tính trên giờ máy client (0–23). */
export function greetingForHour(hour: number): string {
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 13) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** "Thứ Hai, 09/08/2026" — thứ (vi-VN) + ngày dd/MM/yyyy. */
export function formatFullDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date);
  const dmy = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  return `${weekday}, ${dmy}`;
}

/**
 * Phút → "6h 20m" / "0h 10m", khớp dải chỉ số của mockup. Nhãn nói "thời gian học tuần này" nên
 * luôn hiện cả giờ lẫn phút kể cả khi bằng 0 (mockup A1b hiện "0h 0m"), để ba ô cùng một hình.
 */
export function formatStudyMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${minutes}m`;
}
