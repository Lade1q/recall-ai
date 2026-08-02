import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { validateAndFixDag } from '../utils/dag';
import { ReplaceGraphInput } from '../schemas/graph.schema';
import { EdgeItemResponse, PlanGraphResponse } from '../types/plan.types';

const CONCEPT_FIELDS = {
  id: true,
  name: true,
  difficulty: true,
  masteryScore: true,
  lastTestedAt: true,
  source: true,
  status: true,
  createdAt: true,
} as const;

export interface DagValidationResult {
  isValid: boolean;
  removedEdges: EdgeItemResponse[];
}

/**
 * Whether this call to `replacePlanGraph` should move the plan from draft to active.
 *
 * The editor re-sends the whole graph after every edit to get a live DAG check, using
 * the same endpoint as the explicit "Confirm Graph" button (I3.5) — so activation can't
 * key off "the write succeeded", only off the caller's explicit `confirm` flag, or a
 * plan that is already active/completed would never (re-)activate on a plain edit.
 */
export function shouldActivate(
  currentStatus: string,
  confirm: boolean,
  conceptCount: number
): boolean {
  return confirm && currentStatus === 'draft' && conceptCount > 0;
}

/**
 * Checks the graph already stored for a plan and repairs it if it isn't a DAG:
 * the cycle-breaking edges are deleted and `plan.dag_auto_fixed` is set (SP-01 AF3).
 *
 * This is the repair policy, used on graphs the user never approved (AI extraction).
 * User-submitted edits go through `replacePlanGraph`, which rejects instead — see
 * SDP 4.3.2 R03: "edges causing cycles are rejected with user notification and logged".
 */
export async function validateDAG(planId: string): Promise<DagValidationResult> {
  const [concepts, edges] = await Promise.all([
    prisma.concept.findMany({ where: { planId }, select: { id: true } }),
    prisma.conceptEdge.findMany({
      where: { planId },
      select: { id: true, fromConceptId: true, toConceptId: true },
    }),
  ]);

  // Keyed by concept id: the stored graph is authoritative, and ids stay unique
  // even when two concepts happen to share a name.
  const { removedEdges } = validateAndFixDag(
    concepts.map((c) => c.id),
    edges.map((e) => ({ id: e.id, from: e.fromConceptId, to: e.toConceptId }))
  );

  if (removedEdges.length === 0) {
    return { isValid: true, removedEdges: [] };
  }

  const summary = removedEdges.map((e) => `${e.from}->${e.to}`).join(', ');
  console.warn(`[graph] plan ${planId}: cycle detected, removing edge(s): ${summary}`);

  await prisma.$transaction([
    prisma.conceptEdge.deleteMany({ where: { id: { in: removedEdges.map((e) => e.id) } } }),
    prisma.studyPlan.update({ where: { id: planId }, data: { dagAutoFixed: true } }),
  ]);

  return {
    isValid: false,
    removedEdges: removedEdges.map((e) => ({
      id: e.id,
      fromConceptId: e.from,
      toConceptId: e.to,
    })),
  };
}

/**
 * Replaces a plan's concept graph with the exact set the student confirmed in the
 * editor (SP-01 basic flow steps 8-9). Any change that would make the graph cyclic
 * is rejected outright and nothing is written.
 *
 * Concepts are matched by name: names still present keep their id, mastery score and
 * history; names that disappeared are deleted (cascading to their edges); new names
 * are created as `source: 'manual'`.
 */
export async function replacePlanGraph(
  planId: string,
  userId: string,
  input: ReplaceGraphInput
): Promise<PlanGraphResponse> {
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

  const names = input.concepts.map((c) => c.name);
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate) {
    throw new AppError(`Duplicate concept name: "${duplicate}"`, 400, 'DUPLICATE_CONCEPT');
  }

  const nameSet = new Set(names);
  const dangling = input.edges.find((e) => !nameSet.has(e.from) || !nameSet.has(e.to));
  if (dangling) {
    throw new AppError(
      `Edge references a concept not in the graph: "${dangling.from}" -> "${dangling.to}"`,
      400,
      'INVALID_EDGE_REFERENCE'
    );
  }

  // Reject policy: a self-loop or a cycle means the submitted graph is unusable.
  const { removedEdges } = validateAndFixDag(names, input.edges);
  if (removedEdges.length > 0) {
    const summary = removedEdges.map((e) => `${e.from}->${e.to}`).join(', ');
    console.warn(`[graph] plan ${planId}: rejected edit, cyclic edge(s): ${summary}`);
    throw new AppError('Adding this edge would create a cycle', 409, 'DAG_CYCLE');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.concept.findMany({
      where: { planId },
      select: { id: true, name: true },
    });

    const droppedIds = existing.filter((c) => !nameSet.has(c.name)).map((c) => c.id);
    if (droppedIds.length > 0) {
      await tx.concept.deleteMany({ where: { id: { in: droppedIds } } });
    }

    const conceptIdByName = new Map(existing.map((c) => [c.name, c.id]));
    for (const concept of input.concepts) {
      if (conceptIdByName.has(concept.name)) continue;
      const created = await tx.concept.create({
        data: {
          planId,
          name: concept.name,
          difficulty: concept.difficulty ?? 1,
          source: 'manual',
        },
      });
      conceptIdByName.set(concept.name, created.id);
    }

    // Full replace — deleting first also clears edges of concepts that survived.
    await tx.conceptEdge.deleteMany({ where: { planId } });
    if (input.edges.length > 0) {
      await tx.conceptEdge.createMany({
        data: input.edges.map((e) => ({
          planId,
          fromConceptId: conceptIdByName.get(e.from) as string,
          toConceptId: conceptIdByName.get(e.to) as string,
        })),
      });
    }

    // Confirming a graph is what makes a plan usable, so a draft becomes active here
    // (I3.5 "Confirm Graph"). Plans whose AI analysis failed reach `active` this way too.
    const becomesActive = shouldActivate(plan.status, input.confirm, input.concepts.length);
    const updated = await tx.studyPlan.update({
      where: { id: planId },
      data: becomesActive ? { status: 'active' } : {},
      select: {
        id: true,
        status: true,
        dagAutoFixed: true,
        concepts: { select: CONCEPT_FIELDS, orderBy: { createdAt: 'asc' } },
        conceptEdges: { select: { id: true, fromConceptId: true, toConceptId: true } },
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      dagAutoFixed: updated.dagAutoFixed,
      concepts: updated.concepts,
      edges: updated.conceptEdges,
    };
  });
}
