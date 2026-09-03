import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { parseConceptQueue } from '../utils/interview-queue';
import { sessionMasteryScore, conceptMasteryForSession } from '../utils/mastery';
import type {
  InterviewSessionListItem,
  InterviewSessionListConceptDelta,
} from '../types/interview.types';
import type { QuestionMode } from '../schemas/ai-interview.schema';

/**
 * `GET /interviews` (SPEC_DB-03). Read-only: no `mastery_score` is written, no AI is called —
 * this only re-derives numbers `session-summary.service.ts`'s `sessionMasteryScore` already
 * knows how to compute, now across many sessions instead of one.
 */

export interface ListInterviewsParams {
  limit?: number;
  offset?: number;
  planId?: string;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Ownership is reported as 404, not 403 (#115), same rule `loadSession`/`getReviewQueueForPlan`
 * already use — a `planId` belonging to someone else must look identical to one that does not
 * exist.
 */
async function assertPlanOwnership(planId: string, userId: string): Promise<void> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true },
  });
  if (!plan || plan.userId !== userId) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }
}

export async function listInterviews(
  userId: string,
  { limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET, planId }: ListInterviewsParams
): Promise<InterviewSessionListItem[]> {
  if (planId) {
    await assertPlanOwnership(planId, userId);
  }

  const sessions = await prisma.interviewSession.findMany({
    where: { userId, ...(planId ? { planId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      status: true,
      fallbackMode: true,
      conceptQueue: true,
      plan: { select: { id: true, name: true } },
    },
  });

  if (sessions.length === 0) return [];

  const sessionsWithQueue = sessions.map((session) => ({
    ...session,
    queue: parseConceptQueue(session.conceptQueue),
  }));
  const conceptIds = [...new Set(sessionsWithQueue.flatMap((session) => session.queue))];

  const [concepts, turns] = await Promise.all([
    prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true },
    }),
    // Every turn of the user's for these concepts, across their WHOLE history — not just this
    // page — because `masteryBefore` may point at a session several pages back.
    prisma.interviewTurn.findMany({
      where: { conceptId: { in: conceptIds }, session: { userId } },
      select: {
        sessionId: true,
        conceptId: true,
        turnIndex: true,
        score: true,
        mode: true,
        session: { select: { startedAt: true } },
      },
    }),
  ]);
  const conceptNameById = new Map(concepts.map((concept) => [concept.id, concept.name]));

  // conceptId -> sessionId -> that session's own turns for the concept.
  const turnsByConceptSession = new Map<
    string,
    Map<
      string,
      {
        startedAt: Date;
        turns: { turnIndex: number; score: number | null; mode: QuestionMode | null }[];
      }
    >
  >();
  for (const turn of turns) {
    let bySession = turnsByConceptSession.get(turn.conceptId);
    if (!bySession) {
      bySession = new Map();
      turnsByConceptSession.set(turn.conceptId, bySession);
    }
    let entry = bySession.get(turn.sessionId);
    if (!entry) {
      entry = { startedAt: turn.session.startedAt, turns: [] };
      bySession.set(turn.sessionId, entry);
    }
    entry.turns.push({ turnIndex: turn.turnIndex, score: turn.score, mode: turn.mode });
  }

  // conceptId -> every scored session's {startedAt, masteryAfter}, the timeline
  // `conceptMasteryForSession` reads "before" out of.
  const timelineByConcept = new Map<string, { startedAt: number; masteryAfter: number | null }[]>();
  for (const [conceptId, bySession] of turnsByConceptSession) {
    timelineByConcept.set(
      conceptId,
      [...bySession.values()].map((entry) => ({
        startedAt: entry.startedAt.getTime(),
        masteryAfter: sessionMasteryScore(entry.turns),
      }))
    );
  }

  return sessionsWithQueue.map((session) => {
    const concepts: InterviewSessionListConceptDelta[] = [];
    for (const conceptId of session.queue) {
      const name = conceptNameById.get(conceptId);
      // Concept row gone since (re-analysis, SP-05) — nothing left to report for it.
      if (!name) continue;

      const targetTurns = turnsByConceptSession.get(conceptId)?.get(session.id)?.turns ?? [];
      const priorPoints = timelineByConcept.get(conceptId) ?? [];
      const { masteryBefore, masteryAfter, isFirstAssessment } = conceptMasteryForSession(
        targetTurns,
        session.startedAt.getTime(),
        priorPoints
      );
      concepts.push({ conceptId, name, masteryBefore, masteryAfter, isFirstAssessment });
    }

    const scored = concepts
      .map((concept) => concept.masteryAfter)
      .filter((score): score is number => score !== null);
    const averageMasteryScore =
      scored.length > 0
        ? round2(scored.reduce((sum, score) => sum + score, 0) / scored.length)
        : null;

    return {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      fallbackMode: session.fallbackMode,
      plan: session.plan,
      conceptTotal: session.queue.length,
      averageMasteryScore,
      concepts,
    };
  });
}
