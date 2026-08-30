/** Định dạng ngày giờ dùng chung cho màn Lịch sử. Giờ địa phương của máy người dùng. */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `26/07 · 21:40` — nhãn của một mục danh sách. */
export function formatDayTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `26/07/2026` — tiêu đề panel chi tiết. */
export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** `21:40` */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Dòng meta dưới tiêu đề panel: `21:40 – 22:06 · 26 phút · Tên kế hoạch`.
 *
 * Thời lượng chỉ hiện khi có `endedAt`, và điều kiện đó nằm ở ĐÂY chứ không ở chỗ gọi.
 * `/summary` trả `durationMinutes: 0` — không phải `null` — cho phiên `endedAt` null
 * (`session-summary.service.ts`: `session.endedAt ? … : 0`), nên chỉ guard `null` là chưa đủ:
 * hàng cũ bị bỏ dở trước khi `abandonInterview` biết ghi `endedAt` sẽ in ra "0 phút", một con
 * số vừa sai vừa trông như phiên chớp nhoáng. Không có `endedAt` thì không đo được thời lượng,
 * và im lặng đúng hơn số 0.
 */
export function formatSessionMeta({
  startedAt,
  endedAt,
  durationMinutes,
  planName,
}: {
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  planName: string;
}): string {
  const parts: string[] = [];
  parts.push(endedAt ? `${formatTime(startedAt)} – ${formatTime(endedAt)}` : formatTime(startedAt));
  if (endedAt !== null && durationMinutes !== null) parts.push(`${durationMinutes} phút`);
  parts.push(planName);
  return parts.join(' · ');
}
