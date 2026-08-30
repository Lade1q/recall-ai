export type FocusSessionStatus = 'running' | 'completed' | 'cancelled';

/** `users.pomodoro_config` (FS-02) — snake_case để khớp JSON server trả nguyên văn. */
export interface PomodoroConfig {
  work: number;
  short_break: number;
  long_break: number;
  cycles: number;
  sound: boolean;
}

/** Response của POST /focus-sessions. */
export interface CreateFocusSessionResponse {
  /** `false` khi một phiên `running` khớp đúng request được trả lại thay vì tạo mới (#328) —
   *  luôn đi kèm HTTP 200 thay vì 201. Phiên KHÔNG khớp request thì server từ chối 409
   *  `SESSION_ALREADY_RUNNING` thay vì trả về đây — trường này không bao giờ mang dữ liệu
   *  của một plan/concept khác với thứ vừa gửi lên. */
  created: boolean;
  id: string;
  planId: string | null;
  conceptIds: string[];
  status: FocusSessionStatus;
  strictMode: boolean;
  startedAt: string;
}

/** Response của PATCH /focus-sessions/:id. */
export interface EndFocusSessionResponse {
  id: string;
  status: FocusSessionStatus;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: string;
  endedAt: string;
}

export interface EndFocusSessionInput {
  status: 'completed' | 'cancelled';
  focusedSeconds: number;
  awayCount?: number;
  pomodorosCompleted?: number;
}

/** Khái niệm đã đụng tới trong một phiên. Tên đã được server resolve; khái niệm không tra
 *  được (đã xoá, hoặc thuộc user khác) trả `'Không xác định'` chứ không bị loại khỏi mảng. */
export interface FocusSessionConceptSummary {
  id: string;
  name: string;
}

/**
 * Một mục trong lịch sử phiên học — `GET /focus-sessions?limit=&offset=` (FS-03 · DB-08 #247).
 *
 * `startedAt`/`endedAt` là **chuỗi ISO**: server khai `Date`, JSON tuần tự hoá thành chuỗi.
 *
 * ⚠️ `durationMinutes` của phiên `cancelled` LUÔN bằng `0` — có chủ ý, theo FS-01 Alt flow 4
 * (`focus-session.service.ts`: thời gian phiên bị hủy không tính vào lịch sử học tập).
 * `focusedSeconds` vẫn giữ số liệu thô. Hai trường này KHÁC NHAU ở phiên hủy, và chỗ nào cộng
 * tổng thời gian phải nói rõ nó đang cộng cái nào.
 */
export interface FocusSessionListItem {
  id: string;
  planId: string | null;
  concepts: FocusSessionConceptSummary[];
  status: FocusSessionStatus;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: string;
  endedAt: string | null;
}

/** Một ghi chú nhanh (FS-05), như GET/POST/PATCH /focus-sessions/:id/notes trả về. */
export interface SessionNote {
  id: string;
  sessionId: string;
  conceptId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Lượt hiện tại trong chu kỳ Pomodoro. */
export type PomodoroPhase = 'work' | 'short_break' | 'long_break';

/**
 * Snapshot ghi vào `localStorage` mỗi ~10s (AC ⑥) để khôi phục phiên bị gián đoạn.
 * `conceptName`/`planId`/`conceptIds` không nằm trong danh sách trường AC liệt kê,
 * nhưng hộp thoại khôi phục cần nêu đích danh khái niệm — không có chỗ nào khác lấy lại
 * được tên này sau khi tab đã đóng, nên phải lưu kèm.
 */
export interface FocusSessionSnapshot {
  sessionId: string;
  startedAt: string;
  focusedMs: number;
  awayCount: number;
  pomodorosCompleted: number;
  conceptName: string;
  planId: string | null;
  conceptIds: string[];
  /**
   * Chủ của phiên. `localStorage` theo origin chứ không theo tài khoản, nên thiếu trường này thì
   * đổi tài khoản trên cùng trình duyệt sẽ thấy hộp khôi phục của người trước — bấm "Ghi nhận" là
   * PATCH một phiên không thuộc mình (404).
   *
   * `null` cho snapshot ghi TRƯỚC khi có trường này. Phải phân biệt "không biết chủ" với "chủ
   * khác": so sánh thẳng `!==` sẽ vứt mọi snapshot cũ, tức cướp mất dữ liệu khôi phục hợp lệ của
   * chính người đang đăng nhập.
   */
  userId: string | null;
}
