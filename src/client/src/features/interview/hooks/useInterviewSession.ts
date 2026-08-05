import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getInterviewErrorMessage, interviewApi } from '../api/interview.api';
import type {
  InterviewFallbackResponse,
  InterviewQuestionResponse,
  InterviewSessionState,
  InterviewTurnResponse,
  SelfGrade,
  SubmitAnswerResponse,
} from '../types/interview.types';

/** Bộ state đầy đủ mà UI cần — hợp nhất từ getInterview (+ resume nếu đang tạm dừng). */
interface AuthoritativeState {
  session: InterviewSessionState;
  currentQuestion: InterviewQuestionResponse | null;
  turns: InterviewTurnResponse[];
  fallback: InterviewFallbackResponse | null;
}

/**
 * Lấy trạng thái authoritative của phiên khi tải/khôi phục.
 *
 * Nếu phiên đang `paused` (vào lại từ AE-03 hoặc reload một phiên đã tạm dừng), tự gọi
 * `POST /resume` để chuyển nó về `active` TRƯỚC khi người dùng có thể trả lời — backend
 * chặn answer khi còn paused (`SESSION_PAUSED`, 409). Transcript giữ nguyên từ getInterview
 * (resume không trả turns), còn session/câu hỏi/fallback lấy từ response của resume.
 */
async function fetchAuthoritativeState(sessionId: string): Promise<AuthoritativeState> {
  const data = await interviewApi.getInterview(sessionId);
  if (data.session.status !== 'paused') return data;
  const resumed = await interviewApi.resumeInterview(sessionId);
  return {
    session: resumed.session,
    currentQuestion: resumed.currentQuestion,
    turns: data.turns,
    fallback: resumed.fallback,
  };
}

interface UseInterviewSessionOptions {
  /**
   * Được gọi đúng một lần khi phiên kết thúc (sessionCompleted). Nhận nguyên
   * `SubmitAnswerResponse` để trang tự quyết microcopy — ví dụ nhánh E1
   * (`fallback.reason === 'no_cached_questions'`) cần thông báo khác.
   */
  onCompleted?: (result: SubmitAnswerResponse) => void;
}

interface UseInterviewSessionReturn {
  session: InterviewSessionState | null;
  currentQuestion: InterviewQuestionResponse | null;
  turns: InterviewTurnResponse[];
  fallback: InterviewFallbackResponse | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  submit: (answerText: string) => Promise<boolean>;
  submitSelfGrade: (grade: SelfGrade) => Promise<boolean>;
  pause: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Sở hữu toàn bộ trạng thái một phiên phỏng vấn (I6.6). Nguyên tắc cốt lõi: server là
 * nguồn chân lý — sau MỌI lệnh gọi ta ghi đè state từ response, không bao giờ tự đếm
 * số lượt phía client. `submitAnswer` chỉ trả delta (không kèm transcript đầy đủ) nên
 * sau khi gửi ta gọi lại `getInterview` để lấy transcript + câu hỏi kế tiếp chuẩn xác
 * (chính ghi chú `replayed` của backend cũng dặn coi GET là authoritative).
 */
export function useInterviewSession(
  sessionId: string | undefined,
  options: UseInterviewSessionOptions = {}
): UseInterviewSessionReturn {
  const [session, setSession] = useState<InterviewSessionState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestionResponse | null>(null);
  const [turns, setTurns] = useState<InterviewTurnResponse[]>([]);
  const [fallback, setFallback] = useState<InterviewFallbackResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref để chặn double-submit đồng bộ (state cập nhật bất đồng bộ, không kịp chặn).
  const isSubmittingRef = useRef(false);
  // Ref để tránh closure cũ và không phải thêm onCompleted vào deps của submit.
  const onCompletedRef = useRef(options.onCompleted);
  useEffect(() => {
    onCompletedRef.current = options.onCompleted;
  }, [options.onCompleted]);

  const applyServerState = useCallback((data: AuthoritativeState) => {
    setSession(data.session);
    setCurrentQuestion(data.currentQuestion);
    setTurns(data.turns);
    setFallback(data.fallback);
  }, []);

  // Tách phần fetch (await ngay) khỏi phần bật cờ loading: `refetch` (nút "Thử lại" từ
  // event handler) bật lại loading rồi gọi `loadState`. Cả hai đi qua
  // `fetchAuthoritativeState` nên nhánh auto-resume dùng chung.
  const loadState = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    try {
      applyServerState(await fetchAuthoritativeState(sessionId));
      setError(null);
    } catch (err) {
      setError(getInterviewErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, applyServerState]);

  const refetch = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await loadState();
  }, [loadState]);

  // Khôi phục state khi mount / khi đổi sessionId. Chuỗi promise inline (setState nằm
  // trong callback .then/.catch/.finally) đúng chuẩn PlansPage, tránh setState đồng bộ
  // trong thân effect. Cleanup (isActive=false) chặn double-fire khi unmount giữa chừng.
  useEffect(() => {
    if (!sessionId) return;
    let isActive = true;
    fetchAuthoritativeState(sessionId)
      .then((data) => {
        if (!isActive) return;
        applyServerState(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isActive) setError(getInterviewErrorMessage(err));
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [sessionId, applyServerState]);

  /** Chạy sau khi gửi: cập nhật cục bộ (delta update) trước, sau đó lấy transcript chuẩn và soft-fail nếu rớt mạng. */
  const finishSubmit = useCallback(
    async (result: SubmitAnswerResponse, answerText?: string): Promise<void> => {
      if (!sessionId) return;

      // 1. Delta update cục bộ để giữ thành quả submit nếu rớt mạng lúc refetch
      setSession(result.session);
      setCurrentQuestion(result.nextQuestion);
      setFallback(result.fallback);

      setTurns((prev) => {
        const turnIndex = prev.findIndex((t) => t.id === result.gradedTurnId);
        if (turnIndex === -1) return prev;

        const newTurns = [...prev];
        newTurns[turnIndex] = {
          ...newTurns[turnIndex],
          ...(answerText !== undefined && { answerText }),
          ...(result.grading && {
            score: result.grading.score,
            feedback: result.grading.feedback,
            verdict: result.grading.verdict,
          }),
        };
        return newTurns;
      });

      // 2. Refetch để đồng bộ state chuẩn từ server
      try {
        const fresh = await interviewApi.getInterview(sessionId);
        applyServerState(fresh);
        if (result.sessionCompleted || fresh.session.status === 'completed') {
          onCompletedRef.current?.(result);
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu mới:', err);
        toast.warning(
          'Đã lưu câu trả lời nhưng tải dữ liệu mới thất bại. Vui lòng F5 tải lại trang.'
        );
        if (result.sessionCompleted) {
          onCompletedRef.current?.(result);
        }
      }
    },
    [sessionId, applyServerState]
  );

  const submit = useCallback(
    async (answerText: string): Promise<boolean> => {
      if (!sessionId || isSubmittingRef.current) return false;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        const result = await interviewApi.submitAnswer(sessionId, answerText);
        await finishSubmit(result, answerText);
        return true;
      } catch (err) {
        toast.error(getInterviewErrorMessage(err));
        return false;
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [sessionId, finishSubmit]
  );

  const submitSelfGrade = useCallback(
    async (grade: SelfGrade): Promise<boolean> => {
      if (!sessionId || isSubmittingRef.current) return false;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        const result = await interviewApi.submitSelfGrade(sessionId, grade);
        await finishSubmit(result);
        return true;
      } catch (err) {
        toast.error(getInterviewErrorMessage(err));
        return false;
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [sessionId, finishSubmit]
  );

  const pause = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const result = await interviewApi.pauseInterview(sessionId);
      setSession(result.session);
      return true;
    } catch (err) {
      toast.error(getInterviewErrorMessage(err));
      return false;
    }
  }, [sessionId]);

  return {
    session,
    currentQuestion,
    turns,
    fallback,
    isLoading,
    isSubmitting,
    error,
    submit,
    submitSelfGrade,
    pause,
    refetch,
  };
}
