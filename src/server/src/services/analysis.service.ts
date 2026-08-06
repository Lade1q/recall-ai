import fs from 'fs';
import path from 'path';
import { AnalysisJobPhase } from '@prisma/client';
import prisma from '../config/prisma';
import { extractConcepts, uploadFile } from './gemini.service';

import { validateAndFixDag } from '../utils/dag';
import { buildConceptSourceRows } from '../utils/concept-source';
import { planConceptMerge, normalizeConceptKey } from '../utils/concept-merge';
import { toSafeErrorMessage } from '../utils/error-message';
import { UPLOAD_DIR, resolveMaterialSource } from '../utils/material';
import { validateDAG } from './graph.service';
import { pregenerateForPlan } from './question-cache.service';
import { AiExtractResponse } from '../schemas/ai-extract.schema';

const MAX_ATTEMPTS = 3; // 1 initial call + 2 retries, per I3.2 acceptance criteria
const BACKOFF_BASE_MS = 2000;

// A `pending`/`processing` AnalysisJob older than this is considered stuck (server
// restart mid-job, fire-and-forget never picked up, Gemini hang outside
// callAiWithRetry) — shared with plan.service's retry staleness check (Issue #178).
export const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000;

/** Reports which real sub-step of `callAi` is running, for the UI's 4-phase progress (#186). */
type OnPhase = (phase: AnalysisJobPhase) => Promise<void>;

async function callAi(fileKey: string, onPhase: OnPhase): Promise<AiExtractResponse> {
  const absolutePath = path.join(UPLOAD_DIR, fileKey);
  const source = resolveMaterialSource(fileKey);

  // .txt goes inline (no File API upload), so there is no "sending to AI service" step to report.
  if (source.kind === 'text') {
    await onPhase('extracting');
    const text = await fs.promises.readFile(absolutePath, 'utf-8');
    return extractConcepts({ kind: 'text', text });
  }

  await onPhase('sending_to_ai');
  const uploaded = await uploadFile(absolutePath, source.mimeType);
  await onPhase('extracting');
  return extractConcepts({ kind: source.kind, uri: uploaded.uri, mimeType: uploaded.mimeType });
}

async function callAiWithRetry(fileKey: string, onPhase: OnPhase): Promise<AiExtractResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      return await callAi(fileKey, onPhase);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Marks a job `failed`. `error` is the real cause when one exists (AI call failure, DAG
 * validation exception, ...) and is stored so the UI can show the actual reason instead of a
 * generic message (Issue #183). Omitted for paths with no real error to report — the stale-job
 * sweep and the retry/reanalyze force-fail paths don't call this at all, by design.
 *
 * Uses `updateMany` (not `update`) on purpose: this is called from the processing catch-all,
 * where the very error being reported can be the job row having been hard-deleted mid-flight
 * (delete-plan cascade). `update` would throw P2025 on the missing row and bubble a second
 * error out of the failure handler; `updateMany` no-ops to count 0 — there is nothing left to
 * fail, and nothing is stuck at `processing` since the row is gone.
 */
async function markFailed(jobId: string, error?: unknown): Promise<void> {
  await prisma.analysisJob.updateMany({
    where: { id: jobId },
    data: {
      status: 'failed',
      completedAt: new Date(),
      retryCount: MAX_ATTEMPTS - 1,
      errorMessage: error !== undefined ? toSafeErrorMessage(error) : null,
    },
  });
}

/**
 * Background sweep for stuck AnalysisJobs (Issue #178). retryPlanAnalysis's own
 * staleness check only fires when a user actually retries the plan — this backstops
 * plans nobody comes back to, so stuck jobs don't accumulate indefinitely.
 */
export async function cleanupStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  const result = await prisma.analysisJob.updateMany({
    where: {
      status: { in: ['pending', 'processing'] },
      createdAt: { lt: cutoff },
    },
    data: { status: 'failed', completedAt: new Date() },
  });
  return result.count;
}

/**
 * Thrown by the finalize guard below when the job's `processing` claim was pulled out
 * from under this call (e.g. cleanupStaleJobs marked it `failed` while Gemini was still
 * hanging). Caught separately from real processing errors (PR #164 review, point 1/2):
 * the thief already wrote its own terminal state, so this is not a real failure — the
 * catch below must not overwrite it with a generic error message or reset retryCount.
 */
class JobClaimLostError extends Error {}

/**
 * Processes one pending AnalysisJob end-to-end: calls the AI (or mock), validates
 * the returned graph is a DAG, and persists Concepts/ConceptEdges in one transaction.
 * All routing here is deterministic software logic — the AI only extracts (C4).
 */
export async function processAnalysisJob(jobId: string): Promise<void> {
  // Atomic claim (Issue #164): only proceed if this call is the one that flips
  // pending -> processing. A second concurrent call on the same jobId, or a call
  // racing against cleanupStaleJobs/retry already having moved the job elsewhere,
  // sees count 0 and bails instead of re-running extraction and duplicating concepts.
  const claimed = await prisma.analysisJob.updateMany({
    where: { id: jobId, status: 'pending' },
    data: { status: 'processing' },
  });
  if (claimed.count === 0) {
    console.warn(
      `[analysis] job ${jobId} already claimed, no longer pending, or does not exist, skipping`
    );
    return;
  }

  // Everything after the claim runs inside try/catch (PR #164 review, point 3): a throw
  // from findUniqueOrThrow (row hard-deleted between claim and fetch) or any later step
  // routes through markFailed below instead of bubbling up and leaving the job stuck at
  // `processing`. markFailed is updateMany-based, so it stays a no-op if the row really is
  // gone rather than throwing a second time.
  let planId: string;

  try {
    const job = await prisma.analysisJob.findUniqueOrThrow({ where: { id: jobId } });

    if (!job.fileKey || !job.planDraftId) {
      await markFailed(jobId, new Error('AnalysisJob is missing fileKey or planDraftId'));
      return;
    }
    planId = job.planDraftId;

    const setPhase: OnPhase = async (phase) => {
      await prisma.analysisJob.update({ where: { id: jobId }, data: { phase } });
    };

    const extracted = await callAiWithRetry(job.fileKey, setPhase);
    await setPhase('validating');
    // Concepts aren't persisted yet, so the graph is keyed by concept name here.
    const { edges, autoFixed } = validateAndFixDag(
      extracted.concepts.map((c) => c.name),
      extracted.edges
    );

    await prisma.$transaction(async (tx) => {
      // Merge rather than insert, so a re-analysis (SP-05) keeps the ids the student's
      // mastery scores and interview history hang off. On a first analysis the plan holds
      // no concepts, so the merge degenerates to inserting everything — one path for both.
      const existing = await tx.concept.findMany({
        where: { planId },
        select: { id: true, name: true, status: true },
      });
      const mergePlan = planConceptMerge(existing, extracted.concepts);

      // Keyed by normalized name so edge endpoints, which the AI gives by name, resolve
      // through the same identity the merge used.
      const conceptIdByKey = new Map<string, string>();

      for (const kept of mergePlan.toKeep) {
        await tx.concept.update({
          where: { id: kept.id },
          data: { name: kept.name, difficulty: kept.difficulty, status: 'active' },
        });
        conceptIdByKey.set(normalizeConceptKey(kept.name), kept.id);
      }

      const created = await Promise.all(
        mergePlan.toCreate.map((c) =>
          tx.concept.create({
            data: { planId, name: c.name, difficulty: c.difficulty, source: 'ai_generated' },
          })
        )
      );
      for (const c of created) {
        conceptIdByKey.set(normalizeConceptKey(c.name), c.id);
      }

      if (mergePlan.toDeprecate.length > 0) {
        await tx.concept.updateMany({
          where: { id: { in: mergePlan.toDeprecate } },
          data: { status: 'deprecated' },
        });
      }

      // Edges are rebuilt wholesale: the new extraction is the whole truth about structure,
      // and an edge carries no student data worth preserving. No-op on a first analysis.
      await tx.conceptEdge.deleteMany({ where: { planId } });

      // `edges` was de-duplicated by exact name upstream; two spellings of one concept can
      // still collapse onto the same id pair here, which the [planId, from, to] unique index
      // would reject — and a rejected insert fails the whole job.
      const seenEdges = new Set<string>();
      for (const edge of edges) {
        const fromId = conceptIdByKey.get(normalizeConceptKey(edge.from));
        const toId = conceptIdByKey.get(normalizeConceptKey(edge.to));
        if (!fromId || !toId || fromId === toId) continue;
        const edgeKey = `${fromId}->${toId}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        await tx.conceptEdge.create({ data: { planId, fromConceptId: fromId, toConceptId: toId } });
      }

      // Anchor each concept to the passage it came from (concept_sources). One document per
      // plan in the SP-01 flow. Page/excerpt are best-effort from the AI — a concept with
      // neither is simply not anchored. All routing is deterministic; the AI only extracts (C4).
      const document = await tx.document.findFirst({
        where: { planId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (document) {
        // Anchors cite pages of the previous extraction, so they are replaced, not appended.
        await tx.conceptSourceRef.deleteMany({ where: { documentId: document.id } });
        const conceptIdByName = new Map(
          extracted.concepts.flatMap((c) => {
            const id = conceptIdByKey.get(normalizeConceptKey(c.name));
            return id ? [[c.name, id] as [string, string]] : [];
          })
        );
        const anchors = buildConceptSourceRows(extracted.concepts, conceptIdByName, document.id);
        if (anchors.length > 0) {
          await tx.conceptSourceRef.createMany({ data: anchors });
        }
      }

      // `status` stays `draft` on purpose (Issue #265): analysis produces a *proposal*, and
      // SP-01 requires the user to check it against the source before the plan is usable.
      // The plan becomes `active` in `replacePlanGraph` when the user confirms the graph
      // (`shouldActivate`) — activating here made that step unreachable, since the client
      // only navigates to the verification screen once analysis has finished.
      await tx.studyPlan.update({
        where: { id: planId },
        data: {
          dagAutoFixed: autoFixed,
          languageDetected: extracted.language_detected,
        },
      });
      // Guard mirroring the initial claim: if this job was pulled out from under us
      // (e.g. cleanupStaleJobs marked it failed while Gemini was still hanging), don't
      // let a late 'done' write resurrect it — abort so the whole transaction (including
      // the concepts/edges just created) rolls back.
      const finalized = await tx.analysisJob.updateMany({
        where: { id: jobId, status: 'processing' },
        data: { status: 'done', completedAt: new Date() },
      });
      if (finalized.count === 0) {
        throw new JobClaimLostError(
          `[analysis] job ${jobId} no longer processing, aborting commit`
        );
      }
    });
  } catch (error) {
    if (error instanceof JobClaimLostError) {
      // Benign: the thief already wrote its own terminal state (failed, or a fresh retry
      // job). Nothing left for us to persist — in particular, no markFailed, so we don't
      // overwrite that state with our internal message or an unrelated retryCount.
      console.warn(error.message);
      return;
    }
    console.error(`[analysis] job ${jobId} failed:`, error);
    await markFailed(jobId, error);
    return;
  }

  // The check above ran on concept names; if the AI returned two concepts sharing a
  // name, the edges actually persisted can differ from the set that was validated.
  // Re-check what landed in the DB, by concept id, and repair it if needed (I3.3).
  await validateDAG(planId);

  // AE-06: pre-generate flashcard-fallback questions (R01). Fire-and-forget — this must never
  // turn a successful analysis into a failed AnalysisJob, so it is never awaited by the caller
  // and its own errors are only console.warn'd inside pregenerateForPlan, never thrown here.
  // Hooked here rather than at each of triggerAnalysis's 4 controller call sites so create,
  // retry, change-document, and reanalyze all get it for free.
  void pregenerateForPlan(planId).catch((err) =>
    console.warn(`[analysis] question cache pregeneration failed for plan ${planId}:`, err)
  );
}

/** Looks up the pending job created alongside a plan and runs it. */
export async function triggerAnalysis(planId: string): Promise<void> {
  const job = await prisma.analysisJob.findFirst({
    where: { planDraftId: planId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (!job) return;
  await processAnalysisJob(job.id);
}
