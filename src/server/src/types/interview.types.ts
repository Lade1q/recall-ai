import type {
  DocumentKind,
  InterviewSessionStatus,
  QuestionType,
  ReviewItemStatus,
  ReviewReason,
  TurnSource,
  TurnVerdict,
} from '@prisma/client';
import type { TracebackReason } from '../services/traceback.service';
import type { TracebackSkipReason } from '../services/concept-result.service';

/**
 * Response shapes of the Interview API (I6.3 / #115), consumed by the interview screen (I6.6)
 * and the end-of-session screen (I6.7).
 *
 * Everything here is derived from `interview_sessions` / `interview_turns` on each request:
 * the session state lives in the database, never in a module-level variable, so a server
 * restart mid-session loses nothing (#115's "Stateless HTTP" constraint).
 */

/** Where the student is: which concept of the queue, which turn of that concept. */
export interface InterviewProgress {
  /** 0-based position in `conceptQueue`; equals `conceptTotal` once the session is done. */
  conceptIndex: number;
  conceptTotal: number;
  /** Concepts already finalised — what a "2/3 khái niệm" progress line shows. */
  completedConcepts: number;
  /** 1-based turn the pending question belongs to, or `null` when none is waiting. */
  turnIndex: number | null;
  /** The session's own C6 limit, so the client can render "lượt 2/3" without guessing. */
  maxTurnsPerConcept: number;
}

export interface InterviewSessionState {
  id: string;
  planId: string;
  status: InterviewSessionStatus;
  /** True once any Gemini call failed in this session — the client switches to AE-05 fallback. */
  fallbackMode: boolean;
  startedAt: Date;
  endedAt: Date | null;
  currentConcept: { id: string; name: string } | null;
  progress: InterviewProgress;
}

/**
 * Where a question's concept was taken from: the document and page `extract_concepts` anchored
 * it to. This is constraint C5 ("AI không bịa") inside the interview screen — the student can
 * see which page the thing they are being asked about actually came from.
 *
 * Read back from what the turn itself recorded when it was asked, not from where the concept is
 * anchored now (#240): a plan's document can be swapped or re-analysed mid-session, and a
 * re-derived citation would quietly renumber old questions onto the new file.
 *
 * Narrower than `ConceptSourceItemResponse` on purpose: no `excerpt`. A transcript holds up to
 * 5 concepts × 3 turns, and a 2000-character excerpt on each would be ~30KB nobody reads; the
 * citation block under a question is a single line. Verbatim passages belong to the concept
 * detail panel (DB-06) and the focus screen (FS-04), which show one concept at a time.
 */
export interface QuestionSourceResponse {
  documentId: string;
  filename: string;
  kind: DocumentKind;
  /** `null` for material that has no pages — plain text, or an image. */
  pageFrom: number | null;
  pageTo: number | null;
}

/** The question waiting for an answer. `turnId` is what `POST /answers` writes onto. */
export interface InterviewQuestionResponse {
  turnId: string;
  conceptId: string;
  conceptName: string;
  turnIndex: number;
  questionText: string;
  questionType: QuestionType | null;
  /** `ai` normally, `cache_fallback` once the session is in flashcard fallback (AE-05). */
  source: TurnSource;
  /** `null` when the question recorded no anchor, or when the document it recorded is gone or
   * has been replaced since — see `utils/question-citation.ts` for each case. */
  sourceCitation: QuestionSourceResponse | null;
}

/** One line of the transcript. Answered turns carry the grade the AI gave them. */
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
  askedAt: Date;
  answeredAt: Date | null;
  /** Same anchor as on the pending question — the transcript cites answered turns too. */
  sourceCitation: QuestionSourceResponse | null;
}

/** A weak prerequisite the traceback queued ahead of the concept just finished (AE-07). */
export interface InterviewPrerequisiteResponse {
  conceptId: string;
  name: string;
  depth: number;
  reason: TracebackReason;
  masteryScore: number | null;
}

/**
 * What `finalizeConceptResult()` (I7.2) decided when a concept ended: its mastery score, when
 * it comes back, and which foundations were queued before it.
 */
export interface ConceptCompletedResponse {
  conceptId: string;
  conceptName: string;
  /** `null` when no turn of the concept could be graded — the stored score was left alone. */
  masteryScore: number | null;
  reviewInDays: number;
  scheduledFor: Date;
  prerequisites: InterviewPrerequisiteResponse[];
  /** Why no prerequisite was queued; `null` means the traceback actually ran. */
  tracebackSkipReason: TracebackSkipReason | null;
}

/**
 * Which AI call was unavailable, so the client knows what it is falling back *from*: the
 * grade of the answer just sent, or the next question. Both keep the session alive — an AI
 * outage must never kill a session (#115), and I6.4 plugs the flashcard flow in here.
 */
export type InterviewFallbackReason =
  | 'grading_unavailable'
  | 'question_unavailable'
  /** UC-12 E1: fallback mode needs a cached question for this concept and none exists. */
  | 'no_cached_questions';

export interface InterviewFallbackResponse {
  reason: InterviewFallbackReason;
  message: string;
}

export interface StartInterviewResponse {
  /** `false` when an unfinished session already existed and is being handed back (AE-03). */
  created: boolean;
  session: InterviewSessionState;
  question: InterviewQuestionResponse | null;
  /** Resume hint, or the reason there is no question yet. `null` on the ordinary path. */
  message: string | null;
  fallback: InterviewFallbackResponse | null;
}

export interface GetInterviewResponse {
  session: InterviewSessionState;
  currentQuestion: InterviewQuestionResponse | null;
  /** Whole transcript of the session, oldest first — at most 5 concepts × 3 turns. */
  turns: InterviewTurnResponse[];
  fallback: InterviewFallbackResponse | null;
}

export interface SubmitAnswerResponse {
  session: InterviewSessionState;
  /**
   * `null` when grading was unavailable — see `fallback`. `feedback` is itself `null` for a
   * self-graded flashcard turn (AE-05) — there is no AI feedback text to show for it.
   */
  grading: { score: number; feedback: string | null; verdict: TurnVerdict } | null;
  gradedTurnId: string;
  nextQuestion: InterviewQuestionResponse | null;
  /** Set only on the request that ended a concept. */
  conceptCompleted: ConceptCompletedResponse | null;
  sessionCompleted: boolean;
  /**
   * True when this answer had already been graded and the stored result is being replayed
   * (double-click / retried request). No second turn was created — but the request that won
   * may still have been mid-flight, so treat `nextQuestion` here as a hint and take
   * `GET /interviews/:id` as authoritative.
   */
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
 * `POST /interviews/:id/abandon` (#243) — SPEC_DB-03 AF2, "Kết thúc và chấm phần đã làm".
 *
 * Same `conceptCompleted` shape `POST /answers` returns when a concept ends normally, so a
 * client can show "đã chấm xong khái niệm X" from either. `null` when nothing was scored: no
 * turn of the concept the session stopped on could be graded, or the queue had already run out.
 */
export interface AbandonInterviewResponse {
  session: InterviewSessionState;
  conceptCompleted: ConceptCompletedResponse | null;
}

/**
 * `GET /interviews/:id/summary` (I6.5 / AE-09) — the end-of-session screen (I6.7). Everything
 * here is read-only history: the session must already be `completed` to reach this endpoint.
 */

/** One graded turn of a concept, stripped to what the summary screen charts. */
export interface SessionSummaryTurnResponse {
  turnIndex: number;
  score: number | null;
  verdict: TurnVerdict | null;
}

/** One concept's full result for the session, oldest turn first. */
export interface SessionSummaryConceptResponse {
  conceptId: string;
  name: string;
  /** `null` if the queue reached `completed` (e.g. via UC-12 E1) before this concept was ever asked. */
  masteryScore: number | null;
  turns: SessionSummaryTurnResponse[];
}

/**
 * One `ReviewQueueItem` this session's traceback (I7.2) queued — AE-08's contribution to the
 * summary screen, read as-is rather than recomputed (I7.2 already decided this, once).
 */
export interface SessionSummaryTracebackItemResponse {
  conceptId: string;
  name: string;
  reason: ReviewReason;
  depth: number | null;
  /** The concept this prerequisite was traced back *from*; `null` if that concept was deleted since. */
  sourceConceptName: string | null;
  status: ReviewItemStatus;
}

/**
 * `summarize_session`'s output, plus the flag AE-09's exception flow (UC-14 E1) needs: the
 * request never fails just because the AI did — see `message`.
 */
export interface SessionSummaryReport {
  /** `null` when `summarize_session` failed after retry — see `message`. */
  text: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  /** `false` means only the structured score table below is real; `text` etc. are empty/null. */
  generatedByAi: boolean;
  /** Set only when `generatedByAi` is `false` — UC-14 E1's "Không thể tổng hợp nhận xét lúc này." */
  message: string | null;
}

export interface SessionSummaryResponse {
  sessionId: string;
  status: InterviewSessionStatus;
  durationMinutes: number;
  concepts: SessionSummaryConceptResponse[];
  summary: SessionSummaryReport;
  traceback: SessionSummaryTracebackItemResponse[];
}
