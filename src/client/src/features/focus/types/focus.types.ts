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
