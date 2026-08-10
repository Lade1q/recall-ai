import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  Info,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MasteryDistribution, PlanSummary } from '../types/concept';
import { formatDeadlineShort, formatElapsed, formatTimeLeft } from '../utils/planDates';
import { MasteryBar } from './MasteryBar';

/**
 * One plan on the SP-03 list.
 *
 * Two shapes, because a plan being analysed is not the same object to a user as a plan they
 * can study: the analysing one is a dashed, unclickable card that reports progress, the
 * finished one is a link into its concept graph.
 *
 * The mastery bar + counted legend is shared with the dashboard plan catalog — see `MasteryBar`.
 */

/**
 * The one line under the title that says what to do next. Weak concepts outrank untested
 * ones: a concept the student got wrong is a known gap, an untested one is only unknown.
 */
function progressHint(distribution: MasteryDistribution, total: number): string {
  if (total === 0) return 'Chưa có khái niệm nào';
  if (distribution.weak > 0) return `${distribution.weak} khái niệm yếu đang chờ ôn lại`;
  if (distribution.untested > 0) return `${distribution.untested} khái niệm chưa kiểm tra lần nào`;
  return 'Toàn bộ khái niệm đã vững';
}

/**
 * Chân thẻ SP-03: đường vào hàng đợi ôn của đúng kế hoạch này.
 *
 * Hai nhãn, vì con số là số KHÁI NIỆM distinct đang chờ ôn (`reviewQueueConceptCount`, đếm theo
 * `conceptId` — KHÔNG phải số dòng `ReviewQueueItem`) và **bằng 0** khi kế hoạch chưa từng chạy
 * phiên vấn đáp — trong khi bấm vào lại thấy một danh sách gợi ý (fallback A3 dựng thẳng từ
 * `concepts`). "Hàng đợi ôn · 0 khái niệm" dẫn tới một màn có gợi ý là đúng thứ mockup gọi là
 * dòng dẫn nói dối, nên ca đó mang nhãn riêng của mockup (`screen-plans.html`, thẻ thứ ba).
 */
function PlanQueueLink({ plan }: { plan: PlanSummary }) {
  const hasQueue = plan.reviewQueueConceptCount > 0;
  const hasSuggestions = !hasQueue && plan.conceptCount > 0;

  // Không có khái niệm nào thì cũng không có gì để gợi ý — dòng tiến độ cũ nói đúng hơn một liên
  // kết dẫn tới màn trống.
  if (!hasQueue && !hasSuggestions) {
    return <span>{progressHint(plan.masteryDistribution, plan.conceptCount)}</span>;
  }

  return (
    <>
      <Link
        to={`/plan/${plan.id}/review-queue`}
        // z-2 relative: card có link bao toàn thẻ (z-1, absolute inset-0 phía trên) nên link
        // chân thẻ phải nổi lên trên, không được lồng <a> trong <a>.
        // border-b + hover:border-foreground: mockup `.plan__queue` gạch chân bằng viền, hover chỉ
        // đậm viền chứ không đổi màu chữ sang accent.
        className="text-foreground border-border hover:border-foreground z-2 relative inline-flex items-center gap-2 border-b pb-px transition-colors"
      >
        {hasQueue ? (
          <>
            <ListChecks className="size-3.5 flex-none" />
            Hàng đợi ôn · {plan.reviewQueueConceptCount} khái niệm
          </>
        ) : (
          <>
            <Info className="size-3.5 flex-none" />
            Gợi ý ôn · chưa có phiên nào
          </>
        )}
      </Link>
      {hasSuggestions && (
        // Cột phải `.plan__when` của mockup. Chỉ dựng được cho ca này: hai ca còn lại mockup vẽ
        // "≈ N phút" / "ôn gần nhất dd/MM", mà `GET /plans` chưa cấp trường nào cho hai con số đó.
        <span className="whitespace-nowrap font-mono text-[11px]">
          {plan.masteryDistribution.untested} chưa kiểm tra
        </span>
      )}
    </>
  );
}

/**
 * Whether a `draft` plan has any previously-tested concept — only possible for a plan that
 * was `active` before, i.e. a SP-05 re-analyze (#170) dropped it back to `draft` for
 * reconfirmation (#265), not a brand-new plan whose first analysis never ran a test yet.
 * No extra backend field needed: a first-time draft always has every concept `untested`.
 */
function hasPriorProgress(distribution: MasteryDistribution): boolean {
  return distribution.strong + distribution.learning + distribution.weak > 0;
}

interface PlanCardProps {
  plan: PlanSummary;
  /** Ticks once a second so the "Đang phân tích" clock advances. */
  now: Date;
  onArchive: (plan: PlanSummary) => void;
  onRestore: (plan: PlanSummary) => void;
  onReanalyze: (plan: PlanSummary) => void;
  onDelete: (plan: PlanSummary) => void;
  isBusy: boolean;
}

export function PlanCard({
  plan,
  now,
  onArchive,
  onRestore,
  onReanalyze,
  onDelete,
  isBusy,
}: PlanCardProps) {
  const isAnalysing = plan.analysisStatus === 'pending' || plan.analysisStatus === 'processing';
  const isDraft = plan.status === 'draft';
  const isArchived = plan.status === 'archived';
  const isReanalyzeDraft = isDraft && hasPriorProgress(plan.masteryDistribution);

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={isBusy}
          // z-2 lifts the trigger above the stretched link overlay below, which is the only
          // thing keeping a menu click from also opening the plan.
          className="text-muted-foreground hover:text-foreground z-2 relative -mr-1 flex-none"
          aria-label={`Tuỳ chọn cho ${plan.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* Lưu trữ chỉ có nghĩa với kế hoạch đã xác nhận: server từ chối lưu trữ bản nháp
            (#265 — nếu cho, thì "Bỏ lưu trữ" thành lối kích hoạt vòng qua bước kiểm chứng).
            Bản nháp bỏ dở thoát bằng "Xóa vĩnh viễn" ở dưới. */}
        {isArchived ? (
          <DropdownMenuItem onSelect={() => onRestore(plan)}>
            <ArchiveRestore />
            Bỏ lưu trữ
          </DropdownMenuItem>
        ) : (
          !isDraft && (
            <DropdownMenuItem onSelect={() => onArchive(plan)}>
              <Archive />
              Lưu trữ kế hoạch
            </DropdownMenuItem>
          )
        )}

        {/* SP-05 re-reads the document the plan was built from; a draft has no graph to
            refresh yet, and an archived plan is restored first. */}
        {plan.status === 'active' && (
          <DropdownMenuItem onSelect={() => onReanalyze(plan)} disabled={isAnalysing}>
            <RefreshCw />
            Phân tích lại tài liệu
          </DropdownMenuItem>
        )}

        {/* Separated by a rule: archiving is reversible, this is not. A draft has no item
            above it, so the rule would be a stray line at the top of the menu. */}
        {!isDraft && <DropdownMenuSeparator />}
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(plan)}>
          <Trash2 />
          Xóa vĩnh viễn
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ---------- Draft: being analysed, analysis failed, or waiting to be confirmed ----------
  if (isDraft) {
    // Từ #265, kế hoạch ở lại `draft` cho tới khi người dùng xác nhận đồ thị — nên "draft mà
    // không đang chạy" không còn đồng nghĩa với lỗi. Trạng thái thứ ba này mới là trạng thái
    // phổ biến nhất của một bản nháp: AI xong việc, đang chờ bước kiểm chứng của SP-01.
    const analysisFailed = plan.analysisStatus === 'failed';
    const awaitingConfirmation = !isAnalysing && !analysisFailed;
    const elapsed = plan.analysisStartedAt ? formatElapsed(plan.analysisStartedAt, now) : null;
    const meta = [
      plan.document?.filename,
      plan.document?.pageCount ? `${plan.document.pageCount} trang` : null,
      isAnalysing ? elapsed : null,
      awaitingConfirmation && plan.conceptCount ? `${plan.conceptCount} khái niệm` : null,
    ].filter(Boolean);

    return (
      <div
        className={`border-border bg-card pb-4.5 rounded-xl border border-dashed px-5 pt-5 ${
          isBusy ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2.5">
          {isAnalysing ? (
            <Badge tone="ai">Đang phân tích</Badge>
          ) : analysisFailed ? (
            <Badge tone="weak">Phân tích lỗi</Badge>
          ) : (
            <Badge tone="neutral">Chờ xác nhận</Badge>
          )}
          {actions}
        </div>

        <h2 className="font-heading mb-0.75 mt-2.5 text-[18px] leading-tight tracking-[-0.015em]">
          {plan.name}
        </h2>

        {meta.length > 0 && (
          <div className="text-muted-foreground font-mono text-[11.5px]">{meta.join(' · ')}</div>
        )}

        <p className="text-muted-foreground mt-3.5 line-clamp-2 text-pretty text-[12.5px] leading-[1.65]">
          {isAnalysing
            ? isReanalyzeDraft
              ? 'AI đang phân tích lại tài liệu. Lịch ôn tạm dừng, khái niệm đã kiểm tra không mất điểm.'
              : 'AI đang trích xuất khái niệm. Đồ thị sẽ mở được ngay khi xong — bạn không cần chờ ở đây.'
            : awaitingConfirmation
              ? isReanalyzeDraft
                ? 'AI đã phân tích lại xong. Đối chiếu rồi xác nhận để lịch ôn chạy lại — khái niệm đã kiểm tra vẫn giữ nguyên điểm.'
                : 'AI đã trích xuất xong. Đối chiếu các khái niệm với tài liệu rồi xác nhận để kế hoạch bắt đầu chạy.'
              : (plan.analysisErrorMessage ??
                'Không trích xuất được khái niệm từ tài liệu này. Mở kế hoạch để xem chi tiết và thử lại.')}
        </p>

        <div className="border-border mt-3.5 border-t pt-3.5 text-[12.5px]">
          {/* Một link mang ba nhãn, và chỉ ca "chờ xác nhận" mới thuộc màn kiểm chứng: bản
              nháp đang phân tích thì chưa có đồ thị để kiểm, bản lỗi phân tích thì việc cần
              làm là thử lại. Hai ca đó mở kế hoạch như bình thường (PlanDetailPage tự đưa
              tiếp về đúng chỗ nếu cần). */}
          <Link
            to={awaitingConfirmation ? `/plan/${plan.id}/verify` : `/plan/${plan.id}`}
            className="text-foreground border-border hover:border-foreground border-b transition-colors"
          >
            {isAnalysing
              ? 'Xem tiến trình'
              : awaitingConfirmation
                ? 'Kiểm chứng đồ thị'
                : 'Xem chi tiết'}
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Active or archived: a graph the student can open ----------
  const meta = [
    `${plan.conceptCount} khái niệm`,
    plan.deadline ? `hạn ${formatDeadlineShort(plan.deadline)}` : null,
    plan.deadline && !isArchived ? formatTimeLeft(plan.deadline, now) : null,
  ].filter(Boolean);

  return (
    <div
      className={`border-border bg-card pb-4.5 hover:shadow-(--shadow-soft) relative rounded-xl border px-5 pt-5 transition-shadow duration-150 ${
        isBusy ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {/* A stretched link rather than a wrapper around the card: nesting the actions menu
          inside an <a> meant choosing "Lưu trữ" also navigated into the plan. As a sibling
          overlay it covers the card, and the trigger above it stays its own click target. */}
      <Link
        to={`/plan/${plan.id}`}
        aria-label={`Mở kế hoạch ${plan.name}`}
        className="z-1 absolute inset-0 rounded-xl"
      />

      <div className="mb-0.75 flex items-start justify-between gap-2.5">
        <h2 className="font-heading text-[18px] leading-tight tracking-[-0.015em]">{plan.name}</h2>
        {actions}
      </div>

      <div className="text-muted-foreground mb-4 font-mono text-[11.5px]">{meta.join(' · ')}</div>

      <MasteryBar distribution={plan.masteryDistribution} total={plan.conceptCount} />

      {/* A re-analyze always drops the plan to `draft` before its job starts (#170, #265),
          so an `active` card here can never itself be mid-analysis — that state renders via
          the `isDraft` branch above instead. Archived keeps the old progress line; every other
          active plan gets the #225 review-queue link. */}
      <div className="border-border text-muted-foreground mt-3.5 flex items-center justify-between gap-2 border-t pt-3 text-[12.5px]">
        {isArchived ? (
          // Kế hoạch lưu trữ chưa có hành vi hàng đợi nào được demo — giữ nguyên dòng tiến độ cũ.
          progressHint(plan.masteryDistribution, plan.conceptCount)
        ) : (
          // "N khái niệm yếu đang chờ ôn lại" đã lỗi thời (#225, ghi chú 05/08 của issue #223):
          // hai con số không bằng nhau, vì hàng đợi còn chứa khái niệm nền do truy ngược áp vào.
          <PlanQueueLink plan={plan} />
        )}
      </div>
    </div>
  );
}
