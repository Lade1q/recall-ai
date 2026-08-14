import { masteryBand } from '@/components/ui/concept-node';

/**
 * Ngưỡng CẮT NHÁNH truy ngược — soi gương (mirror) `MASTERY_THRESHOLD` ở `server/src/services/traceback.service.ts:16`.
 *
 * ⚠️ Trùng con số 0.6 với biên dưới dải "learning" của `masteryBand()` nhưng khác nghĩa hẳn:
 * `masteryBand()` quyết định MÀU hiển thị, hằng số này quyết định có xếp khái niệm nền vào lịch
 * ôn hay không. Vì thế một khái niệm `0.78` vẫn mang màu vàng "đang học" mà đã qua ngưỡng truy
 * ngược nên không bị đưa vào lịch (#119 — "hai mốc 0.6 khác nhau, đừng gộp").
 *
 * Codebase hiện có 3 mốc threshold: `0.6` (dừng truy ngược), `0.7` (`MIN_COVERAGE` của Interview v2),
 * và `0.8` (mốc "đã vững" hiển thị).
 *
 * Đây KHÔNG phải nguồn sự thật thứ hai cho dải màu: mọi chỗ phân dải vẫn gọi `masteryBand()`.
 */
export const TRACEBACK_THRESHOLD = 0.6;

type Band = ReturnType<typeof masteryBand>;

/**
 * Biến CSS của từng dải, cho những chỗ phải tô inline vì màu nằm trong `style` chứ không phải
 * class tĩnh (chiều dài thanh điểm, chấm chú giải). Chỗ nào dùng được class thì dùng
 * `bg-mastery-*` như `ReviewQueueItemRow`.
 */
export const BAND_COLOR_VAR: Record<Band, string> = {
  strong: 'var(--mastery-strong)',
  learning: 'var(--mastery-learning)',
  weak: 'var(--mastery-weak)',
  untested: 'var(--mastery-untested)',
};

export function masteryColor(score: number | null): string {
  return BAND_COLOR_VAR[masteryBand(score)];
}
