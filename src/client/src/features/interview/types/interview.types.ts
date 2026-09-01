/**
 * FE mirror của các shape trong `src/server/src/types/interview.types.ts` (I6.3 / #115),
 * dùng cho màn hình phỏng vấn AI Examiner (I6.6 / #118).
 *
 * Khác backend đúng một điểm: JSON serialize `Date` thành chuỗi ISO, nên mọi trường
 * kiểu `Date` phía server ở đây là `string`. Chỉ khai báo phần I6.6 tiêu thụ —
 * màn tổng hợp cuối phiên (I6.7) nằm ngoài phạm vi nên không mirror ở đây.
 */

/** Trạng thái một phiên phỏng vấn — enum `InterviewSessionStatus` phía server. */
export type InterviewSessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

/** Loại tài liệu (khớp với DocumentKind từ backend). */
export type DocumentKind = 'pdf' | 'image' | 'text';

/** Loại câu hỏi — enum `QuestionType` phía server. */
export type QuestionType = 'recall' | 'application' | 'why';

/** Nguồn của câu hỏi — enum `TurnSource` phía server. */
export type TurnSource = 'ai' | 'cache_fallback';

/** Kết luận AI chấm cho một lượt — enum `TurnVerdict` phía server. */
export type TurnVerdict = 'deep' | 'shallow' | 'wrong';

/** Vì sao một lệnh gọi AI không khả dụng — quyết định client fallback *từ* đâu. */
export type InterviewFallbackReason =
  'grading_unavailable' | 'question_unavailable' | 'no_cached_questions';

/** Điểm tự chấm ở chế độ flashcard fallback (AE-05). */
export type SelfGrade = 'correct' | 'partial' | 'wrong';

/** Sinh viên đang ở đâu: khái niệm nào của hàng đợi, lượt nào của khái niệm đó. */
export interface InterviewProgress {
  conceptIndex: number;
  conceptTotal: number;
  completedConcepts: number;
  turnIndex: number | null;
  maxTurnsPerConcept: number;
}

export interface InterviewSessionState {
  id: string;
  planId: string;
  status: InterviewSessionStatus;
  /** True khi bất kỳ lệnh gọi Gemini nào đã fail trong phiên — client chuyển sang AE-05. */
  fallbackMode: boolean;
  startedAt: string;
  endedAt: string | null;
  currentConcept: { id: string; name: string } | null;
  progress: InterviewProgress;
}

/**
 * Neo nguồn C5 của một câu hỏi: tài liệu + trang mà khái niệm được trích ra.
 */
export interface QuestionSourceResponse {
  documentId: string;
  filename: string;
  kind: DocumentKind;
  /** `null` for material that has no pages — plain text, or an image. */
  pageFrom: number | null;
  pageTo: number | null;
}

/** Câu hỏi đang chờ trả lời. `turnId` là bản ghi mà `POST /answers` sẽ ghi vào. */
export interface InterviewQuestionResponse {
  turnId: string;
  conceptId: string;
  conceptName: string;
  turnIndex: number;
  questionText: string;
  questionType: QuestionType | null;
  source: TurnSource;
  sourceCitation: QuestionSourceResponse | null;
}

/** Một dòng transcript. Lượt đã trả lời mang theo điểm AI đã chấm. */
/** Mirror của `TurnMode` (Prisma) / `QuestionMode` (server) — cùng bốn nấc, không tên mới. */
export type TurnMode = 'initial' | 'deeper' | 'probe' | 'hint';

export interface InterviewTurnResponse {
  id: string;
  conceptId: string;
  conceptName: string;
  turnIndex: number;
  questionText: string;
  questionType: QuestionType | null;
  answerText: string | null;
  score: number | null;
  feedback: string | null;
  verdict: TurnVerdict | null;
  askedAt: string;
  answeredAt: string | null;
  /**
   * Nấc thang câu hỏi đã sinh ra lượt này (#392); `null` khi nó không đứng trên nấc nào — lượt
   * có trước cột `mode`, và mọi lượt flashcard. Dùng để NÓI, không để tính.
   */
  mode: TurnMode | null;
  /**
   * Lượt này có vào trung bình có trọng số không. Server quyết, client chỉ đọc — xem
   * `features/interview/utils/turn-mode.ts` để biết vì sao không suy lại từ `mode`.
   */
  countsTowardMastery: boolean;
  sourceCitation: QuestionSourceResponse | null;
  /**
   * Đường đã sinh ra lượt này. `cache_fallback` = sinh viên tự chấm (AE-05) nên điểm là của
   * chính họ. KHÔNG suy được từ `verdict`: lượt flashcard vẫn mang `verdict` thật.
   */
  source: TurnSource;
  /**
   * Lượt này có gửi phản hồi điểm được không (AE-10)?
   *
   * ⛔ Client KHÔNG tự suy từ `verdict`/`source`/`mode` — cùng luật với `countsTowardMastery`:
   * suy lại ở đây là dựng bản thứ hai của cổng bằng một ngôn ngữ khác, và hai bản sẽ trôi khỏi
   * nhau. Server quyết bằng `isTurnAppealable`, client chỉ đọc cờ này.
   */
  canAppeal: boolean;
  /**
   * Phản hồi của sinh viên về điểm lượt này (AE-10), `null` khi chưa gửi.
   *
   * Mang NỘI DUNG chứ không phải cờ boolean: mở lại panel phải dựng lại form với đúng thứ đã
   * gửi để sửa được, và một cờ sẽ tốn thêm một vòng gọi để làm việc đó.
   */
  gradingFeedback: GradingFeedbackResponse | null;
}

/** Một hàng `grading_feedback` như client thấy (AE-10 · UC-15). */
export interface GradingFeedbackResponse {
  /** Các chip đã chọn; rỗng khi sinh viên chỉ viết lý do tự do. */
  reasons: string[];
  /** Lý do tự do, tùy chọn theo UC-15. */
  note: string | null;
}

export interface InterviewFallbackResponse {
  reason: InterviewFallbackReason;
  message: string;
}

/**
 * Kết quả `finalizeConceptResult()` khi một khái niệm kết thúc. Màn I6.6 chỉ cần biết
 * *một khái niệm đã xong* — không cần vẽ chi tiết tiên quyết, nên chỉ khai báo tối thiểu.
 */
export interface ConceptCompletedResponse {
  conceptId: string;
  conceptName: string;
  masteryScore: number | null;
}

export interface StartInterviewResponse {
  /** `false` khi đã tồn tại một phiên chưa hoàn tất và đang được trả lại (AE-03). */
  created: boolean;
  session: InterviewSessionState;
  question: InterviewQuestionResponse | null;
  message: string | null;
  fallback: InterviewFallbackResponse | null;
}

export interface GetInterviewResponse {
  session: InterviewSessionState;
  currentQuestion: InterviewQuestionResponse | null;
  /** Toàn bộ transcript của phiên, cũ nhất trước. */
  turns: InterviewTurnResponse[];
  fallback: InterviewFallbackResponse | null;
}

export interface SubmitAnswerResponse {
  session: InterviewSessionState;
  grading: { score: number; feedback: string | null; verdict: TurnVerdict } | null;
  gradedTurnId: string;
  nextQuestion: InterviewQuestionResponse | null;
  conceptCompleted: ConceptCompletedResponse | null;
  sessionCompleted: boolean;
  /** True khi câu trả lời này đã được chấm trước đó và kết quả cũ đang được phát lại. */
  replayed: boolean;
  fallback: InterviewFallbackResponse | null;
}

export interface PauseInterviewResponse {
  session: InterviewSessionState;
}

export interface ResumeInterviewResponse {
  session: InterviewSessionState;
  currentQuestion: InterviewQuestionResponse | null;
  fallback: InterviewFallbackResponse | null;
}

/**
 * `POST /interviews/:id/abandon` (#243) — "Kết thúc và chấm phần đã làm" (SPEC_DB-03 AF2).
 * `conceptCompleted` là khái niệm đang dở vừa được chấm trên số lượt đã trả lời, `null` nếu
 * không có lượt nào chấm được.
 */
export interface AbandonInterviewResponse {
  session: InterviewSessionState;
  conceptCompleted: ConceptCompletedResponse | null;
}

/** One graded turn of a concept, stripped to what the summary screen charts. */
export interface SessionSummaryTurnResponse {
  turnIndex: number;
  score: number | null;
  verdict: TurnVerdict | null;
  /**
   * Nấc thang câu hỏi đã sinh ra lượt này (#392); `null` khi nó không đứng trên nấc nào — lượt
   * có trước cột `mode`, và mọi lượt flashcard. Dùng để NÓI, không để tính.
   */
  mode: TurnMode | null;
  /**
   * Lượt này có vào trung bình có trọng số không. Server quyết, client chỉ đọc — xem
   * `features/interview/utils/turn-mode.ts` để biết vì sao không suy lại từ `mode`.
   */
  countsTowardMastery: boolean;
}

/** One concept's full result for the session, oldest turn first. */
export interface SessionSummaryConceptResponse {
  conceptId: string;
  name: string;
  /**
   * Điểm của riêng phiên này (không phải `Concept.masteryScore` live hôm nay vì các phiên sau có thể đã ghi đè).
   * `null` khi hàng đợi đạt `completed` trước khi khái niệm được hỏi, hoặc mọi lượt hỏi về khái niệm đều chấm hỏng
   * (khác `0` là đã chấm và trả lời sai hoàn toàn).
   */
  masteryScore: number | null;
  turns: SessionSummaryTurnResponse[];
}

export interface SessionSummaryReviewItemResponse {
  /** `ReviewQueueItem.id` — the `itemId` of `PATCH /review-queue/:itemId` (#310). */
  id: string;
  conceptId: string;
  name: string;
  reason: 'traceback' | 'spaced_repetition' | 'deadline_priority' | 'manual';
  depth: number | null;
  /**
   * Group the Traceback block by this, not by `sourceConceptName` — the name collides when two
   * concepts share it. `null` for `spaced_repetition`; non-null with a `null` name means the
   * source concept was deleted since (soft reference, no FK).
   */
  sourceConceptId: string | null;
  sourceConceptName: string | null;
  status: 'pending' | 'skipped';
  scheduledFor: string | null;
}

export interface SessionSummaryReport {
  text: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  generatedByAi: boolean;
  message: string | null;
}

export interface SessionSummaryResponse {
  sessionId: string;
  status: InterviewSessionStatus;
  durationMinutes: number;
  concepts: SessionSummaryConceptResponse[];
  summary: SessionSummaryReport;
  reviewSchedule: SessionSummaryReviewItemResponse[];
}
