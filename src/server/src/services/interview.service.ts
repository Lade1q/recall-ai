import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  generateQuestion,
  getPlanMaterial,
  gradeAnswer,
  uploadFile,
  type AiMaterial,
  type PreviousTurn,
} from './gemini.service';
import { finalizeConceptResult, type FinalizeConceptResultOutput } from './concept-result.service';
import { getReviewQueueForPlan } from './scheduling.service';
import type { QuestionMode, QuestionType } from '../schemas/ai-interview.schema';
import type { CreateInterviewInput } from '../schemas/interview.schema';
import {
  DEFAULT_CONCEPTS_PER_SESSION,
  DEFAULT_MAX_TURNS_PER_CONCEPT,
  decideNextStep,
  isTurnWithinLimit,
  questionModeForStep,
  resolveFallbackStep,
  MAX_CACHED_QUESTIONS_PER_CONCEPT,
  SELF_GRADE_SCORE,
  SELF_GRADE_VERDICT,
  type SelfGrade,
} from '../utils/interview-state';
import { UPLOAD_DIR, resolveMaterialSource } from '../utils/material';
import {
  anchorMatchesCachedQuestion,
  buildTurnCitation,
  type CitedDocumentRow,
} from '../utils/question-citation';
import { gradedTurnScores } from '../utils/mastery';
import type {
  AbandonInterviewResponse,
  ConceptCompletedResponse,
  GetInterviewResponse,
  InterviewFallbackResponse,
  InterviewQuestionResponse,
  InterviewSessionState,
  InterviewTurnResponse,
  PauseInterviewResponse,
  ResumeInterviewResponse,
  StartInterviewResponse,
  SubmitAnswerResponse,
} from '../types/interview.types';

/**
 * Interview orchestration (I6.3 / #115) — the heart of AI Examiner.
 *
 * This file does exactly three things: read the session state out of the database, hand it to
 * the pure state machine in `utils/interview-state.ts`, and execute whatever that returned
 * (ask Gemini, write a turn, finalise a concept through I7.2). No routing decision is made
 * here and none is ever asked of the model (C4).
 *
 * Everything lives in `interview_sessions` / `interview_turns`, never in a module-level
 * variable: a server restart mid-session has to be invisible to the student, and the
 * "what happens next" decision is re-derived from stored turns on every request. That is also
 * what makes recovery free — a request that died between grading a turn and finalising its
 * concept leaves state the next request can finish, because it replays the same decision.
 */

/**
 * How long a claimed-but-ungraded answer stays claimed. Long enough to cover the two Gemini
 * calls a turn can wait on (10–20s, #115), short enough that a process killed mid-grade does
 * not lock the student out of their own session for the rest of the day.
 */
const ANSWER_CLAIM_STALE_MS = 2 * 60 * 1000;

const RESUME_MESSAGE =
  'Bạn đang có một phiên kiểm tra chưa hoàn thành cho kế hoạch này. Hãy tiếp tục phiên đó.';
const FALLBACK_GRADING_MESSAGE =
  'AI tạm thời không chấm được câu trả lời. Câu trả lời của bạn đã được giữ lại — hãy gửi lại sau giây lát.';
const FALLBACK_QUESTION_MESSAGE =
  'AI tạm thời không sinh được câu hỏi tiếp theo. Hãy mở lại phiên sau giây lát để tiếp tục.';
const NO_CONCEPTS_MESSAGE = 'Không có khái niệm nào cần ôn tập trong kế hoạch này.';
const NO_CACHE_MESSAGE =
  'Không thể chuyển sang chế độ Flashcard do chưa có câu hỏi sẵn. Vui lòng thử lại sau khi AI khả dụng.';

// --- Row shapes -------------------------------------------------------------------------

const sessionSelect = {
  id: true,
  userId: true,
  planId: true,
  status: true,
  conceptQueue: true,
  currentConceptIdx: true,
  maxTurnsPerConcept: true,
  fallbackMode: true,
  // Only read by session-summary.service.ts (AE-09) — the cache of the one-time
  // `summarize_session` call, serialized as JSON (see that file for why).
  summaryText: true,
  startedAt: true,
  endedAt: true,
  plan: { select: { languageDetected: true } },
} satisfies Prisma.InterviewSessionSelect;

type SessionRow = Prisma.InterviewSessionGetPayload<{ select: typeof sessionSelect }>;

const turnSelect = {
  id: true,
  conceptId: true,
  turnIndex: true,
  questionText: true,
  questionType: true,
  answerText: true,
  score: true,
  feedback: true,
  verdict: true,
  source: true,
  // The C5 anchor frozen when this turn was asked (#240) — read back as-is, never re-derived.
  sourceDocumentId: true,
  sourcePageFrom: true,
  sourcePageTo: true,
  askedAt: true,
  answeredAt: true,
  concept: { select: { name: true } },
} satisfies Prisma.InterviewTurnSelect;

type TurnRow = Prisma.InterviewTurnGetPayload<{ select: typeof turnSelect }>;

/**
 * Everything one request needs about a session, read in three queries. Snapshot only — any
 * function that writes reloads it rather than patching this object, so no caller can read a
 * value that the database has since moved past.
 */
interface SessionView {
  session: SessionRow;
  queue: string[];
  conceptIndex: number;
  /** `null` once the queue is exhausted — the session has nothing left to ask. */
  concept: { id: string; name: string } | null;
  /** Every turn of the session, oldest first — the transcript. */
  turns: TurnRow[];
  /** Turns of the current concept, by `turnIndex`. */
  conceptTurns: TurnRow[];
  /** The turn still waiting for a verdict, if any. */
  pending: TurnRow | null;
  /**
   * The documents this session's turns froze a C5 anchor onto, by id — enough to name the file
   * and to tell whether it has been replaced since. Empty when no turn carries a snapshot.
   */
  documents: Map<string, CitedDocumentRow>;
}

// --- Loading ----------------------------------------------------------------------------

/**
 * `conceptQueue` is a JSON column, so its contents are validated rather than trusted. Exported
 * for `session-summary.service.ts` (AE-09), which needs the same queue order to list a
 * session's concepts.
 */
export function parseConceptQueue(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Ownership is reported as 404, not 403 (#115): a session that exists but belongs to somebody
 * else must be indistinguishable from one that does not exist, or the endpoint leaks which
 * ids are real.
 *
 * Exported for `session-summary.service.ts` (AE-09/I6.5): the summary endpoint needs the exact
 * same ownership check and row shape as every other interview endpoint, so it reuses this
 * rather than re-implementing the 404-not-403 rule a second time.
 */
export async function loadSession(sessionId: string, userId: string): Promise<SessionRow> {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    select: sessionSelect,
  });

  if (!session || session.userId !== userId) {
    throw new AppError('Interview session not found', 404, 'NOT_FOUND');
  }
  return session;
}

/**
 * Resolves which concept the session is on, skipping queue entries whose Concept row is gone —
 * a re-analysis (SP-05) can delete a concept between two sessions, and one missing row must
 * not strand the whole session. The skip is persisted so the next request does not repeat it.
 */
async function resolveCurrentConcept(
  session: SessionRow,
  queue: string[]
): Promise<{ concept: { id: string; name: string } | null; conceptIndex: number }> {
  let index = Math.max(session.currentConceptIdx, 0);

  while (index < queue.length) {
    const conceptId = queue[index];
    const concept = conceptId
      ? await prisma.concept.findFirst({
          where: { id: conceptId, planId: session.planId },
          select: { id: true, name: true },
        })
      : null;

    if (concept) {
      return { concept, conceptIndex: index };
    }
    index += 1;
  }

  return { concept: null, conceptIndex: queue.length };
}

async function buildView(session: SessionRow): Promise<SessionView> {
  const queue = parseConceptQueue(session.conceptQueue);
  const { concept, conceptIndex } = await resolveCurrentConcept(session, queue);

  if (conceptIndex !== session.currentConceptIdx && conceptIndex <= queue.length) {
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { currentConceptIdx: conceptIndex },
    });
  }

  const turns = await prisma.interviewTurn.findMany({
    where: { sessionId: session.id },
    orderBy: [{ askedAt: 'asc' }, { turnIndex: 'asc' }],
    select: turnSelect,
  });

  // The turns already carry their own anchors (#240), so the read path only has to name the
  // documents they point at — no lookup of what the concepts are anchored to *now*. Skipped
  // entirely for a session whose turns all predate snapshotting, or whose concepts had no
  // anchor to freeze.
  const documentIds = [
    ...new Set(
      turns
        .map((turn) => turn.sourceDocumentId)
        .filter((documentId): documentId is string => documentId !== null)
    ),
  ];
  const documents = documentIds.length
    ? await prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, filename: true, kind: true, updatedAt: true },
      })
    : [];

  const conceptTurns = concept
    ? turns
        .filter((turn) => turn.conceptId === concept.id)
        .sort((a, b) => a.turnIndex - b.turnIndex)
    : [];

  return {
    session: { ...session, currentConceptIdx: conceptIndex },
    queue,
    conceptIndex,
    concept,
    turns,
    conceptTurns,
    // A turn with no verdict is still open, whether or not an answer has been submitted for
    // it: an answer claimed but not yet graded is exactly the turn the student is waiting on.
    pending: conceptTurns.find((turn) => turn.verdict === null) ?? null,
    documents: new Map(documents.map((document) => [document.id, document])),
  };
}

async function reloadView(sessionId: string, userId: string): Promise<SessionView> {
  return buildView(await loadSession(sessionId, userId));
}

// --- Material ---------------------------------------------------------------------------

/** Mock mode never touches the material, so it must not touch the filesystem either. */
const MOCK_MATERIAL: AiMaterial = { kind: 'text', text: '[mock material]' };

/**
 * The plan's source document, as the two interview AI calls take it. Cached per plan by
 * `getPlanMaterial` (#114) — Sprint 4 re-sends the whole document every turn, and re-uploading
 * it each time would be both slow and wasteful.
 *
 * Exported for `question-cache.service.ts` (AE-06/I6.4): pregeneration needs the exact same
 * material a live interview turn would use, and reuses this module's `getPlanMaterial` cache
 * rather than uploading the document a second time.
 */
export async function loadMaterial(planId: string): Promise<AiMaterial> {
  if (process.env.USE_MOCK_AI === 'true') {
    return MOCK_MATERIAL;
  }

  return getPlanMaterial(planId, async () => {
    const document = await prisma.document.findFirst({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: { fileKey: true },
    });
    if (!document) {
      throw new AppError(
        'This study plan has no source document to ask questions from',
        409,
        'NO_MATERIAL'
      );
    }

    const source = resolveMaterialSource(document.fileKey);
    const absolutePath = path.join(UPLOAD_DIR, document.fileKey);

    if (source.kind === 'text') {
      return { kind: 'text', text: await fs.promises.readFile(absolutePath, 'utf-8') };
    }

    const uploaded = await uploadFile(absolutePath, source.mimeType);
    return { kind: source.kind, uri: uploaded.uri, mimeType: uploaded.mimeType };
  });
}

// --- Mapping to responses ---------------------------------------------------------------

/**
 * Both mappers take the view's document map rather than reading anchors themselves: every
 * entry point (`startInterview`, `getInterview`, `submitAnswer`) reaches the client through
 * these two functions, so filling `sourceCitation` here is what makes C5 hold on all of them.
 */
function toQuestionResponse(
  turn: TurnRow,
  documents: Map<string, CitedDocumentRow>
): InterviewQuestionResponse {
  return {
    turnId: turn.id,
    conceptId: turn.conceptId,
    conceptName: turn.concept.name,
    turnIndex: turn.turnIndex,
    questionText: turn.questionText,
    questionType: turn.questionType,
    source: turn.source,
    sourceCitation: buildTurnCitation(turn, documents),
  };
}

function toTurnResponse(
  turn: TurnRow,
  documents: Map<string, CitedDocumentRow>
): InterviewTurnResponse {
  return {
    id: turn.id,
    conceptId: turn.conceptId,
    conceptName: turn.concept.name,
    turnIndex: turn.turnIndex,
    questionText: turn.questionText,
    questionType: turn.questionType,
    answerText: turn.answerText,
    score: turn.score,
    feedback: turn.feedback,
    verdict: turn.verdict,
    askedAt: turn.askedAt,
    answeredAt: turn.answeredAt,
    sourceCitation: buildTurnCitation(turn, documents),
  };
}

function toSessionState(view: SessionView): InterviewSessionState {
  const { session } = view;
  const isEnded = session.status === 'completed' || session.status === 'abandoned';

  return {
    id: session.id,
    planId: session.planId,
    status: session.status,
    fallbackMode: session.fallbackMode,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    // A finished session has no concept "currently" being asked. Most `completed` sessions
    // already report `null` because the queue ran out (`view.concept` is null past its end),
    // but two paths finish with a concept still in hand: `abandon` bumps the index past the
    // concept it just scored, so `view.concept` is the *next, never-asked* one; and UC-12 E1
    // completes a session while still pointing at a concept that had no question to serve.
    // Reporting either as `currentConcept` would tell the client the session stopped somewhere
    // it did not. `completedConcepts` still needs the bumped index, so only this field is
    // nulled — see the bump in `abandonInterview`.
    currentConcept: isEnded ? null : view.concept,
    progress: {
      conceptIndex: view.conceptIndex,
      conceptTotal: view.queue.length,
      completedConcepts: Math.min(view.conceptIndex, view.queue.length),
      turnIndex: view.pending?.turnIndex ?? null,
      maxTurnsPerConcept: session.maxTurnsPerConcept,
    },
  };
}

function toConceptCompleted(
  result: FinalizeConceptResultOutput,
  conceptName: string
): ConceptCompletedResponse {
  return {
    conceptId: result.conceptId,
    conceptName,
    masteryScore: result.masteryScore,
    reviewInDays: result.reviewInDays,
    scheduledFor: result.scheduledFor,
    prerequisites: result.prerequisites.map((prerequisite) => ({
      conceptId: prerequisite.conceptId,
      name: prerequisite.name,
      depth: prerequisite.depth,
      reason: prerequisite.reason,
      masteryScore: prerequisite.masteryScore,
    })),
    tracebackSkipReason: result.tracebackSkipReason,
  };
}

// --- Asking a question ------------------------------------------------------------------

/** Prisma's unique-constraint code — the `@@unique([sessionId, conceptId, turnIndex])` index. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Gemini failures arrive as `AI_*` AppErrors (#114); those are survivable, other errors are bugs. */
function isAiFailure(error: unknown): boolean {
  return error instanceof AppError && (error.code?.startsWith('AI_') ?? false);
}

/**
 * `question_cache.questionType` is an unconstrained `String?` column (unlike `InterviewTurn`'s
 * `QuestionType` enum column), so a cached row's value is narrowed rather than cast — a bad or
 * stale value (the enum has changed before, e.g. seed data once wrote `'open_ended'`) becomes
 * `null` instead of a rejected insert or a silently wrong enum value.
 */
function toQuestionType(value: string | null): QuestionType | null {
  return value === 'recall' || value === 'application' || value === 'why' ? value : null;
}

/** The turns already asked about this concept, so 'deeper'/'probe' can build on them. */
function toPreviousTurns(conceptTurns: TurnRow[]): PreviousTurn[] {
  return conceptTurns.map((turn) => ({
    questionText: turn.questionText,
    answerText: turn.answerText,
    verdict: turn.verdict,
  }));
}

// --- The C5 anchor, frozen at ask time ---------------------------------------------------

/** The concept's current anchor, as both ask paths read it. */
type ConceptAnchorRow = {
  documentId: string;
  pageFrom: number | null;
  pageTo: number | null;
  createdAt: Date;
} | null;

/**
 * The anchor a question asked *right now* would cite: the concept's oldest `concept_sources`
 * row, the same one `getConceptDetail` (DB-06) lists first, so one concept reads as one
 * citation everywhere. `null` for a concept with no anchor at all — a manual concept (#172) is
 * a valid state, not an error.
 */
async function loadConceptAnchor(conceptId: string): Promise<ConceptAnchorRow> {
  return prisma.conceptSourceRef.findFirst({
    where: { conceptId },
    orderBy: { createdAt: 'asc' },
    select: { documentId: true, pageFrom: true, pageTo: true, createdAt: true },
  });
}

/** The three snapshot columns of an `InterviewTurn`, all `null` when there is no anchor. */
function toAnchorSnapshot(anchor: ConceptAnchorRow) {
  return {
    sourceDocumentId: anchor?.documentId ?? null,
    sourcePageFrom: anchor?.pageFrom ?? null,
    sourcePageTo: anchor?.pageTo ?? null,
  };
}

/**
 * Generates one question and stores it as the session's next turn.
 *
 * The C6 limit is re-checked here rather than only in the state machine: this is the single
 * place a turn can be created, so a limit checked here cannot be bypassed by any caller — and
 * `isTurnWithinLimit` clamps to the global maximum too, so even a session row claiming a
 * larger `maxTurnsPerConcept` cannot produce a turn the mastery formula has no weight for.
 */
async function askQuestion(
  view: SessionView,
  concept: { id: string; name: string },
  turnIndex: number,
  mode: QuestionMode
): Promise<TurnRow> {
  const { session } = view;

  if (!isTurnWithinLimit(turnIndex, session.maxTurnsPerConcept)) {
    throw new AppError(
      `Turn ${turnIndex} exceeds the limit of ${session.maxTurnsPerConcept} turns per concept`,
      409,
      'TURN_LIMIT_REACHED'
    );
  }

  const material = await loadMaterial(session.planId);
  const question = await generateQuestion({
    conceptName: concept.name,
    material,
    turnIndex,
    mode,
    previousTurns: mode === 'initial' ? [] : toPreviousTurns(view.conceptTurns),
    language: session.plan.languageDetected ?? undefined,
  });

  const identity = { sessionId: session.id, conceptId: concept.id, turnIndex };
  // Read after `generateQuestion` resolved, not before: the anchor recorded has to be the one
  // in force when the turn is written, and a question can wait 10–20s on Gemini (#115).
  const anchor = await loadConceptAnchor(concept.id);

  try {
    return await prisma.interviewTurn.create({
      data: {
        ...identity,
        questionText: question.question_text,
        questionType: question.question_type,
        ...toAnchorSnapshot(anchor),
      },
      select: turnSelect,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Audit A2: a concurrent request already created this exact turn. The unique index is what
    // makes a double-submit produce one turn instead of two; the loser simply adopts the row
    // that won, having burnt one generate_question call.
    const existing = await prisma.interviewTurn.findUnique({
      where: { sessionId_conceptId_turnIndex: identity },
      select: turnSelect,
    });
    if (!existing) throw error;
    return existing;
  }
}

// --- Ending a concept and a session ------------------------------------------------------

async function enableFallbackMode(session: SessionRow): Promise<SessionRow> {
  if (session.fallbackMode) return session;

  return prisma.interviewSession.update({
    where: { id: session.id },
    data: { fallbackMode: true },
    select: sessionSelect,
  });
}

async function completeSession(session: SessionRow): Promise<SessionRow> {
  if (session.status !== 'active' && session.status !== 'paused') return session;

  return prisma.interviewSession.update({
    where: { id: session.id },
    data: { status: 'completed', endedAt: new Date() },
    select: sessionSelect,
  });
}

/**
 * Ends the current concept: hands its turn scores to `finalizeConceptResult()` (I7.2) and moves
 * the queue on.
 *
 * Every finished concept goes through here, whatever it scored (audit A4) — that is what keeps
 * a well-answered concept on the spaced-repetition calendar instead of dropping out of the
 * plan. The mastery formula and the traceback decision both belong to I7.2 and are deliberately
 * not reimplemented here.
 */
async function finishConcept(
  view: SessionView,
  concept: { id: string; name: string }
): Promise<ConceptCompletedResponse> {
  // Read the scores back from the database rather than from the view: the turn that triggered
  // this was graded after the view was built.
  const turns = await prisma.interviewTurn.findMany({
    where: { sessionId: view.session.id, conceptId: concept.id },
    orderBy: { turnIndex: 'asc' },
    select: { score: true },
  });
  const turnScores = gradedTurnScores(turns);

  const result = await finalizeConceptResult({
    sessionId: view.session.id,
    conceptId: concept.id,
    turnScores,
  });

  const nextIndex = view.conceptIndex + 1;
  const isLastConcept = nextIndex >= view.queue.length;

  await prisma.interviewSession.update({
    where: { id: view.session.id },
    data: {
      currentConceptIdx: nextIndex,
      // The queue is exhausted, so the session is over (I6.5 summarises it from here).
      ...(isLastConcept ? { status: 'completed' as const, endedAt: new Date() } : {}),
    },
  });

  return toConceptCompleted(result, concept.name);
}

// --- The state machine, executed -------------------------------------------------------

interface AdvanceResult {
  view: SessionView;
  question: InterviewQuestionResponse | null;
  /** Concepts finalised on the way to that question — normally none or one. */
  completed: ConceptCompletedResponse[];
  fallback: InterviewFallbackResponse | null;
}

/**
 * Brings the session to the question it should be showing, running the state machine over
 * whatever is stored.
 *
 * Every entry point goes through here — starting a session, resuming one, reading one, and the
 * tail of `submitAnswer` — so the decision table is executed in exactly one place. Because it
 * reads the last *graded* turn rather than being told what just happened, it also finishes work
 * an earlier request left half-done (crash, timeout, AI outage) instead of getting stuck.
 */
async function advanceToNextQuestion(
  view: SessionView,
  completed: ConceptCompletedResponse[] = []
): Promise<AdvanceResult> {
  if (view.pending) {
    return {
      view,
      question: toQuestionResponse(view.pending, view.documents),
      completed,
      fallback: null,
    };
  }

  const concept = view.concept;
  if (!concept) {
    const session = await completeSession(view.session);
    return { view: { ...view, session }, question: null, completed, fallback: null };
  }

  // Once fallbackMode is set, no code path below this line may run for the rest of the
  // session (#115 / AE-05): a concept switch, a resume, a retry must all keep re-entering
  // this branch rather than trying Gemini again just because it happens to be reachable now.
  if (view.session.fallbackMode) {
    return advanceFallback(view, concept, completed);
  }

  const lastGraded = view.conceptTurns[view.conceptTurns.length - 1] ?? null;
  let mode: QuestionMode = 'initial';

  if (lastGraded?.verdict) {
    const step = decideNextStep({
      verdict: lastGraded.verdict,
      turnIndex: lastGraded.turnIndex,
      maxTurns: view.session.maxTurnsPerConcept,
      remainingConcepts: view.queue.length - view.conceptIndex - 1,
    });
    const nextMode = questionModeForStep(step);

    if (!nextMode) {
      // The concept is over ('finish_concept' / 'finish_session'). Both finalise it first;
      // the recursion then either opens the next concept or ends the session.
      const conceptCompleted = await finishConcept(view, concept);
      const fresh = await reloadView(view.session.id, view.session.userId);
      return advanceToNextQuestion(fresh, [...completed, conceptCompleted]);
    }
    mode = nextMode;
  }

  try {
    const turn = await askQuestion(view, concept, view.conceptTurns.length + 1, mode);
    const fresh = await reloadView(view.session.id, view.session.userId);
    return {
      view: fresh,
      question: toQuestionResponse(turn, fresh.documents),
      completed,
      fallback: null,
    };
  } catch (error) {
    if (!isAiFailure(error)) throw error;

    // "AI lỗi ≠ phiên chết" (#115): the session stays open in fallback mode with no pending
    // question. The next GET/resume runs this same path again — and once I6.4 lands, serves a
    // pre-generated question from `question_cache` instead of failing.
    const session = await enableFallbackMode(view.session);
    return {
      view: { ...view, session },
      question: null,
      completed,
      fallback: { reason: 'question_unavailable', message: FALLBACK_QUESTION_MESSAGE },
    };
  }
}

/**
 * `advanceToNextQuestion`'s fallback-mode counterpart (AE-05 / I6.4): serves the concept's
 * pre-generated cache instead of calling Gemini, and never falls back to `decideNextStep`'s
 * deep/shallow/wrong branching — a flashcard concept always asks every cached question it has,
 * in order, then finishes, whatever the student self-graded (confirmed product decision).
 */
async function advanceFallback(
  view: SessionView,
  concept: { id: string; name: string },
  completed: ConceptCompletedResponse[]
): Promise<AdvanceResult> {
  const cached = await prisma.questionCache.findMany({
    where: { conceptId: concept.id },
    orderBy: { generatedAt: 'asc' },
    take: MAX_CACHED_QUESTIONS_PER_CONCEPT,
  });

  const step = resolveFallbackStep({
    cachedQuestionCount: cached.length,
    // Audit finding (real-Gemini manual test): grading failure — the common trigger for
    // fallback — always fires after a question was already asked by AI, so most concepts enter
    // fallback already holding `source: 'ai'` turns. Those must not count against the cache
    // index, or a concept with untouched cached questions finishes without ever serving them.
    cachedTurnsServed: view.conceptTurns.filter((turn) => turn.source === 'cache_fallback').length,
    totalTurnsServed: view.conceptTurns.length,
    maxTurns: view.session.maxTurnsPerConcept,
  });

  if (step.type === 'finish_concept') {
    const conceptCompleted = await finishConcept(view, concept);
    const fresh = await reloadView(view.session.id, view.session.userId);
    // Not advanceFallback: fallbackMode is still true on the reloaded session, so the next
    // concept re-enters advanceToNextQuestion's fallback branch and gets its own cache check
    // instead of inheriting this concept's exhausted cache.
    return advanceToNextQuestion(fresh, [...completed, conceptCompleted]);
  }

  const cacheRow = step.type === 'ask_cached' ? cached[step.cacheIndex] : undefined;
  if (step.type === 'no_cache_available' || !cacheRow) {
    // UC-12 E1: this concept never had a question served (AI or cache) and none is cached
    // either. End the session gracefully rather than leaving the student with nothing to
    // answer — the `!cacheRow` arm only guards resolveFallbackStep's own invariant (an index
    // it just derived from `cached.length`), it is not expected to be reachable in practice.
    const session = await completeSession(view.session);
    return {
      view: { ...view, session },
      question: null,
      completed,
      fallback: { reason: 'no_cached_questions', message: NO_CACHE_MESSAGE },
    };
  }

  const turn = await askCachedQuestion(view, concept, view.conceptTurns.length + 1, cacheRow);
  const fresh = await reloadView(view.session.id, view.session.userId);
  return {
    view: fresh,
    question: toQuestionResponse(turn, fresh.documents),
    completed,
    fallback: null,
  };
}

/**
 * Creates the session's next turn from a pre-generated cache row instead of calling Gemini.
 * Mirrors `askQuestion`'s C6 limit check and P2002 race handling exactly (audit A2) — the only
 * difference is where the question text/type come from.
 */
async function askCachedQuestion(
  view: SessionView,
  concept: { id: string; name: string },
  turnIndex: number,
  cacheRow: { questionText: string; questionType: string | null; generatedAt: Date }
): Promise<TurnRow> {
  const { session } = view;

  if (!isTurnWithinLimit(turnIndex, session.maxTurnsPerConcept)) {
    throw new AppError(
      `Turn ${turnIndex} exceeds the limit of ${session.maxTurnsPerConcept} turns per concept`,
      409,
      'TURN_LIMIT_REACHED'
    );
  }

  const identity = { sessionId: session.id, conceptId: concept.id, turnIndex };
  // A cached question is older than the turn serving it, so the concept's anchor is only this
  // question's anchor if it was already in place when the question was generated — see
  // `anchorMatchesCachedQuestion`. A re-analysis in between makes the current anchor somebody
  // else's, and the turn cites nothing rather than the wrong page.
  const anchor = await loadConceptAnchor(concept.id);
  const questionAnchor =
    anchor && anchorMatchesCachedQuestion(anchor.createdAt, cacheRow.generatedAt) ? anchor : null;

  try {
    return await prisma.interviewTurn.create({
      data: {
        ...identity,
        questionText: cacheRow.questionText,
        questionType: toQuestionType(cacheRow.questionType),
        source: 'cache_fallback',
        ...toAnchorSnapshot(questionAnchor),
      },
      select: turnSelect,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await prisma.interviewTurn.findUnique({
      where: { sessionId_conceptId_turnIndex: identity },
      select: turnSelect,
    });
    if (!existing) throw error;
    return existing;
  }
}

// --- Public API -------------------------------------------------------------------------

/**
 * POST /interviews — AE-01. Picks the concepts, creates the session, and returns the first
 * question already generated.
 *
 * An unfinished session on the same plan is handed back instead of a second one being created
 * (AE-03): two live sessions over one plan would grade the same concepts twice and write
 * conflicting mastery scores. No question is generated on that path — the client resumes,
 * which is where a fresh question (and its 10–20s wait) belongs.
 */
export async function startInterview(
  userId: string,
  input: CreateInterviewInput
): Promise<StartInterviewResponse> {
  const plan = await prisma.studyPlan.findUnique({
    where: { id: input.planId },
    select: { id: true, userId: true },
  });
  if (!plan || plan.userId !== userId) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }

  const existing = await prisma.interviewSession.findFirst({
    where: { userId, planId: plan.id, status: { in: ['active', 'paused'] } },
    orderBy: { startedAt: 'desc' },
    select: sessionSelect,
  });

  if (existing) {
    const view = await buildView(existing);
    return {
      created: false,
      session: toSessionState(view),
      question: view.pending ? toQuestionResponse(view.pending, view.documents) : null,
      message: RESUME_MESSAGE,
      fallback: null,
    };
  }

  const conceptQueue = await resolveConceptQueue(plan.id, userId, input.conceptIds);

  const session = await prisma.interviewSession.create({
    data: {
      userId,
      planId: plan.id,
      conceptQueue,
      maxTurnsPerConcept: input.maxTurnsPerConcept ?? DEFAULT_MAX_TURNS_PER_CONCEPT,
    },
    select: sessionSelect,
  });

  const advance = await advanceToNextQuestion(await buildView(session));

  return {
    created: true,
    session: toSessionState(advance.view),
    question: advance.question,
    message: advance.fallback?.message ?? null,
    fallback: advance.fallback,
  };
}

/**
 * The concepts the session will cover, in the order they will be asked. A client-supplied list
 * wins; otherwise the top of the review queue (I7.3) is taken, which is already ordered
 * traceback-first, weakest-first.
 */
async function resolveConceptQueue(
  planId: string,
  userId: string,
  requested: string[] | undefined
): Promise<string[]> {
  if (requested && requested.length > 0) {
    const unique = [...new Set(requested)];
    const found = await prisma.concept.findMany({
      where: { id: { in: unique }, planId, status: 'active' },
      select: { id: true },
    });

    const foundIds = new Set(found.map((concept) => concept.id));
    const missing = unique.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError(
        `Concept not found in this study plan: ${missing.join(', ')}`,
        404,
        'NOT_FOUND'
      );
    }
    return unique;
  }

  const queue = await getReviewQueueForPlan(planId, userId, DEFAULT_CONCEPTS_PER_SESSION);
  const conceptIds = queue.items.map((item) => item.conceptId);

  if (conceptIds.length === 0) {
    throw new AppError(queue.message ?? NO_CONCEPTS_MESSAGE, 409, 'NO_CONCEPTS_TO_REVIEW');
  }
  return conceptIds;
}

/**
 * GET /interviews/:id — current state, the question waiting for an answer, and the transcript.
 *
 * This is also the resume path (AE-03) and the recovery path: for an `active` session it runs
 * the state machine, so a session whose question generation failed gets a new question here
 * rather than staying stuck. A `paused` or finished session is only read — a status poll must
 * never spend a Gemini call.
 */
export async function getInterview(
  sessionId: string,
  userId: string
): Promise<GetInterviewResponse> {
  const session = await loadSession(sessionId, userId);
  const view = await buildView(session);

  if (session.status !== 'active') {
    return {
      session: toSessionState(view),
      currentQuestion: view.pending ? toQuestionResponse(view.pending, view.documents) : null,
      turns: view.turns.map((turn) => toTurnResponse(turn, view.documents)),
      fallback: null,
    };
  }

  const advance = await advanceToNextQuestion(view);
  return {
    session: toSessionState(advance.view),
    currentQuestion: advance.question,
    turns: advance.view.turns.map((turn) => toTurnResponse(turn, advance.view.documents)),
    fallback: advance.fallback,
  };
}

/**
 * Loads a session that is ready to receive an answer of either kind (AI text or self-grade),
 * shared by `submitAnswer` and `submitSelfGrade` — both need the exact same status/pending
 * checks, only what they do with the pending turn differs.
 */
async function loadPendingTurnForAnswering(
  sessionId: string,
  userId: string
): Promise<{ view: SessionView; concept: { id: string; name: string }; pending: TurnRow }> {
  const session = await loadSession(sessionId, userId);

  if (session.status === 'paused') {
    throw new AppError('Resume the session before answering', 409, 'SESSION_PAUSED');
  }
  if (session.status !== 'active') {
    throw new AppError('This interview session has already ended', 409, 'SESSION_ENDED');
  }

  const view = await buildView(session);
  const { concept, pending } = view;

  if (!concept || !pending) {
    // Either the queue ran out (the session is over) or the pending question was never created
    // because generate_question failed. Neither can be answered — and generating one here
    // would make the client wait 10–20s for a request that cannot succeed anyway. GET
    // /interviews/:id runs the state machine and produces the question to answer.
    throw new AppError(
      'No question is waiting for an answer; reload the session first',
      409,
      'NO_PENDING_QUESTION'
    );
  }

  return { view, concept, pending };
}

/**
 * POST /interviews/:id/answers — AE-02, the endpoint the whole session runs on:
 * grade → state machine → next question, or the end of a concept, or the end of the session.
 */
export async function submitAnswer(
  sessionId: string,
  userId: string,
  answerText: string
): Promise<SubmitAnswerResponse> {
  const { view, concept, pending } = await loadPendingTurnForAnswering(sessionId, userId);

  if (view.session.fallbackMode) {
    // Once in fallback mode a session must not flip back to AI grading (#115 / AE-05) — the
    // client is expected to submit `selfGrade` instead of `answerText` from here on.
    throw new AppError(
      'This session is in flashcard fallback mode; submit a selfGrade instead of an answer',
      409,
      'FALLBACK_MODE_ACTIVE'
    );
  }

  const session = view.session;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ANSWER_CLAIM_STALE_MS);

  // Idempotency (#115): claim the turn before spending a Gemini call on it. A double-click
  // sends two identical requests; only one can win this update, so only one grades and only
  // one creates the next turn. A claim older than ANSWER_CLAIM_STALE_MS is reclaimable, so a
  // process killed mid-grade does not freeze the session.
  const claim = await prisma.interviewTurn.updateMany({
    where: {
      id: pending.id,
      verdict: null,
      OR: [{ answeredAt: null }, { answeredAt: { lt: staleBefore } }],
    },
    data: { answerText, answeredAt: now },
  });

  if (claim.count === 0) {
    return replayAnswer(sessionId, userId, pending.id);
  }

  let graded;
  try {
    graded = await gradeAnswer({
      conceptName: concept.name,
      material: await loadMaterial(session.planId),
      questionText: pending.questionText,
      answerText,
      language: session.plan.languageDetected ?? undefined,
    });
  } catch (error) {
    if (!isAiFailure(error)) throw error;
    return gradingUnavailable(view, pending);
  }

  await prisma.interviewTurn.update({
    where: { id: pending.id },
    data: { score: graded.score, feedback: graded.feedback, verdict: graded.verdict },
  });

  // The decision itself is re-derived from the turn just stored, so this request and a later
  // GET can never disagree about what comes next.
  const advance = await advanceToNextQuestion(await reloadView(sessionId, userId));

  return {
    session: toSessionState(advance.view),
    grading: { score: graded.score, feedback: graded.feedback, verdict: graded.verdict },
    gradedTurnId: pending.id,
    nextQuestion: advance.question,
    conceptCompleted: advance.completed[0] ?? null,
    sessionCompleted: advance.view.session.status === 'completed',
    replayed: false,
    fallback: advance.fallback,
  };
}

/**
 * The answer was already claimed by an identical request. If that request finished, its result
 * is replayed so a double-click looks like one call; if it is still waiting on Gemini, the
 * client is told to wait rather than being given a half-finished state.
 */
async function replayAnswer(
  sessionId: string,
  userId: string,
  turnId: string
): Promise<SubmitAnswerResponse> {
  const turn = await prisma.interviewTurn.findUnique({ where: { id: turnId }, select: turnSelect });

  if (!turn || turn.verdict === null) {
    throw new AppError(
      'This answer is still being graded, please wait for the result',
      409,
      'ANSWER_IN_PROGRESS'
    );
  }

  const view = await reloadView(sessionId, userId);

  return {
    session: toSessionState(view),
    // `feedback` alone can't tell "not graded yet" from "self-graded" (self-grading legitimately
    // leaves it `null`) — `verdict` is the field both AI grading and self-grading always set.
    grading:
      turn.score !== null && turn.verdict !== null
        ? { score: turn.score, feedback: turn.feedback, verdict: turn.verdict }
        : null,
    gradedTurnId: turn.id,
    nextQuestion: view.pending ? toQuestionResponse(view.pending, view.documents) : null,
    // What the first request reported about the concept it may have finished is not
    // reconstructed here — GET /interviews/:id and the end-of-session summary (I6.5) carry it.
    conceptCompleted: null,
    sessionCompleted: view.session.status === 'completed',
    replayed: true,
    fallback: null,
  };
}

/**
 * grade_answer was unavailable. The session survives in fallback mode (#115) and the claim is
 * released so the same turn can be answered again — the typed answer is kept so the student
 * does not have to retype it. I6.4 replaces this branch with flashcard self-grading (AE-05).
 */
async function gradingUnavailable(
  view: SessionView,
  pending: TurnRow
): Promise<SubmitAnswerResponse> {
  const [session] = await prisma.$transaction([
    prisma.interviewSession.update({
      where: { id: view.session.id },
      data: { fallbackMode: true },
      select: sessionSelect,
    }),
    prisma.interviewTurn.update({ where: { id: pending.id }, data: { answeredAt: null } }),
  ]);

  return {
    session: toSessionState({ ...view, session }),
    grading: null,
    gradedTurnId: pending.id,
    nextQuestion: toQuestionResponse(pending, view.documents),
    conceptCompleted: null,
    sessionCompleted: false,
    replayed: false,
    fallback: { reason: 'grading_unavailable', message: FALLBACK_GRADING_MESSAGE },
  };
}

/**
 * POST /interviews/:id/answers in fallback mode — AE-05, UC-12 step 4-6. Grades whatever turn is
 * pending against the hard-coded self-grade mapping, whatever that turn's `source`: a turn left
 * pending by `gradingUnavailable()` (AI-authored, grading failed) is self-graded here too, since
 * a fallback session must never send it back to Gemini for grading.
 */
export async function submitSelfGrade(
  sessionId: string,
  userId: string,
  selfGrade: SelfGrade
): Promise<SubmitAnswerResponse> {
  const { view, pending } = await loadPendingTurnForAnswering(sessionId, userId);

  if (!view.session.fallbackMode) {
    throw new AppError(
      'Self-grading is only available once this session is in flashcard fallback mode',
      409,
      'NOT_IN_FALLBACK_MODE'
    );
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - ANSWER_CLAIM_STALE_MS);

  const claim = await prisma.interviewTurn.updateMany({
    where: {
      id: pending.id,
      verdict: null,
      OR: [{ answeredAt: null }, { answeredAt: { lt: staleBefore } }],
    },
    data: { answeredAt: now },
  });

  if (claim.count === 0) {
    return replayAnswer(sessionId, userId, pending.id);
  }

  const score = SELF_GRADE_SCORE[selfGrade];
  const verdict = SELF_GRADE_VERDICT[selfGrade];

  await prisma.interviewTurn.update({
    where: { id: pending.id },
    data: { score, verdict },
  });

  const advance = await advanceToNextQuestion(await reloadView(sessionId, userId));

  return {
    session: toSessionState(advance.view),
    grading: { score, feedback: null, verdict },
    gradedTurnId: pending.id,
    nextQuestion: advance.question,
    conceptCompleted: advance.completed[0] ?? null,
    sessionCompleted: advance.view.session.status === 'completed',
    replayed: false,
    fallback: advance.fallback,
  };
}

/** POST /interviews/:id/pause — AE-03. Idempotent: pausing a paused session is not an error. */
export async function pauseInterview(
  sessionId: string,
  userId: string
): Promise<PauseInterviewResponse> {
  const session = await loadSession(sessionId, userId);

  if (session.status === 'paused') {
    return { session: toSessionState(await buildView(session)) };
  }
  if (session.status !== 'active') {
    throw new AppError('This interview session has already ended', 409, 'SESSION_ENDED');
  }

  const paused = await prisma.interviewSession.update({
    where: { id: session.id },
    data: { status: 'paused' },
    select: sessionSelect,
  });

  return { session: toSessionState(await buildView(paused)) };
}

/**
 * POST /interviews/:id/resume — AE-03. Reopens the session and hands back the question it was
 * on; if that question was never created (AI outage during pause), one is generated now.
 */
export async function resumeInterview(
  sessionId: string,
  userId: string
): Promise<ResumeInterviewResponse> {
  const session = await loadSession(sessionId, userId);

  if (session.status !== 'active' && session.status !== 'paused') {
    throw new AppError('This interview session has already ended', 409, 'SESSION_ENDED');
  }

  const active =
    session.status === 'active'
      ? session
      : await prisma.interviewSession.update({
          where: { id: session.id },
          data: { status: 'active' },
          select: sessionSelect,
        });

  const advance = await advanceToNextQuestion(await buildView(active));

  return {
    session: toSessionState(advance.view),
    currentQuestion: advance.question,
    fallback: advance.fallback,
  };
}

/**
 * POST /interviews/:id/abandon — SPEC_DB-03 AF2, "Kết thúc và chấm phần đã làm" (#243).
 *
 * Closes an unfinished session and **scores** the concept it was in the middle of instead of
 * throwing that work away: a student who answered two of three turns keeps those two in
 * `mastery_score`, weighted over the turns that happened (`[0.2, 0.3] → [0.4, 0.6]`). That is
 * the whole difference from "start a new one" — the wording the design uses everywhere, and the
 * reason this is not simply a delete.
 *
 * Its own endpoint rather than a `force` flag on `POST /interviews`: the session history screen
 * (DB-03) ends a session *without* opening a new one, while AE-01's dialog calls this and then
 * creates. One flag serving both would tie the two together and DB-03 could not reuse it.
 *
 * `summarize_session` is deliberately **not** called (SPEC_DB-03 AF3): an abandoned session keeps
 * `summary_text = NULL` and the history screen drops the commentary block rather than rendering
 * an empty frame — so ending early costs no extra AI call (C4).
 */
export async function abandonInterview(
  sessionId: string,
  userId: string
): Promise<AbandonInterviewResponse> {
  const session = await loadSession(sessionId, userId);

  // Idempotent, the same way `pauseInterview` is for an already-paused session: a retried or
  // double-clicked request reports the state back, it does not score the concept twice.
  if (session.status === 'abandoned') {
    return { session: toSessionState(await buildView(session)), conceptCompleted: null };
  }
  if (session.status !== 'active' && session.status !== 'paused') {
    throw new AppError('This interview session has already ended', 409, 'SESSION_ENDED');
  }

  const view = await buildView(session);
  const conceptCompleted = view.concept ? await scoreConceptSoFar(view, view.concept) : null;

  const abandoned = await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      status: 'abandoned',
      endedAt: new Date(),
      // Only when something was actually scored: the queue has genuinely moved past that
      // concept, and leaving the index behind would report `completedConcepts` one short of
      // what was written to the graph.
      ...(conceptCompleted ? { currentConceptIdx: view.conceptIndex + 1 } : {}),
    },
    select: sessionSelect,
  });

  return { session: toSessionState(await buildView(abandoned)), conceptCompleted };
}

/**
 * Finalises the concept a session is stopping in the middle of, through the same I7.2 seam a
 * concept that ran to the end goes through — mastery score, review schedule, traceback.
 *
 * `null` when no turn of the concept could be graded: there is nothing for the weighted average
 * to average, and a spaced-repetition row for a concept the student never answered would claim
 * an assessment that never happened. `finalizeConceptResult` already leaves the stored score
 * alone in that case; not calling it at all keeps the review queue clean as well.
 *
 * Traceback (AE-07) still runs for a concept that *was* graded. The turns the student answered
 * are real evidence, and a weak foundation found through them is worth queueing whether or not
 * the session ran to the end — a deliberate decision, not a side effect of reusing I7.2.
 */
async function scoreConceptSoFar(
  view: SessionView,
  concept: { id: string; name: string }
): Promise<ConceptCompletedResponse | null> {
  const turns = await prisma.interviewTurn.findMany({
    where: { sessionId: view.session.id, conceptId: concept.id },
    orderBy: { turnIndex: 'asc' },
    select: { score: true },
  });

  const turnScores = gradedTurnScores(turns);
  if (turnScores.length === 0) {
    return null;
  }

  const result = await finalizeConceptResult({
    sessionId: view.session.id,
    conceptId: concept.id,
    turnScores,
  });

  return toConceptCompleted(result, concept.name);
}
