import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';

import { masteryBand } from '@/components/ui/concept-node';
import { AiSummaryCard } from './AiSummaryCard';
import { ScoreBreakdown } from './ScoreBreakdown';
import { TracebackPanel } from './TracebackPanel';
import { NextSessionPanel } from './NextSessionPanel';
import { interviewApi } from '../api/interview.api';
import type {
  InterviewTurnResponse,
  SessionSummaryResponse,
  SessionSummaryConceptResponse,
} from '../types/interview.types';
import { TRACEBACK_THRESHOLD, BAND_COLOR_VAR } from '../utils/summary-display';
import { cn } from '@/lib/utils';
import { Heading, headingVariants } from '@/components/ui/heading';

type Band = ReturnType<typeof masteryBand>;

interface SessionSummaryProps {
  summary: SessionSummaryResponse;
  turns: InterviewTurnResponse[];
  planId: string;
  /**
   * Nhánh E1 (UC-12): AI hỏng và khái niệm kế tiếp không có câu hỏi lưu sẵn nên hệ thống tự
   * đóng phiên. Phiên vẫn `completed` và vẫn có điểm thật của những khái niệm đã chấm xong —
   * nhưng nó DỪNG SỚM, không phải làm hết hàng đợi, nên phải nói ra thay vì để người đọc tưởng
   * mình đã hoàn thành bài kiểm tra.
   */
  endedEarlyByAiOutage: boolean;
  /** ISO. Dùng cho khung giờ phiên ở dòng eyebrow ("Hôm nay 20:15 – 20:47"). */
  startedAt: string;
  endedAt: string | null;
}

/**
 * AE-09 — trạng thái cuối của chính màn phỏng vấn (quyết định 04/08, epic #220), KHÔNG phải một
 * route riêng: khi phiên `completed` thì cùng màn đổi sang khung này, không điều hướng, không
 * mất ngữ cảnh phiên.
 *
 * Thứ tự bốn khối theo mockup `screen-interview.html` §"TRẠNG THÁI CUỐI": bằng chứng (điểm) →
 * diễn giải (AI) → hệ quả (lịch ôn) → bước tiếp theo. Điểm đứng trước nhận xét vì nhận xét là
 * lời bình về những con số đó; đảo lại thì sinh viên đọc kết luận trước khi thấy bằng chứng.
 *
 * Toàn bộ dữ liệu từ MỘT lời gọi `GET /interviews/:id/summary`, trừ phần chữ của từng lượt lấy
 * từ transcript đã tải sẵn của màn vấn đáp (xem `ScoreBreakdown`).
 */
export function SessionSummary({
  summary,
  turns,
  planId,
  endedEarlyByAiOutage,
  startedAt,
  endedAt,
}: SessionSummaryProps) {
  // Lịch đã được áp sẵn từ lúc chấm điểm; state này chỉ theo dõi những gì người dùng vừa GỠ.
  const [skippedItemIds, setSkippedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * Optimistic: đánh dấu gỡ ngay rồi mới gọi API, và trả lại nguyên trạng nếu server từ chối.
   * Bấm xong mà hàng đứng im vài trăm mili giây thì người dùng bấm lần nữa; im lặng nuốt lỗi
   * còn tệ hơn — họ sẽ tin là đã gỡ trong khi lịch trên server không đổi.
   */
  const handleSkip = useCallback(
    async (conceptId: string): Promise<void> => {
      setSkippedItemIds((prev) => new Set(prev).add(conceptId));
      setPendingItemIds((prev) => new Set(prev).add(conceptId));

      try {
        // `id` giờ có sẵn thẳng trong `/summary` (#310/#312) — không cần fetch lại review queue
        // rồi dò `conceptId` như trước nữa.
        const item = summary.reviewSchedule.find((row) => row.conceptId === conceptId);
        if (!item) {
          throw new Error('Concept not found in review schedule');
        }

        await interviewApi.skipReviewItem(item.id);
      } catch {
        setSkippedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(conceptId);
          return next;
        });
        toast.error('Không gỡ được khái niệm khỏi lịch. Hãy thử lại.');
      } finally {
        setPendingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(conceptId);
          return next;
        });
      }
    },
    [summary.reviewSchedule]
  );

  const tracebackItems = summary.reviewSchedule.filter((item) => item.reason === 'traceback');

  return (
    <div className="max-w-170 mx-auto flex flex-col gap-10">
      {endedEarlyByAiOutage && (
        <div className="border-mastery-learning/40 bg-mastery-learning/10 flex items-start gap-3 rounded-xl border p-4">
          <TriangleAlert className="text-mastery-learning mt-0.5 size-4 shrink-0" />
          <p className="text-foreground text-[13.5px] leading-[1.6]">
            AI chưa khả dụng nên phiên dừng sớm, chưa đi hết hàng đợi. Điểm và lịch ôn của những
            khái niệm đã chấm xong bên dưới vẫn là kết quả thật — phần còn lại bạn kiểm tra tiếp ở
            phiên sau.
          </p>
        </div>
      )}

      <SummaryHero
        concepts={summary.concepts}
        durationMinutes={summary.durationMinutes}
        startedAt={startedAt}
        endedAt={endedAt}
      />

      <ScoreBreakdown
        concepts={summary.concepts}
        turns={turns}
        reviewSchedule={summary.reviewSchedule}
      />
      <AiSummaryCard summary={summary.summary} />
      <TracebackPanel
        items={tracebackItems}
        concepts={summary.concepts}
        planId={planId}
        skippedItemIds={skippedItemIds}
        pendingItemIds={pendingItemIds}
        onSkip={(conceptId) => void handleSkip(conceptId)}
      />
      <NextSessionPanel schedule={summary.reviewSchedule} skippedItemIds={skippedItemIds} />

      <div className="pb-10" />
    </div>
  );
}

const hourMinute = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * "Hôm nay 20:15 – 20:47" (mockup `.hero__eyebrow`). Phiên kết thúc sang ngày khác, hoặc phiên
 * cũ mở lại từ lịch sử, thì ghi kèm ngày thay vì nói dối là "hôm nay".
 */
function formatSessionWindow(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 'đã xong';

  const isToday = new Date().toDateString() === start.toDateString();
  const dayLabel = isToday
    ? 'Hôm nay'
    : `Ngày ${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;

  const end = endedAt ? new Date(endedAt) : null;
  if (!end || Number.isNaN(end.getTime())) {
    return `${dayLabel} ${hourMinute.format(start)}`;
  }
  return `${dayLabel} ${hourMinute.format(start)} – ${hourMinute.format(end)}`;
}

const BAND_ORDER: readonly Band[] = ['strong', 'learning', 'weak', 'untested'];

const BAND_LEGEND: Record<Band, string> = {
  strong: 'vững · từ 0.80',
  learning: 'đang học · 0.60 – 0.79',
  weak: 'dưới ngưỡng · truy ngược',
  untested: 'chưa kiểm tra',
};

/**
 * Câu mở đầu do phần mềm ghép từ số liệu, không phải AI viết — nên nói bằng giọng khẳng định.
 * Không mở bằng "Chúc mừng!": một phiên có khái niệm dưới ngưỡng mà chúc mừng thì là nói dối
 * cho êm tai.
 */
function SummaryHero({
  concepts,
  durationMinutes,
  startedAt,
  endedAt,
}: {
  concepts: SessionSummaryConceptResponse[];
  durationMinutes: number;
  startedAt: string;
  endedAt: string | null;
}) {
  const gradedConcepts = concepts.filter((concept) => concept.masteryScore !== null);
  const weakCount = gradedConcepts.filter(
    (concept) => (concept.masteryScore ?? 0) < TRACEBACK_THRESHOLD
  ).length;
  const turnCount = concepts.reduce((total, concept) => total + concept.turns.length, 0);

  const averageScore =
    gradedConcepts.length > 0
      ? gradedConcepts.reduce((total, concept) => total + (concept.masteryScore ?? 0), 0) /
        gradedConcepts.length
      : null;

  const bandCounts = new Map<Band, number>();
  for (const concept of concepts) {
    const band = masteryBand(concept.masteryScore);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }

  return (
    <section aria-labelledby="tt-tong-quan">
      <p className="text-muted-foreground mb-1 text-[13px] font-medium uppercase tracking-wider">
        Kiểm tra vấn đáp · {formatSessionWindow(startedAt, endedAt)}
      </p>
      <Heading as="h1" size="page" className="text-foreground mb-3" id="tt-tong-quan">
        Kết quả phiên kiểm tra
      </Heading>

      <p className="text-muted-foreground text-[14.5px] leading-[1.6]">
        {gradedConcepts.length} khái niệm đã chấm trong {durationMinutes} phút.{' '}
        {weakCount > 0
          ? `${weakCount === 1 ? 'Một khái niệm' : `${weakCount} khái niệm`} rơi xuống dưới ngưỡng ${TRACEBACK_THRESHOLD.toFixed(2)}, nên hệ thống đã truy ngược tìm khái niệm nền cần học trước khi quay lại.`
          : `Không khái niệm nào rơi xuống dưới ngưỡng ${TRACEBACK_THRESHOLD.toFixed(2)}, nên phiên này không cần truy ngược.`}
      </p>

      {/* Mỗi đoạn là một khái niệm, theo đúng thứ tự hàng đợi của phiên vừa xong. */}
      <div
        className="mt-5 flex items-center gap-1"
        role="img"
        aria-label={`Kết quả ${concepts.length} khái niệm`}
      >
        {concepts.map((concept) => (
          <span
            key={concept.conceptId}
            title={`${concept.name}${concept.masteryScore !== null ? ` — ${concept.masteryScore.toFixed(2)}` : ''}`}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: BAND_COLOR_VAR[masteryBand(concept.masteryScore)] }}
          />
        ))}
      </div>

      <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
        {BAND_ORDER.filter((band) => (bandCounts.get(band) ?? 0) > 0).map((band) => (
          <span key={band} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: BAND_COLOR_VAR[band] }}
              aria-hidden="true"
            />
            {bandCounts.get(band)} {BAND_LEGEND[band]}
          </span>
        ))}
      </p>

      {/* Điểm trung bình đứng cùng hàng với ba số đếm khác, KHÔNG phóng to làm số chính: thứ
          quyết định lịch học là mastery_score của TỪNG khái niệm, không phải trung bình phiên. */}
      <dl className="border-border mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t pt-5 sm:grid-cols-4">
        <SummaryStat label="Khái niệm" value={String(concepts.length)} note="hàng đợi của phiên" />
        <SummaryStat
          label="Lượt hỏi–đáp"
          value={String(turnCount)}
          note="trần 3 lượt mỗi khái niệm"
        />
        <SummaryStat label="Thời lượng" value={`${durationMinutes} phút`} note="thời gian thực" />
        <SummaryStat
          label="Điểm trung bình"
          value={averageScore !== null ? averageScore.toFixed(2) : '--'}
          note="lịch ôn tính theo từng khái niệm"
        />
      </dl>
    </section>
  );
}

function SummaryStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[12px] uppercase tracking-wider">{label}</dt>
      <dd
        className={cn(headingVariants({ size: 'section' }), 'text-foreground mt-1 leading-tight')}
      >
        {value}
      </dd>
      <dd className="text-muted-foreground mt-0.5 text-[11.5px] leading-normal">{note}</dd>
    </div>
  );
}
