import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { buildConceptHistory } from '../utils/concept-history';
import { ON_SCHEDULE_WHERE } from './scheduling.service';
import { ConceptDetailResponse } from '../types/plan.types';

/**
 * Fetches everything the DB-06 detail panel shows for one concept (Issue #168): its own
 * mastery/remediation state, the document passages it was extracted from
 * (`concept_sources`), and its learning history (interview turns + focus sessions).
 *
 * Deliberately does NOT compute prerequisites/dependents — the client already has the full
 * plan graph from `getPlanById` and derives those from it (see `ConceptGraph.tsx`), so this
 * endpoint stays about the one concept and can't drift out of sync with the canvas the
 * student is looking at.
 *
 * Ownership is checked through the plan, not the concept: a concept has no `userId` of its
 * own, only a `planId`.
 */
export async function getConceptDetail(
  planId: string,
  conceptId: string,
  userId: string
): Promise<ConceptDetailResponse> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: {
      userId: true,
      // Every document, oldest first. `take: 1` on `desc` used to be a fine shorthand for "the
      // plan's file" back when a plan had exactly one; with a whole subject in one plan it picked
      // the most recently ADDED file and showed it as the source of every concept — so a concept
      // from chapter 2 was labelled with the appendix someone uploaded last week.
      documents: {
        select: { id: true, filename: true, kind: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!plan) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }
  if (plan.userId !== userId) {
    throw new AppError('Access denied to this study plan', 403, 'FORBIDDEN');
  }

  const concept = await prisma.concept.findFirst({
    where: { id: conceptId, planId },
    select: {
      id: true,
      name: true,
      difficulty: true,
      masteryScore: true,
      lastTestedAt: true,
      primaryDocumentId: true,
    },
  });

  if (!concept) {
    throw new AppError('Concept not found in this study plan', 404, 'NOT_FOUND');
  }

  // The file this concept is filed under — its topic. Falls back to the plan's FIRST document
  // (oldest), which is the right answer for the single-document plans that predate the topic
  // layer and for the concepts a graph edit left unfiled.
  const conceptDocument =
    plan.documents.find((document) => document.id === concept.primaryDocumentId) ??
    plan.documents[0];

  const [sourceRefs, remediationItem, turns, focusSessions] = await Promise.all([
    prisma.conceptSourceRef.findMany({
      where: { conceptId },
      select: {
        pageFrom: true,
        pageTo: true,
        sectionTitle: true,
        excerpt: true,
        context: true,
        document: { select: { id: true, filename: true, kind: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Only items still on the schedule — same rule (and same predicate) as the graph list's
    // isRemediating flag in getPlanById: a removed or finished item is history, not a reason to
    // still pulse the node. See `OFF_SCHEDULE_STATUSES` (#224).
    prisma.reviewQueueItem.findFirst({
      where: { conceptId, planId, ...ON_SCHEDULE_WHERE },
      select: { reason: true },
      orderBy: { priority: 'desc' },
    }),
    prisma.interviewTurn.findMany({
      where: { conceptId },
      // `mode` is what keeps this list scoring by the same rule as the session summary and the
      // interview history (#392 (c)) — three read paths, one predicate.
      select: { sessionId: true, turnIndex: true, askedAt: true, score: true, mode: true },
    }),
    // FocusSession.conceptIds is a JSON string[] (no relation to Concept), so it can't be
    // filtered in SQL — every session of the plan is pulled and matched in-process instead.
    prisma.focusSession.findMany({
      where: { planId },
      select: { id: true, startedAt: true, durationMinutes: true, conceptIds: true },
    }),
  ]);

  const focusSessionsForConcept = focusSessions.filter((session) => {
    const ids = session.conceptIds;
    return Array.isArray(ids) && ids.includes(conceptId);
  });

  return {
    id: concept.id,
    name: concept.name,
    difficulty: concept.difficulty,
    masteryScore: concept.masteryScore,
    lastTestedAt: concept.lastTestedAt,
    isRemediating: remediationItem !== null,
    remediationReason: remediationItem?.reason ?? null,
    document: conceptDocument
      ? {
          documentId: conceptDocument.id,
          filename: conceptDocument.filename,
          kind: conceptDocument.kind,
        }
      : null,
    sources: sourceRefs.map((ref) => ({
      documentId: ref.document.id,
      filename: ref.document.filename,
      kind: ref.document.kind,
      pageFrom: ref.pageFrom,
      pageTo: ref.pageTo,
      sectionTitle: ref.sectionTitle,
      excerpt: ref.excerpt,
      context: ref.context,
    })),
    history: buildConceptHistory(
      turns,
      focusSessionsForConcept.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        durationMinutes: session.durationMinutes,
      }))
    ),
  };
}
