import { useCallback, useEffect, useState } from 'react';

import { interviewApi } from '@/features/interview/api/interview.api';
import type {
  GetInterviewResponse,
  InterviewSessionStatus,
  SessionSummaryResponse,
} from '@/features/interview/types/interview.types';

/**
 * Phiên này đọc được những gì. Màn Lịch sử là màn **read-only** (SPEC_DB-03 §2), nên cái nó
 * KHÔNG gọi cũng quan trọng như cái nó gọi:
 *
 * - `closed` (`completed` / `abandoned`) — đọc cả transcript lẫn `/summary`.
 * - `paused` — chỉ transcript. `/summary` ném 409 `SESSION_NOT_COMPLETED` cho phiên chưa đóng
 *   (`session-summary.service.ts`), và phiên tạm dừng thì đúng là chưa có gì để tổng kết.
 *   Không gọi thì không phải dịch một mã lỗi mà người dùng không gây ra và không sửa được.
 * - `active` — **không gọi gì cả**. `GET /interviews/:id` cho phiên `active` chạy máy trạng
 *   thái (`advanceToNextQuestion`) và có thể gọi Gemini sinh câu hỏi mới. Mở một hàng trong
 *   lịch sử mà đốt một lượt gọi AI và đẩy phiên sang lượt kế tiếp thì màn "chỉ trình bày lại"
 *   đã ghi vào chính dữ liệu nó đang đọc.
 */
export type SessionReadPlan = 'closed' | 'paused' | 'active';

export function readPlanFor(status: InterviewSessionStatus): SessionReadPlan {
  if (status === 'active') return 'active';
  if (status === 'paused') return 'paused';
  return 'closed';
}

export interface SessionDetail {
  transcript: GetInterviewResponse | null;
  /** `null` cho phiên `paused`/`active` — theo thiết kế, không phải lỗi tải. */
  summary: SessionSummaryResponse | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

interface LoadedDetail {
  /** Khoá của dữ liệu đang giữ. Khác khoá đang cần ⇒ đó là dữ liệu của phiên cũ. */
  key: string;
  transcript: GetInterviewResponse | null;
  summary: SessionSummaryResponse | null;
  error: boolean;
}

/**
 * Nạp chi tiết của phiên đang chọn. Khác `useAsyncResource` của Dashboard đúng ở chỗ quan
 * trọng nhất với màn này: effect chạy lại khi **`sessionId` đổi**, không chỉ khi bấm "Thử
 * lại". Dùng thẳng `useAsyncResource` ở đây sẽ khoá dữ liệu vào phiên được chọn đầu tiên và
 * mọi lần chọn sau đều hiện chi tiết của phiên cũ.
 *
 * `loading` được SUY RA từ việc khoá của dữ liệu đang giữ có khớp khoá đang cần hay không, chứ
 * không phải một cờ được bật trong thân effect. Nhờ vậy đổi phiên là panel trống ngay ở lượt
 * render đầu — không có nhịp nào transcript của phiên trước nằm dưới tiêu đề của phiên vừa
 * chọn — mà không cần `setState` đồng bộ trong effect.
 */
export function useSessionDetail(
  sessionId: string | null,
  status: InterviewSessionStatus | null
): SessionDetail {
  const [loaded, setLoaded] = useState<LoadedDetail | null>(null);
  const [attempt, setAttempt] = useState(0);

  const plan = status === null ? null : readPlanFor(status);
  // `null` = không có gì để tải: chưa chọn phiên, hoặc phiên `active` mà ta cố ý không đụng.
  const key =
    sessionId !== null && plan !== null && plan !== 'active' ? `${sessionId}#${attempt}` : null;

  useEffect(() => {
    if (key === null || sessionId === null || plan === null || plan === 'active') return;

    let alive = true;
    Promise.all([
      interviewApi.getInterview(sessionId),
      plan === 'closed' ? interviewApi.getSummary(sessionId) : Promise.resolve(null),
    ])
      .then(([transcript, summary]) => {
        if (alive) setLoaded({ key, transcript, summary, error: false });
      })
      .catch(() => {
        if (alive) setLoaded({ key, transcript: null, summary: null, error: true });
      });

    return () => {
      // Chọn nhanh nhiều phiên liên tiếp: phản hồi của phiên bỏ dở giữa chừng bị chặn ở đây,
      // nếu không nó có thể về sau và ghi đè phiên đang mở.
      alive = false;
    };
  }, [key, sessionId, plan]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (key === null) {
    return { transcript: null, summary: null, loading: false, error: false, reload };
  }
  if (loaded === null || loaded.key !== key) {
    return { transcript: null, summary: null, loading: true, error: false, reload };
  }
  return {
    transcript: loaded.transcript,
    summary: loaded.summary,
    loading: false,
    error: loaded.error,
    reload,
  };
}
