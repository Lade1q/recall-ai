import type { InterviewSessionListItem } from '../types/history.types';

/**
 * Giữ phiên người dùng đã chọn nếu nó còn trong phần danh sách đã tải; chỉ rơi về phiên mới
 * nhất khi lựa chọn đó thật sự không còn trong phạm vi hiện tại (ví dụ đổi bộ lọc kế hoạch).
 */
export function selectInterviewSession(
  sessions: readonly InterviewSessionListItem[],
  selectedId: string | null
): InterviewSessionListItem | null {
  return sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
}
