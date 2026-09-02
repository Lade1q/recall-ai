import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { WalletCards } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BlockError } from '@/features/dashboard/components/BlockError';
import type { InterviewSessionStatus } from '@/features/interview/types/interview.types';
import { AiNote } from './AiNote';
import { MasteryOutcomeList } from './MasteryOutcomeList';
import { QaTranscript } from './QaTranscript';
import { SystemActionsBlock } from './SystemActionsBlock';
import { PausedSessionActions } from './PausedSessionActions';
import { useSessionDetail, readPlanFor } from '../hooks/useSessionDetail';
import { formatFullDate, formatSessionMeta } from '../utils/format';
import type { InterviewSessionListItem } from '../types/history.types';
import { Heading } from '@/components/ui/heading';

/**
 * Panel chi tiết (SPEC_DB-03 bước #3–#7). Chọn phiên KHÔNG rời danh sách.
 *
 * Ngoài phạm vi #246 và cố ý không dựng, dù mockup màn chính có vẽ: biểu đồ "Diễn tiến của ba
 * khái niệm này" (bước #8, hoãn tới khi danh sách chạy được).
 *
 * Link "Không đồng ý với điểm này" (AF5/AE-10) từng nằm trong danh sách trên vì bảng
 * `grading_feedback` chưa tồn tại. #248 đã dựng bảng đó (PR #505) và nối lối vào ở
 * `QaTranscript` → `GradingFeedbackPanel`, nên nó KHÔNG còn là nút chết.
 */
export function SessionDetailPanel({
  session,
  onSessionChanged,
}: {
  session: InterviewSessionListItem;
  onSessionChanged: () => void;
}) {
  const detail = useSessionDetail(session.id, session.status);
  const plan = readPlanFor(session.status);

  // AC #246: lỗi mạng báo bằng toast kèm "Thử lại", và KHÔNG mất vị trí đang xem — danh sách
  // bên trái cùng phiên đang chọn vẫn nguyên, chỉ nội dung panel đổi thành khối lỗi.
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => {
    if (detail.error && notifiedFor.current !== session.id) {
      notifiedFor.current = session.id;
      toast.error('Không tải được chi tiết phiên. Kiểm tra kết nối rồi thử lại.');
    }
    if (!detail.error && notifiedFor.current === session.id) {
      notifiedFor.current = null;
    }
  }, [detail.error, session.id]);

  return (
    <section
      className="bg-card border-border rounded-xl border px-[26px] py-6"
      aria-label="Chi tiết phiên kiểm tra"
    >
      <header className="border-border mb-5 flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <Heading as="h2" size="section" className="m-0">
            Phiên kiểm tra · {formatFullDate(session.startedAt)}
          </Heading>
          <div className="text-muted-foreground mt-[5px] font-mono text-[12px]">
            {formatSessionMeta({
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              durationMinutes: detail.summary?.durationMinutes ?? null,
              planName: session.plan.name,
            })}
          </div>
        </div>
        <StatusBadge status={session.status} />
      </header>

      {/* AF4 — nhãn tự chấm ở ĐẦU PANEL, cặp với nhãn ở mục danh sách. Hai chỗ chứ không một:
          người đọc panel chi tiết có thể tới thẳng đây mà chưa đọc hàng bên trái. */}
      {session.fallbackMode && <SelfGradedNotice />}

      {plan === 'active' ? (
        <ActiveSessionNotice sessionId={session.id} />
      ) : detail.loading ? (
        <DetailSkeleton />
      ) : detail.error ? (
        <BlockError message="Không tải được chi tiết phiên này." onRetry={detail.reload} />
      ) : detail.transcript ? (
        <div className="flex flex-col gap-0">
          {plan === 'paused' && (
            <Block title="Phiên đang dừng ở đâu">
              <PausedSessionActions
                sessionId={session.id}
                detail={detail.transcript}
                onAbandoned={onSessionChanged}
              />
            </Block>
          )}

          {plan === 'closed' && (
            <Block
              title="Biến động mastery_score"
              hint="Phần nhạt là điểm đã có trước phiên, phần đậm là mức tăng của phiên này. Vạch dọc là ngưỡng 0.60 — dưới nó, hệ thống sẽ truy ngược thay vì xếp lịch ôn lại bình thường."
            >
              <MasteryOutcomeList concepts={session.concepts} summary={detail.summary} />
            </Block>
          )}

          {/* Bước #5 — chỉ phiên `completed` mới có nhận xét. Phiên `abandoned` bỏ HẲN khối này
              (AF3): `summarize_session` cố tình không chạy, nên không có gì để hiện và một
              khung trống sẽ trông như lỗi. Điều kiện đọc cả `message` để giữ được câu báo
              UC-14 E1 khi AI thật sự hỏng — nhánh đó `text` là null nhưng có chuyện để nói. */}
          {session.status === 'completed' &&
            detail.summary &&
            (detail.summary.summary.text !== null || detail.summary.summary.message !== null) && (
              <Block title="Nhận xét cuối phiên">
                <AiNote summary={detail.summary.summary} />
              </Block>
            )}

          {detail.summary && <TracebackBlock summary={detail.summary} />}

          {detail.transcript.turns.length > 0 && (
            <Block
              title="Bản ghi hỏi–đáp"
              hint="Mở sẵn khái niệm bị chấm thấp nhất. Các khái niệm còn lại thu gọn — mở tất cả cùng lúc thì chỗ cần đọc lại là chỗ khó tìm nhất."
            >
              <QaTranscript turns={detail.transcript.turns} summary={detail.summary} />
            </Block>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Chỉ chiếm chỗ khi phiên thật sự có truy ngược — xem `SystemActionsBlock`. */
function TracebackBlock({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof useSessionDetail>['summary']>;
}) {
  const hasTraceback = summary.reviewSchedule.some((item) => item.reason === 'traceback');
  if (!hasTraceback) return null;
  return (
    <Block title="Hệ thống đã làm gì sau phiên">
      <SystemActionsBlock summary={summary} />
    </Block>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-[26px] first:mt-0">
      {/* #387: KHÔNG snap — giữ 13px (Quân chốt 02/09). Bậc `card`(18) lệch 5px, tức
          **+38%**, và bán kính là MỌI tiêu đề mục trong panel chi tiết phiên.
          Ghim BA trục, không chỉ cỡ: `card` kéo theo `tracking-[-0.015em]` (utility) và
          `.font-heading` kéo theo `line-height:1.25` (base) — đo trên bản dựng thật thì
          leading tụt 20,8px → 16,25px (−22%, mất 4,55px mỗi dòng) và tracking từ 0 xuống
          −0,195px. `leading-[1.6]` cho đúng 20,8px ở 13px; `tracking-normal` trả về 0.
          ⚠️ Mặt chữ VẪN đổi sans → mono; không gỡ được khi đã bọc `<Heading>`, Quân chấp
          nhận. Hồ sơ ở `SIZE_EXCEPTION` trong `heading-scale.test.ts`. */}
      <Heading
        as="h3"
        size="card"
        className="m-0 mb-3 text-[13px] font-semibold leading-[1.6] tracking-normal"
      >
        {title}
      </Heading>
      {hint && (
        <p className="text-muted-foreground -mt-1.5 mb-3.5 max-w-[68ch] text-[12.5px] leading-[1.65]">
          {hint}
        </p>
      )}
      {children}
    </section>
  );
}

const STATUS_BADGE: Record<InterviewSessionStatus, { label: string; className: string }> = {
  completed: { label: 'Đã hoàn thành', className: 'text-muted-foreground' },
  paused: { label: 'Tạm dừng', className: 'text-focus-session' },
  abandoned: { label: 'Bỏ dở', className: 'text-mastery-weak' },
  active: { label: 'Đang diễn ra', className: 'text-primary' },
};

function StatusBadge({ status }: { status: InterviewSessionStatus }) {
  const badge = STATUS_BADGE[status];
  return (
    <span
      className={cn(
        'bg-muted inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]',
        badge.className
      )}
    >
      {badge.label}
    </span>
  );
}

/** AF4 — điểm tự chấm không cùng độ tin cậy với điểm `grade_answer` chấm. */
function SelfGradedNotice() {
  return (
    <div className="border-border border-l-muted-foreground bg-card mb-5 flex gap-[11px] rounded-lg border border-l-[3px] px-[15px] py-[13px]">
      <WalletCards className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-[1.65]">
        Phiên này chạy bằng <strong className="font-semibold">flashcard đã lưu sẵn</strong> vì AI
        không phản hồi. Bạn tự chấm đúng/sai, nên điểm phản ánh cảm nhận của chính bạn chứ không
        phải một lượt chấm độc lập — cân nhắc kiểm tra lại bằng một phiên vấn đáp thật.
        <div className="text-muted-foreground mt-[5px] font-mono text-[11px]">
          AE-05 · interview_turns.source = cache_fallback
        </div>
      </div>
    </div>
  );
}

/**
 * Phiên `active` — hàng này tới được vì `GET /interviews` không lọc theo `status`.
 *
 * Cố ý KHÔNG tải chi tiết: `GET /interviews/:id` cho phiên `active` chạy máy trạng thái và có
 * thể gọi Gemini sinh câu hỏi mới. Một màn read-only mở ra mà đẩy phiên sang lượt kế tiếp thì
 * nó đã ghi vào chính dữ liệu nó đang trình bày.
 */
function ActiveSessionNotice({ sessionId }: { sessionId: string }) {
  return (
    <div>
      <p className="m-0 text-[13.5px] leading-[1.65]">
        Phiên này vẫn đang mở. Kết quả chỉ chốt lại khi phiên kết thúc, nên lịch sử chưa hiện điểm
        và bản ghi hỏi–đáp của nó — quay lại phiên để làm tiếp hoặc kết thúc nó.
      </p>
      <Button asChild className="mt-3.5">
        <Link to={`/interview/${sessionId}`}>Quay lại phiên đang mở</Link>
      </Button>
    </div>
  );
}

/** Mockup không vẽ trạng thái đang tải cho panel; khung xám giữ chiều cao để layout khỏi nhảy. */
function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải chi tiết phiên">
      <div className="bg-muted h-3 w-40 animate-pulse rounded" />
      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid grid-cols-[1fr_152px] items-center gap-3.5">
            <div className="bg-muted h-3.5 w-48 animate-pulse rounded" />
            <div className="bg-muted h-1.5 w-full animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="bg-muted mt-7 h-24 w-full animate-pulse rounded-lg" />
    </div>
  );
}
