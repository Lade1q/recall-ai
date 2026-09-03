import fs from 'fs';
import path from 'path';
import { AnalysisJobPhase, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { extractConcepts, linkTopics, uploadFile } from './gemini.service';
import { mockExtractForFile, mockTopicEdgesForDocuments } from '../utils/mock-ai';
import { validateAndFixDag } from '../utils/dag';
import { mapWithConcurrency } from '../utils/concurrency';
import {
  DocumentExtraction,
  buildTopicLinkMaterial,
  mapTopicEdgesToDocumentIds,
  mergeExtractions,
} from '../utils/extraction-merge';
import { buildConceptSourceRows } from '../utils/concept-source';
import { planCheckpointMerge, readExtractedCheckpoints } from '../utils/checkpoint';
import { planConceptMerge, normalizeConceptKey } from '../utils/concept-merge';
import { toSafeErrorMessage } from '../utils/error-message';
import { UPLOAD_DIR, resolveMaterialSource } from '../utils/material';
import { validateDAG } from './graph.service';
import { pregenerateForPlan } from './question-cache.service';
import { AiExtractResponse, ConceptExtract } from '../schemas/ai-extract.schema';

const MAX_ATTEMPTS = 3; // 1 initial call + 2 retries, per I3.2 acceptance criteria
const BACKOFF_BASE_MS = 2000;

/**
 * How many phase-1 extractions may be in flight at once.
 *
 * Default 4, not 8. A probe on 2026-09-03 ran 3, 5 and 8 concurrent Gemini calls on this
 * project's free-tier key with zero failures — but with short text prompts, so it bounds
 * requests-per-minute and says nothing about tokens-per-minute, which is what a batch of PDF
 * extractions actually spends. 4 keeps an 8-file upload to two rounds while staying well inside
 * the only limit that was measured.
 */
const MAX_CONCURRENT_EXTRACT = (() => {
  const raw = Number(process.env.GEMINI_MAX_CONCURRENT_EXTRACT);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 4;
})();

// A `pending`/`processing` AnalysisJob older than this is considered stuck (server
// restart mid-job, fire-and-forget never picked up, Gemini hang outside
// callAiWithRetry) — shared with plan.service's retry staleness check (Issue #178).
/**
 * Ceiling on the single write transaction at the end of a job, and the wait for a connection.
 *
 * Prisma's interactive-transaction default is **5 s**, which was sized for the world where a
 * plan held one document. Counted on this branch by wrapping `tx` in a proxy: 1 document × 10
 * concepts issues **37** statements, 8 × 10 issues **254** — every concept costs an update plus
 * its checkpoints and its source anchors, all sequential. Overrunning throws P2028, and it does
 * so AFTER the run has already paid for every Gemini call, so this sits far above the measured
 * work rather than just above it.
 */
const ANALYSIS_TRANSACTION_TIMEOUT_MS = 60 * 1000;
const ANALYSIS_TRANSACTION_MAX_WAIT_MS = 15 * 1000;

export const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000;

/** Reports which real sub-step of `callAi` is running, for the UI's 4-phase progress (#186). */
type OnPhase = (phase: AnalysisJobPhase) => Promise<void>;

async function callAi(
  fileKey: string,
  onPhase: OnPhase,
  documentIndex?: number
): Promise<AiExtractResponse> {
  if (process.env.USE_MOCK_AI === 'true') {
    await onPhase('extracting');
    // Keyed on the document's POSITION, not just the file key: a plan can hold several
    // documents and each gets its own call, so a shared constant would give every topic the
    // same concepts and the two-level graph would have nothing to show. Hashing the key alone
    // does not spread reliably over so few banks — the three CNPM PDFs on this machine hash to
    // banks 1, 1, 0 (measured 2026-09-03).
    return mockExtractForFile(fileKey, documentIndex);
  }

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

/**
 * Review #425 (Quân) — `buildConceptSourceRows`'s `sectionTitle` guard needs the plan's raw text
 * to verify against. `.txt` is the only material kind this server ever decodes locally (PDF/image
 * go to Gemini's File API by URI, and this codebase has no local PDF/image text extraction), so
 * every other kind — and mock mode, where `fileKey` names nothing real on disk — answers `null`:
 * "cannot verify" rather than risk a wrong read.
 *
 * A second, small read of the same `.txt` file `callAi` already read: kept separate rather than
 * threading the string back out of `callAiWithRetry`'s return type, since this only matters to
 * one caller and the file is small.
 *
 * Round 2 (Quân) — this call sits AFTER `callAiWithRetry` succeeds and OUTSIDE its retry loop,
 * with no `try/catch` of its own, so an uncaught throw here falls into `processAnalysisJob`'s
 * catch-all and marks the WHOLE job `failed` — discarding an extraction that already succeeded
 * (money and ~30s spent, thrown away by a decorative field) if the file happens to have vanished
 * from disk between upload and this read (this repo has precedent for files going missing under
 * `uploads/`, #411). `.catch(() => null)` makes a read failure degrade to the same "cannot
 * verify" `null` the guard already treats as a first-class, correct answer — fail-closed on the
 * guard's own terms, not error-swallowing.
 */
export async function resolveMaterialText(fileKey: string): Promise<string | null> {
  if (process.env.USE_MOCK_AI === 'true') return null;
  const source = resolveMaterialSource(fileKey);
  if (source.kind !== 'text') return null;
  return fs.promises.readFile(path.join(UPLOAD_DIR, fileKey), 'utf-8').catch(() => null);
}

/**
 * The retry budget is PER DOCUMENT, which is the point of extracting them separately: one file
 * hitting a 503 costs three attempts on that file, not on the batch. A file that still fails
 * after them fails the whole job — see `runPhaseOne`.
 */
async function callAiWithRetry(
  fileKey: string,
  onPhase: OnPhase,
  documentIndex?: number
): Promise<AiExtractResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      return await callAi(fileKey, onPhase, documentIndex);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Commits every extracted concept's checkpoints — the ruler Interview v2 grades against (#329).
 *
 * This is the ONLY place checkpoints are written, and it runs at analysis time inside the
 * extraction transaction (INV-1): an interview may read the list but never add to it, so the
 * examiner can't mint the marks it then measures the student by (C4 at the micro scale).
 *
 * Merged onto the stored rows rather than replaced, so a checkpoint that survives a re-analysis
 * keeps its id and the evidence recorded against it stays attached. The three statements run in
 * the order delete → update → create, and that order is load-bearing: the `(concept_id, text)`
 * unique index rejects a row created or renamed onto text a not-yet-deleted duplicate still
 * holds. `process-analysis-job.test.ts` pins the order, because the mocked client has no unique
 * index to fail on and would happily let a reordering look green.
 *
 * Concepts the extraction dropped are untouched — `planConceptMerge` deprecated rather than
 * deleted them, and a concept revived by a later re-analysis should find its checkpoints where
 * it left them.
 */
async function persistCheckpoints(
  tx: Prisma.TransactionClient,
  extracted: readonly ConceptExtract[],
  conceptIdByKey: ReadonlyMap<string, string>
): Promise<void> {
  // Keyed by id, not by name: two spellings of one concept collapse onto a single row upstream,
  // and merging that row twice would let the second pass delete what the first just committed.
  // First occurrence wins, matching `planConceptMerge`.
  const checkpointsByConceptId = new Map<string, string[]>();
  const seenConceptIds = new Set<string>();
  for (const concept of extracted) {
    const conceptId = conceptIdByKey.get(normalizeConceptKey(concept.name));
    if (!conceptId || seenConceptIds.has(conceptId)) continue;
    seenConceptIds.add(conceptId);

    // A concept whose checkpoints came back unreadable is left exactly as it was. Merging it
    // would read a model failure as "this concept has no checkpoints" and delete the whole
    // ruler — a re-analysis that hiccups once must not cost a concept its stored checkpoints
    // (and, from #330 on, the evidence recorded against their ids). Warned rather than failed:
    // the extraction itself is fine, and the stored checkpoints remain valid.
    const commitment = readExtractedCheckpoints(concept.checkpoints);
    if (commitment.status === 'degraded') {
      console.warn(
        `[analysis] concept ${conceptId} ("${concept.name}"): unreadable checkpoints in this extraction, keeping the stored ones`
      );
      continue;
    }
    checkpointsByConceptId.set(conceptId, commitment.texts);
  }
  if (checkpointsByConceptId.size === 0) return;

  const stored = await tx.conceptCheckpoint.findMany({
    where: { conceptId: { in: [...checkpointsByConceptId.keys()] } },
    select: { id: true, conceptId: true, text: true, orderIndex: true },
  });
  const storedByConceptId = new Map<string, { id: string; text: string }[]>();
  const storedById = new Map<string, { text: string; orderIndex: number }>();
  for (const row of stored) {
    const rows = storedByConceptId.get(row.conceptId) ?? [];
    rows.push({ id: row.id, text: row.text });
    storedByConceptId.set(row.conceptId, rows);
    storedById.set(row.id, { text: row.text, orderIndex: row.orderIndex });
  }

  for (const [conceptId, checkpoints] of checkpointsByConceptId) {
    const plan = planCheckpointMerge(storedByConceptId.get(conceptId) ?? [], checkpoints);

    if (plan.toDelete.length > 0) {
      await tx.conceptCheckpoint.deleteMany({ where: { id: { in: plan.toDelete } } });
    }
    for (const kept of plan.toKeep) {
      // Re-analysing an unchanged document matches every checkpoint, so writing each one back
      // would be a transaction full of no-op updates — and would bump `updatedAt` on rows that
      // did not change, costing the column the only thing it is good for.
      const before = storedById.get(kept.id);
      if (before?.text === kept.text && before.orderIndex === kept.orderIndex) continue;
      await tx.conceptCheckpoint.update({
        where: { id: kept.id },
        data: { text: kept.text, orderIndex: kept.orderIndex },
      });
    }
    if (plan.toCreate.length > 0) {
      await tx.conceptCheckpoint.createMany({
        data: plan.toCreate.map((c) => ({ conceptId, text: c.text, orderIndex: c.orderIndex })),
      });
    }
  }
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

/** One document queued for phase 1, plus what came back. */
type CompletedExtraction = DocumentExtraction & { fileKey: string; materialText: string | null };

interface ExtractionTarget {
  documentId: string | null;
  filename: string;
  fileKey: string;
  order: number;
}

/**
 * Phase 1 — one `extract_concepts` call per document, several in flight at once.
 *
 * A document that fails all its retries rejects, and that rejection fails the whole job. Skipping
 * it instead would hand the student a plan missing part of their syllabus with nothing on screen
 * saying so — the same dishonesty C5 exists to prevent, just at the level of the plan rather than
 * a citation. The recovery is cheap and in the student's hands: drop that file and upload again.
 */
async function runPhaseOne(
  jobId: string,
  targets: readonly ExtractionTarget[],
  setPhase: OnPhase
): Promise<CompletedExtraction[]> {
  let done = 0;
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: { documentsTotal: targets.length, documentsDone: 0 },
  });

  return mapWithConcurrency(targets, MAX_CONCURRENT_EXTRACT, async (target) => {
    // `target.order` (position in the PLAN), not `index` (position in this batch): an append job
    // carries one target, so `index` is always 0 and every added document would draw the same
    // mock bank as the plan's first file.
    const result = await callAiWithRetry(target.fileKey, setPhase, target.order);
    const materialText = await resolveMaterialText(target.fileKey);
    done += 1;
    // Best-effort: the counter only drives a progress label, so a failed write must not cost a
    // successful extraction. Not awaited into the result either — it is not on the critical path.
    await prisma.analysisJob
      .update({ where: { id: jobId }, data: { documentsDone: done } })
      .catch((error) => console.warn(`[analysis] progress update failed for job ${jobId}:`, error));
    return { ...target, result, materialText };
  });
}

/**
 * Rebuilds a phase-1-shaped result for a document that this job did NOT re-read, from what is
 * already in the database.
 *
 * This is what lets `new_only` still produce a complete topic order: phase 2 has to see every
 * document of the plan, or the new file becomes an island. The old documents come back as their
 * stored concepts plus the excerpt already anchored to them — the same kind of derived text a
 * freshly-extracted document contributes, so phase 2's input is uniform.
 *
 * The result is ONLY fed to phase 2. It never reaches the merge, so it cannot rewrite a stored
 * concept with this thinner copy of itself.
 */
async function loadStoredExtraction(document: {
  id: string;
  filename: string;
  fileKey: string;
  order: number;
}): Promise<CompletedExtraction> {
  const concepts = await prisma.concept.findMany({
    where: { primaryDocumentId: document.id, status: 'active' },
    select: {
      name: true,
      difficulty: true,
      conceptSources: {
        where: { documentId: document.id, excerpt: { not: null } },
        select: { excerpt: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    documentId: document.id,
    filename: document.filename,
    fileKey: document.fileKey,
    order: document.order,
    materialText: null,
    result: {
      concepts: concepts.map((concept) => ({
        name: concept.name,
        difficulty: concept.difficulty ?? 1,
        checkpoints: null,
        source_excerpt: concept.conceptSources[0]?.excerpt ?? null,
      })),
      edges: [],
      language_detected: 'en',
      topic_edges: [],
    },
  };
}

/**
 * Phase 2 — ONE call that orders the documents relative to each other.
 *
 * Skipped entirely below two documents: with one topic there is no order to ask about, and the
 * call would cost money to return an empty list.
 *
 * A failure here does NOT fail the job. Phase 1 has already succeeded at that point — minutes of
 * work and real money — and what is lost is only the arrows BETWEEN topics. The degraded result
 * is honest on screen: the student sees their N topics with no order drawn between them, which is
 * exactly true. Failing the job instead would throw away a complete concept graph to punish a
 * missing convenience.
 */
/**
 * The outcome of phase 2, and `produced` is the field that matters.
 *
 * 🔴 `edges: []` is NOT enough to decide what to write. It means either "the model looked and
 * found no order" or "there was nothing to ask / the call failed" — and those want OPPOSITE
 * writes. Phase 2 is one `linkTopics` call with no retry wrapper, so a single blip inside its
 * 6-20s window used to land in the catch below, return `[]`, and let the caller `deleteMany`
 * the plan's whole topic order while the job still reported `done`. Those arrows are the only
 * part of the graph a student can edit but not re-create: the UI offers removal and no add,
 * so the loss was silent and permanent short of a re-analysis that discards their edits.
 */
interface TopicOrder {
  edges: { from: string; to: string }[];
  autoFixed: boolean;
  /** True only when a linking pass actually ran and returned an answer for THIS plan. */
  produced: boolean;
}

async function runPhaseTwo(
  extractions: readonly CompletedExtraction[],
  documents: readonly { id: string; filename: string }[]
): Promise<TopicOrder> {
  if (documents.length < 2) return { edges: [], autoFixed: false, produced: false };

  let topicEdges;
  try {
    // The flag has to be honoured HERE too, not only in `callAi`. Without this branch the
    // "offline" path still reached out to Gemini for the linking pass, and the failure was
    // invisible: the catch below turns it into "no study order", which is indistinguishable
    // from a model that genuinely found none.
    topicEdges =
      process.env.USE_MOCK_AI === 'true'
        ? mockTopicEdgesForDocuments(documents.map((d) => d.filename))
        : await linkTopics(buildTopicLinkMaterial(extractions));
  } catch (error) {
    console.warn(
      '[analysis] topic linking failed; the plan keeps its concepts and whatever study order ' +
        'it already had:',
      error
    );
    return { edges: [], autoFixed: false, produced: false };
  }

  const mapped = mapTopicEdgesToDocumentIds(topicEdges, documents);
  if (mapped.unresolved.length > 0) {
    console.warn(
      `[analysis] dropped ${mapped.unresolved.length} topic edge(s) naming no document of this ` +
        `plan: ${mapped.unresolved.map((e) => `${e.from} -> ${e.to}`).join(', ')}`
    );
  }

  // Second use of the same DAG fixer, now in the document-id key space. By this point every
  // endpoint is a real document id, so all it can still find is a cycle.
  const dag = validateAndFixDag(
    documents.map((d) => d.id),
    mapped.edges
  );
  if (dag.removedEdges.length > 0) {
    console.warn(`[analysis] broke a cycle in the topic order, dropped ${dag.removedEdges.length}`);
  }

  return { edges: dag.edges, autoFixed: mapped.autoFixed || dag.autoFixed, produced: true };
}

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

    // The AI is driven by the plan's `documents` rows, not by `job.fileKey`. `fileKey` stays on
    // the job because `retryPlanAnalysis` guards on it, and because it is still the right answer
    // for the degraded case below.
    const documents = await prisma.document.findMany({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true, fileKey: true },
    });

    // A plan with no `documents` row is a broken state rather than a supported one, but the job
    // still knows which file to read, and the concepts are still worth having. They just belong
    // to no topic: `documentId: null` puts them in the UI's "Chưa xếp chủ đề" bucket, and nothing
    // anchors them in `concept_sources`. This is exactly what this code did before it learned
    // about multiple documents, so no existing plan changes behaviour.
    const allTargets: ExtractionTarget[] =
      documents.length > 0
        ? documents.map((document, order) => ({
            documentId: document.id,
            filename: document.filename,
            fileKey: document.fileKey,
            order,
          }))
        : [{ documentId: null, filename: job.fileKey, fileKey: job.fileKey, order: 0 }];

    // `new_only`: read ONLY the documents this job was created for. The cheap mode of "thêm tài
    // liệu" — one extraction instead of re-reading the whole subject — and the reason every
    // merge decision below has to ask which mode it is in.
    const scopeIds = new Set(
      job.scope === 'new_only' && Array.isArray(job.scopeDocumentIds)
        ? (job.scopeDocumentIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : []
    );
    const appendOnly = job.scope === 'new_only' && scopeIds.size > 0;
    const targets = appendOnly
      ? allTargets.filter((target) => target.documentId && scopeIds.has(target.documentId))
      : allTargets;

    if (appendOnly && targets.length === 0) {
      await markFailed(jobId, new Error('append job names no document of this plan'));
      return;
    }

    const extractions = await runPhaseOne(jobId, targets, setPhase);
    const merged = mergeExtractions(extractions);

    // Phase 1 sees ONE file per call, so it cannot know an order between two of them — anything
    // it puts in `topic_edges` is invented. The schema still asks for the field (`.catch([])`
    // does not remove it from `required`, measured 2026-09-03), so the model does answer, and
    // this is where the answer dies. Without this the invariant "every document_edges row came
    // from phase 2" is false from the very first upload, and with it goes the reason
    // `document_edges` needs no `source` column.
    if (merged.droppedTopicEdgeCount > 0) {
      console.warn(
        `[analysis] dropped ${merged.droppedTopicEdgeCount} topic edge(s) invented by phase 1`
      );
    }

    await setPhase('linking');
    // Phase 2 ALWAYS sees every document, even in append mode: it is what stops a newly added
    // file from becoming an island on the topic graph, and it costs one call rather than a
    // re-read of the whole subject. Documents this job did not read contribute their stored
    // concepts and excerpts instead.
    const linkInput = appendOnly
      ? (
          await Promise.all(
            allTargets.map((target) => {
              const fresh = extractions.find((e) => e.documentId === target.documentId);
              if (fresh) return Promise.resolve(fresh);
              if (!target.documentId) return Promise.resolve(null);
              return loadStoredExtraction({
                id: target.documentId,
                filename: target.filename,
                fileKey: target.fileKey,
                order: target.order,
              });
            })
          )
        ).filter((e): e is CompletedExtraction => e !== null)
      : extractions;
    const topicOrder = await runPhaseTwo(linkInput, documents);

    await setPhase('validating');
    // Concepts aren't persisted yet, so the graph is keyed by concept name here.
    const { edges, autoFixed } = validateAndFixDag(
      merged.concepts.map((c) => c.name),
      merged.edges
    );

    // 🔴 Not the default 5s — see `ANALYSIS_TRANSACTION_TIMEOUT_MS`. What changed is not this
    // transaction but the size of a plan: it can now hold eight files instead of one.
    await prisma.$transaction(
      async (tx) => {
        // Merge rather than insert, so a re-analysis (SP-05) keeps the ids the student's
        // mastery scores and interview history hang off. On a first analysis the plan holds
        // no concepts, so the merge degenerates to inserting everything — one path for both.
        const existing = await tx.concept.findMany({
          where: { planId },
          // `primaryDocumentId` is not part of the merge — it is read so append mode can tell a
          // concept that already belongs to a topic from one that does not.
          select: { id: true, name: true, status: true, primaryDocumentId: true },
        });
        const filedUnder = new Map(existing.map((c) => [c.id, c.primaryDocumentId]));
        const mergePlan = planConceptMerge(existing, merged.concepts);

        // Keyed by normalized name so edge endpoints, which the AI gives by name, resolve
        // through the same identity the merge used.
        const conceptIdByKey = new Map<string, string>();

        // Which document each concept is filed under. Assigned from the CALL SITE — phase 1 sends
        // one file per call, so the answer is known without asking the model. Left untouched when
        // the merge has no answer (the no-documents path above), rather than written as null, so a
        // degraded re-analysis cannot strip a topic off concepts that already had one.
        const topicOf = (name: string): { primaryDocumentId: string } | Record<string, never> => {
          const documentId = merged.primaryDocumentIdByKey.get(normalizeConceptKey(name));
          return documentId ? { primaryDocumentId: documentId } : {};
        };

        for (const kept of mergePlan.toKeep) {
          // 🔴 A concept the new file ALSO teaches. In append mode this extraction saw one file, so
          // it is not entitled to rewrite what the old graph says about a concept it shares:
          //
          //   - `primaryDocumentId` — MEASURED on real material 2026-09-03. Adding "LN09 - Test
          //     Automation" to a plan already holding LN08 re-filed the concept "Test Automation"
          //     from LN08 to LN09, because phase 1 never saw LN08's claim on it. That breaks the
          //     documented rule (the EARLIEST document owns a shared concept), and it does it
          //     silently: LN08's topic quietly lost a node.
          //   - `name` / `difficulty` — same argument, and the dialog promises the mode "chỉ thêm,
          //     không sửa … gì của đồ thị cũ". Rewriting either would make that copy false.
          //
          // `status` is the one field append does touch: a file that teaches a concept is evidence
          // it belongs, and reviving a tombstone grows the graph rather than editing it.
          // `name`/`difficulty` are never rewritten in append mode — not even for a concept that
          // has no topic yet. `planConceptMerge` matches case-insensitively, so "SOFTWARE PROCESS"
          // in a new file matches a stored "Software Process" and would overwrite the student's
          // own casing and their difficulty with one file's guess. A concept can genuinely hold
          // `primary_document_id = NULL` today — a single-document plan edits through the flat
          // editor, which sends no topic — so "unfiled" must not be read as "not really theirs".
          // Filing it IS allowed: giving a home to a concept that has none only adds information.
          const filedAlready = filedUnder.get(kept.id) != null;
          await tx.concept.update({
            where: { id: kept.id },
            data: appendOnly
              ? { status: 'active', ...(filedAlready ? {} : topicOf(kept.name)) }
              : {
                  name: kept.name,
                  difficulty: kept.difficulty,
                  status: 'active',
                  ...topicOf(kept.name),
                },
          });
          conceptIdByKey.set(normalizeConceptKey(kept.name), kept.id);
        }

        const created = await Promise.all(
          mergePlan.toCreate.map((c) =>
            tx.concept.create({
              data: {
                planId,
                name: c.name,
                difficulty: c.difficulty,
                source: 'ai_generated',
                ...topicOf(c.name),
              },
            })
          )
        );
        for (const c of created) {
          conceptIdByKey.set(normalizeConceptKey(c.name), c.id);
        }

        // 🔴 In append mode the AI only saw the NEW files, so EVERY concept of the old ones is
        // "absent" from this extraction. Deprecating them would empty the student's whole graph —
        // the single most destructive silent failure this mode can have. `planConceptMerge` stays
        // untouched (it is a pure function with its own tests); the caller ignores its verdict.
        if (!appendOnly && mergePlan.toDeprecate.length > 0) {
          await tx.concept.updateMany({
            where: { id: { in: mergePlan.toDeprecate } },
            data: { status: 'deprecated' },
          });
        }

        // The ruler each concept will be graded against, committed here and nowhere else (INV-1).
        //
        // Append mode commits it only for the concepts it CREATED. A concept the new file shares
        // with an old one already has a ruler, derived from the file that first taught it and used
        // to grade every answer the student has given about it; `planCheckpointMerge` would replace
        // that ruler with one derived from a file phase 1 read in isolation. Same reasoning as the
        // fields left alone above, with a sharper edge: this one changes how answers are scored.
        const createdKeys = new Set(created.map((c) => normalizeConceptKey(c.name)));
        const checkpointScope = appendOnly
          ? merged.concepts.filter((c) => createdKeys.has(normalizeConceptKey(c.name)))
          : merged.concepts;
        await persistCheckpoints(tx, checkpointScope, conceptIdByKey);

        // Edges are rebuilt wholesale: the new extraction is the whole truth about structure,
        // and an edge carries no student data worth preserving. No-op on a first analysis.
        //
        // Except in append mode, where this extraction is NOT the whole truth — it saw one file.
        // The existing edges are added to, not replaced; the `create` loop below already skips a
        // pair that is already stored, so no `@@unique` violation can fail the transaction.
        if (!appendOnly) {
          await tx.conceptEdge.deleteMany({ where: { planId } });
        }
        const storedEdgeKeys = appendOnly
          ? new Set(
              (
                await tx.conceptEdge.findMany({
                  where: { planId },
                  select: { fromConceptId: true, toConceptId: true },
                })
              ).map((e) => `${e.fromConceptId}->${e.toConceptId}`)
            )
          : new Set<string>();

        // `edges` was de-duplicated by exact name upstream; two spellings of one concept can
        // still collapse onto the same id pair here, which the [planId, from, to] unique index
        // would reject — and a rejected insert fails the whole job.
        const seenEdges = new Set<string>();
        for (const edge of edges) {
          const fromId = conceptIdByKey.get(normalizeConceptKey(edge.from));
          const toId = conceptIdByKey.get(normalizeConceptKey(edge.to));
          if (!fromId || !toId || fromId === toId) continue;
          const edgeKey = `${fromId}->${toId}`;
          if (seenEdges.has(edgeKey) || storedEdgeKeys.has(edgeKey)) continue;
          seenEdges.add(edgeKey);
          await tx.conceptEdge.create({
            data: { planId, fromConceptId: fromId, toConceptId: toId },
          });
        }

        // Anchor each concept to the passage it came from (concept_sources), ONE DOCUMENT AT A
        // TIME. Each phase-1 result already knows which file produced it, so nothing has to be
        // guessed here: no `resolveSourceDocumentId`, no matching by name. A concept taught in two
        // files legitimately gets an anchor row in each — that table is N:M and both are true —
        // even though it sits under only one topic. Page/excerpt are best-effort from the AI; a
        // concept with neither is simply not anchored.
        for (const extraction of extractions) {
          if (!extraction.documentId) continue;
          // Anchors cite pages of the previous extraction, so they are replaced, not appended.
          await tx.conceptSourceRef.deleteMany({ where: { documentId: extraction.documentId } });
          const conceptIdByName = new Map(
            extraction.result.concepts.flatMap((c) => {
              const id = conceptIdByKey.get(normalizeConceptKey(c.name));
              return id ? [[c.name, id] as [string, string]] : [];
            })
          );
          const anchors = buildConceptSourceRows(
            extraction.result.concepts,
            conceptIdByName,
            extraction.documentId,
            extraction.materialText
          );
          if (anchors.length > 0) {
            await tx.conceptSourceRef.createMany({ data: anchors });
          }
        }

        // The topic layer, replaced wholesale like concept edges — but ONLY when phase 2 actually
        // answered. Replacing is right because phase 2 always runs over ALL the plan's documents,
        // so what it returns is the complete order and older rows alongside it would be
        // contradictory arrows nobody ever deletes. Guarding on `produced` rather than on
        // `edges.length` is the whole point: an empty list from a call that RAN is a real answer
        // ("no order"), while an empty list from a call that failed or never happened is not an
        // answer at all, and letting it delete would destroy edges the student curated by hand.
        if (topicOrder.produced) {
          await tx.documentEdge.deleteMany({ where: { planId } });
          if (topicOrder.edges.length > 0) {
            await tx.documentEdge.createMany({
              data: topicOrder.edges.map((edge) => ({
                planId,
                fromDocumentId: edge.from,
                toDocumentId: edge.to,
              })),
            });
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
            // One flag for both layers: the banner text ("we adjusted the graph, please check")
            // is true either way, and a student has no use for knowing which layer moved.
            dagAutoFixed: autoFixed || topicOrder.autoFixed,
            // Append mode saw one file; letting its verdict overwrite the plan's language would
            // let a single English appendix re-label a Vietnamese course.
            ...(appendOnly ? {} : { languageDetected: merged.languageDetected }),
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
      },
      { timeout: ANALYSIS_TRANSACTION_TIMEOUT_MS, maxWait: ANALYSIS_TRANSACTION_MAX_WAIT_MS }
    );
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
