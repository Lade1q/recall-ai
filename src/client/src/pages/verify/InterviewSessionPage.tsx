import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetaMono } from '@/components/ui/kbd';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { QuestionCard } from '@/features/interview/components/QuestionCard';
import { AnswerInput } from '@/features/interview/components/AnswerInput';
import { TurnHistory } from '@/features/interview/components/TurnHistory';
import { FallbackBanner } from '@/features/interview/components/FallbackBanner';
import { useInterviewSession } from '@/features/interview/hooks/useInterviewSession';
import type { SubmitAnswerResponse } from '@/features/interview/types/interview.types';

/**
 * AE-02 — màn phỏng vấn nhiều lượt do state machine tất định điều phối.
 *
 * Bố cục một cột: thanh khái niệm + tiến độ ở trên, transcript ở giữa, khu trả lời ở
 * dưới. Khi phiên rơi vào fallback (AE-05) thì thay ô gõ bằng ba nút tự chấm và hiện
 * băng cảnh báo. Toàn bộ state do `useInterviewSession` sở hữu — server là nguồn chân lý.
 */
export default function InterviewSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Chỉ rời phiên đúng một lần: cả nhánh hoàn thành trực tiếp (sau khi gửi) và nhánh mở
  // một phiên đã kết thúc từ trước (reload URL) đều đi qua đây, nên toast + redirect
  // không bị nhân đôi.
  const hasExitedRef = useRef(false);
  const exitToDashboard = useCallback(
    (showToast: () => void): void => {
      if (hasExitedRef.current) return;
      hasExitedRef.current = true;
      showToast();
      navigate('/dashboard');
    },
    [navigate]
  );

  const handleCompleted = useCallback(
    (result: SubmitAnswerResponse): void => {
      exitToDashboard(() => {
        // Nhánh E1 (UC-12): fallback cần câu hỏi cache nhưng không còn → kết thúc sớm.
        if (result.fallback?.reason === 'no_cached_questions') {
          toast.info('Đã hết câu hỏi có sẵn cho chế độ ngoại tuyến. Phiên kiểm tra kết thúc.');
        } else {
          toast.success('Bạn đã hoàn thành phiên kiểm tra.');
        }
      });
    },
    [exitToDashboard]
  );

  const {
    session,
    currentQuestion,
    turns,
    isLoading,
    isSubmitting,
    error,
    submit,
    submitSelfGrade,
    pause,
    refetch,
  } = useInterviewSession(sessionId, { onCompleted: handleCompleted });

  // BUG-2: mở URL của một phiên đã ở trạng thái kết thúc (completed/abandoned) — ví dụ
  // reload sau khi xong, hoặc phiên bị bỏ dở. `onCompleted` chỉ bắn sau khi gửi nên
  // không phủ trường hợp này; ở đây phát hiện lúc load rồi đưa người dùng ra ngoài
  // (màn kết quả I6.7 là issue riêng, toast + redirect là mức xử lý tối thiểu đúng).
  const sessionStatus = session?.status;
  useEffect(() => {
    if (sessionStatus === 'completed' || sessionStatus === 'abandoned') {
      exitToDashboard(() => toast.info('Phiên đã kết thúc.'));
    }
  }, [sessionStatus, exitToDashboard]);

  const handlePause = async (): Promise<void> => {
    const ok = await pause();
    if (ok) {
      toast.success('Đã tạm dừng. Bạn có thể tiếp tục phiên này sau.');
      navigate('/dashboard');
    }
  };

  // ---------- Loading khôi phục lần đầu ----------
  if (isLoading && !session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // ---------- Lỗi tải phiên ----------
  if (error && !session) {
    return (
      <div className="border-border bg-background mx-auto max-w-2xl rounded-xl border px-7 py-6 text-center">
        <p className="text-muted-foreground mb-5 text-[13.5px] leading-[1.7]">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!session) return null;

  const { progress, currentConcept, fallbackMode } = session;
  // "Tạm dừng" chỉ hợp lệ khi phiên đang chạy — backend từ chối pause phiên không active.
  const isActive = session.status === 'active';
  // completedConcepts là số khái niệm đã chốt; +1 là khái niệm đang hỏi (không vượt tổng).
  const conceptPosition = Math.min(progress.completedConcepts + 1, progress.conceptTotal);
  const turnIndex = progress.turnIndex ?? currentQuestion?.turnIndex ?? null;
  // Câu hỏi đang chờ đã nằm trong transcript — lọc ra để không hiện trùng với QuestionCard.
  const historyTurns = turns.filter((turn) => turn.id !== currentQuestion?.turnId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* Thanh khái niệm + tiến độ + hành động cấp phiên */}
      <header className="border-border flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-4">
        {isActive && (
          <Button variant="outline" size="sm" onClick={() => void handlePause()}>
            <ArrowLeft />
            Tạm dừng &amp; thoát
          </Button>
        )}

        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl tracking-[-0.01em]">
            {currentConcept?.name ?? 'Kiểm tra vấn đáp'}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            <MetaMono>
              Khái niệm {conceptPosition}/{progress.conceptTotal}
            </MetaMono>
            {turnIndex !== null && (
              <>
                {' · '}
                <MetaMono>
                  Lượt {turnIndex}/{progress.maxTurnsPerConcept}
                </MetaMono>
              </>
            )}
          </p>
        </div>

        {/* AE-04 hoãn sang Sprint 5 — nút hiển thị nhưng vô hiệu hóa, không nối API. */}
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="ml-auto"
          title="Tính năng bỏ qua khái niệm sẽ có ở Sprint 5"
        >
          Bỏ qua khái niệm
          <span className="text-muted-foreground ml-1.5 text-[11px]">Sprint 5</span>
        </Button>
      </header>

      {fallbackMode && <FallbackBanner />}

      {/* Transcript + câu hỏi / trạng thái chờ. Trong lúc chờ vẫn giữ câu hỏi vừa trả lời
          trên màn hình (câu trả lời còn nằm trong ô nhập đang khóa) — không mất ngữ cảnh.
          Ở chế độ fallback (AE-05) AI đang hỏng và người dùng tự chấm, nên KHÔNG hiện chữ
          "AI đang chấm…" (mâu thuẫn với FallbackBanner) mà chỉ hiện chỉ báo lưu trung tính. */}
      <div className="flex flex-col gap-5">
        <TurnHistory turns={historyTurns} />

        {currentQuestion && <QuestionCard question={currentQuestion} />}
        {isSubmitting && (fallbackMode ? <SavingIndicator /> : <WaitingForAi />)}
      </div>

      {/* Khu trả lời — gõ (mặc định) hoặc tự chấm flashcard (fallback) */}
      {currentQuestion && (
        <footer className="border-border border-t pt-5">
          {fallbackMode ? (
            <div>
              <p className="text-muted-foreground mb-3 text-[13px]">
                Tự đánh giá câu trả lời của bạn cho câu hỏi trên:
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => void submitSelfGrade('correct')}
                  disabled={isSubmitting}
                >
                  Đúng
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void submitSelfGrade('partial')}
                  disabled={isSubmitting}
                >
                  Một phần
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void submitSelfGrade('wrong')}
                  disabled={isSubmitting}
                >
                  Sai
                </Button>
              </div>
            </div>
          ) : (
            <AnswerInput onSubmit={submit} isSubmitting={isSubmitting} />
          )}
        </footer>
      )}
    </div>
  );
}

/**
 * Trạng thái gặp nhiều nhất trong một phiên: chờ AI chấm rồi sinh câu hỏi kế tiếp. Vẽ
 * skeleton theo hình bong bóng câu hỏi (không phải spinner tròn) để sinh viên biết cái
 * gì sắp hiện ra — không bao giờ để màn hình trắng.
 */
function WaitingForAi() {
  return (
    <ChatBubble role="ai" className="max-w-full">
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <div className="bg-ai-accent/16 h-2.5 w-full animate-pulse rounded" />
        <div className="bg-ai-accent/16 h-2.5 w-11/12 animate-pulse rounded" />
        <div className="bg-ai-accent/16 h-2.5 w-1/2 animate-pulse rounded" />
      </div>
      <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs" role="status">
        <Loader2 className="size-3.5 animate-spin" />
        AI đang chấm câu trả lời của bạn…
      </p>
    </ChatBubble>
  );
}

/**
 * Chỉ báo lưu trung tính cho chế độ flashcard fallback (AE-05): AI đang hỏng, sinh viên
 * tự chấm nên không có bước "AI chấm" — chỉ đang ghi kết quả tự chấm và lấy câu hỏi kế.
 */
function SavingIndicator() {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
      <Loader2 className="size-3.5 animate-spin" />
      Đang lưu…
    </p>
  );
}
