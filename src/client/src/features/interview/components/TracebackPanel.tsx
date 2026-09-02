import { Undo2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  SessionSummaryConceptResponse,
  SessionSummaryReviewItemResponse,
} from '../types/interview.types';
import { TRACEBACK_THRESHOLD, masteryColor } from '../utils/summary-display';
import { Heading } from '@/components/ui/heading';

interface TracebackPanelProps {
  /** Chỉ hàng `reason === 'traceback'` — hàng ôn giãn cách thuộc về `NextSessionPanel`. */
  items: SessionSummaryReviewItemResponse[];
  /** Bảng điểm của phiên, để nói được khái niệm gốc đang ở điểm nào. */
  concepts: SessionSummaryConceptResponse[];
  planId: string;
  skippedItemIds: ReadonlySet<string>;
  pendingItemIds: ReadonlySet<string>;
  onSkip: (conceptId: string) => void;
}

/**
 * AE-08 — khối truy ngược. Đây là thứ NotebookLM / Quizlet / RemNote không có, nên nó không
 * được rút gọn thành một danh sách khái niệm trơ: mỗi khái niệm nền phải đứng dưới đúng khái
 * niệm gốc đã kéo nó vào lịch, kèm câu nói thẳng "vì chúng là nền tảng của [C]" (UC-04 UC-13
 * bước 5). Bỏ vế "vì" đi cho gọn là bỏ mất lý do tính năng tồn tại.
 *
 * C4: BFS ngược là logic phần mềm tất định, không có lời gọi AI nào — nên khối này KHÔNG mang
 * màu `ai-accent`, và nhãn ở đầu khối nói rõ điều đó.
 *
 * Lịch đã được áp NGAY trong transaction chấm điểm (`finalizeConceptResult`), trước khi màn này
 * hiện ra. Không có cổng xác nhận: thao tác duy nhất còn lại là gỡ bớt, và gỡ rồi vẫn sửa tiếp
 * được trong Kế hoạch ôn tập.
 */
export function TracebackPanel({
  items,
  concepts,
  planId,
  skippedItemIds,
  pendingItemIds,
  onSkip,
}: TracebackPanelProps) {
  const scoreByConceptId = new Map(
    concepts.map((concept) => [concept.conceptId, concept.masteryScore])
  );
  const weakConceptCount = concepts.filter(
    (concept) => concept.masteryScore !== null && concept.masteryScore < TRACEBACK_THRESHOLD
  ).length;

  // Gom theo `sourceConceptId` (#310), giữ nguyên thứ tự server đã sort (tầng 1 trước tầng 2).
  // Đừng suy id từ tên: id non-null + tên null nghĩa là khái niệm gốc đã bị xoá khỏi kế hoạch.
  const groups = new Map<string, SessionSummaryReviewItemResponse[]>();
  for (const item of items) {
    const key = item.sourceConceptId ?? '';
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="tt-lich">
      <div>
        <p className="text-muted-foreground mb-1 text-[13px] font-medium uppercase tracking-wider">
          Hệ quả
        </p>
        <Heading as="h2" size="section" className="text-foreground" id="tt-lich">
          Hệ thống đã xếp lại lịch ôn
        </Heading>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-[1.6]">
          {groups.size > 0
            ? `${groups.size === 1 ? 'Một khái niệm' : `${groups.size} khái niệm`} dưới ${TRACEBACK_THRESHOLD.toFixed(2)} được truy ngược tìm khái niệm nền. Lịch đã cập nhật theo kết quả đó — bạn bỏ bớt được ngay tại đây, hoặc sau này trong Kế hoạch ôn tập.`
            : 'Truy ngược chạy sau mỗi khái niệm được chốt điểm. Phiên này không có khái niệm nền nào phải xếp thêm vào lịch.'}
        </p>
      </div>

      <div className="border-border bg-card flex flex-col gap-5 rounded-xl border p-5">
        <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          <Undo2 className="h-3.5 w-3.5" />
          Hệ thống · tìm bằng đồ thị khái niệm, không gọi AI
        </p>

        <p className="text-muted-foreground text-[13.5px] leading-[1.6]">
          Với mỗi khái niệm dưới ngưỡng, hệ thống đi ngược lên các khái niệm tiên quyết, tối đa 2
          tầng, và dừng ở khái niệm bạn đã đạt từ {TRACEBACK_THRESHOLD.toFixed(2)} trở lên. Những
          khái niệm nền còn yếu được xếp lên đầu phiên kế tiếp, học trước khi quay lại khái niệm
          gốc.
        </p>

        {groups.size === 0 ? (
          <EmptyTraceback weakConceptCount={weakConceptCount} />
        ) : (
          [...groups].map(([sourceConceptId, prereqs]) => {
            // Tên hiển thị lấy từ chính hàng, không suy từ id — `null` nghĩa là khái niệm gốc
            // đã bị xoá khỏi kế hoạch (id vẫn còn để nhóm, tên thì mất).
            const sourceName = prereqs[0]?.sourceConceptName ?? '';
            return (
              <TracebackGroup
                key={sourceConceptId || '__unknown__'}
                sourceName={sourceName}
                sourceScore={
                  sourceConceptId ? (scoreByConceptId.get(sourceConceptId) ?? null) : null
                }
                prereqs={prereqs}
                skippedItemIds={skippedItemIds}
                pendingItemIds={pendingItemIds}
                onSkip={onSkip}
              />
            );
          })
        )}

        {/* "Sửa lại bất cứ lúc nào" phải trỏ tới một chỗ có thật, nếu không thì bỏ cổng xác nhận
            là lấy mất quyền chứ không phải bớt một cú bấm thừa. Đích đến là hàng đợi ôn của
            chính kế hoạch này (#225, đã xong). */}
        <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4">
          {/* Đồ thị của CHÍNH kế hoạch này, không phải `/graph` (route đó tự chọn một kế hoạch
              rồi mới chuyển hướng — sau một phiên vấn đáp thì đích đến phải xác định). */}
          <Button asChild variant="outline" size="sm">
            <Link to={`/plan/${planId}`}>Xem trên đồ thị khái niệm</Link>
          </Button>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            Đã áp vào
            <Link
              to={`/plan/${planId}/review-queue`}
              className="text-foreground font-medium underline underline-offset-4"
            >
              Kế hoạch ôn tập
            </Link>
            · sửa lại bất cứ lúc nào
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Không có khái niệm nền để xếp là một KẾT QUẢ HỢP LỆ, không phải khối rỗng. Hai lý do dẫn tới
 * đây khác hẳn nhau nên phải nói khác nhau — hiện một khung trống giống nhau cho cả hai thì
 * sinh viên tưởng tính năng hỏng (mockup `screen-interview.html`, trạng thái phụ 2 và 6).
 */
function EmptyTraceback({ weakConceptCount }: { weakConceptCount: number }) {
  return (
    <p className="text-foreground text-[14px] leading-[1.6]">
      {weakConceptCount === 0 ? (
        <>
          Không có khái niệm nào dưới {TRACEBACK_THRESHOLD.toFixed(2)} nên không cần truy ngược. Các
          khái niệm trong phiên đều được giãn lịch ôn theo mức bạn đã nắm — xem ở khối bên dưới.
        </>
      ) : (
        <>
          {weakConceptCount === 1 ? 'Khái niệm' : `${weakConceptCount} khái niệm`} dưới ngưỡng nhưng
          không có tiên quyết nào trong đồ thị của kế hoạch, hoặc mọi tiên quyết đều đã vững — nên
          không có khái niệm nền nào để học trước. Chúng được xếp ôn lại sớm hơn các khái niệm bạn
          đã nắm chắc.
        </>
      )}
    </p>
  );
}

interface TracebackGroupProps {
  sourceName: string;
  sourceScore: number | null;
  prereqs: SessionSummaryReviewItemResponse[];
  skippedItemIds: ReadonlySet<string>;
  pendingItemIds: ReadonlySet<string>;
  onSkip: (conceptId: string) => void;
}

function TracebackGroup({
  sourceName,
  sourceScore,
  prereqs,
  skippedItemIds,
  pendingItemIds,
  onSkip,
}: TracebackGroupProps) {
  // Đã gỡ = server đã ghi `skipped`, HOẶC vừa bấm trong phiên xem này (lạc quan, chưa reload).
  // Thiếu vế đầu thì sau khi tải lại trang, khái niệm đã gỡ hiện lại nguyên vẹn kèm nút gỡ —
  // trong khi hàng đợi bên dưới đã bỏ nó, hai khối nói hai điều khác nhau về cùng một thứ.
  const isSkipped = (item: SessionSummaryReviewItemResponse): boolean =>
    item.status === 'skipped' || skippedItemIds.has(item.conceptId);

  const activeNames = prereqs.filter((item) => !isSkipped(item)).map((item) => item.name);
  const label = sourceName || 'một khái niệm đã bị xoá khỏi kế hoạch';

  return (
    <div className="border-border rounded-lg border">
      <div className="border-border bg-muted/30 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 py-3">
        <span className="text-muted-foreground text-[13px]">Truy ngược từ</span>
        <strong className="text-foreground text-[14.5px] font-semibold">{label}</strong>
        {sourceScore !== null && (
          <span className="text-muted-foreground font-mono text-[12px]">
            <span style={{ color: masteryColor(sourceScore) }}>{sourceScore.toFixed(2)}</span> ·
            dưới ngưỡng {TRACEBACK_THRESHOLD.toFixed(2)}
          </span>
        )}
      </div>

      {/* Câu chữ theo UC-04 UC-13 bước 5. Vế "vì chúng là nền tảng của [C]" là linh hồn của
          tính năng — giữ nguyên cả khi danh sách chỉ còn một khái niệm. */}
      {activeNames.length > 0 && sourceName && (
        <p className="text-foreground border-border border-b px-4 py-3 text-[14px] leading-[1.6]">
          Phát hiện bạn còn yếu ở <strong className="font-semibold">{sourceName}</strong>. Hệ thống{' '}
          <strong className="font-semibold">đã thêm</strong>{' '}
          <strong className="font-semibold">{activeNames.join(', ')}</strong> vào lịch ôn tập tiếp
          theo vì {activeNames.length === 1 ? 'nó' : 'chúng'} là nền tảng của {sourceName}.
        </p>
      )}

      <div className="divide-border flex flex-col divide-y">
        {prereqs.map((item) => (
          <PrereqRow
            key={item.conceptId}
            item={item}
            sourceName={sourceName}
            isSkipped={isSkipped(item)}
            isPending={pendingItemIds.has(item.conceptId)}
            onSkip={onSkip}
          />
        ))}
      </div>
    </div>
  );
}

interface PrereqRowProps {
  item: SessionSummaryReviewItemResponse;
  sourceName: string;
  isSkipped: boolean;
  isPending: boolean;
  onSkip: (conceptId: string) => void;
}

function PrereqRow({ item, sourceName, isSkipped, isPending, onSkip }: PrereqRowProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3',
        isSkipped && 'opacity-55'
      )}
    >
      <span className="min-w-0 flex-1 text-[14px] leading-normal">
        <span className={cn('text-foreground font-medium', isSkipped && 'line-through')}>
          {item.name}
        </span>
        {sourceName && <span className="text-muted-foreground"> — nền của {sourceName}</span>}
      </span>

      <span className="text-muted-foreground whitespace-nowrap font-mono text-[12px]">
        tầng {item.depth ?? '—'}
      </span>

      {isSkipped ? (
        <span className="text-muted-foreground whitespace-nowrap text-[12px]">Đã gỡ khỏi lịch</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => onSkip(item.conceptId)}
          className="text-muted-foreground hover:text-foreground h-auto px-2 py-1 text-[12px]"
        >
          {isPending && <Loader2 className="size-3 animate-spin" />}
          Bỏ khỏi lịch
        </Button>
      )}
    </div>
  );
}
