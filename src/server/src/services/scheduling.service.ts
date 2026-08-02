import type { ReviewItemStatus, ReviewReason } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { daysUntil } from '../utils/mastery';

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

const COMPLETED_TODAY_MESSAGE = 'Bạn đã hoàn thành kế hoạch hôm nay 🎉';
const NO_ACTIVE_PLAN_MESSAGE = 'Bạn chưa có kế hoạch ôn tập nào đang hoạt động.';
const PLAN_NOT_ACTIVE_MESSAGE = 'Kế hoạch chưa ở trạng thái hoạt động.';
const NOT_TESTED_REASON_TEXT = 'Khái niệm chưa được kiểm tra';

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

export interface ReviewQueueItemResponse {
  /** `null` for a virtual A3-fallback suggestion — no real row exists yet, so nothing to PATCH. */
  id: string | null;
  conceptId: string;
  name: string;
  priority: number;
  reason: ReviewReason;
  reasonText: string;
  sourceConceptName: string | null;
  depth: number | null;
  masteryScore: number | null;
  status: ReviewItemStatus;
}

export interface ReviewQueueListResponse {
  items: ReviewQueueItemResponse[];
  message: string | null;
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
      return `Nền tảng của '${context.sourceConceptName ?? ''}' mà bạn còn yếu`;
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

interface ToResponseItemInput {
  id: string | null;
  conceptId: string;
  name: string;
  masteryScore: number | null;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptName: string | null;
  daysUntilDeadline: number | null;
}

function toResponseItem(input: ToResponseItemInput): ReviewQueueItemResponse {
  return {
    id: input.id,
    conceptId: input.conceptId,
    name: input.name,
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

/**
 * Audit A3 fallback: a plan that has never had an Interview session has no `ReviewQueueItem`
 * rows at all, which is a different empty state from "reviewed everything today" (UC-19 E1).
 * Suggests directly from the plan's concepts instead — untested first, then hardest first —
 * so a brand-new plan still has something reasonable to show without needing traceback.
 */
async function buildFallbackItems(
  plan: { id: string; deadline: Date | null },
  now: Date
): Promise<ReviewQueueItemResponse[]> {
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
      masteryScore: concept.masteryScore,
      reason: 'spaced_repetition',
      depth: null,
      status: 'pending',
      sourceConceptName: null,
      daysUntilDeadline,
    })
  );
}

interface PlanQueueResolution {
  items: ReviewQueueItemResponse[];
  /** `false` only when the plan has never had a `ReviewQueueItem` row (A3 fallback path). */
  hasHistory: boolean;
}

/**
 * The shared core behind both GET endpoints: same data, same scoring — they differ only in
 * `dueOnly`. `/review-queue` (I6.3's auto top-K concept picker) needs every pending item
 * regardless of `scheduledFor`, or a plan whose whole queue is spaced out into the future would
 * give the Interview flow nothing to pick from. `/review-queue/today` (I8.2's "Gợi ý hôm nay"
 * tab) needs only what's actually due.
 */
async function resolvePlanQueue(
  plan: { id: string; deadline: Date | null },
  now: Date,
  options: { dueOnly: boolean }
): Promise<PlanQueueResolution> {
  const totalCount = await prisma.reviewQueueItem.count({ where: { planId: plan.id } });

  if (totalCount === 0) {
    return { items: await buildFallbackItems(plan, now), hasHistory: false };
  }

  const rows = await prisma.reviewQueueItem.findMany({
    where: {
      planId: plan.id,
      status: 'pending',
      ...(options.dueOnly ? { scheduledFor: { lte: now } } : {}),
    },
    include: {
      concept: { select: { id: true, name: true, masteryScore: true } },
    },
  });

  const sourceConceptNames = await resolveSourceConceptNames(rows);
  const daysUntilDeadline = daysUntil(plan.deadline, now);

  const items = rows.map((row) =>
    toResponseItem({
      id: row.id,
      conceptId: row.conceptId,
      name: row.concept.name,
      masteryScore: row.concept.masteryScore,
      reason: row.reason,
      depth: row.depth,
      status: row.status,
      sourceConceptName: row.sourceConceptId
        ? (sourceConceptNames.get(row.sourceConceptId) ?? null)
        : null,
      daysUntilDeadline,
    })
  );

  return { items, hasHistory: true };
}

/** `[]` + "already done" only means anything once there was history to be done with. */
function resolveEmptyMessage(
  items: readonly ReviewQueueItemResponse[],
  hasHistory: boolean
): string | null {
  if (items.length > 0) {
    return null;
  }
  return hasHistory ? COMPLETED_TODAY_MESSAGE : null;
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
  limit: number = DEFAULT_QUEUE_LIMIT
): Promise<ReviewQueueListResponse> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true, deadline: true, status: true },
  });

  if (!plan || plan.userId !== userId) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.status !== 'active') {
    return { items: [], message: PLAN_NOT_ACTIVE_MESSAGE };
  }

  const now = new Date();
  const { items, hasHistory } = await resolvePlanQueue(plan, now, { dueOnly: false });
  const sorted = sortReviewItems(items).slice(0, limit);

  return { items: sorted, message: resolveEmptyMessage(sorted, hasHistory) };
}

/**
 * GET /review-queue/today?limit= — top-K across every `active` plan of the user, due now.
 * Backs I8.2's "Gợi ý hôm nay" tab and the dashboard nudge (UC-19).
 */
export async function getTodayReviewQueue(
  userId: string,
  limit: number = DEFAULT_TODAY_LIMIT
): Promise<ReviewQueueListResponse> {
  const activePlans = await prisma.studyPlan.findMany({
    where: { userId, status: 'active' },
    select: { id: true, deadline: true },
  });

  if (activePlans.length === 0) {
    return { items: [], message: NO_ACTIVE_PLAN_MESSAGE };
  }

  const now = new Date();
  const resolutions = await Promise.all(
    activePlans.map((plan) => resolvePlanQueue(plan, now, { dueOnly: true }))
  );

  const allItems = resolutions.flatMap((resolution) => resolution.items);
  const hasHistory = resolutions.some((resolution) => resolution.hasHistory);
  const sorted = sortReviewItems(allItems).slice(0, limit);

  return { items: sorted, message: resolveEmptyMessage(sorted, hasHistory) };
}

export interface ReviewQueueItemUpdate {
  id: string;
  conceptId: string;
  planId: string;
  status: ReviewItemStatus;
}

/**
 * PATCH /review-queue/:itemId — accept or skip a suggestion (I6.7). Skipped rows stay in the DB
 * with `status = 'skipped'` (never deleted — #124's own ràng buộc: what a student chose to skip
 * is worth keeping).
 */
export async function updateReviewQueueItemStatus(
  itemId: string,
  userId: string,
  status: 'accepted' | 'skipped'
): Promise<ReviewQueueItemUpdate> {
  const item = await prisma.reviewQueueItem.findUnique({
    where: { id: itemId },
    select: { id: true, plan: { select: { userId: true } } },
  });

  if (!item || item.plan.userId !== userId) {
    throw new AppError('Review queue item not found', 404, 'NOT_FOUND');
  }

  return prisma.reviewQueueItem.update({
    where: { id: itemId },
    data: { status },
    select: { id: true, conceptId: true, planId: true, status: true },
  });
}
