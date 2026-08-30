import type { InterviewSessionListItem } from '../types/history.types';

/**
 * Nhóm danh sách phiên theo mốc thời gian (SPEC_DB-03 bước #2). Logic thuần, không đọc đồng hồ
 * hệ thống trực tiếp — `now` truyền vào để test ghim được biên "hôm nay / tuần này / tuần
 * trước" mà không phải giả lập giờ máy.
 *
 * Tuần bắt đầu từ **thứ Hai**, cùng quy ước với `weeklyStudyMinutes` của DB-01 (#200), để hai
 * màn không nói hai câu khác nhau về việc "tuần này" là từ hôm nào.
 */

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 00:00 thứ Hai của tuần chứa `date` (Chủ nhật thuộc về tuần vừa qua, không mở tuần mới). */
function startOfWeek(date: Date): number {
  const day = date.getDay(); // 0 = Chủ nhật
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return startOfDay(date) - daysSinceMonday * DAY_MS;
}

export function timeBucketLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  // Ngày giờ hỏng thì gom về một nhóm riêng thay vì ném — một hàng dị dạng không được
  // làm sập cả danh sách.
  if (Number.isNaN(started.getTime())) return 'Không rõ thời gian';

  if (startOfDay(started) === startOfDay(now)) return 'Hôm nay';

  const thisWeek = startOfWeek(now);
  if (started.getTime() >= thisWeek) return 'Tuần này';
  if (started.getTime() >= thisWeek - 7 * DAY_MS) return 'Tuần trước';

  return `Tháng ${started.getMonth() + 1}/${started.getFullYear()}`;
}

export interface SessionGroup {
  label: string;
  sessions: InterviewSessionListItem[];
}

/**
 * Giữ nguyên thứ tự server đã sắp (`startedAt` giảm dần) và chỉ chèn tiêu đề nhóm khi nhãn
 * đổi. Không sắp lại phía client: sắp lại một trang cục bộ sẽ làm thứ tự nhảy mỗi lần tải
 * thêm trang sau.
 */
export function groupSessionsByTime(
  sessions: InterviewSessionListItem[],
  now: Date
): SessionGroup[] {
  const groups: SessionGroup[] = [];
  for (const session of sessions) {
    const label = timeBucketLabel(session.startedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.sessions.push(session);
    } else {
      groups.push({ label, sessions: [session] });
    }
  }
  return groups;
}
