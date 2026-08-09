import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatClock } from '../utils/format';

interface SessionSummaryProps {
  focusedSeconds: number;
  pomodorosCompleted: number;
  cycles: number;
  awayCount: number;
  conceptName: string;
  interviewHref: string;
  estimatedMinutes: number;
}

/**
 * Trạng thái 9 (mockup `.panel` > `.summary` + `.handoff`) — hoàn thành phiên + bàn giao AI
 * Examiner (AC ⑤). Mắt xích khép kín vòng lặp học tập (UC-Overview §4): không hiện
 * `mastery_score`, không gọi endpoint chấm điểm — phiên Focus chỉ ghi thống kê thời gian.
 */
export function SessionSummary({
  focusedSeconds,
  pomodorosCompleted,
  cycles,
  awayCount,
  conceptName,
  interviewHref,
  estimatedMinutes,
}: SessionSummaryProps) {
  return (
    <div className="flex flex-col items-center gap-[18px] px-8 py-[30px] text-center">
      <h1 className="font-heading text-[19px] tracking-[-0.02em]">Xong phiên học</h1>

      {/* `.summary` — 3 ô, vạch ngăn 1px bằng gap + nền border, ô căn TRÁI, nhãn IN HOA. */}
      <div className="bg-border border-border grid w-full max-w-[470px] grid-cols-3 gap-px overflow-hidden rounded-[calc(var(--radius)*0.9)] border">
        <SummaryCell value={formatClock(focusedSeconds * 1000)} label="Tập trung" />
        <SummaryCell value={`${pomodorosCompleted}/${cycles}`} label="Pomodoro" />
        <SummaryCell value={String(awayCount)} label="Lần rời tab" />
      </div>

      {/* `.handoff` — viền 1px quanh + viền trái 2px ai-accent + nền card (không tint). */}
      <div className="border-border border-l-ai-accent bg-card w-full max-w-[470px] rounded-[calc(var(--radius)*0.9)] border border-l-2 px-[18px] py-4 text-left">
        <div className="mb-1 text-[13px] font-semibold">Kiểm tra lại ngay: {conceptName}</div>
        <p className="text-muted-foreground mb-3.5 text-pretty text-[12px] leading-[1.65]">
          Đọc xong chưa chứng minh được là hiểu. Phiên kiểm tra vấn đáp 3 lượt sẽ chấm{' '}
          <code className="bg-muted rounded px-1 py-0.5 text-[12px]">mastery_score</code> và quyết
          định có cần truy ngược tiếp hay không. Mất khoảng {estimatedMinutes} phút.
        </p>
        <div className="flex items-center gap-2.5">
          <Button asChild>
            <Link to={interviewHref}>Bắt đầu kiểm tra</Link>
          </Button>
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground text-[13px]">
            Để sau — về Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-card px-4 py-3.5 text-left">
      <div className="font-mono text-[19px] font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground mt-0.5 text-[11px] uppercase tracking-[0.05em]">
        {label}
      </div>
    </div>
  );
}
