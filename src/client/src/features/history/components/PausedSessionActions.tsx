import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { interviewApi, getInterviewErrorMessage } from '@/features/interview/api/interview.api';
import type { GetInterviewResponse } from '@/features/interview/types/interview.types';

/**
 * AF2 — phiên đang tạm dừng.
 *
 * SPEC_DB-03 AF2 bước #2: màn này là nơi DUY NHẤT liệt kê mọi phiên kể cả phiên chưa kết
 * thúc, nên nó cũng là chỗ phát hiện trạng thái PAUSED để extend AE-01 → AE-03. Vì thế hàng
 * phiên tạm dừng mang hành động chứ không chỉ để đọc.
 *
 * Với phiên `paused`, `session.currentConcept` đọc được bình thường (khác hẳn phiên đã đóng,
 * nơi trường này mang hai nghĩa ngược nhau và phải suy từ `interview_turns`).
 */
export function PausedSessionActions({
  sessionId,
  detail,
  onAbandoned,
}: {
  sessionId: string;
  detail: GetInterviewResponse;
  onAbandoned: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'resume' | 'abandon' | null>(null);

  const { progress, currentConcept } = detail.session;
  const remaining = Math.max(progress.conceptTotal - progress.completedConcepts, 0);
  // Số lượt đã TRẢ LỜI của khái niệm đang dở — lượt đã hỏi mà bỏ trống không tính là đã làm.
  const answeredOnCurrent = currentConcept
    ? detail.turns.filter(
        (turn) => turn.conceptId === currentConcept.id && turn.answerText !== null
      ).length
    : 0;

  const handleResume = async () => {
    setBusy('resume');
    try {
      await interviewApi.resumeInterview(sessionId);
      navigate(`/interview/${sessionId}`);
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
      setBusy(null);
    }
  };

  const handleAbandon = async () => {
    setBusy('abandon');
    try {
      await interviewApi.abandonInterview(sessionId);
      toast.success('Đã kết thúc phiên và chấm phần bạn đã làm.');
      onAbandoned();
    } catch (error) {
      toast.error(getInterviewErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="m-0 text-[13.5px] leading-[1.65]">
        Hàng đợi còn{' '}
        <strong className="font-semibold">
          {remaining} trong {progress.conceptTotal} khái niệm
        </strong>
        .{' '}
        {currentConcept ? (
          <>
            Khái niệm đang dở là <strong className="font-semibold">{currentConcept.name}</strong>,
            đã trả lời {answeredOnCurrent}/{progress.maxTurnsPerConcept} lượt — tiếp tục thì phiên
            chạy tiếp từ lượt {answeredOnCurrent + 1}, điểm vẫn tính trên đủ{' '}
            {progress.maxTurnsPerConcept} lượt.
          </>
        ) : (
          <>Tiếp tục thì phiên chạy tiếp từ khái niệm còn lại trong hàng đợi.</>
        )}
      </p>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <Button
          onClick={() => void handleResume()}
          loading={busy === 'resume'}
          disabled={busy !== null}
        >
          Tiếp tục phiên
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleAbandon()}
          loading={busy === 'abandon'}
          disabled={busy !== null}
        >
          Kết thúc và chấm phần đã làm
        </Button>
      </div>

      {/* Chưa trả lời lượt nào thì "chấm trên 0 lượt" là câu vô nghĩa — không có gì để chấm, và
          hệ quả thật sự là khái niệm không nhận được điểm nào từ phiên này. */}
      <p className="text-muted-foreground mt-3 text-[12px] leading-[1.6]">
        {answeredOnCurrent === 0 ? (
          <>
            Chưa lượt nào được trả lời, nên kết thúc bây giờ thì{' '}
            {currentConcept?.name ?? 'khái niệm đang dở'} không nhận được điểm nào từ phiên này.
          </>
        ) : (
          <>
            Kết thúc sớm thì {currentConcept?.name ?? 'khái niệm đang dở'} chỉ được chấm trên{' '}
            {answeredOnCurrent} lượt — điểm sẽ kém tin cậy hơn và khái niệm dễ bị xếp lại vào lịch
            ôn.
          </>
        )}
      </p>
    </div>
  );
}
