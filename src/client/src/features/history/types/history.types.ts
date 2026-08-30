/**
 * FE mirror của `InterviewSessionListItem` (`src/server/src/types/interview.types.ts`, #245).
 * Như mọi mirror khác trong `src/client`: `Date` phía server serialize thành chuỗi ISO.
 *
 * Panel chi tiết KHÔNG có type riêng — nó dùng lại `GetInterviewResponse` và
 * `SessionSummaryResponse` đã mirror sẵn ở `features/interview/types`.
 */
import type { InterviewSessionStatus } from '@/features/interview/types/interview.types';

/** Biến động điểm của MỘT khái niệm trong MỘT phiên (SPEC_DB-03 bước #2 và #4). */
export interface InterviewSessionListConceptDelta {
  conceptId: string;
  name: string;
  /**
   * `null` ở `masteryBefore` nghĩa là **chưa từng đo**, không phải `0.0` — đây là ràng buộc
   * cứng của màn này (SPEC_DB-03 bước #4 / UC-Overview §5.3). `masteryBefore ?? 0` rồi vẽ
   * `+0.72` là bịa ra một điểm xuất phát mà chưa ai từng đo.
   *
   * `null` ở `masteryAfter` nghĩa là phiên này không chấm được khái niệm đó lượt nào.
   */
  masteryBefore: number | null;
  masteryAfter: number | null;
  /** True khi `masteryAfter` là điểm thật đầu tiên của khái niệm ⇒ hiện nhãn "lần đầu". */
  isFirstAssessment: boolean;
}

export interface InterviewSessionListItem {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: InterviewSessionStatus;
  /** AE-05: điểm do sinh viên tự chấm trên flashcard, không cùng độ tin cậy với `grade_answer`. */
  fallbackMode: boolean;
  plan: { id: string; name: string };
  /** Số khái niệm trong hàng đợi của phiên — một phép đếm, không phải phân số tiến độ. */
  conceptTotal: number;
  /** `null` khi chưa khái niệm nào của phiên có điểm thật. Tín hiệu phụ, xem `concepts`. */
  averageMasteryScore: number | null;
  concepts: InterviewSessionListConceptDelta[];
}
