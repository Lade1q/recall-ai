import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { CreatePlanInput, UpdatePlanStatusInput } from '../schemas/plan.schema';
import { createStorageService } from './storage.service';
import { STALE_JOB_THRESHOLD_MS } from './analysis.service';
import { ON_SCHEDULE_WHERE } from './scheduling.service';
import { clearQuestionCacheForPlan } from './question-cache.service';
import { summariseMasteryDistribution } from '../utils/mastery';
import {
  CreatePlanResponse,
  PlanItemResponse,
  PlanDetailResponse,
  RetryPlanResponse,
  ReanalyzePlanResponse,
  ChangeDocumentResponse,
  UpdatePlanStatusResponse,
  DocumentMeta,
} from '../types/plan.types';

const storageService = createStorageService();

/**
 * Creates a new StudyPlan (draft), its source Document, and the pending AnalysisJob
 * atomically. The Document is the durable home for the uploaded file (it outlives the
 * transient AnalysisJob); concept_sources are anchored to it later during analysis.
 */
export async function createPlanInDb(
  userId: string,
  planId: string,
  input: CreatePlanInput,
  document: DocumentMeta
): Promise<CreatePlanResponse> {
  const dateStr = input.deadline.includes('T') ? input.deadline.split('T')[0] : input.deadline;
  const deadlineDate = new Date(`${dateStr}T23:59:59.999Z`);

  const result = await prisma.$transaction(async (tx) => {
    const plan = await tx.studyPlan.create({
      data: {
        id: planId,
        userId,
        name: input.name,
        deadline: deadlineDate,
        status: 'draft',
      },
    });

    await tx.document.create({
      data: {
        planId: plan.id,
        filename: document.filename,
        fileKey: document.fileKey,
        kind: document.kind,
        pageCount: document.pageCount,
        byteSize: document.byteSize,
      },
    });

    await tx.analysisJob.create({
      data: {
        planDraftId: plan.id,
        fileKey: document.fileKey,
        status: 'pending',
      },
    });

    return plan;
  });

  return {
    id: result.id,
    name: result.name,
    deadline: result.deadline,
    status: result.status,
  };
}

/**
 * Fetches all study plans for a given user, with everything a plan card on SP-03 renders:
 * the mastery distribution bar, and — for a plan still being analysed — the status of its
 * job and the document it is chewing through.
 *
 * Three queries, not one per plan. Mastery scores are pulled inline (a plan holds tens of
 * concepts, and banding them needs the pure classifier rather than SQL), while AnalysisJob,
 * which has no FK to StudyPlan by design, is fetched for every plan id at once and reduced
 * to the latest job per plan here. The review-queue count is one grouped query for the whole
 * grid, for the same reason: a card's footer must not cost a request each (#232).
 */
export async function getUserPlans(userId: string): Promise<PlanItemResponse[]> {
  const plans = await prisma.studyPlan.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      deadline: true,
      status: true,
      createdAt: true,
      // Deprecated concepts (SP-05 re-analyze, #170) are tombstones for history, not
      // material to review — a card counting them would tell a student "4 khái niệm"
      // for a plan whose document currently only covers 3.
      concepts: { where: { status: 'active' }, select: { masteryScore: true } },
      documents: {
        select: { filename: true, pageCount: true, kind: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (plans.length === 0) {
    return [];
  }

  const planIds = plans.map((p) => p.id);

  const [jobs, queueGroups] = await Promise.all([
    // Ordered newest-first, so the first row seen for a plan id is its latest job (same
    // "latest by createdAt" rule as getPlanById — SP-05 re-analyze can add more).
    prisma.analysisJob.findMany({
      where: { planDraftId: { in: planIds } },
      orderBy: { createdAt: 'desc' },
      select: { planDraftId: true, status: true, createdAt: true, errorMessage: true },
    }),
    // One group per (plan, concept) still on the schedule — grouping by the pair is what makes
    // this a count of concepts rather than of rows, since a concept collects one row per session
    // that graded it (#232). Counting the groups per plan is then plain arithmetic.
    prisma.reviewQueueItem.groupBy({
      by: ['planId', 'conceptId'],
      where: { planId: { in: planIds }, ...ON_SCHEDULE_WHERE },
    }),
  ]);

  const latestJobByPlan = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    if (job.planDraftId !== null && !latestJobByPlan.has(job.planDraftId)) {
      latestJobByPlan.set(job.planDraftId, job);
    }
  }

  const queueCountByPlan = new Map<string, number>();
  for (const group of queueGroups) {
    queueCountByPlan.set(group.planId, (queueCountByPlan.get(group.planId) ?? 0) + 1);
  }

  return plans.map((p) => {
    const latestJob = latestJobByPlan.get(p.id);
    const document = p.documents[0];

    return {
      id: p.id,
      name: p.name,
      deadline: p.deadline,
      status: p.status,
      conceptCount: p.concepts.length,
      masteryDistribution: summariseMasteryDistribution(p.concepts.map((c) => c.masteryScore)),
      reviewQueueConceptCount: queueCountByPlan.get(p.id) ?? 0,
      analysisStatus: latestJob?.status ?? null,
      analysisStartedAt: latestJob?.createdAt ?? null,
      analysisErrorMessage: latestJob?.errorMessage ?? null,
      document: document
        ? { filename: document.filename, pageCount: document.pageCount, kind: document.kind }
        : null,
      createdAt: p.createdAt,
    };
  });
}

/**
 * Fetches details of a specific study plan by ID with ownership verification.
 */
export async function getPlanById(planId: string, userId: string): Promise<PlanDetailResponse> {
  // AnalysisJob has no FK relation to StudyPlan (async draft flow), so its status
  // is fetched separately — latest job by createdAt, since SP-05 re-analyze can add more.
  const [plan, latestJob, remediatingItems] = await Promise.all([
    prisma.studyPlan.findUnique({
      where: { id: planId },
      include: {
        // Deprecated concepts (SP-05 re-analyze, #170) are kept in the DB as tombstones —
        // a revived one gets its old mastery back — but they are not part of the plan a
        // student currently studies, so the graph they land on must not show them.
        concepts: {
          where: { status: 'active' },
          select: {
            id: true,
            name: true,
            difficulty: true,
            masteryScore: true,
            lastTestedAt: true,
            source: true,
            status: true,
            createdAt: true,
          },
        },
        conceptEdges: {
          select: {
            id: true,
            fromConceptId: true,
            toConceptId: true,
          },
        },
        // Powers the SP-06 progress panel's "N trang" and filename (Issue #186) — same
        // "latest document" pattern as getUserPlans.
        documents: {
          select: { filename: true, pageCount: true, kind: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.analysisJob.findFirst({
      where: { planDraftId: planId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, phase: true, createdAt: true, errorMessage: true },
    }),
    // "Đang ôn lại" for the DB-05 filter chip and the node outline (Issue #168). Only items
    // still on the schedule: one the student removed, or has finished, is history, and a node
    // still pulsing for it would be telling them to do something they no longer have to.
    // Same predicate as the review queue itself — see `OFF_SCHEDULE_STATUSES` (#224).
    prisma.reviewQueueItem.findMany({
      where: { planId, ...ON_SCHEDULE_WHERE },
      select: { conceptId: true },
      distinct: ['conceptId'],
    }),
  ]);

  if (!plan) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.userId !== userId) {
    throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
  }

  const document = plan.documents[0];
  const remediatingConceptIds = new Set(remediatingItems.map((item) => item.conceptId));

  return {
    id: plan.id,
    userId: plan.userId,
    name: plan.name,
    deadline: plan.deadline,
    status: plan.status,
    analysisStatus: latestJob?.status ?? null,
    analysisPhase: latestJob?.phase ?? null,
    analysisStartedAt: latestJob?.createdAt ?? null,
    analysisErrorMessage: latestJob?.errorMessage ?? null,
    document: document
      ? { filename: document.filename, pageCount: document.pageCount, kind: document.kind }
      : null,
    dagAutoFixed: plan.dagAutoFixed,
    tracebackEnabled: plan.tracebackEnabled,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    concepts: plan.concepts.map((concept) => ({
      ...concept,
      isRemediating: remediatingConceptIds.has(concept.id),
    })),
    edges: plan.conceptEdges,
  };
}

/**
 * Archives a plan or pulls it back into circulation (SP-04, Issue #171).
 *
 * A `draft` plan is refused in both directions, and that is what keeps the SP-01 verification
 * step mandatory (Issue #265). This function is the only writer of `archived` — the schema
 * accepts nothing but `active`/`archived`, `draft` is written once at creation, and `active`
 * only by `shouldActivate` — so `archived` is reachable only from `active`:
 *
 *   draft → active (only via PUT /plans/:id/graph {confirm:true}) | deleted
 *   active → archived        archived → active
 *
 * Allowing a draft to be archived would open a second road to `active` — archive, then
 * "Bỏ lưu trữ" — that never passes through the confirmation. A user who walks away from an
 * unconfirmed draft is not stuck: `deletePlan` has no status guard, and an unconfirmed draft
 * has nothing worth keeping (no mastery, no sessions, no history) — its parking spot is the
 * "Chưa xác nhận" tab.
 *
 * Setting the status a plan already has is a no-op that still returns 200, so a double-click
 * on "Lưu trữ" does not surface an error.
 */
export async function updatePlanStatus(
  planId: string,
  userId: string,
  status: UpdatePlanStatusInput['status']
): Promise<UpdatePlanStatusResponse> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true, status: true },
  });

  if (!plan) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.userId !== userId) {
    throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
  }

  if (plan.status === 'draft') {
    throw new AppError(
      status === 'active'
        ? 'A draft plan becomes active by confirming its concept graph'
        : 'An unconfirmed plan cannot be archived — confirm its concept graph, or delete it',
      409,
      'STATUS_TRANSITION_NOT_ALLOWED'
    );
  }

  const updated = await prisma.studyPlan.update({
    where: { id: planId },
    data: { status },
    select: { id: true, name: true, deadline: true, status: true, updatedAt: true },
  });

  return updated;
}

/**
 * Creates a new AnalysisJob for a failed plan, reusing the original fileKey
 * so the user does not need to re-upload. Validates ownership and that the
 * latest job is in `failed` state before proceeding (Issue #106) — a stuck
 * `pending`/`processing` job past STALE_JOB_THRESHOLD_MS is treated the same
 * as `failed` so it doesn't block retry forever (Issue #178).
 *
 * Uses SELECT FOR UPDATE to serialize concurrent retry requests on the same
 * plan — prevents two pending jobs from being created simultaneously.
 */
export async function retryPlanAnalysis(
  planId: string,
  userId: string
): Promise<RetryPlanResponse> {
  return prisma.$transaction(async (tx) => {
    // Lock the plan row — a second concurrent request will block here
    // until this transaction commits or rolls back.
    await tx.$queryRaw`SELECT id FROM study_plans WHERE id = ${planId}::uuid FOR UPDATE`;

    // 1. Fetch plan — reuse the same query pattern as getPlanById
    const plan = await tx.studyPlan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, name: true, deadline: true, status: true },
    });

    if (!plan) {
      throw new AppError('Study plan not found', 404, 'NOT_FOUND');
    }

    if (plan.userId !== userId) {
      throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
    }

    // Guard: only draft plans can be retried — active plans already have concepts,
    // and processAnalysisJob only INSERTs (no DELETE), causing duplicates.
    if (plan.status !== 'draft') {
      throw new AppError('Retry is only allowed for draft plans', 409, 'RETRY_NOT_ALLOWED');
    }

    // 2. Find latest AnalysisJob — must be `failed` (or stale `pending`/`processing`,
    // Issue #178) to allow retry.
    const latestJob = await tx.analysisJob.findFirst({
      where: { planDraftId: planId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, fileKey: true, createdAt: true },
    });

    if (!latestJob) {
      throw new AppError('No analysis job found for this plan', 409, 'RETRY_NOT_ALLOWED');
    }

    if (latestJob.status === 'pending' || latestJob.status === 'processing') {
      const isStale = Date.now() - latestJob.createdAt.getTime() > STALE_JOB_THRESHOLD_MS;
      if (!isStale) {
        throw new AppError('An analysis is already in progress', 409, 'RETRY_NOT_ALLOWED');
      }
      // Stuck past the threshold — release it so retry is not blocked forever (#178).
      await tx.analysisJob.update({
        where: { id: latestJob.id },
        data: { status: 'failed', completedAt: new Date() },
      });
    } else if (latestJob.status !== 'failed') {
      throw new AppError('Plan analysis is not in a failed state', 409, 'RETRY_NOT_ALLOWED');
    }

    if (!latestJob.fileKey) {
      throw new AppError('Original file key is missing, cannot retry', 409, 'RETRY_NOT_ALLOWED');
    }

    // 3. Create new job within the same transaction — guaranteed no duplicate
    await tx.analysisJob.create({
      data: {
        planDraftId: planId,
        fileKey: latestJob.fileKey,
        status: 'pending',
      },
    });

    return {
      id: plan.id,
      name: plan.name,
      deadline: plan.deadline,
      status: plan.status,
      analysisStatus: 'pending' as const,
    };
  });
}

/**
 * Swaps the source file of a `draft` plan whose analysis failed and starts a fresh job
 * against it (Issue #187) — the mockup's "Đổi tài liệu khác" alt flow, for when the
 * original file itself was the problem (e.g. an encrypted PDF Gemini can't read), not
 * something a same-file retry (#106) can fix.
 *
 * Direction (A) from the issue: overwrites the plan's existing Document row in place
 * rather than inserting a new one. `processAnalysisJob` anchors `concept_sources` to
 * `tx.document.findFirst({ where: { planId }, orderBy: { createdAt: 'asc' } })` — overwriting
 * keeps that query correct for the new file without touching analysis.service.ts.
 *
 * Guards mirror retryPlanAnalysis: same `draft` + `failed`/stale-job checks, same
 * `SELECT ... FOR UPDATE` serialization. The old file is deleted from storage best-effort
 * after the transaction commits — same "DB is source of truth" policy as deletePlan.
 */
export async function changePlanDocument(
  planId: string,
  userId: string,
  document: DocumentMeta
): Promise<ChangeDocumentResponse> {
  const { response, oldFileKey } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM study_plans WHERE id = ${planId}::uuid FOR UPDATE`;

    const plan = await tx.studyPlan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, name: true, deadline: true, status: true },
    });

    if (!plan) {
      throw new AppError('Study plan not found', 404, 'NOT_FOUND');
    }

    if (plan.userId !== userId) {
      throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
    }

    // Guard: only a draft plan can have its document swapped — an active plan already has
    // concepts and uses reanalyze (#170) instead, which reuses the existing file on purpose.
    if (plan.status !== 'draft') {
      throw new AppError(
        'Changing the document is only allowed for draft plans',
        409,
        'DOCUMENT_CHANGE_NOT_ALLOWED'
      );
    }

    const latestJob = await tx.analysisJob.findFirst({
      where: { planDraftId: planId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });

    if (!latestJob) {
      throw new AppError('No analysis job found for this plan', 409, 'DOCUMENT_CHANGE_NOT_ALLOWED');
    }

    if (latestJob.status === 'pending' || latestJob.status === 'processing') {
      const isStale = Date.now() - latestJob.createdAt.getTime() > STALE_JOB_THRESHOLD_MS;
      if (!isStale) {
        throw new AppError(
          'An analysis is already in progress',
          409,
          'DOCUMENT_CHANGE_NOT_ALLOWED'
        );
      }
      // Stuck past the threshold — release it so this isn't blocked forever (same as #178).
      await tx.analysisJob.update({
        where: { id: latestJob.id },
        data: { status: 'failed', completedAt: new Date() },
      });
    } else if (latestJob.status !== 'failed') {
      throw new AppError(
        'Plan analysis is not in a failed state',
        409,
        'DOCUMENT_CHANGE_NOT_ALLOWED'
      );
    }

    const existingDocument = await tx.document.findFirst({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileKey: true },
    });

    let oldFileKey: string | null = null;
    if (existingDocument) {
      oldFileKey = existingDocument.fileKey;
      await tx.document.update({
        where: { id: existingDocument.id },
        data: {
          filename: document.filename,
          fileKey: document.fileKey,
          kind: document.kind,
          pageCount: document.pageCount,
          byteSize: document.byteSize,
        },
      });
    } else {
      // Defensive fallback — createPlanInDb always creates a Document alongside a draft
      // plan, so a plan reaching this guard with none should not happen in practice.
      await tx.document.create({
        data: {
          planId,
          filename: document.filename,
          fileKey: document.fileKey,
          kind: document.kind,
          pageCount: document.pageCount,
          byteSize: document.byteSize,
        },
      });
    }

    // Issue #216: bước merge tiếp theo giữ nguyên id concept, nên nếu không xoá, câu hỏi cache
    // sinh từ tài liệu cũ sẽ sống sót qua bước kiểm tra idempotent của pregenerateForPlan. Xoá
    // trước khi tạo job mới để không ai thấy trạng thái job đã trỏ tới tài liệu mới nhưng cache
    // vẫn còn mô tả tài liệu cũ.
    await clearQuestionCacheForPlan(tx, planId);

    await tx.analysisJob.create({
      data: { planDraftId: planId, fileKey: document.fileKey, status: 'pending' },
    });

    return {
      response: {
        id: plan.id,
        name: plan.name,
        deadline: plan.deadline,
        status: plan.status,
        analysisStatus: 'pending' as const,
      },
      oldFileKey,
    };
  });

  if (oldFileKey) {
    try {
      await storageService.delete(oldFileKey);
    } catch (err) {
      console.warn(
        `[changePlanDocument] Failed to cleanup old file ${oldFileKey} for plan ${planId}:`,
        err
      );
    }
  }

  return response;
}

/**
 * Queues a fresh analysis of an already-analysed plan (SP-05, Issue #170).
 *
 * Distinct from `retryPlanAnalysis` (#106), which rescues a `draft` whose only job failed.
 * Here the plan starts `active`, but this call drops it back to `draft` — same as SP-01's
 * first analysis — so the merged result goes through the same confirmation gate #265 built
 * for a first-time graph (`UC-Overview.md`: SP-05 `<<include>>` SP-02 "Review đồ thị sau
 * re-analyze"). `processAnalysisJob` merges the result over the existing graph rather than
 * replacing it, so mastery scores survive (see `planConceptMerge`); the plan only leaves
 * `draft` again once the user confirms via `PUT /plans/:id/graph {confirm:true}`.
 *
 * The file is taken from the plan's newest Document — the durable home for the upload —
 * rather than from the previous job, so nothing needs re-uploading.
 *
 * Uses SELECT FOR UPDATE for the same reason retry does: two clicks must not produce two
 * pending jobs racing to rewrite the same graph.
 */
export async function reanalyzePlan(
  planId: string,
  userId: string
): Promise<ReanalyzePlanResponse> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM study_plans WHERE id = ${planId}::uuid FOR UPDATE`;

    const plan = await tx.studyPlan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, name: true, deadline: true, status: true },
    });

    if (!plan) {
      throw new AppError('Study plan not found', 404, 'NOT_FOUND');
    }

    if (plan.userId !== userId) {
      throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
    }

    // A draft has nothing to re-analyse — its first analysis either never finished (retry,
    // #106) or never ran. An archived plan is restored first; re-analysing one the user has
    // retired would burn an AI call on material they said they were done with.
    if (plan.status !== 'active') {
      throw new AppError('Only an active plan can be re-analysed', 409, 'REANALYZE_NOT_ALLOWED');
    }

    // A job wedged in `pending`/`processing` (server restart, Gemini timeout) would
    // otherwise block re-analysis forever, same failure shape retryPlanAnalysis has —
    // release it past the same threshold rather than making the user wait for the
    // background sweep in cleanupStaleJobs (#178).
    const latestJob = await tx.analysisJob.findFirst({
      where: { planDraftId: planId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });

    if (latestJob?.status === 'pending' || latestJob?.status === 'processing') {
      const isStale = Date.now() - latestJob.createdAt.getTime() > STALE_JOB_THRESHOLD_MS;
      if (!isStale) {
        throw new AppError('An analysis is already in progress', 409, 'REANALYZE_NOT_ALLOWED');
      }
      await tx.analysisJob.update({
        where: { id: latestJob.id },
        data: { status: 'failed', completedAt: new Date() },
      });
    }

    const document = await tx.document.findFirst({
      where: { planId },
      orderBy: { createdAt: 'desc' },
      select: { fileKey: true },
    });

    if (!document) {
      throw new AppError(
        'This plan has no source document to re-analyse',
        409,
        'REANALYZE_NOT_ALLOWED'
      );
    }

    // Issue #216: cùng lý do như changePlanDocument — bước merge giữ nguyên id concept, nên
    // câu hỏi cache sinh từ trước lần reanalyze này sẽ sống sót qua bước kiểm tra idempotent
    // của pregenerateForPlan nếu không xoá. Lưu ý: nếu đúng lúc đó có phiên interview đang ở
    // chế độ fallback trên plan này, deck flashcard của phiên đó có thể bị rỗng giữa chừng.
    // Việc reanalyze đổi graph ngay dưới một phiên đang sống là rủi ro có sẵn từ trước; nhưng
    // deck rỗng *vì cache bị xoá* là hệ quả mới hẹp của chính thay đổi này (trước đây cache
    // không bị xoá nên vẫn phục vụ câu cũ — đúng là bug #216). Chấp nhận được: cửa sổ đồng thời
    // rất hẹp, phiên vốn đã ở chế độ degraded, deck rỗng rơi vào path `no_cached_questions` sẵn
    // có (kết thúc sớm có thông báo, không crash), và xoá là đánh đổi đúng cho C5 — thà rỗng
    // còn hơn phục vụ câu hỏi của tài liệu đã bị thay.
    await clearQuestionCacheForPlan(tx, planId);

    await tx.analysisJob.create({
      data: { planDraftId: planId, fileKey: document.fileKey, status: 'pending' },
    });

    // Drop back to `draft` now, not when the job finishes — mirrors plan creation, where the
    // plan is `draft` for the whole "job running + awaiting confirmation" span (#265).
    await tx.studyPlan.update({ where: { id: planId }, data: { status: 'draft' } });

    return {
      id: plan.id,
      name: plan.name,
      deadline: plan.deadline,
      status: 'draft' as const,
      analysisStatus: 'pending' as const,
    };
  });
}

/**
 * Permanently deletes a study plan and all associated data.
 *
 * Cascade (via Prisma onDelete: Cascade) handles:
 *   Concept, ConceptEdge, InterviewSession → InterviewTurn,
 *   FocusSession, ReviewQueueItem, Document → ConceptSourceRef, QuestionCache.
 *
 * Manual cleanup required:
 *   - AnalysisJob: no FK constraint to StudyPlan (async draft flow by design).
 *   - Storage files: physical files referenced by Document.fileKey.
 */
export async function deletePlan(planId: string, userId: string): Promise<void> {
  // 1. Fetch plan with document file keys for later storage cleanup
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: {
      userId: true,
      documents: { select: { fileKey: true } },
    },
  });

  if (!plan) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.userId !== userId) {
    throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
  }

  // 2. Collect file keys BEFORE deleting DB records (cascade will remove Document rows).
  //    We key cleanup off Document.fileKey (the durable home for the file); in every
  //    current flow each stored object also has a Document row, so a job that reuses the
  //    same fileKey points at the same object. A file referenced ONLY by an AnalysisJob
  //    (no matching Document) is not cleaned here — no such flow exists today.
  const fileKeys = plan.documents.map((d) => d.fileKey);

  // 3. Delete AnalysisJob (no FK → not cascade-deleted) + StudyPlan atomically.
  //    P2025 means the plan row was already removed between the fetch above and here
  //    (concurrent DELETE) — treat it as "not found" so the endpoint stays idempotent.
  try {
    await prisma.$transaction([
      prisma.analysisJob.deleteMany({ where: { planDraftId: planId } }),
      prisma.studyPlan.delete({ where: { id: planId } }),
    ]);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      throw new AppError('Study plan not found', 404, 'NOT_FOUND');
    }
    throw err;
  }

  // 4. Best-effort storage cleanup — DB is source of truth, don't fail the request
  const results = await Promise.allSettled(fileKeys.map((key) => storageService.delete(key)));

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(
      `[deletePlan] Failed to cleanup ${failures.length}/${fileKeys.length} storage files for plan ${planId}`
    );
  }
}
