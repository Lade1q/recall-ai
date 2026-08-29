import type { ReviewQueueItem } from '../types/review-queue.types';

/**
 * Deep-link từ một mục hàng đợi ôn sang hai lối học của nó.
 *
 * Quy ước đã chốt ở #127/#227 và **khác nhau ở số nhiều**: Focus nhận đúng một `conceptId`, còn
 * phiên kiểm tra nhận `conceptIds` (nó chấm được nhiều khái niệm trong một phiên). Hai chuỗi này
 * từng nằm rời trong `TodayNudge`; màn Lịch (#405) là người dùng thứ hai, và một quy ước URL có
 * hai bản chép là một quy ước sẽ lệch — bên nào sửa trước thì bên kia dẫn tới màn trắng.
 *
 * Nhận `Pick<>` chứ không nhận cả `ReviewQueueItem` để `ScheduleItem` (siết `id` thành `string`)
 * và mục ảo A3 (`id: null`) dùng chung được: cả hai chỉ cần hai khoá này.
 */
type LinkableItem = Pick<ReviewQueueItem, 'planId' | 'conceptId'>;

export function focusHref(item: LinkableItem): string {
  return `/focus?planId=${item.planId}&conceptId=${item.conceptId}`;
}

export function interviewHref(item: LinkableItem): string {
  return `/interview?planId=${item.planId}&conceptIds=${item.conceptId}`;
}
