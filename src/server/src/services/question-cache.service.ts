import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { generateQuestion, type AiMaterial, type PreviousTurn } from './gemini.service';
import { loadMaterial } from './interview.service';
import { MAX_CACHED_QUESTIONS_PER_CONCEPT } from '../utils/interview-state';

/**
 * AE-06 (I6.4) — pre-generates flashcard-fallback questions so AE-05 has something to serve
 * when Gemini goes down mid-session (SDP risk R01, the highest-exposure risk in the plan).
 *
 * Runs fire-and-forget right after an `AnalysisJob` reaches `done` (see the trigger in
 * `analysis.service.ts`) — never awaited by the request that triggered analysis, and its own
 * failures must never turn a successful analysis into a failed job, so every error here is only
 * `console.warn`'d, never thrown out of `pregenerateForPlan`.
 */

/**
 * Small delay between Gemini calls so a plan with many concepts doesn't burn the free-tier rate
 * limit in one burst (R01). Skipped entirely under mocks, where there is no real rate limit.
 * Read on every call (not cached at module scope) so tests can flip `USE_MOCK_AI` per case.
 */
function pregenDelayMs(): number {
  return process.env.USE_MOCK_AI === 'true'
    ? 0
    : Number(process.env.QUESTION_CACHE_DELAY_MS ?? 1500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pre-generates up to `MAX_CACHED_QUESTIONS_PER_CONCEPT` questions for every active concept of a
 * plan, skipping concepts that already have enough cached (idempotent — a re-analysis or a retry
 * that runs this again spends no extra Gemini calls on concepts already covered).
 */
export async function pregenerateForPlan(planId: string): Promise<void> {
  const concepts = await prisma.concept.findMany({
    where: { planId, status: 'active' },
    // `primaryDocumentId`: each concept is pre-generated against the file it is filed under, the
    // same rule the live interview follows. Caching one material for the whole plan would
    // pre-warm every concept of a whole subject from its first file.
    select: { id: true, name: true, primaryDocumentId: true },
  });
  if (concepts.length === 0) return;

  const counts = await prisma.questionCache.groupBy({
    by: ['conceptId'],
    where: { conceptId: { in: concepts.map((concept) => concept.id) } },
    _count: { _all: true },
  });
  const cachedCountByConcept = new Map(counts.map((row) => [row.conceptId, row._count._all]));

  const pendingConcepts = concepts.filter(
    (concept) => (cachedCountByConcept.get(concept.id) ?? 0) < MAX_CACHED_QUESTIONS_PER_CONCEPT
  );
  if (pendingConcepts.length === 0) return;

  const plan = await prisma.studyPlan.findUnique({
    where: { id: planId },
    select: { languageDetected: true },
  });

  /**
   * Material per topic, loaded once each and remembered for this run.
   *
   * A whole-plan load used to happen up front, which let one failure end the run with a single
   * warning. Per topic that shortcut is wrong in both directions: one unreadable file must not
   * cost the other topics their pre-warmed questions, and one failure repeated per concept would
   * bury the log. So: memoise per document, cache the FAILURE too, and warn once per document.
   * `getPlanMaterial` already dedupes across runs; this map only avoids re-awaiting within one.
   */
  const materialByDocument = new Map<string, Promise<AiMaterial | null>>();
  const materialFor = (documentId: string | null): Promise<AiMaterial | null> => {
    const key = documentId ?? 'default';
    const existing = materialByDocument.get(key);
    if (existing) return existing;
    const loading = loadMaterial(planId, documentId).catch((error: unknown) => {
      console.warn(
        `[question-cache] could not load material for plan ${planId} document ${key}, ` +
          'skipping its concepts:',
        error
      );
      return null;
    });
    materialByDocument.set(key, loading);
    return loading;
  };

  let callsMade = 0;

  for (const concept of pendingConcepts) {
    const alreadyCached = cachedCountByConcept.get(concept.id) ?? 0;
    const material = await materialFor(concept.primaryDocumentId);
    // Its topic's file could not be read. Its siblings under other topics still can be, so this
    // skips one concept rather than the plan.
    if (!material) continue;

    try {
      // Only the questions generated in this loop, so the prompt's "don't repeat a question
      // already asked" instruction can't reference a real student's turns — there are none.
      const previousTurns: PreviousTurn[] = [];

      for (
        let turnIndex = alreadyCached + 1;
        turnIndex <= MAX_CACHED_QUESTIONS_PER_CONCEPT;
        turnIndex++
      ) {
        // Re-checked on every iteration rather than trusted from the count read at the top of
        // this function: a concurrent `pregenerateForPlan` run for the same plan (e.g. two
        // reanalyze requests close together) can fill this concept's cache while this run is
        // still working through earlier concepts, especially on a plan with many concepts where
        // the throttle stretches the whole run to tens of seconds. No DB-level lock or schema
        // change — just don't spend a Gemini call once another run already finished this slot.
        const currentCount = await prisma.questionCache.count({
          where: { conceptId: concept.id },
        });
        if (currentCount >= MAX_CACHED_QUESTIONS_PER_CONCEPT) break;

        if (callsMade > 0) {
          await sleep(pregenDelayMs());
        }
        callsMade += 1;

        const question = await generateQuestion({
          conceptName: concept.name,
          material,
          turnIndex,
          // 'deeper'/'probe' prompts reference "the student's previous answer" — meaningless
          // with no real session, so every pre-generated question uses the opening mode.
          mode: 'initial',
          previousTurns,
          language: plan?.languageDetected ?? undefined,
        });

        await prisma.questionCache.create({
          data: {
            conceptId: concept.id,
            questionText: question.question_text,
            questionType: question.question_type,
            // generate_question has no hint field today; adding one means touching the shared
            // AI schema/prompt for the live interview path too, for a column AE-05/AE-06 don't
            // require to be populated.
            answerHint: null,
          },
        });

        previousTurns.push({ questionText: question.question_text });
      }
    } catch (error) {
      // One concept's Gemini failure must not stop the rest of the plan from getting cached
      // (R01) — and must never bubble up to fail the AnalysisJob that triggered this.
      console.warn(
        `[question-cache] pregeneration failed for concept ${concept.id} (${concept.name}):`,
        error
      );
    }
  }
}

/**
 * Xoá toàn bộ câu hỏi đã cache của các concept thuộc plan (Issue #216). `planConceptMerge` giữ
 * nguyên id của concept qua mỗi lần merge, nên nếu không xoá, bước kiểm tra idempotent của
 * `pregenerateForPlan` ở trên sẽ thấy concept đã đủ 2 câu và bỏ qua việc sinh lại — để sót câu
 * hỏi cũ từ tài liệu/lần phân tích đã bị thay thế. Xoá không điều kiện cho cả plan thay vì tính
 * chính xác "concept nào bị ảnh hưởng": concept nào còn tồn tại sau lần merge tiếp theo,
 * `pregenerateForPlan` sẽ tự sinh lại cache từ đầu cho concept đó.
 *
 * Bắt buộc chạy trong cùng transaction với lệnh tạo `AnalysisJob` kế tiếp, và phải chạy trước
 * lệnh `create` đó — để không ai có thể thấy trạng thái plan đã có job mới nhưng cache vẫn còn
 * câu hỏi cũ.
 */
export async function clearQuestionCacheForPlan(
  tx: Prisma.TransactionClient,
  planId: string
): Promise<void> {
  await tx.questionCache.deleteMany({ where: { concept: { planId } } });
}
