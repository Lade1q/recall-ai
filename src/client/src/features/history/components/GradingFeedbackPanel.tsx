import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { getInterviewErrorMessage, interviewApi } from '@/features/interview/api/interview.api';
import type { GradingFeedbackResponse } from '@/features/interview/types/interview.types';

/**
 * AE-10 · UC-15 (#248) — sinh viên không đồng ý với điểm một lượt đã chấm.
 *
 * Chữ lấy nguyên văn từ `claude-design/screen-history.html:1692-1764`, so tới codepoint: em dash
 * trong câu xác nhận là U+2014, placeholder kết bằng ba dấu `.` ASCII (KHÔNG phải U+2026), và nút
 * phụ là `Hủy` (`ủ` = U+1EE7 một codepoint), không phải `Huỷ`.
 *
 * ⛔ Cổng hiện nút là `turn.canAppeal` do SERVER tính — không suy lại từ `verdict`/`source`/`mode`.
 * Suy lại là dựng bản thứ hai của cổng bằng một ngôn ngữ khác, đúng thứ `turn-mode.ts` và khối
 * `countsTowardMastery` trong `interview.types.ts` cấm bằng tên.
 */

/** Ba chip có sẵn (`:1719-1721`). FE sở hữu bộ từ vựng này — BE cố ý nhận danh sách chuỗi tự do. */
const REASON_CHIPS = ['Câu hỏi không rõ', 'Chấm quá nặng', 'Ngoài phạm vi tài liệu'] as const;

type Phase =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

interface GradingFeedbackPanelProps {
  turnId: string;
  /** Điểm của lượt, nội suy vào câu xác nhận. Chỉ gọi component này khi điểm khác `null`. */
  score: number;
  /** `true` khi server cho phép khiếu nại lượt này. Là CỜ, không phải dữ liệu để suy lại. */
  canAppeal: boolean;
  /** Phản hồi đã gửi trước đó, dùng để prefill form khi mở lại panel. */
  gradingFeedback: GradingFeedbackResponse | null;
}

export function GradingFeedbackPanel({
  turnId,
  score,
  canAppeal,
  gradingFeedback,
}: GradingFeedbackPanelProps) {
  const [saved, setSaved] = useState<GradingFeedbackResponse | null>(gradingFeedback);
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  // Khởi tạo RỖNG chứ không phải từ `gradingFeedback`: panel luôn bắt đầu ở `closed`, và lối duy
  // nhất vào form là `openForm()` — vốn nạp lại từ `saved`. Để `gradingFeedback` ở đây nữa là dựng
  // nguồn prefill thứ hai, thứ sẽ lệch âm thầm khi `saved` đổi sau lần gửi đầu.
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // Trạng thái (7): lượt không khiếu nại được — không có lối vào nào cả.
  if (!canAppeal) return null;

  const busy = phase.kind === 'submitting';
  const trimmedNote = note.trim();
  // Server chặn body rỗng hoàn toàn bằng 400; chặn luôn ở đây để không tốn một vòng gọi cho một
  // câu trả lời đã biết trước. KHÔNG phải bản sao của luật — server vẫn là nơi quyết.
  const canSubmit = reasons.length > 0 || trimmedNote.length > 0;

  const toggleReason = (chip: string) =>
    setReasons((prev) => (prev.includes(chip) ? prev.filter((r) => r !== chip) : [...prev, chip]));

  const openForm = () => {
    setReasons(saved?.reasons ?? []);
    setNote(saved?.note ?? '');
    setPhase({ kind: 'open' });
  };

  const submit = async () => {
    setPhase({ kind: 'submitting' });
    try {
      const result = await interviewApi.submitGradingFeedback(turnId, {
        reasons,
        note: trimmedNote || undefined,
      });
      setSaved(result);
      setPhase({ kind: 'closed' });
    } catch (error) {
      // Ba ca hỏng — 400, 409, mạng/500 — đều có ĐƯỜNG RA ở đây, không ca nào rơi vào panel
      // trắng. Câu chữ lấy từ `getInterviewErrorMessage`, kể cả `TURN_NOT_APPEALABLE` đã có sẵn
      // từ PR 1; đừng viết câu thứ hai cho cùng một mã.
      setPhase({ kind: 'error', message: getInterviewErrorMessage(error) });
    }
  };

  // Form đóng có đúng hai bộ mặt, và `saved` là thứ phân biệt chúng.
  if (phase.kind === 'closed') {
    // Trạng thái (3): đã gửi xong — câu xác nhận, kèm lối sửa lại. Mockup không vẽ lối sửa nào;
    // nhãn dưới đây là chữ của client cho một ca mockup không phủ (AC cuối #248 đòi "cho sửa
    // lại"), giữ ngắn và dùng lại đúng từ "phản hồi" mà mockup đã dùng.
    return saved ? (
      <div className="text-muted-foreground mt-2.5 flex items-start gap-2 text-[13px] leading-[1.6]">
        <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col items-start gap-1">
          <span>
            Đã ghi nhận phản hồi. Điểm {score.toFixed(2)} giữ nguyên — phản hồi được dùng để chỉnh
            rubric chấm, không sửa điểm của phiên đã xong.
          </span>
          <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={openForm}>
            Sửa phản hồi
          </Button>
        </div>
      </div>
    ) : (
      // Trạng thái (1): chưa gửi gì — chỉ có lối vào.
      <Button
        type="button"
        variant="link"
        size="xs"
        className="text-muted-foreground mt-2 h-auto p-0 text-[12px]"
        onClick={openForm}
      >
        Không đồng ý với điểm này
      </Button>
    );
  }

  // Trạng thái (2), (4), (5), (6): form đang mở, đang gửi, hoặc vừa gửi hỏng.
  return (
    <div className="border-border mt-2.5 flex flex-col gap-2.5 border-t pt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {REASON_CHIPS.map((chip) => {
          const active = reasons.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => toggleReason(chip)}
              className={cn(
                // `rounded-[4px]` theo đúng `.tag` của mockup (`border-radius:4px`), KHÔNG phải
                // pill: `badge.tsx` chốt pill-shape là ngoại lệ dành riêng cho Badge trong DS v3.
                'border-border rounded-[4px] border px-2.5 py-1 font-mono text-[11px] transition-colors',
                '[outline-style:none] focus-visible:outline-2 focus-visible:outline-offset-1',
                'focus-visible:outline-ring disabled:opacity-60',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>

      <div>
        <label
          htmlFor={`grading-feedback-note-${turnId}`}
          className="text-muted-foreground mb-[5px] block text-[12px]"
        >
          Lý do (không bắt buộc)
        </label>
        <textarea
          id={`grading-feedback-note-${turnId}`}
          rows={2}
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          placeholder="Tôi có nói tới ngăn xếp ở lượt 2 nhưng không được tính..."
          className="border-border bg-card text-foreground rounded-field focus-visible:outline-ring w-full resize-y border px-2.5 py-2 text-[13px] [outline-style:none] focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-60"
        />
      </div>

      {/* `FieldError` chứ không phải `<p>` đỏ tự vẽ: nó kèm icon, nên lỗi không dựa MÀU làm kênh
          duy nhất (C6), và nó dùng `--mastery-weak` — cùng token mà `input.tsx` chọn để ô nhập và
          dòng lỗi ngay dưới không lệch màu nhau. */}
      {phase.kind === 'error' && <FieldError>{phase.message}</FieldError>}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          loading={busy}
          disabled={busy || !canSubmit}
          onClick={submit}
        >
          Gửi phản hồi
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => setPhase({ kind: 'closed' })}
        >
          Hủy
        </Button>
        {/* Vùng `role="status"` mount VÔ ĐIỀU KIỆN. Trình đọc màn hình thông báo phần thay đổi của
            một live region đã có sẵn; nếu chỉ mount lúc bận thì lần đổi chữ đầu tiên rơi vào một
            node vừa xuất hiện và có thể bị nuốt. Cùng khuôn `PlanCatalog`/`RunningSession`. */}
        <span
          className="text-muted-foreground font-mono text-[11px]"
          role="status"
          aria-live="polite"
        >
          {busy ? 'Đang gửi…' : ''}
        </span>
      </div>
    </div>
  );
}
