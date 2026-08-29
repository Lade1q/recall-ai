import type { ReviewItemStatus, ReviewReason, StudyPlanStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { DEFAULT_MAX_TURNS_PER_CONCEPT } from '../utils/interview-state';
import { daysUntil } from '../utils/mastery';
import { getVnDateInstant, getVnTomorrowStartUtc, toVnDateKey } from '../utils/dashboard-stats';
import { isWeakTraceback, pickRepresentative } from '../utils/schedule-representative';

/**
 * Review Queue API (Scheduling & Remediation Engine output, I7.3 / #124).
 *
 * Reads the `ReviewQueueItem` rows I7.2 writes and turns them into the priority-ordered,
 * human-readable list AI Examiner (I6.3), Focus Session (I8.2) and the session-result screen
 * (I6.7) all consume. No AI call, no cron — pure arithmetic over data already in the DB,
 * recomputed on every read (MVP note in #124: the graph is small enough that this is fast
 * enough, and a stored value would go stale as the deadline gets closer).
 *
 * `calculatePriority()` here is deliberately a different number from `reviewPriority()` in
 * `utils/mastery.ts`: that one is what I7.2 stores on the row (changes only when the concept is
 * retested), this one folds in the deadline and is never persisted. See `mastery.ts` for the
 * full explanation of why the two must not be conflated.
 */

/** No plan deadline → treated as if the deadline were this many days out (UC-19 formula). */
export const DEFAULT_DEADLINE_HORIZON_DAYS = 30;
export const DEFAULT_QUEUE_LIMIT = 10;
export const DEFAULT_TODAY_LIMIT = 5;

/**
 * Câu rỗng của `/review-queue/today` — bề mặt duy nhất thật sự lọc theo "đến hạn hôm nay", nên
 * cũng là bề mặt duy nhất được nói chữ "hôm nay". Xem `COMPLETED_PLAN_MESSAGE` ngay dưới.
 */
export const COMPLETED_TODAY_MESSAGE = 'Bạn đã hoàn thành kế hoạch hôm nay 🎉';

/**
 * Câu rỗng của `GET /review-queue?planId=` (#224, bổ sung 05/08). Hai endpoint từng dùng chung
 * `COMPLETED_TODAY_MESSAGE`, nhưng endpoint này **không** lọc `scheduledFor`: rỗng ở đây nghĩa
 * là hết sạch hàng đợi của cả kế hoạch, không phải hết phần đến hạn hôm nay. Nói "xong phần hôm
 * nay" ở đây khiến sinh viên ngồi chờ một đợt ôn mà hôm nay không có — và giấu mất thành tựu
 * thật. Câu lấy từ mockup `screen-plan-review-queue.html` (trạng thái rỗng số 2).
 */
export const COMPLETED_PLAN_MESSAGE =
  'Bạn đã ôn hết kế hoạch này. Mỗi khái niệm có ngày ôn lại riêng, xa dần theo mức bạn nắm.';

/**
 * #345, ca (c) — kế hoạch **đã** có kết quả vấn đáp, nhưng mọi khái niệm từng lên lịch đã bị
 * `mergePlan` gỡ khỏi nội dung hiện tại. Đi qua `noScheduleNote`, **không** qua `message`: ở ca
 * này `items` không rỗng (đang hiện gợi ý A3) nên theo định nghĩa `message` phải là `null`.
 *
 * Ba cụm cố ý, đừng gọn hoá (#345):
 * - **"đã được phân tích lại"** — `status: 'deprecated'` chỉ có **một** đường ghi (`mergePlan`),
 *   nên đây là chẩn đoán duy nhất tới được, không phải phỏng đoán.
 * - **"khái niệm trong lịch ôn trước đó"**, không phải "bạn từng ôn": hàng đợi có cả mục
 *   traceback mà sinh viên chưa vấn đáp lần nào.
 * - **"không còn trong nội dung hiện tại"**, không phải "đã xoá": dòng vẫn còn và hồi sinh được
 *   nguyên vẹn nếu tài liệu nhắc lại tên (#343).
 */
export const CONTENT_CHANGED_PLAN_NOTE =
  'Kế hoạch này đã được phân tích lại, nên những khái niệm trong lịch ôn trước đó không còn ' +
  'trong nội dung hiện tại. Làm một phiên với nội dung mới để có lịch thật.';

/**
 * #345, nhánh `CHANGED` trên `/today`. Câu **riêng** chứ không dùng lại
 * `CONTENT_CHANGED_PLAN_NOTE`: `/today` gộp mọi kế hoạch của user, nên "Kế hoạch này" ở đó là sai.
 *
 * ⚠️ **LUẬT CÂU CHỮ — vế cuối nêu VIỆC NGƯỜI DÙNG LÀM, không nêu NƠI NGƯỜI DÙNG TỚI.** Nút đã
 * nói nơi rồi; để chữ lặp lại cái nút là mất một vế mà không mua được gì. Bản nháp của câu này
 * từng kết bằng *"mở kế hoạch để xem đồ thị hiện tại"* và được biện minh bằng *"vế cuối khớp CTA
 * `/plans`"* — chính lối thoát mà luật trên bác. Nếu định "khôi phục" nó vì thấy khớp nút, đọc
 * lại dòng này trước; và đọc cả `NO_ACTIVE_CONCEPTS_TODAY_MESSAGE` ngay dưới, nơi cùng luật đó
 * được viện để **không** nhắc "mở kế hoạch".
 *
 * Hệ quả kiểm được: sau khi theo luật, vế hành động của câu này **trùng nguyên văn** với vế cuối
 * của `CONTENT_CHANGED_PLAN_NOTE`. Bốn câu, hai cặp, không cặp nào lệch chữ ở phần việc-phải-làm.
 */
export const CONTENT_CHANGED_TODAY_MESSAGE =
  'Hôm nay không có gì đến hạn. Nội dung kế hoạch đã thay đổi nên lịch ôn cũ không còn hiệu ' +
  'lực — làm một phiên với nội dung mới để có lịch thật.';

/**
 * #345, ca (d) — kế hoạch `active` mà **không còn khái niệm `active` nào**.
 *
 * ⚠️ Câu này gánh **hai vai**. Ngoài empty-state của màn hàng đợi, nó còn là **body của 409
 * `NO_CONCEPTS_TO_REVIEW`**: `resolveConceptQueue` ném `queue.message ?? NO_CONCEPTS_MESSAGE`
 * và `queue` ở đó là `getReviewQueueForPlan`. Sửa câu này là sửa cả lý do từ chối mở phiên, nên
 * nó phải đọc lọt ở cả hai ngữ cảnh — có assertion ghim trong test, không chỉ ghi chú.
 */
export const NO_ACTIVE_CONCEPTS_PLAN_MESSAGE =
  'Kế hoạch này hiện không có khái niệm nào, nên chưa có gì để ôn. Thêm khái niệm vào đồ thị ' +
  'hoặc phân tích lại tài liệu để bắt đầu.';

/**
 * #345, ca (d) trên `/today`. Lại là câu riêng: đây là câu **đa kế hoạch** (mọi kế hoạch `active`
 * của user đều rỗng khái niệm) nên không được nói "Kế hoạch này". Nó rơi vào nhánh cuối của
 * `TodayNudge`, nơi không có badge lẫn heading, nên câu phải tự đứng được một mình — ba mệnh đề
 * *hôm nay thế nào → vì sao → làm gì*; vế đầu tồn tại chính vì không có heading.
 *
 * Vế hành động **trùng khít từng chữ** với `NO_ACTIVE_CONCEPTS_PLAN_MESSAGE` là cố ý: hai bề mặt
 * nói cùng một việc thì phải nói bằng cùng một chữ. Nó cũng cố ý **không** nhắc "mở kế hoạch" —
 * nút "Xem kế hoạch ôn tập" nằm ngay dưới, để nút lo điều hướng còn chữ lo nội dung.
 *
 * "**hiện không có**" gánh cả hai biến thể của ca (d), cùng lý do như câu kia: "chưa có" sai với
 * kế hoạch từng có khái niệm rồi bị xoá, "không còn" sai với kế hoạch chưa bao giờ có.
 */
export const NO_ACTIVE_CONCEPTS_TODAY_MESSAGE =
  'Hôm nay không có gì đến hạn. Kế hoạch của bạn hiện không có khái niệm nào — thêm khái niệm ' +
  'vào đồ thị hoặc phân tích lại tài liệu để bắt đầu.';

/**
 * Câu rỗng của `GET /review-queue?planId=` khi kế hoạch còn là `draft` (#232 phần 4, 06/08).
 * Trước #265 `draft` chỉ sống vài giây trong lúc AI phân tích, nên một câu chung "chưa ở trạng
 * thái hoạt động" cho mọi status không-`active` là vô hại. Giờ `draft` nghĩa là *đã phân tích
 * xong, đang chờ người dùng xác nhận đồ thị* và là trạng thái sống lâu — câu chữ phải nói ra
 * việc người dùng còn nợ và lối đi tới đó, thay vì mô tả trạng thái hệ thống.
 *
 * Chữ "xác nhận" bám theo nhãn "Chờ xác nhận" của thẻ kế hoạch SP-03 (#269) và nút "Kiểm chứng
 * đồ thị" trong `PlanCard.tsx` — cùng một trạng thái không được mang hai tên trong sản phẩm.
 */
export const PLAN_AWAITING_CONFIRMATION_MESSAGE =
  'Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.';

/**
 * Câu rỗng của cùng endpoint khi kế hoạch đã `archived`. Tách khỏi câu `draft` ngay trên vì
 * guard `status !== 'active'` bắt cả hai: dùng chung một câu thì hoặc là nói "chờ xác nhận" với
 * một kế hoạch đã lưu trữ (nói dối), hoặc là quay về câu mô tả trạng thái hệ thống cho cả hai.
 */
export const PLAN_ARCHIVED_MESSAGE = 'Kế hoạch này đã được lưu trữ. Bỏ lưu trữ để ôn tiếp.';

/** Câu rỗng của `/review-queue/today` cho người dùng mới — chưa có kế hoạch nào để mà ôn. */
export const NO_PLAN_MESSAGE = 'Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.';

/** Câu rỗng của `/review-queue/today` khi mọi kế hoạch đều đã lưu trữ — khác hẳn ca trên. */
export const ALL_PLANS_ARCHIVED_MESSAGE =
  'Mọi kế hoạch của bạn đang được lưu trữ. Bỏ lưu trữ một kế hoạch để ôn tiếp.';

const NOT_TESTED_REASON_TEXT = 'Khái niệm chưa được kiểm tra';

/**
 * Câu rỗng của `GET /review-queue?planId=` cho kế hoạch chưa `active` (#232 phần 4).
 *
 * Tham số hẹp lại thành `'draft' | 'archived'` chứ không phải cả enum: chỗ gọi đã loại `active`
 * bằng guard, và để `active` lọt vào đây thì không có câu nào đúng để trả.
 */
export function buildInactivePlanMessage(status: Exclude<StudyPlanStatus, 'active'>): string {
  switch (status) {
    case 'draft':
      return PLAN_AWAITING_CONFIRMATION_MESSAGE;
    case 'archived':
      return PLAN_ARCHIVED_MESSAGE;
    default: {
      const exhaustiveCheck: never = status;
      throw new Error(`Unhandled plan status: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Câu rỗng của `/review-queue/today` khi người dùng không có kế hoạch `active` nào (#232 phần 4).
 *
 * Ba ca, ba lối đi khác nhau — và trước 06/08 cả ba nhận chung một câu *"bạn chưa có kế hoạch ôn
 * tập nào đang hoạt động"*, đúng về kỹ thuật nhưng vô dụng về hành động, nhất là với sinh viên
 * vừa tạo kế hoạch đầu tiên mà chưa xác nhận đồ thị (ca #265).
 *
 * Hàm thuần, tách khỏi truy vấn để chạy được khi tước `DATABASE_URL` + `GEMINI_API_KEY` (R05).
 * `draft` được ưu tiên hơn `archived` khi có cả hai: nó là ca duy nhất người dùng đang còn nợ
 * một việc cụ thể, còn lưu trữ là một lựa chọn đã hoàn tất.
 */
export function buildNoActivePlanMessage(statuses: readonly StudyPlanStatus[]): string {
  const awaitingCount = statuses.filter((status) => status === 'draft').length;

  if (statuses.length === 0) {
    return NO_PLAN_MESSAGE;
  }
  if (awaitingCount > 0) {
    return `Bạn có ${awaitingCount} kế hoạch đang chờ xác nhận đồ thị. Xác nhận để hàng đợi ôn bắt đầu chạy.`;
  }
  return ALL_PLANS_ARCHIVED_MESSAGE;
}

/**
 * "Không còn nằm trên lịch" (#224). Mọi bộ lọc đọc hàng đợi loại trừ đúng bộ này thay vì kén
 * `status: 'pending'`:
 *
 * - `pending` giờ nghĩa là *đã áp vào lịch*, không phải *chờ duyệt* — nên nó phải lọt qua.
 * - `accepted` đã ngừng dùng và được backfill về `pending`, nhưng một DB chưa chạy migration
 *   vẫn còn hàng cũ; lọc `= 'pending'` sẽ làm chúng bốc hơi khỏi hàng đợi.
 * - `skipped` là mục sinh viên đã gỡ — ra khỏi lịch, nhưng hàng vẫn giữ để đưa lại được.
 * - `done` chưa code path nào ghi; liệt kê sẵn ở đây để ngày nó được ghi thì "đã ôn xong" tự
 *   rời hàng đợi, không phải nhớ quay lại sửa bộ lọc.
 */
export const OFF_SCHEDULE_STATUSES: ReviewItemStatus[] = ['skipped', 'done'];

/** `where` fragment dùng chung cho mọi truy vấn "mục còn nằm trên lịch" — xem trên. */
export const ON_SCHEDULE_WHERE = { status: { notIn: OFF_SCHEDULE_STATUSES } } as const;

/**
 * "Khái niệm còn thuộc kế hoạch" (#343). Đi kèm `ON_SCHEDULE_WHERE` ở mọi đường **đọc** hàng
 * đợi: hai điều kiện khác trục nhau — cái trên là trạng thái *của mục* (sinh viên đã gỡ chưa),
 * cái này là trạng thái *của khái niệm* (tài liệu còn dạy nó không).
 *
 * SP-05 re-analyze gỡ một khái niệm khỏi kế hoạch bằng `status: 'deprecated'`, **không xoá**
 * (`analysis.service.ts` `mergePlan`). Hàng đợi thì chỉ lọc item-status, nên mọi khái niệm từng
 * được ôn rồi bị gỡ sau vẫn nổi lên — và hàng đợi chảy thẳng vào nhánh auto-pick của
 * `interview.service.ts`, dựng cả một phiên phỏng vấn trên thứ đã rời cả kế hoạch lẫn đồ thị
 * (`graph.service` render active-only).
 *
 * **Sửa ở đường đọc chứ không đụng data**, vì deprecate là cửa **hai chiều**: `mergePlan.toKeep`
 * set `status: 'active'` vô điều kiện, nên tài liệu nhắc lại tên là tombstone sống lại **cùng
 * `id`**; `ReviewQueueItem.concept` là relation **bắt buộc** (FK Cascade), nên hàng đợi tự gắn
 * lại, giữ nguyên `scheduledFor`, priority và cả quyết định `skipped` của sinh viên. Bộ lọc này
 * là một **view**: hồi sinh khôi phục hiển thị miễn phí, còn mọi bản vá ghi vào data sẽ là cửa
 * một chiều bắc qua một trạng thái hai chiều.
 *
 * Vì relation là bắt buộc, thêm fragment này **không** âm thầm làm rụng hàng: mọi
 * `ReviewQueueItem` đều có đúng một `Concept`, nên phép lọc chỉ loại đúng hàng trỏ tombstone.
 */
export const ACTIVE_CONCEPT_WHERE = { concept: { status: 'active' } } as const;

export interface CalculatePriorityInput {
  masteryScore: number | null;
  daysUntilDeadline: number | null;
  /**
   * Kept in the signature to match #124's published contract (I7.4 tests against it), but
   * unused in the arithmetic on purpose: folding "traceback" into the number as a bonus is
   * exactly the bug audit B4 flagged (it only worked by accident because the rest of the
   * formula is capped at 1.0). The traceback-always-first guarantee lives in
   * `sortReviewItems()` instead, as a real two-tier sort — see the ràng buộc in #124.
   */
  reason: ReviewReason;
}

/**
 * `priority = (1 / max(deadline - today, 1)) * (1 - COALESCE(masteryScore, 0))` (UC-05 §UC-19).
 * No deadline uses a 30-day horizon. Rounded to two decimals, same convention as
 * `reviewPriority()` in `utils/mastery.ts`.
 *
 * UC-19's E2 ("no upcoming deadline anywhere → sort by lowest mastery") needs no special case:
 * when every item's `daysUntilDeadline` is `null`, `1 / 30` is the same constant for all of
 * them, so the ordering collapses to `(1 - masteryScore)` ascending on its own.
 */
export function calculatePriority({
  masteryScore,
  daysUntilDeadline,
}: CalculatePriorityInput): number {
  const remainingDays = Math.max(daysUntilDeadline ?? DEFAULT_DEADLINE_HORIZON_DAYS, 1);
  const masteryGap = 1 - (masteryScore ?? 0);
  return Math.round((1 / remainingDays) * masteryGap * 100) / 100;
}

/**
 * How long one Interview turn takes end to end — read the question, write an answer, read the
 * feedback. A guess, not a measurement: nothing records real durations yet, so this is the one
 * number to re-calibrate once `InterviewTurn.askedAt`/`answeredAt` have enough history.
 */
export const MINUTES_PER_TURN = 3;

/**
 * Extra minutes a traceback item costs on top of answering: the prerequisite is by definition
 * something the student did *not* have ready, so it needs re-reading before the questions make
 * sense. Scaled by `depth` — a prerequisite of a prerequisite (depth 2) sits further from what
 * was actually tested, so it is the less familiar of the two.
 */
export const TRACEBACK_RELEARN_MINUTES = 5;

export interface EstimateReviewMinutesInput {
  reason: ReviewReason;
  /** 1 or 2 for a traceback item (`max_depth = 2`), `null` for every other reason. */
  depth: number | null;
  /** From the session that queued the item; `null` → the schema default of 3. */
  maxTurnsPerConcept: number | null;
}

/**
 * How long reviewing one concept should take (DB-04, #201) — arithmetic only, no AI, exactly
 * like `calculatePriority()` above.
 *
 * `estimate = maxTurns * MINUTES_PER_TURN + (traceback ? TRACEBACK_RELEARN_MINUTES * depth : 0)`
 *
 * Calibrated against the dashboard mockup's "Hàng đợi hôm nay · ≈ 50 phút": a default
 * `/review-queue/today` page is `DEFAULT_TODAY_LIMIT` = 5 items, and the shape the mockup shows
 * (one depth-1 traceback ahead of plain spaced-repetition items) gives 14 + 4 × 9 = 50.
 */
export function estimateReviewMinutes({
  reason,
  depth,
  maxTurnsPerConcept,
}: EstimateReviewMinutesInput): number {
  const turns = maxTurnsPerConcept ?? DEFAULT_MAX_TURNS_PER_CONCEPT;
  const relearnMinutes = reason === 'traceback' ? TRACEBACK_RELEARN_MINUTES * (depth ?? 1) : 0;
  return turns * MINUTES_PER_TURN + relearnMinutes;
}

export interface ReviewQueueItemResponse {
  /** `null` for a virtual A3-fallback suggestion — no real row exists yet, so nothing to PATCH. */
  id: string | null;
  conceptId: string;
  name: string;
  /**
   * #232: which plan the concept belongs to. `/review-queue/today` merges the queues of every
   * `active` plan, so without this the dashboard cannot build either of its two CTAs —
   * `POST /interviews` and `FocusSession` both require a `planId`. Present on `GET /review-queue`
   * too (where the caller already knows it) so the two endpoints keep one shape, and on
   * A3-fallback items, which belong to a plan just as much as a real row does.
   */
  planId: string;
  /** #232: the plan's name, so a merged list can say which plan a suggestion came from. */
  planName: string;
  priority: number;
  reason: ReviewReason;
  reasonText: string;
  sourceConceptName: string | null;
  depth: number | null;
  masteryScore: number | null;
  status: ReviewItemStatus;
  /** #201: heuristic minutes for this one concept — see `estimateReviewMinutes()`. */
  estimatedMinutes: number;
  /**
   * #201: when the Interview session that queued this item ended, so the dashboard can say
   * "…trong phiên kiểm tra tối qua" (AE-08 narrative). `null` when the item has no source
   * session — A3-fallback suggestions and manually added items.
   */
  sourceSessionEndedAt: Date | null;
}

export interface ReviewQueueListResponse {
  items: ReviewQueueItemResponse[];
  message: string | null;
  /** #201: sum of `estimatedMinutes` over `items`. `0` for an empty queue. */
  totalEstimatedMinutes: number;
  /**
   * #224: the "Đã gỡ khỏi lịch" group, present **only** for `GET /review-queue` with
   * `includeSkipped=true`. Absent — not `[]` — when it was not asked for: an empty array would
   * claim the student has removed nothing, which is a different fact from not having looked.
   * Every entry has `status: 'skipped'` and is put back with `PATCH { "status": "pending" }`.
   */
  skippedItems?: ReviewQueueItemResponse[];
  /**
   * #345: the "your queued concepts are no longer in this plan's content" note, for the one case
   * where `items` is **not** empty (the A3 suggestion list is showing) so `message` cannot carry
   * it. `null` everywhere else — including `/today`, whose aggregate wording is different.
   *
   * Deliberately a separate field rather than a second sentence in `message`: `noScheduleNote
   * !== null` is exactly the discriminator the client needs. If the server put a sentence in the
   * same place for both the "never graded" and the "content changed" cases, the client would
   * have to **read the string** to tell which case it is in.
   */
  noScheduleNote: string | null;
  /**
   * #345: whether the plan's graph still holds anything. A **fact**, not a sentence — the client
   * picks its empty-state frame (icon, heading, CTA) from it, the same way it already picks one
   * from `planStatus`. Choosing a frame by sniffing `message` for a substring is the thing this
   * field exists to make unnecessary.
   *
   * Absent — not `false` — when the plan is not `active`, following `skippedItems`' precedent in
   * this same interface: those responses return before anything is counted, and a `draft` plan
   * does hold concepts (awaiting confirmation), so `false` there would be a lie rather than a
   * default. The client never needs it in that case: `resolveFrame` answers `draft`/`archived`
   * before it ever looks at this.
   */
  hasActiveConcepts?: boolean;
}

/**
 * The user-facing "why is this here" line, generated on the backend (#124: "để chỉ cần sửa một
 * chỗ khi đổi câu chữ" — so the client never assembles this string itself).
 */
export function buildReasonText(
  reason: ReviewReason,
  context: { masteryScore: number | null; sourceConceptName: string | null }
): string {
  switch (reason) {
    case 'traceback':
      return context.sourceConceptName
        ? `Nền tảng của '${context.sourceConceptName}' mà bạn còn yếu`
        : 'Một khái niệm nền tảng của mục này mà bạn còn yếu';
    case 'spaced_repetition':
      return context.masteryScore === null
        ? NOT_TESTED_REASON_TEXT
        : 'Đã đến lịch ôn tập theo mức độ ghi nhớ';
    case 'deadline_priority':
      return 'Deadline sắp tới, cần ưu tiên ôn tập';
    case 'manual':
      return 'Được thêm vào hàng đợi thủ công';
    default: {
      const exhaustiveCheck: never = reason;
      throw new Error(`Unhandled review reason: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Two-tier ordering (audit B4): `reason = 'traceback'` always first, `priority` descending
 * within each tier. A real two-tier sort, not a bonus added to `priority` — so the guarantee
 * holds whatever the two numbers happen to be, not just for the ranges the formula can produce
 * today.
 */
export function sortReviewItems<T extends { reason: ReviewReason; priority: number }>(
  items: readonly T[]
): T[] {
  const tier = (item: T): number => (item.reason === 'traceback' ? 0 : 1);
  return [...items].sort((a, b) => tier(a) - tier(b) || b.priority - a.priority);
}

/**
 * The plan fields every read path here needs: `deadline` feeds `calculatePriority()`, `id` and
 * `name` ride along on every item (#232). Both GET endpoints already load the plan row, so
 * carrying it through costs no extra query — see the ràng buộc in #232.
 */
export interface QueuePlan {
  id: string;
  name: string;
  deadline: Date | null;
}

/**
 * One item per concept (#232 phần 3). `@@unique([sourceSessionId, conceptId])` only stops a
 * concept being queued twice *by the same session*, so every session that grades the same
 * concept adds another `pending` row — a real plan came back `8 mục / 3 khái niệm`
 * (Array ×4 · Binary Tree ×2 · Linked List ×2). That per-session value is deliberate (audit A1
 * keeps the trail of which session asked for what), so the fix is here on the read side, not on
 * the constraint.
 *
 * The survivor is the row that `sortReviewItems()` would have shown first anyway — traceback
 * ahead of everything, then highest `priority` — so folding the duplicates away never changes
 * which item a student sees at the top, only how many times they see it.
 *
 * Pure, so it runs without `DATABASE_URL`/`GEMINI_API_KEY` (R05). Returns items in the sorted
 * order it used to pick winners; callers sort again after merging plans, which is idempotent.
 */
export function dedupeByConcept(
  items: readonly ReviewQueueItemResponse[]
): ReviewQueueItemResponse[] {
  const bestPerConcept = new Map<string, ReviewQueueItemResponse>();

  for (const item of sortReviewItems(items)) {
    if (!bestPerConcept.has(item.conceptId)) {
      bestPerConcept.set(item.conceptId, item);
    }
  }

  return [...bestPerConcept.values()];
}

interface ToResponseItemInput {
  id: string | null;
  conceptId: string;
  name: string;
  plan: QueuePlan;
  masteryScore: number | null;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptName: string | null;
  daysUntilDeadline: number | null;
  sourceSession: SourceSessionInfo | null;
}

function toResponseItem(input: ToResponseItemInput): ReviewQueueItemResponse {
  return {
    id: input.id,
    conceptId: input.conceptId,
    name: input.name,
    planId: input.plan.id,
    planName: input.plan.name,
    priority: calculatePriority({
      masteryScore: input.masteryScore,
      daysUntilDeadline: input.daysUntilDeadline,
      reason: input.reason,
    }),
    reason: input.reason,
    reasonText: buildReasonText(input.reason, {
      masteryScore: input.masteryScore,
      sourceConceptName: input.sourceConceptName,
    }),
    sourceConceptName: input.sourceConceptName,
    depth: input.depth,
    masteryScore: input.masteryScore,
    status: input.status,
    estimatedMinutes: estimateReviewMinutes({
      reason: input.reason,
      depth: input.depth,
      maxTurnsPerConcept: input.sourceSession?.maxTurnsPerConcept ?? null,
    }),
    sourceSessionEndedAt: input.sourceSession?.endedAt ?? null,
  };
}

/**
 * `sourceConceptId` is a soft reference (no FK, per the schema comment), so it can't be
 * `include`d — resolved here with one batched lookup instead of one query per row.
 */
async function resolveSourceConceptNames(
  rows: readonly { sourceConceptId: string | null }[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((row) => row.sourceConceptId).filter((id): id is string => id !== null)),
  ];
  if (ids.length === 0) {
    return new Map();
  }
  const sourceConcepts = await prisma.concept.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(sourceConcepts.map((concept) => [concept.id, concept.name]));
}

interface SourceSessionInfo {
  /** `null` while the session is still running — it queued the item but has not ended yet. */
  endedAt: Date | null;
  maxTurnsPerConcept: number;
}

/**
 * `sourceSessionId` is a soft reference too (audit A1's dedupe key, no FK), so the same batched
 * treatment as `resolveSourceConceptNames()`: one lookup for the whole page, never per row.
 * Carries `maxTurnsPerConcept` along with `endedAt` because the estimate needs it and it is free
 * to select here.
 */
async function resolveSourceSessions(
  rows: readonly { sourceSessionId: string | null }[]
): Promise<Map<string, SourceSessionInfo>> {
  const ids = [
    ...new Set(rows.map((row) => row.sourceSessionId).filter((id): id is string => id !== null)),
  ];
  if (ids.length === 0) {
    return new Map();
  }
  const sessions = await prisma.interviewSession.findMany({
    where: { id: { in: ids } },
    select: { id: true, endedAt: true, maxTurnsPerConcept: true },
  });
  return new Map(
    sessions.map((session) => [
      session.id,
      { endedAt: session.endedAt, maxTurnsPerConcept: session.maxTurnsPerConcept },
    ])
  );
}

/**
 * Audit A3 fallback: a plan that has never had an Interview session has no `ReviewQueueItem`
 * rows at all, which is a different empty state from "reviewed everything today" (UC-19 E1).
 * Suggests directly from the plan's concepts instead — untested first, then hardest first —
 * so a brand-new plan still has something reasonable to show without needing traceback.
 */
async function buildFallbackItems(plan: QueuePlan, now: Date): Promise<ReviewQueueItemResponse[]> {
  const concepts = await prisma.concept.findMany({
    where: { planId: plan.id, status: 'active' },
    orderBy: [{ masteryScore: { sort: 'asc', nulls: 'first' } }, { difficulty: 'desc' }],
    select: { id: true, name: true, masteryScore: true },
  });

  const daysUntilDeadline = daysUntil(plan.deadline, now);

  return concepts.map((concept) =>
    toResponseItem({
      id: null,
      conceptId: concept.id,
      name: concept.name,
      plan,
      masteryScore: concept.masteryScore,
      reason: 'spaced_repetition',
      depth: null,
      status: 'pending',
      sourceConceptName: null,
      daysUntilDeadline,
      sourceSession: null,
    })
  );
}

export interface QueueRow {
  id: string;
  conceptId: string;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptId: string | null;
  sourceSessionId: string | null;
  concept: { name: string; masteryScore: number | null };
}

const QUEUE_ROW_INCLUDE = {
  concept: { select: { id: true, name: true, masteryScore: true } },
} as const;

/**
 * Row → response for a page of rows, with the two soft-reference lookups batched once for the
 * whole page. Shared by the queue itself and by the "đã gỡ khỏi lịch" group so the two lists
 * can never drift into different shapes — #225 draws them with the same row component.
 */
export async function toResponseItems(
  rows: readonly QueueRow[],
  plan: QueuePlan,
  now: Date
): Promise<ReviewQueueItemResponse[]> {
  const [sourceConceptNames, sourceSessions] = await Promise.all([
    resolveSourceConceptNames(rows),
    resolveSourceSessions(rows),
  ]);
  const daysUntilDeadline = daysUntil(plan.deadline, now);

  return rows.map((row) =>
    toResponseItem({
      id: row.id,
      conceptId: row.conceptId,
      name: row.concept.name,
      plan,
      masteryScore: row.concept.masteryScore,
      reason: row.reason,
      depth: row.depth,
      status: row.status,
      sourceConceptName: row.sourceConceptId
        ? (sourceConceptNames.get(row.sourceConceptId) ?? null)
        : null,
      daysUntilDeadline,
      sourceSession: row.sourceSessionId ? (sourceSessions.get(row.sourceSessionId) ?? null) : null,
    })
  );
}

/**
 * The three facts an empty queue has to be told apart by (#345). One flag answering two
 * questions is what produced the bug this issue exists to fix, so each of these answers exactly
 * one — and they are deliberately **not** derivable from each other:
 *
 * - `hasQueueOnActiveConcepts` — is there a row on the schedule pointing at a concept the plan still has?
 * - `hadGradedHistory` — was this plan ever graded at all? (unfiltered; a plan whose whole
 *   history points at tombstones has `hasQueueOnActiveConcepts: false` and `hadGradedHistory: true`)
 * - `hasActiveConcepts` — is there anything in the graph to review?
 */
interface PlanQueueResolution {
  items: ReviewQueueItemResponse[];
  /**
   * `false` when nothing is on the schedule *that the plan still contains* — which since #343
   * includes a plan whose every queued concept was deprecated. Was called `hasHistory` until
   * #345; that name outlived its meaning the moment the count behind it started filtering.
   */
  hasQueueOnActiveConcepts: boolean;
  /**
   * Ever graded, counting rows that point at tombstones. This is what separates "chưa vấn đáp
   * bao giờ" from "đã vấn đáp, nội dung đã đổi" — the two states #344 collapsed into one
   * sentence.
   *
   * ⚠️ Read from `ReviewQueueItem`, **not** from `InterviewSession`/`InterviewTurn`, and that is
   * a decision rather than a convenience: (i) the queue only ever gets a row when there is a
   * *graded result*, which is exactly the claim the copy makes — counting sessions would let a
   * session abandoned before its first answer read as history and swallow the sentence that
   * should have fired; (ii) switching source would not rescue the wiped-graph case anyway,
   * since `InterviewTurn.concept` is `onDelete: Cascade` too.
   */
  hadGradedHistory: boolean;
  /** Whether the graph still has anything in it. Guards case (d) — see `getReviewQueueForPlan`. */
  hasActiveConcepts: boolean;
}

/**
 * The shared core behind both GET endpoints: same data, same scoring — they differ only in
 * `dueOnly`. `/review-queue` (I6.3's auto top-K concept picker) needs every scheduled item
 * regardless of `scheduledFor`, or a plan whose whole queue is spaced out into the future would
 * give the Interview flow nothing to pick from. `/review-queue/today` (I8.2's "Gợi ý hôm nay"
 * tab) needs only what's actually due.
 *
 * #224: the filter excludes `OFF_SCHEDULE_STATUSES` instead of demanding `status = 'pending'`.
 * The old filter was a live bug, not just stale wording — PATCH `'accepted'` used to make an
 * item vanish from the very queue the student had just accepted it into.
 *
 * #232: rows are folded to one per concept before they leave here — see `dedupeByConcept()`.
 * Doing it per plan is enough for `/today` too: a `Concept` belongs to exactly one plan, so
 * merging two plans' queues can never put the same concept in twice.
 *
 * #273: the A3 fallback is offered on `/review-queue?planId=` (`dueOnly: false`) but **not** on
 * `/review-queue/today` (`dueOnly: true`). A fallback suggestion has no `scheduledFor`, so it is
 * never "due"; letting it into `/today` meant a brand-new plan's suggestions (priority from
 * null mastery ≈ 0.07 each) outranked the real, actually-due items of a plan the student is
 * mid-way through, and crowded them out of "Gợi ý hôm nay". Only genuinely scheduled, due work
 * belongs on `/today` — the same reason a `draft` plan contributes nothing there (#265). The
 * empty state this opens ("has plans, nothing due yet") is left to `resolveEmptyMessage` to
 * answer with `null`; its wording is #231/#232-phần-4's call, not this function's.
 *
 * #343: `ACTIVE_CONCEPT_WHERE` sits on **both** reads, and the two are not the same decision.
 * On `findMany` it just keeps tombstones out of the list. On `count` it picks *which empty
 * state shows*: filtered, a plan whose whole queue history points at deprecated concepts reads
 * as `hasQueueOnActiveConcepts: false` and falls to the A3 suggestion list; unfiltered it would read as
 * `hasQueueOnActiveConcepts: true` and answer `COMPLETED_PLAN_MESSAGE` — congratulating the student for
 * finishing a plan they never finished. The wording of neither sentence changes here, only
 * which branch is taken (#231/#232-phần-4 still owns the words).
 */
async function resolvePlanQueue(
  plan: QueuePlan,
  now: Date,
  options: { dueOnly: boolean }
): Promise<PlanQueueResolution> {
  const totalCount = await prisma.reviewQueueItem.count({
    where: { planId: plan.id, ...ACTIVE_CONCEPT_WHERE },
  });

  if (totalCount === 0) {
    // #345: the two extra counts live **inside** this branch, not beside `totalCount`. `/today`
    // calls this function once per active plan, so an unconditional count at the top multiplies
    // by the number of plans; here the hot path pays nothing and only the already-empty path
    // spends one extra round trip.
    const [gradedEver, activeConcepts] = await Promise.all([
      prisma.reviewQueueItem.count({ where: { planId: plan.id } }),
      prisma.concept.count({ where: { planId: plan.id, status: 'active' } }),
    ]);

    return {
      items: options.dueOnly ? [] : await buildFallbackItems(plan, now),
      hasQueueOnActiveConcepts: false,
      hadGradedHistory: gradedEver > 0,
      hasActiveConcepts: activeConcepts > 0,
    };
  }

  const rows = await prisma.reviewQueueItem.findMany({
    where: {
      planId: plan.id,
      ...ON_SCHEDULE_WHERE,
      ...ACTIVE_CONCEPT_WHERE,
      ...(options.dueOnly ? { scheduledFor: { lte: now } } : {}),
    },
    include: QUEUE_ROW_INCLUDE,
  });

  const items = await toResponseItems(rows, plan, now);

  // The other two flags are **entailed** here, not assumed, so they cost no query: `totalCount`
  // counts rows whose concept is still active, so `> 0` gives at least one such row — which means
  // the plan was graded at some point (`gradedEver >= totalCount`), and that the concept the row
  // points at exists and is active (the relation is required).
  return {
    items: dedupeByConcept(items),
    hasQueueOnActiveConcepts: true,
    hadGradedHistory: true,
    hasActiveConcepts: true,
  };
}

/**
 * The "Đã gỡ khỏi lịch" group of `GET /review-queue?includeSkipped=true` (#224 → #225). Rows the
 * student removed are never deleted, so this is what makes the removal reversible: without a way
 * to read them back, PATCH `'skipped'` would be a one-way door with a `'pending'` handle on the
 * far side that nothing can reach.
 *
 * Same sort as the live queue — an item put back should land where the scheduler would have put
 * it, not at the bottom of the list because it was once removed.
 *
 * Folded to one row per concept for the same reason the live queue is (#232): the student
 * removed a *concept* from the schedule, and `updateReviewQueueItemStatus()` moves all of its
 * rows together, so listing the concept once is what actually happened.
 *
 * #343: this list needs `ACTIVE_CONCEPT_WHERE` more than the live queue does, not less. Every
 * row here is drawn with a **"Đưa lại vào lịch"** button, so an unfiltered tombstone is not a
 * stale line the student can ignore — it is a one-click way to put a concept the plan no longer
 * contains back onto the schedule.
 */
async function resolveSkippedItems(
  plan: QueuePlan,
  now: Date,
  limit: number
): Promise<ReviewQueueItemResponse[]> {
  const rows = await prisma.reviewQueueItem.findMany({
    where: { planId: plan.id, status: 'skipped', ...ACTIVE_CONCEPT_WHERE },
    include: QUEUE_ROW_INCLUDE,
  });

  const items = await toResponseItems(rows, plan, now);

  return dedupeByConcept(items).slice(0, limit);
}

/**
 * `[]` + "already done" only means anything once there was history to be done with — a plan that
 * has never been interviewed gets the A3 fallback list, not a congratulation.
 *
 * `completedMessage` is per-endpoint on purpose (#224, 05/08): the two surfaces filter
 * differently, so an empty list means different things and must not share one sentence. See
 * `COMPLETED_TODAY_MESSAGE` / `COMPLETED_PLAN_MESSAGE`.
 */
function resolveEmptyMessage(
  items: readonly ReviewQueueItemResponse[],
  hasQueueOnActiveConcepts: boolean,
  completedMessage: string
): string | null {
  if (items.length > 0) {
    return null;
  }
  return hasQueueOnActiveConcepts ? completedMessage : null;
}

/**
 * GET /review-queue?planId=&limit= — the priority-ordered queue for one plan. Used by I6.3 to
 * auto-pick concepts for a new Interview session and by I6.7's traceback accept/skip screen.
 *
 * Ownership: plan missing or belonging to another user is reported the same way (404), matching
 * #124's own AC ("item không thuộc user → 404") rather than the 403-for-forbidden split
 * `plan.service.ts` uses elsewhere.
 */
export async function getReviewQueueForPlan(
  planId: string,
  userId: string,
  limit: number = DEFAULT_QUEUE_LIMIT,
  options: { includeSkipped?: boolean } = {}
): Promise<ReviewQueueListResponse> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true, name: true, deadline: true, status: true },
  });

  if (!plan || plan.userId !== userId) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.status !== 'active') {
    // `status` was already in the select, so telling the two inactive states apart costs
    // nothing — and one shared sentence would have to lie about one of them (#232 phần 4).
    return {
      items: [],
      message: buildInactivePlanMessage(plan.status),
      // Nothing was counted on this path, so `hasActiveConcepts` is omitted rather than guessed —
      // a `draft` plan does have concepts, they are just unconfirmed (see the field's docstring).
      noScheduleNote: null,
      totalEstimatedMinutes: 0,
    };
  }

  const now = new Date();
  const { items, hasQueueOnActiveConcepts, hadGradedHistory, hasActiveConcepts } =
    await resolvePlanQueue(plan, now, { dueOnly: false });
  const sorted = sortReviewItems(items).slice(0, limit);

  // #345 ca (c): đã từng có kết quả chấm, không còn gì trên lịch mà plan vẫn giữ, nhưng đồ thị
  // vẫn còn khái niệm — nên `items` là danh sách **gợi ý A3**, không rỗng, và câu phải đi bằng
  // `noScheduleNote`. Nhét vào `message` là không được: `message` theo định nghĩa là câu của
  // trạng thái rỗng, mà ở đây danh sách có nội dung.
  const noScheduleNote =
    !hasQueueOnActiveConcepts && hadGradedHistory && hasActiveConcepts
      ? CONTENT_CHANGED_PLAN_NOTE
      : null;

  return {
    items: sorted,
    // #345 ca (d) gác bằng `hasActiveConcepts`, **không** bằng `hadGradedHistory`: câu này khẳng
    // định một điều về **đồ thị**, mà trả lời câu hỏi về đồ thị bằng một dữ kiện về **lịch sử**
    // chính là nước đi "một cờ trả lời hai câu hỏi" đã đẻ ra chính issue này.
    message: hasActiveConcepts
      ? resolveEmptyMessage(sorted, hasQueueOnActiveConcepts, COMPLETED_PLAN_MESSAGE)
      : NO_ACTIVE_CONCEPTS_PLAN_MESSAGE,
    noScheduleNote,
    hasActiveConcepts,
    totalEstimatedMinutes: sorted.reduce((total, item) => total + item.estimatedMinutes, 0),
    ...(options.includeSkipped
      ? { skippedItems: await resolveSkippedItems(plan, now, limit) }
      : {}),
  };
}

/**
 * #345 — which sentence `/today` says once nothing is due. Branches are named, not numbered: the
 * three sessions that designed this table numbered them differently and nearly swapped two.
 *
 * | `DUE-DONE`     | some plan still has a live queue | `COMPLETED_TODAY_MESSAGE` |
 * | `EMPTY-GRAPH`  | every plan's graph is empty      | `NO_ACTIVE_CONCEPTS_TODAY_MESSAGE` |
 * | `CHANGED`      | every plan was graded before     | `CONTENT_CHANGED_TODAY_MESSAGE` |
 * | `INVITE`       | no plan was ever graded          | `null` → the client's A2b invitation |
 * | `INVITE-MIXED` | some were, some weren't          | `null` → same, **borrowed on purpose** |
 *
 * **The three flags use three different quantifiers, and that is the point — do not "unify"
 * them.** A2b is an *invitation*: one plan genuinely ready for a first session is enough to keep
 * it (`some`). The other two are *diagnoses*, and a diagnosis has to be true of **every** plan it
 * speaks about (`every`). Collapsing `every` to `some` here is the exact bug an earlier draft of
 * #345 carried: it fires "your content changed" at a student whose other plan is simply new, and
 * swallows the one invitation they could have acted on.
 *
 * `INVITE` and `INVITE-MIXED` return the same `null` for **different reasons**, which is why the
 * distinction is written down rather than silently merged: in the mixed case the invitation is
 * not merely harmless, it is the correct thing to show — at least one plan really is waiting for
 * its first session.
 *
 * `EMPTY-GRAPH` is tested before `CHANGED` because a wiped graph satisfies both, and "your plans
 * have no concepts" is the more specific and more actionable of the two — where `CHANGED` would
 * send the student off to look at a graph that is empty.
 *
 * ⚠️ **Precondition: `resolutions` is never empty.** `[].every(...)` is `true`, so an empty array
 * would fire `EMPTY-GRAPH` at a user who has no active plan at all. The only thing preventing
 * that is the `activePlans.length === 0` early return in the caller. Move or drop that early
 * return and this function **must** grow a length guard.
 */
function resolveTodayMessage(resolutions: readonly PlanQueueResolution[]): string | null {
  if (resolutions.some((resolution) => resolution.hasQueueOnActiveConcepts)) {
    return COMPLETED_TODAY_MESSAGE;
  }
  if (resolutions.every((resolution) => !resolution.hasActiveConcepts)) {
    return NO_ACTIVE_CONCEPTS_TODAY_MESSAGE;
  }
  if (resolutions.every((resolution) => resolution.hadGradedHistory)) {
    return CONTENT_CHANGED_TODAY_MESSAGE;
  }
  return null;
}

/**
 * GET /review-queue/today?limit= — top-K across every `active` plan of the user, due now.
 * Backs I8.2's "Gợi ý hôm nay" tab and the dashboard nudge (UC-19).
 *
 * #232 phần 4: the query asks for **every** plan and filters to `active` here, so an empty
 * result can still say *which* empty it is. Only the filtered list is ever queued — a plan the
 * student has not confirmed stays off the schedule (#265); the wider `where` exists to choose
 * the sentence, not to let drafts in. Still one round trip: `status` rides along in the select.
 */
export async function getTodayReviewQueue(
  userId: string,
  limit: number = DEFAULT_TODAY_LIMIT
): Promise<ReviewQueueListResponse> {
  const plans = await prisma.studyPlan.findMany({
    where: { userId },
    select: { id: true, name: true, deadline: true, status: true },
  });
  const activePlans = plans.filter((plan) => plan.status === 'active');

  if (activePlans.length === 0) {
    return {
      items: [],
      message: buildNoActivePlanMessage(plans.map((plan) => plan.status)),
      noScheduleNote: null,
      totalEstimatedMinutes: 0,
    };
  }

  const now = new Date();
  const resolutions = await Promise.all(
    activePlans.map((plan) => resolvePlanQueue(plan, now, { dueOnly: true }))
  );

  const allItems = resolutions.flatMap((resolution) => resolution.items);
  const sorted = sortReviewItems(allItems).slice(0, limit);

  return {
    items: sorted,
    // A non-empty list needs no sentence — the same rule `resolveEmptyMessage` applies on the
    // other endpoint. Which sentence an *empty* one gets is `resolveTodayMessage`'s table.
    message: sorted.length > 0 ? null : resolveTodayMessage(resolutions),
    noScheduleNote: null,
    totalEstimatedMinutes: sorted.reduce((total, item) => total + item.estimatedMinutes, 0),
  };
}

export interface ReviewQueueItemUpdate {
  id: string;
  conceptId: string;
  planId: string;
  status: ReviewItemStatus;
}

/** Kết quả của "hoãn đến mai" (#233): thêm mốc mới để người gọi thấy ngày do server tự chốt. */
export interface ReviewQueueItemSnooze extends ReviewQueueItemUpdate {
  scheduledFor: Date | null;
}

/**
 * Tra một hàng hàng-đợi và kiểm quyền sở hữu — dùng chung cho cả hai thao tác PATCH.
 *
 * Chung một hàm chứ không chép lại: item không tồn tại và item của user khác phải **không phân
 * biệt được** từ bên ngoài (cùng 404, không rò rỉ sự tồn tại của dữ liệu người khác), và hai
 * nhánh cùng endpoint mà lệch nhau ở đúng chỗ này là cách một lỗ hổng lọt qua review.
 */
async function findOwnedQueueItem(
  itemId: string,
  userId: string
): Promise<{ id: string; conceptId: string; planId: string }> {
  const item = await prisma.reviewQueueItem.findUnique({
    where: { id: itemId },
    select: { id: true, conceptId: true, planId: true, plan: { select: { userId: true } } },
  });

  if (!item || item.plan.userId !== userId) {
    throw new AppError('Review queue item not found', 404, 'NOT_FOUND');
  }

  return { id: item.id, conceptId: item.conceptId, planId: item.planId };
}

/**
 * PATCH /review-queue/:itemId với `{ snooze: true }` — "Hoãn đến mai" (DB-09 / #233).
 *
 * Khác hẳn `'skipped'`: mục **vẫn nằm trên lịch**, `status` không đổi. Thứ duy nhất đổi là
 * `scheduledFor`, đẩy sang 00:00 ngày mai giờ VN — đủ để mục rời `GET /review-queue/today`
 * (lọc `scheduledFor <= now`) cho hết hôm nay và tự quay lại vào ngày mai, mà không biến mất
 * khỏi hàng đợi của kế hoạch ở màn #225. "Hôm nay bận" không phải là "không cần ôn nữa".
 *
 * Cùng phạm vi cụm-khái-niệm như `updateReviewQueueItemStatus()` và vì cùng một lý do (#232):
 * màn hình gộp mọi hàng của một khái niệm thành MỘT mục, nên hoãn đúng một hàng sẽ để khái niệm
 * đó quay lại ngay lần đọc sau từ một hàng anh em — nút bấm trông như không làm gì.
 *
 * Hai bộ lọc thu hẹp phạm vi, cả hai đều cố ý:
 * - `scheduledFor <= now` — chỉ dời phần **đang đến hạn**. Hàng đã được xếp cho một ngày trong
 *   tương lai mà bị "hoãn đến mai" thì hoá ra là **kéo sớm lên**, ngược nghĩa nút bấm.
 * - `ON_SCHEDULE_WHERE` — không đụng hàng đã bị gỡ (`skipped`). Ngày đến hạn của chúng là thứ
 *   nút "Đưa lại vào lịch" (#225) dựa vào; viết đè lên đây là lặng lẽ đổi lịch của một khái
 *   niệm mà sinh viên còn chưa đưa trở lại.
 *
 * `scheduledFor` trả về được **đọc lại từ DB** sau khi ghi, không phải mốc vừa tính: gọi thẳng
 * API cho một hàng không đến hạn là hợp lệ và sẽ không dời gì cả, response phải nói đúng sự
 * thật đó thay vì báo một ngày mai không có ai ghi.
 */
export async function snoozeReviewQueueItem(
  itemId: string,
  userId: string,
  now: Date
): Promise<ReviewQueueItemSnooze> {
  const item = await findOwnedQueueItem(itemId, userId);

  await prisma.reviewQueueItem.updateMany({
    where: {
      planId: item.planId,
      conceptId: item.conceptId,
      scheduledFor: { lte: now },
      ...ON_SCHEDULE_WHERE,
    },
    data: { scheduledFor: getVnTomorrowStartUtc(now) },
  });

  const updated = await prisma.reviewQueueItem.findUniqueOrThrow({
    where: { id: item.id },
    select: { status: true, scheduledFor: true },
  });

  return { ...item, status: updated.status, scheduledFor: updated.scheduledFor };
}

/**
 * PATCH /review-queue/:itemId — remove an item from the schedule (`'skipped'`) or put it back
 * (`'pending'`). Since #224 this is not an approval gate: traceback already applied the concept
 * to the schedule when the session was graded, so the only thing left for the student to do is
 * change their mind, in either direction, at any time.
 *
 * Skipped rows stay in the DB (never deleted — #124's own ràng buộc: what a student chose to
 * remove is worth keeping) and `GET /review-queue?includeSkipped=true` reads them back, which is
 * what makes the `'pending'` direction reachable at all.
 *
 * Ownership is checked through `plan.userId`; an item that is missing and an item belonging to
 * someone else are reported identically (404), same as the GET endpoints.
 *
 * #232: the status is applied to **every** row of that concept in that plan, not just the row
 * whose id was sent. Each graded session adds another row for the same concept, and since #232
 * the queue folds them into the one item the student actually sees — so moving a single row
 * would let the concept the student just removed come straight back on the next read, with the
 * button looking like it did nothing. One concept on the screen, one concept moved.
 */
export async function updateReviewQueueItemStatus(
  itemId: string,
  userId: string,
  status: 'skipped' | 'pending'
): Promise<ReviewQueueItemUpdate> {
  const item = await findOwnedQueueItem(itemId, userId);

  await prisma.reviewQueueItem.updateMany({
    where: { planId: item.planId, conceptId: item.conceptId },
    data: { status },
  });

  return { ...item, status };
}

/** Kết quả của "dời ngày" (#403): cùng hình dạng với `ReviewQueueItemSnooze`, mốc do NGƯỜI DÙNG chọn. */
export interface ReviewQueueItemReschedule extends ReviewQueueItemUpdate {
  scheduledFor: Date | null;
}

/**
 * PATCH /review-queue/:itemId với `{ scheduledFor: 'YYYY-MM-DD' }` — "dời ngày theo cụm" trên màn
 * Lịch của epic #400 (#403).
 *
 * Không dựng bảng override riêng (xem ghi chú của #403): ghi thẳng `scheduledFor` là **một nguồn
 * sự thật** cho mọi đường đọc (`/today`, hàng đợi, lịch) — không cần `resolvePlanQueue` biết thêm
 * gì để hai màn hình khỏi bất đồng về "đến hạn khi nào".
 *
 * `updateMany` theo CỤM `(planId, conceptId)`, cùng cơ chế `snoozeReviewQueueItem`: một khái niệm
 * gộp nhiều hàng thành một mục trên màn hình (#232), nên dời một hàng để hàng anh em kéo mục đó
 * về ngày cũ ở lần đọc sau — nút bấm trông như không làm gì.
 *
 * 🔴 Guard: khi cụm đang được MỘT hàng traceback tier-0 đại diện (`pickRepresentative` +
 * `isWeakTraceback`, cùng luật đại diện #400 dùng cho màn Lịch), từ chối dời — nền tảng còn yếu
 * thì lịch phải do hệ thống giữ, không phải người dùng kéo đi đâu tuỳ ý. Guard đọc CỤM đã lọc
 * `ON_SCHEDULE_WHERE`, đúng tập hợp mà `getReviewSchedule` fold để chọn đại diện, nên "mục đang
 * đại diện" ở đây và trên màn Lịch không bao giờ lệch nhau.
 *
 * Ngày quá khứ (theo lịch VN) bị từ chối bằng `VALIDATION_ERROR` đã có sẵn — engine không bao giờ
 * xếp lịch vào quá khứ, và mã này không cần mapper client riêng (đã có case ở nơi khác).
 *
 * `scheduledFor` trả về được **đọc lại từ DB**, cùng lý do `snoozeReviewQueueItem`: một lệnh hợp
 * lệ trên hàng không thuộc cụm (đã lọc `ON_SCHEDULE_WHERE`) sẽ không dời gì cả.
 */
export async function setReviewQueueItemScheduledFor(
  itemId: string,
  userId: string,
  dateKey: string,
  now: Date
): Promise<ReviewQueueItemReschedule> {
  const item = await findOwnedQueueItem(itemId, userId);

  if (dateKey < toVnDateKey(now)) {
    throw new AppError(
      'scheduledFor không được là một ngày trong quá khứ',
      400,
      'VALIDATION_ERROR'
    );
  }

  const clusterRows = await prisma.reviewQueueItem.findMany({
    where: { planId: item.planId, conceptId: item.conceptId, ...ON_SCHEDULE_WHERE },
    select: {
      reason: true,
      createdAt: true,
      sourceConceptId: true,
      concept: { select: { masteryScore: true } },
    },
  });
  const representative = pickRepresentative(clusterRows);

  if (representative && isWeakTraceback(representative)) {
    const sourceConcept = representative.sourceConceptId
      ? await prisma.concept.findUnique({
          where: { id: representative.sourceConceptId },
          select: { name: true },
        })
      : null;

    throw new AppError(
      `Không thể dời ngày: ${buildReasonText('traceback', {
        masteryScore: null,
        sourceConceptName: sourceConcept?.name ?? null,
      })}, nên lịch của mục này do hệ thống giữ nguyên.`,
      400,
      'TRACEBACK_REPRESENTATIVE_LOCKED'
    );
  }

  await prisma.reviewQueueItem.updateMany({
    where: { planId: item.planId, conceptId: item.conceptId, ...ON_SCHEDULE_WHERE },
    data: { scheduledFor: getVnDateInstant(dateKey) },
  });

  const updated = await prisma.reviewQueueItem.findUniqueOrThrow({
    where: { id: item.id },
    select: { status: true, scheduledFor: true },
  });

  return { ...item, status: updated.status, scheduledFor: updated.scheduledFor };
}
