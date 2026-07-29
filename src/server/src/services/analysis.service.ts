import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma';
import { extractConcepts, uploadFile } from './gemini.service';
import { MOCK_EXTRACT_RESULT } from '../utils/mock-ai';
import { validateAndFixDag } from '../utils/dag';
import { buildConceptSourceRows } from '../utils/concept-source';
import { validateDAG } from './graph.service';
import { AiExtractResponse } from '../schemas/ai-extract.schema';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const MAX_ATTEMPTS = 3; // 1 initial call + 2 retries, per I3.2 acceptance criteria
const BACKOFF_BASE_MS = 2000;

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

async function callAi(fileKey: string): Promise<AiExtractResponse> {
  if (process.env.USE_MOCK_AI === 'true') {
    return MOCK_EXTRACT_RESULT;
  }

  const absolutePath = path.join(UPLOAD_DIR, fileKey);
  const ext = path.extname(fileKey).toLowerCase();

  if (ext === '.txt') {
    const text = await fs.promises.readFile(absolutePath, 'utf-8');
    return extractConcepts({ kind: 'text', text });
  }

  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(`Unsupported file extension for AI extraction: ${ext}`);
  }
  const uploaded = await uploadFile(absolutePath, mimeType);
  const kind = mimeType === 'application/pdf' ? 'document' : 'image';
  return extractConcepts({ kind, uri: uploaded.uri, mimeType: uploaded.mimeType });
}

async function callAiWithRetry(fileKey: string): Promise<AiExtractResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      return await callAi(fileKey);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function markFailed(jobId: string): Promise<void> {
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'failed', completedAt: new Date(), retryCount: MAX_ATTEMPTS - 1 },
  });
}

/**
 * Processes one pending AnalysisJob end-to-end: calls the AI (or mock), validates
 * the returned graph is a DAG, and persists Concepts/ConceptEdges in one transaction.
 * All routing here is deterministic software logic — the AI only extracts (C4).
 */
export async function processAnalysisJob(jobId: string): Promise<void> {
  const job = await prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });

  if (!job.fileKey || !job.planDraftId) {
    await markFailed(jobId);
    return;
  }
  const planId = job.planDraftId;

  try {
    const extracted = await callAiWithRetry(job.fileKey);
    // Concepts aren't persisted yet, so the graph is keyed by concept name here.
    const { edges, autoFixed } = validateAndFixDag(
      extracted.concepts.map((c) => c.name),
      extracted.edges
    );

    await prisma.$transaction(async (tx) => {
      // Concept names are assumed unique within one extraction — edges below are wired by name.
      const created = await Promise.all(
        extracted.concepts.map((c) =>
          tx.concept.create({
            data: { planId, name: c.name, difficulty: c.difficulty, source: 'ai_generated' },
          })
        )
      );
      const conceptIdByName = new Map(created.map((c) => [c.name, c.id]));

      for (const edge of edges) {
        const fromId = conceptIdByName.get(edge.from);
        const toId = conceptIdByName.get(edge.to);
        if (!fromId || !toId) continue;
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
        const anchors = buildConceptSourceRows(extracted.concepts, conceptIdByName, document.id);
        if (anchors.length > 0) {
          await tx.conceptSourceRef.createMany({ data: anchors });
        }
      }

      await tx.studyPlan.update({
        where: { id: planId },
        data: { status: 'active', dagAutoFixed: autoFixed },
      });
      await tx.analysisJob.update({
        where: { id: jobId },
        data: { status: 'done', completedAt: new Date() },
      });
    });
  } catch (error) {
    console.error(`[analysis] job ${jobId} failed:`, error);
    await markFailed(jobId);
    return;
  }

  // The check above ran on concept names; if the AI returned two concepts sharing a
  // name, the edges actually persisted can differ from the set that was validated.
  // Re-check what landed in the DB, by concept id, and repair it if needed (I3.3).
  await validateDAG(planId);
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
