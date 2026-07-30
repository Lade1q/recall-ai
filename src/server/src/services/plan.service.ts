import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { CreatePlanInput } from '../schemas/plan.schema';
import {
  CreatePlanResponse,
  PlanItemResponse,
  PlanDetailResponse,
  DocumentMeta,
} from '../types/plan.types';

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
 * Fetches all study plans for a given user.
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
      _count: {
        select: { concepts: true },
      },
    },
  });

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    deadline: p.deadline,
    status: p.status,
    conceptCount: p._count.concepts,
    createdAt: p.createdAt,
  }));
}

/**
 * Fetches details of a specific study plan by ID with ownership verification.
 */
export async function getPlanById(planId: string, userId: string): Promise<PlanDetailResponse> {
  // AnalysisJob has no FK relation to StudyPlan (async draft flow), so its status
  // is fetched separately — latest job by createdAt, since SP-05 re-analyze can add more.
  const [plan, latestJob] = await Promise.all([
    prisma.studyPlan.findUnique({
      where: { id: planId },
      include: {
        concepts: {
          select: {
            id: true,
            name: true,
            difficulty: true,
            masteryScore: true,
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
      },
    }),
    prisma.analysisJob.findFirst({
      where: { planDraftId: planId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    }),
  ]);

  if (!plan) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  if (plan.userId !== userId) {
    throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
  }

  return {
    id: plan.id,
    userId: plan.userId,
    name: plan.name,
    deadline: plan.deadline,
    status: plan.status,
    analysisStatus: latestJob?.status ?? null,
    dagAutoFixed: plan.dagAutoFixed,
    tracebackEnabled: plan.tracebackEnabled,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    concepts: plan.concepts,
    edges: plan.conceptEdges,
  };
}
