import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { loadSession, parseConceptQueue } from './interview.service';
import { summarizeSession, type SessionConceptSummaryInput } from './gemini.service';
import { countsTowardMastery, sessionMasteryScore } from '../utils/mastery';
import type { Verdict } from '../schemas/ai-interview.schema';
import type {
  SessionSummaryConceptResponse,
  SessionSummaryReport,
  SessionSummaryResponse,
  SessionSummaryReviewItemResponse,
} from '../types/interview.types';

/**
 * `GET /interviews/:id/summary` (I6.5 / AE-09) — the fourth and last AI call the system ever
 * makes. Collects the scores I6.3/I7.2 already computed, asks Gemini to turn them into prose
 * exactly once per session, and folds in the review schedule I7.2 queued: both the traceback
 * prerequisites (AE-08) and the per-concept spaced repetition.
 */

const SUMMARY_UNAVAILABLE_MESSAGE = 'Không thể tổng hợp nhận xét lúc này.';

const MS_PER_MINUTE = 60 * 1000;

/** Gemini failures arrive as `AI_*` AppErrors (#114), same convention as I6.3. */
function isAiFailure(error: unknown): boolean {
  return error instanceof AppError && (error.code?.startsWith('AI_') ?? false);
}

/**
 * `InterviewSession.summaryText` is a single `String?` column (#113) — no separate columns
 * exist for `strengths`/`weaknesses`/`recommendations`, and adding them is outside this
 * issue's scope (no migration is listed in its Todo List). The whole structured
 * `summarize_session` response is serialized as JSON into that one column instead, so a
 * second `GET` never re-calls Gemini (R01) while still returning the full breakdown, not
 * just the prose.
 */
interface CachedSummary {
  summaryText: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

function parseCachedSummary(raw: string): CachedSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'summaryText' in parsed &&
    'strengths' in parsed &&
    'weaknesses' in parsed &&
    'recommendations' in parsed &&
    typeof (parsed as CachedSummary).summaryText === 'string' &&
    Array.isArray((parsed as CachedSummary).strengths) &&
    Array.isArray((parsed as CachedSummary).weaknesses) &&
    Array.isArray((parsed as CachedSummary).recommendations)
  ) {
    return parsed as CachedSummary;
  }
  return null;
}

/** The `question_cache`-style "already have it, don't call AI again" branch. */
function reportFromCache(cached: CachedSummary): SessionSummaryReport {
  return {
    text: cached.summaryText,
    strengths: cached.strengths,
    weaknesses: cached.weaknesses,
    recommendations: cached.recommendations,
    generatedByAi: true,
    message: null,
  };
}

/** UC-14 E1: no AI text, but the structured score table below is still real and still returned. */
function unavailableReport(): SessionSummaryReport {
  return {
    text: null,
    strengths: [],
    weaknesses: [],
    recommendations: [],
    generatedByAi: false,
    message: SUMMARY_UNAVAILABLE_MESSAGE,
  };
}

async function loadConceptSummaries(
  sessionId: string,
  queue: string[]
): Promise<SessionSummaryConceptResponse[]> {
  const [concepts, turns] = await Promise.all([
    prisma.concept.findMany({
      where: { id: { in: queue } },
      select: { id: true, name: true },
    }),
    prisma.interviewTurn.findMany({
      where: { sessionId },
      orderBy: [{ conceptId: 'asc' }, { turnIndex: 'asc' }],
      select: { conceptId: true, turnIndex: true, score: true, verdict: true, mode: true },
    }),
  ]);

  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const turnsByConcept = new Map<string, typeof turns>();
  for (const turn of turns) {
    const existing = turnsByConcept.get(turn.conceptId);
    if (existing) {
      existing.push(turn);
    } else {
      turnsByConcept.set(turn.conceptId, [turn]);
    }
  }

  // Order follows the session's own queue, not query order — that is the order the student
  // actually went through the concepts in.
  const summaries: SessionSummaryConceptResponse[] = [];
  for (const conceptId of queue) {
    const concept = conceptById.get(conceptId);
    // Concept row gone since (re-analysis, SP-05) — nothing left to report for it.
    if (!concept) continue;

    const conceptTurns = turnsByConcept.get(conceptId) ?? [];
    summaries.push({
      conceptId,
      name: concept.name,
      // Suy điểm từ turns của chính phiên này — không đọc Concept.masteryScore (có thể đã bị
      // một phiên sau đè lên). Xem sessionMasteryScore() / mastery.ts.
      masteryScore: sessionMasteryScore(conceptTurns),
      turns: conceptTurns.map((turn) => ({
        turnIndex: turn.turnIndex,
        score: turn.score,
        verdict: turn.verdict,
        mode: turn.mode,
        // The formula on the results screen must add up to the number printed next to it, so
        // the client needs to know which turns the server left out — not guess it (#392 (c)).
        countsTowardMastery: countsTowardMastery(turn),
      })),
    });
  }
  return summaries;
}

/**
 * The review schedule this session produced, read straight from `ReviewQueueItem` and never
 * recomputed here — I7.2 already made every one of these decisions once, when each concept
 * finished. Both reasons it writes are returned: the `spaced_repetition` row it creates for
 * every finished concept, and the `traceback` prerequisites AE-08 queues ahead of a weak one.
 *
 * Filtering to `reason: 'traceback'` (as this did until #119) hid the schedule of any session
 * that never triggered a traceback — a student who did well got an empty block where their next
 * review dates belong. The summary screen tells the two apart by `reason`.
 *
 * Each row carries its own `id` and its `sourceConceptId` out (#310) so the client addresses rows
 * by identity: `id` is what `PATCH /review-queue/:itemId` takes, and grouping the traceback block
 * by `sourceConceptId` survives two concepts sharing a name.
 */
async function loadReviewScheduleForSession(
  sessionId: string
): Promise<SessionSummaryReviewItemResponse[]> {
  const items = await prisma.reviewQueueItem.findMany({
    where: { sourceSessionId: sessionId },
    select: {
      id: true,
      conceptId: true,
      reason: true,
      depth: true,
      status: true,
      scheduledFor: true,
      sourceConceptId: true,
      concept: { select: { name: true } },
    },
  });
  if (items.length === 0) return [];

  // `sourceConceptId` is a soft reference (no FK — see the schema comment), so it can't be
  // `include`d: resolved with one batched lookup instead of one query per row.
  const sourceIds = [
    ...new Set(items.map((item) => item.sourceConceptId).filter((id): id is string => id !== null)),
  ];
  const sourceConcepts =
    sourceIds.length > 0
      ? await prisma.concept.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
  const sourceNameById = new Map(sourceConcepts.map((concept) => [concept.id, concept.name]));

  return items
    .map((item) => ({
      id: item.id,
      conceptId: item.conceptId,
      name: item.concept.name,
      reason: item.reason,
      depth: item.depth,
      sourceConceptId: item.sourceConceptId,
      sourceConceptName: item.sourceConceptId
        ? (sourceNameById.get(item.sourceConceptId) ?? null)
        : null,
      status: item.status,
      scheduledFor: item.scheduledFor ?? null,
    }))
    .sort(compareReviewItems);
}

/**
 * Queue order for the summary screen: the foundations the traceback found go first, shallowest
 * (depth 1, the direct prerequisite) before deeper — they are due immediately and are what the
 * next session should rebuild first — then the ordinary schedule by due date. Ties break on name
 * so the list is stable across requests: every traceback row of one session shares the same
 * `scheduledFor`, and Postgres gives no inherent order without an `ORDER BY`.
 */
function compareReviewItems(
  a: SessionSummaryReviewItemResponse,
  b: SessionSummaryReviewItemResponse
): number {
  const groupA = a.reason === 'traceback' ? 0 : 1;
  const groupB = b.reason === 'traceback' ? 0 : 1;
  if (groupA !== groupB) return groupA - groupB;

  const keyA = groupA === 0 ? a.depth : (a.scheduledFor?.getTime() ?? null);
  const keyB = groupB === 0 ? b.depth : (b.scheduledFor?.getTime() ?? null);
  // A row missing its sort key sinks to the end of its group rather than jumping to the front.
  if (keyA === null || keyB === null) {
    if (keyA !== keyB) return keyA === null ? 1 : -1;
  } else if (keyA !== keyB) {
    return keyA - keyB;
  }

  return a.name.localeCompare(b.name);
}

/**
 * `GET /interviews/:id/summary`. `404` for a session that does not exist or is not the
 * caller's (via `loadSession`'s existing 404-not-403 rule); `409` for one still in progress —
 * summarising a session that has not finished yet would report scores that are still changing.
 */
export async function getSessionSummary(
  sessionId: string,
  userId: string
): Promise<SessionSummaryResponse> {
  const session = await loadSession(sessionId, userId);

  // SPEC_DB-03: the history screen must open a paused/abandoned session's detail too, but
  // "paused" has nothing finished to summarise yet — only a closed session (completed or
  // abandoned) has a real score table to show.
  if (session.status !== 'completed' && session.status !== 'abandoned') {
    throw new AppError('This interview session has not finished yet', 409, 'SESSION_NOT_COMPLETED');
  }

  const queue = parseConceptQueue(session.conceptQueue);
  const [concepts, reviewSchedule] = await Promise.all([
    loadConceptSummaries(sessionId, queue),
    loadReviewScheduleForSession(sessionId),
  ]);

  let summary: SessionSummaryReport;
  if (session.status === 'abandoned') {
    // SPEC_DB-03 AF3: summarize_session is deliberately never called for an abandoned session
    // (see abandonInterview()'s own comment on why) — the queue never ran to completion, so
    // there is nothing for it to read. This is not an AI failure, so it does NOT reuse
    // unavailableReport()'s message — that wording is UC-14 E1's specifically.
    summary = {
      text: null,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      generatedByAi: false,
      message: null,
    };
  } else {
    const summaryInput: SessionConceptSummaryInput[] = concepts.map((concept) => ({
      conceptName: concept.name,
      masteryScore: concept.masteryScore,
      verdicts: concept.turns
        .map((turn) => turn.verdict)
        .filter((verdict): verdict is Verdict => verdict !== null),
    }));
    const hasAnyGradedTurn = summaryInput.some((concept) => concept.verdicts.length > 0);

    const cached = session.summaryText ? parseCachedSummary(session.summaryText) : null;

    if (cached) {
      summary = reportFromCache(cached);
    } else if (!hasAnyGradedTurn) {
      // UC-12 E1 can end a session before its first concept was ever graded — nothing for
      // summarize_session to read, and calling it with an all-empty input would only invite a
      // made-up report. Same "score table only" shape as a genuine AI failure below.
      summary = unavailableReport();
    } else {
      try {
        const result = await summarizeSession({
          concepts: summaryInput,
          language: session.plan.languageDetected ?? undefined,
        });
        const toCache: CachedSummary = {
          summaryText: result.summary_text,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          recommendations: result.recommendations,
        };
        // Best-effort cache: if the write fails the AI result is already paid for (quota),
        // so we still return it rather than throwing 500 and re-calling Gemini next time.
        try {
          await prisma.interviewSession.update({
            where: { id: sessionId },
            data: { summaryText: JSON.stringify(toCache) },
          });
        } catch (dbError) {
          console.error('[session-summary] failed to cache summary to DB:', dbError);
        }
        summary = reportFromCache(toCache);
      } catch (error) {
        if (!isAiFailure(error)) throw error;
        summary = unavailableReport();
      }
    }
  }

  // Wall-clock elapsed time — includes any pause intervals (AE-03) since the model only
  // stores `startedAt` / `endedAt`, not accumulated active study time.
  const durationMinutes = session.endedAt
    ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / MS_PER_MINUTE)
    : 0;

  return {
    sessionId: session.id,
    status: session.status,
    durationMinutes,
    concepts,
    summary,
    reviewSchedule,
  };
}
