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
  sourceCitation: QuestionSourceResponse | null;
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
