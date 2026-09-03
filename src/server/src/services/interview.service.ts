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
import { findRelatedConcepts, findWeakPrerequisites } from './concept-graph.service';
import { buildInactivePlanMessage, getReviewQueueForPlan } from './scheduling.service';
import { listConceptCheckpoints } from './checkpoint.service';
import { recordTurnEvidence } from './interview-evidence.service';
import type { QuestionMode, QuestionType } from '../schemas/ai-interview.schema';
import { isTurnAppealable, toGradingFeedbackResponse } from '../utils/grading-feedback';
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
import {
  hasTracedBackFrom,
  planTracebackInsert,
  readConceptQueue,
  writeConceptQueue,
  type QueueEntry,
} from '../utils/interview-queue';
import { UPLOAD_DIR, resolveMaterialSource } from '../utils/material';
import {
  anchorMatchesCachedQuestion,
  buildTurnCitation,
  type CitedDocumentRow,
} from '../utils/question-citation';
import { countsTowardMastery, gradedTurnScores } from '../utils/mastery';
import type {
  AbandonInterviewResponse,
  ConceptCompletedResponse,
  InterviewQueueItemResponse,
  TracebackHopResponse,
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
  // Which rung of the ladder produced this turn (#392). The client needs it to say why a hint
  // turn carries a grade but no weight.
  mode: true,
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
 * The transcript read, and ONLY it, also pulls the student's appeal (AE-10, #248).
 *
 * Kept separate from `turnSelect` on purpose: that constant is used at seven call sites, six of
 * which (`askQuestion`, `askCachedQuestion`, and `replayAnswer`'s poll loop) feed
 * `toQuestionResponse`, which never reads the relation. Putting it on the shared select would
 * add a second SQL round trip per read for a to-many that is structurally empty on a row that
 * was just created — and `replayAnswer` does up to eleven of those per double-submit.
 *
 * A list because `@@unique([turnId, userId])` allows one row per user; the ownership chain
 * `turn -> session -> user` plus the 404-not-403 rule means element 0 is the reader's or there
 * is none. Filtering by `userId` here is not possible: this is module-level.
 */
const transcriptTurnSelect = {
  ...turnSelect,
  gradingFeedbacks: { select: { reasons: true, note: true } },
} satisfies Prisma.InterviewTurnSelect;

type TranscriptTurnRow = Prisma.InterviewTurnGetPayload<{ select: typeof transcriptTurnSelect }>;

/**
 * Everything one request needs about a session, read in three queries. Snapshot only — any
 * function that writes reloads it rather than patching this object, so no caller can read a
 * value that the database has since moved past.
 */
interface SessionView {
  session: SessionRow;
  /** The concept queue as stored, including any prerequisites live traceback put in front. */
  queue: QueueEntry[];
  conceptIndex: number;
  /** `null` once the queue is exhausted — the session has nothing left to ask. */
  concept: { id: string; name: string } | null;
  /** Every turn of the session, oldest first — the transcript. */
  turns: TranscriptTurnRow[];
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
  queue: QueueEntry[]
): Promise<{ concept: { id: string; name: string } | null; conceptIndex: number }> {
  let index = Math.max(session.currentConceptIdx, 0);

  while (index < queue.length) {
    const conceptId = queue[index]?.conceptId;
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
  const queue = readConceptQueue(session.conceptQueue);
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
    select: transcriptTurnSelect,
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
 * Raised by both the material load below and `startInterview`'s pre-check (#272). Shared so the
 * two cannot drift: the client keys its "kế hoạch chưa có tài liệu" copy off this exact `code`,
 * and a session refused before it is created must be indistinguishable from one refused during
 * the first question.
 */
function noMaterialError(): AppError {
  return new AppError(
    'This study plan has no source document to ask questions from',
    409,
    'NO_MATERIAL'
  );
}

/** The database row still exists, but its backing upload has disappeared from storage. */
function documentFileMissingError(): AppError {
  return new AppError('Document file is no longer available', 404, 'DOCUMENT_FILE_MISSING');
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Whether a missing document should stop an interview. Mock mode answers "no": `loadMaterial`
 * short-circuits to `MOCK_MATERIAL` before it ever reads `prisma.document`, so a plan with no
 * document still runs end-to-end under `USE_MOCK_AI=true` — which is what the dev seed and much
 * of the test suite rely on. The pre-check has to mirror that exactly or it breaks them.
 */
function materialIsRequired(): boolean {
  return process.env.USE_MOCK_AI !== 'true';
}

/**
 * Whether this turn should ask the model for per-checkpoint evidence (#346).
 *
 * Mock mode answers "no", for the same reason `materialIsRequired` does: `mockGradeAnswer` returns
 * no `evidence` field, so reading the concept's ruler would be a database round-trip whose result
 * nothing can use — and mock mode is precisely the mode that runs without those tables (the dev
 * seed and much of the suite rely on it). Evidence is additive, so switching it off here costs a
 * mock session nothing: the score, the state machine and the summary are unchanged.
 */
function evidenceIsRequested(): boolean {
  return process.env.USE_MOCK_AI !== 'true';
}

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
  if (!materialIsRequired()) {
    return MOCK_MATERIAL;
  }

  return getPlanMaterial(planId, async () => {
    const document = await prisma.document.findFirst({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: { fileKey: true },
    });
    if (!document) {
      throw noMaterialError();
    }

    const source = resolveMaterialSource(document.fileKey);
    const absolutePath = path.join(UPLOAD_DIR, document.fileKey);

    try {
      if (source.kind === 'text') {
        return { kind: 'text', text: await fs.promises.readFile(absolutePath, 'utf-8') };
      }

      const uploaded = await uploadFile(absolutePath, source.mimeType);
      return { kind: source.kind, uri: uploaded.uri, mimeType: uploaded.mimeType };
    } catch (error) {
      if (isMissingFileError(error)) {
        throw documentFileMissingError();
      }
      throw error;
    }
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
  turn: TranscriptTurnRow,
  documents: Map<string, CitedDocumentRow>
): InterviewTurnResponse {
  const [appeal] = turn.gradingFeedbacks;
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
    mode: turn.mode,
    // Computed here, not in the client: one predicate decides it for the write path and every
    // read path (#392 (c)).
    countsTowardMastery: countsTowardMastery(turn),
    sourceCitation: buildTurnCitation(turn, documents),
    // #248 F2: the appeal gate needs this, and `verdict` cannot stand in for it — a flashcard
    // turn carries a real verdict. `turnSelect` already selected it; it was only never mapped.
    source: turn.source,
    // Computed server-side and shipped, not left for the client to re-derive from
    // `verdict`/`source`/`mode` — the same rule `countsTowardMastery` follows, and for the same
    // reason: a second copy of the gate in a second language would drift from this one.
    canAppeal: isTurnAppealable(turn),
    gradingFeedback: appeal ? toGradingFeedbackResponse(appeal) : null,
  };
}

/**
 * The queue with names attached, in stored order — **one item per stored entry, never fewer**.
 *
 * A concept whose row is gone reports `name: null` rather than being dropped. Dropping it looks
 * kinder (no blank line for a question that will never be asked) but it silently re-indexes the
 * list, and `progress.conceptIndex` / `conceptTotal` are indices into the *stored* queue: the
 * screen would then highlight the row after the one being asked, or none at all when the missing
 * concept sits before the cursor, and print "Khái niệm 2/3" above two rows. Keeping the entry
 * makes that class of drift unrepresentable instead of guarded against.
 *
 * The only writer that can produce this is `PUT /graph`, which hard-deletes Concept rows
 * (`graph.service.ts`); an SP-05 re-analysis leaves a `deprecated` tombstone, and neither this
 * query nor `resolveCurrentConcept` filters on `status`, so those still resolve their name.
 * `viaConceptName` comes from the same batch and is `null` on the same condition.
 */
async function toQueueItems(
  entries: readonly QueueEntry[],
  planId: string
): Promise<InterviewQueueItemResponse[]> {
  if (entries.length === 0) return [];

  const ids = new Set<string>();
  for (const entry of entries) {
    ids.add(entry.conceptId);
    if (entry.viaConceptId) ids.add(entry.viaConceptId);
  }

  const concepts = await prisma.concept.findMany({
    where: { id: { in: [...ids] }, planId },
    select: { id: true, name: true },
  });
  const nameById = new Map(concepts.map((concept) => [concept.id, concept.name]));

  return entries.map((entry) => ({
    conceptId: entry.conceptId,
    name: nameById.get(entry.conceptId) ?? null,
    hop: entry.hop,
    viaConceptId: entry.viaConceptId,
    viaConceptName: entry.viaConceptId ? (nameById.get(entry.viaConceptId) ?? null) : null,
  }));
}

/**
 * Async purely because of `queue`: the session stores concept ids, and the screen needs names.
 *
 * One extra `findMany` per session read, which is why it is batched here rather than resolved
 * per row. `resolveCurrentConcept` already reads the current concept one row at a time for a
 * different reason (it has to skip deleted ones in order), so this does not replace that.
 */
async function toSessionState(view: SessionView): Promise<InterviewSessionState> {
  const { session } = view;
  const isEnded = session.status === 'completed' || session.status === 'abandoned';
  const queue = await toQueueItems(view.queue, session.planId);

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
    queue,
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
        // The rung this question came from, kept so scoring and the transcript can tell a hint
        // turn apart later (#392 (c)). `mode` was already decided above and handed to
        // `generateQuestion`; this only writes down what was asked for — the AI call surface is
        // untouched (C4).
        mode,
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
    // `mode` alongside `score`: `gradedTurnScores` drops hint turns (#392 (c)), and this path
    // must agree with `scoreConceptSoFar` below — the normal close and the abandoned-session
    // close cannot grade by two different rules.
    select: { score: true, mode: true },
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
  /**
   * Set when this request hopped to a prerequisite instead of asking again about the concept the
   * student was on. The client has no other way to know: the concept simply changes and the
   * queue gets longer, which without a sentence of explanation reads as a bug.
   */
  tracedBack: TracebackHopResponse | null;
}

/**
 * Works out whether the concept the student just got wrong has a base worth visiting right now,
 * and what the queue would become if it did. Returns `null` when there is nothing to hop to —
 * the state machine then falls back to #392's hint ladder.
 *
 * Every rule about *whether* to insert lives in `planTracebackInsert` (pure, R05); every rule
 * about *which* concepts count as weak lives in `traceback.service.ts` (pure, R05). This
 * function is only the wiring between them and the database, and it writes nothing.
 *
 * Two guards run before the graph is read, and they are NOT the same kind of thing:
 *   - `tracebackEnabled` is **correctness**. It is the plan-level switch `scheduleConceptReview`
 *     already honours; a student who turned remediation off must not have their session
 *     re-ordered by it either. Nothing downstream re-checks it.
 *   - `hasTracedBackFrom` is **cost only**, and saying otherwise would be wrong. Termination is
 *     owned by `planTracebackInsert`'s budgets — the hop count and the insert/sitting ceilings —
 *     not by any rule about a concept already being queued; its docstring carries the cycle that
 *     disproves the tidier explanation. Deleting this line changes no outcome — measured, by
 *     removing it and watching every test stay green. What it does buy is the two queries below,
 *     on every remaining wrong answer of a concept that already traced back (up to two more per
 *     concept once the hint ladder takes over).
 */
async function planTracebackHop(
  view: SessionView,
  concept: { id: string; name: string }
): Promise<{ entries: QueueEntry[]; response: TracebackHopResponse } | null> {
  if (hasTracedBackFrom(view.queue, concept.id)) return null;

  const plan = await prisma.studyPlan.findUnique({
    where: { id: view.session.planId },
    select: { tracebackEnabled: true },
  });
  if (!plan?.tracebackEnabled) return null;

  const prerequisites = await findWeakPrerequisites(view.session.planId, concept.id);
  if (prerequisites.length === 0) return null;

  const planned = planTracebackInsert({
    entries: view.queue,
    cursor: view.conceptIndex,
    prerequisites,
  });
  if (planned.inserted.length === 0) return null;

  const insertedIds = new Set(planned.inserted);
  return {
    entries: planned.entries,
    response: {
      fromConceptId: concept.id,
      fromConceptName: concept.name,
      prerequisites: prerequisites
        .filter((prerequisite) => insertedIds.has(prerequisite.conceptId))
        .map((prerequisite) => ({
          conceptId: prerequisite.conceptId,
          name: prerequisite.name,
          reason: prerequisite.reason,
          masteryScore: prerequisite.masteryScore,
        })),
    },
  };
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
      tracedBack: null,
    };
  }

  const concept = view.concept;
  if (!concept) {
    const session = await completeSession(view.session);
    return {
      view: { ...view, session },
      question: null,
      completed,
      fallback: null,
      tracedBack: null,
    };
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
    // Only a wrong answer can trace back, so the graph is only read on that branch — a session
    // where nothing goes wrong pays nothing for this feature.
    const hop = lastGraded.verdict === 'wrong' ? await planTracebackHop(view, concept) : null;

    const step = decideNextStep({
      verdict: lastGraded.verdict,
      turnIndex: lastGraded.turnIndex,
      maxTurns: view.session.maxTurnsPerConcept,
      remainingConcepts: view.queue.length - view.conceptIndex - 1,
      tracebackAvailable: hop !== null,
      tracedBackAlready: hasTracedBackFrom(view.queue, concept.id),
    });

    if (step === 'trace_back' && hop) {
      // `currentConceptIdx` is deliberately NOT touched. The prerequisites went in *before* the
      // concept the student is on, so the index that used to address it now addresses the first
      // prerequisite, and the concept itself has slid down the queue un-finalised — no mastery
      // score written, no review row queued, its turn budget still where the student left it.
      // Advancing the index here as well would skip straight past the base we just queued.
      await prisma.interviewSession.update({
        where: { id: view.session.id },
        data: { conceptQueue: writeConceptQueue(hop.entries) as Prisma.InputJsonValue },
      });
      const fresh = await reloadView(view.session.id, view.session.userId);
      const next = await advanceToNextQuestion(fresh, completed);
      // The hop is reported by the request that made it. A later GET re-derives the state and
      // finds the prerequisite already in front, so it must NOT announce the hop again.
      return { ...next, tracedBack: hop.response };
    }

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
      tracedBack: null,
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
      tracedBack: null,
    };
  }
}

/**
 * `advanceToNextQuestion`'s fallback-mode counterpart (AE-05 / I6.4): serves the concept's
 * pre-generated cache instead of calling Gemini. Unlike AI mode, `deep`/`shallow` verdicts do
 * not steer question selection — a flashcard concept asks every cached question it has, in
 * order, then finishes. A `wrong` verdict still ends the concept immediately (CF-03/CF-04) —
 * this is now a DELIBERATE divergence from `decideNextStep` (#392 gave AI mode a hint ladder
 * instead), not the same rule: fallback has no live AI call to narrow a question with, only a
 * fixed set of pre-generated flashcards, so there is nothing to serve as a "hint" here.
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

  // CF-03/CF-04: the last graded turn's verdict drives the `wrong` early-exit in the state
  // machine. Read it from conceptTurns the same way advanceToNextQuestion does for AI mode.
  const lastGraded = [...view.conceptTurns].reverse().find((turn) => turn.verdict !== null);

  const step = resolveFallbackStep({
    cachedQuestionCount: cached.length,
    // Audit finding (real-Gemini manual test): grading failure — the common trigger for
    // fallback — always fires after a question was already asked by AI, so most concepts enter
    // fallback already holding `source: 'ai'` turns. Those must not count against the cache
    // index, or a concept with untouched cached questions finishes without ever serving them.
    cachedTurnsServed: view.conceptTurns.filter((turn) => turn.source === 'cache_fallback').length,
    totalTurnsServed: view.conceptTurns.length,
    maxTurns: view.session.maxTurnsPerConcept,
    lastVerdict: lastGraded?.verdict ?? null,
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
      tracedBack: null,
    };
  }

  const turn = await askCachedQuestion(view, concept, view.conceptTurns.length + 1, cacheRow);
  const fresh = await reloadView(view.session.id, view.session.userId);
  return {
    view: fresh,
    question: toQuestionResponse(turn, fresh.documents),
    completed,
    fallback: null,
    tracedBack: null,
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
        // `mode` stays NULL on purpose. A cached flashcard question does not come from
        // `decideNextStep`, so it sits on no rung — and `resolveFallbackStep` deliberately has no
        // hint step at all. Writing `initial` here would be a guess dressed as data, and
        // `countsTowardMastery` reads NULL as "counts", which is what a self-graded turn should do.
        mode: null,
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
    select: { id: true, userId: true, status: true },
  });
  if (!plan || plan.userId !== userId) {
    throw new AppError('Study plan not found', 404, 'NOT_FOUND');
  }
  if (plan.status !== 'active') {
    throw new AppError(buildInactivePlanMessage(plan.status), 409, 'PLAN_NOT_ACTIVE');
  }

  // #272, and it has to come before the resume branch below, not just before the `create`.
  //
  // The same check runs inside `loadMaterial` once the first question is asked, but by then the
  // session row exists, and a throw there leaves an `active` session with no turns that nobody
  // can finish. Every later attempt then matched the resume branch and answered with AE-03's
  // "phiên đang dở" dialog, so "kế hoạch chưa có tài liệu" (#118/#279) reached the student once
  // per plan and never again.
  //
  // Checking here rather than after that branch also covers the zombies already in the
  // database: a plan with nothing to ask from is refused whatever sessions it carries. Those
  // rows are left alone on purpose — they hold no turns, and once the plan gets a document they
  // resume into a perfectly ordinary first question.
  if (materialIsRequired()) {
    const document = await prisma.document.findFirst({
      where: { planId: plan.id },
      select: { id: true },
    });
    if (!document) {
      throw noMaterialError();
    }
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
      session: await toSessionState(view),
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
      conceptQueue: writeConceptQueue(conceptQueue) as Prisma.InputJsonValue,
      maxTurnsPerConcept: input.maxTurnsPerConcept ?? DEFAULT_MAX_TURNS_PER_CONCEPT,
    },
    select: sessionSelect,
  });

  // The pre-check closes the NO_MATERIAL case specifically; this closes the general one. Any
  // other failure of the *first* question (a document row whose file is gone, a DB blip) would
  // strand the same zombie session, so the row is rolled back and the original error rethrown.
  // Only AI failures survive this path without throwing — `advanceToNextQuestion` converts them
  // into fallback mode on purpose (#115), and that session is a real one worth keeping.
  let advance;
  try {
    advance = await advanceToNextQuestion(await buildView(session));
  } catch (error) {
    await rollbackUnstartedSession(session.id);
    throw error;
  }

  return {
    created: true,
    session: await toSessionState(advance.view),
    question: advance.question,
    message: advance.fallback?.message ?? null,
    fallback: advance.fallback,
  };
}

/**
 * Deletes a session whose very first question never made it, so the next attempt starts clean
 * instead of resuming a session with nothing in it (#272).
 *
 * Guarded on the turn count rather than assumed: `askQuestion` writes its turn only after the
 * AI call returns, so a first-question failure leaves none — but a future caller could reach
 * here with a turn already persisted, and deleting that would destroy graded work. Best-effort
 * on purpose: the caller is already throwing the real error, and a failed cleanup must not
 * replace it with a confusing one.
 */
async function rollbackUnstartedSession(sessionId: string): Promise<void> {
  try {
    const turnCount = await prisma.interviewTurn.count({ where: { sessionId } });
    if (turnCount > 0) return;
    await prisma.interviewSession.delete({ where: { id: sessionId } });
  } catch (cleanupError) {
    console.error('[interview] failed to roll back an unstarted session:', cleanupError);
  }
}

/**
 * The concepts the session will cover, in the order they will be asked. A client-supplied list
 * wins; otherwise the top of the review queue (I7.3) is taken, which is already ordered
 * traceback-first, weakest-first.
 *
 * Every entry starts at `hop: 0`, `added: false` — these are the concepts the session opened
 * with, so none of them has spent any of the live-traceback insert budget. Live traceback adds
 * `hop >= 1` entries later, from `advanceToNextQuestion`.
 */
async function resolveConceptQueue(
  planId: string,
  userId: string,
  requested: string[] | undefined
): Promise<QueueEntry[]> {
  const asEntries = (ids: string[]): QueueEntry[] =>
    ids.map((conceptId) => ({ conceptId, hop: 0, viaConceptId: null, added: false }));

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

    // A session is a set of RELATED concepts, not one concept (UC-11; Quân, 03/09). Every deep
    // link into the interview outside "Dùng gợi ý hôm nay" carries exactly one id — the review
    // queue row, the graph panel's "Kiểm tra ngay", the focus summary — so without this a
    // student who clicks a concept gets a one-concept sitting and the whole queue rail, the
    // progress meter and the "Khái niệm 1/N" header describe a session of one.
    //
    // Filled from the GRAPH rather than from the review queue: the point is concepts related to
    // the one they chose, and the graph is the only thing that knows which those are. A concept
    // with no neighbours simply stays a one-concept session — that is a real answer, not a
    // failure, and it must not turn into "here are two unrelated things that were also due".
    if (unique.length === 1) {
      const seed = unique[0];
      if (seed) {
        const related = await findRelatedConcepts(planId, seed, DEFAULT_CONCEPTS_PER_SESSION - 1);
        return asEntries([seed, ...related.map((concept) => concept.id)]);
      }
    }
    return asEntries(unique);
  }

  const queue = await getReviewQueueForPlan(planId, userId, DEFAULT_CONCEPTS_PER_SESSION);
  // Same `[...new Set()]` the hand-picked branch above applies, for the same reason: a repeated
  // concept makes the header promise "Khái niệm 1/3" for a session that ends after one (#232).
  // The queue already folds duplicates away since #232 — this is the belt to that pair of braces,
  // because the header's honesty must not depend on a filter two services away.
  const conceptIds = [...new Set(queue.items.map((item) => item.conceptId))];

  if (conceptIds.length === 0) {
    throw new AppError(queue.message ?? NO_CONCEPTS_MESSAGE, 409, 'NO_CONCEPTS_TO_REVIEW');
  }
  return asEntries(conceptIds);
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
      session: await toSessionState(view),
      currentQuestion: view.pending ? toQuestionResponse(view.pending, view.documents) : null,
      turns: view.turns.map((turn) => toTurnResponse(turn, view.documents)),
      fallback: null,
    };
  }

  const advance = await advanceToNextQuestion(view);
  return {
    session: await toSessionState(advance.view),
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

  // Read the ruler ONCE, here, and keep the array: it is serialised into the prompt below and is
  // the only thing `evidence[].checkpoint` indices are meaningful against (#346). A second read
  // could come back in a different order and map every row to the wrong checkpoint — silently.
  const checkpoints = evidenceIsRequested() ? await listConceptCheckpoints(concept.id) : [];

  // Same snapshot `askQuestion` reads for generate_question, minus the turn being graded right
  // now: `view` was loaded before the claim above, so it still carries `pending` itself with a
  // null answer/verdict — left in, turn N would cite itself as "(no answer given)" (#391).
  const previousTurns = toPreviousTurns(view.conceptTurns.filter((turn) => turn.id !== pending.id));

  let graded;
  try {
    graded = await gradeAnswer({
      conceptName: concept.name,
      material: await loadMaterial(session.planId),
      questionText: pending.questionText,
      answerText,
      language: session.plan.languageDetected ?? undefined,
      checkpoints,
      previousTurns,
    });
  } catch (error) {
    if (!isAiFailure(error)) throw error;
    return gradingUnavailable(view, pending, now);
  }

  // #288: bind the grade write to the exact claim this request took. A slow Gemini call can
  // outlast ANSWER_CLAIM_STALE_MS, letting a newer identical request reclaim the turn — its
  // claim moves `answeredAt` to a fresh timestamp. Writing on `id` alone would then overwrite
  // the winner's verdict AND run the state machine a second time, silently dropping a concept
  // from a multi-concept session. Anchoring on `answeredAt: now` (the mark set by this
  // request's own claim above) makes the write a no-op once the claim has been lost.
  const written = await prisma.interviewTurn.updateMany({
    where: { id: pending.id, answeredAt: now },
    data: { score: graded.score, feedback: graded.feedback, verdict: graded.verdict },
  });

  if (written.count === 0) {
    // Lost the claim mid-grade: do not advance the state machine again. Replay whatever the
    // winning request recorded so this one still resolves coherently instead of double-stepping.
    return replayAnswer(sessionId, userId, pending.id);
  }

  // ⚠️ BELOW the guard, never above it (#346, and #288 is why). A request that lost its claim holds
  // a valid grade whose score was just discarded — and since evidence upserts on
  // (session, concept, checkpoint), writing it up there would let the loser overwrite the winner's
  // evidence for the same cell. Additive and non-fatal: it records what the answer showed, and a
  // failure inside costs at most a row, never this response.
  await recordTurnEvidence({
    sessionId,
    conceptId: concept.id,
    turnRef: pending.id,
    ruler: checkpoints,
    answerText,
    raw: graded.evidence,
  });

  // The decision itself is re-derived from the turn just stored, so this request and a later
  // GET can never disagree about what comes next.
  const advance = await advanceToNextQuestion(await reloadView(sessionId, userId));

  return {
    session: await toSessionState(advance.view),
    grading: { score: graded.score, feedback: graded.feedback, verdict: graded.verdict },
    gradedTurnId: pending.id,
    nextQuestion: advance.question,
    conceptCompleted: advance.completed[0] ?? null,
    tracedBack: advance.tracedBack,
    sessionCompleted: advance.view.session.status === 'completed',
    replayed: false,
    fallback: advance.fallback,
  };
}

/**
 * The answer was already claimed by an identical request. If that request finished, its result
 * is replayed so a double-click looks like one call; if it is still waiting on Gemini, we poll
 * until the winner's grade lands — Gemini grading typically takes 10–20s (#115), so the window
 * has to cover that whole range, not just the first couple of seconds.
 *
 * Idempotency fix: the original code threw 409 immediately when `verdict === null`, which made
 * concurrent double-submits both return 409 (the loser saw the winner's not-yet-graded turn).
 * Now we wait up to `REPLAY_POLL_ATTEMPTS × REPLAY_POLL_INTERVAL_MS` before giving up.
 */

/** How many times to re-read the turn waiting for the winner's grading to land. */
const REPLAY_POLL_ATTEMPTS = 10;
/** Milliseconds between re-reads — 10 × 2s = 20s, covering Gemini's worst-case grading time. */
const REPLAY_POLL_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replayAnswer(
  sessionId: string,
  userId: string,
  turnId: string
): Promise<SubmitAnswerResponse> {
  let turn = await prisma.interviewTurn.findUnique({ where: { id: turnId }, select: turnSelect });

  // Poll briefly for the winner's grading to finish, so the client gets a result instead of an
  // opaque 409 that it would have to retry blindly.
  for (let attempt = 0; attempt < REPLAY_POLL_ATTEMPTS && turn?.verdict === null; attempt++) {
    await sleep(REPLAY_POLL_INTERVAL_MS);
    turn = await prisma.interviewTurn.findUnique({ where: { id: turnId }, select: turnSelect });
  }

  if (!turn || turn.verdict === null) {
    throw new AppError(
      'This answer is still being graded, please wait for the result',
      409,
      'ANSWER_IN_PROGRESS'
    );
  }

  const view = await reloadView(sessionId, userId);

  return {
    session: await toSessionState(view),
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
    // Same for a traceback hop: the request that actually hopped announced it, and re-announcing
    // it to a double-click would show the student the same explanation twice.
    conceptCompleted: null,
    tracedBack: null,
    sessionCompleted: view.session.status === 'completed',
    replayed: true,
    fallback: null,
  };
}

/**
 * grade_answer was unavailable. The session survives in fallback mode (#115) and the claim is
 * released so the same turn can be answered again — the typed answer is kept so the student
 * does not have to retype it. I6.4 replaces this branch with flashcard self-grading (AE-05).
 *
 * #288: only a request that STILL holds the claim may do this. One whose slow Gemini call let a
 * newer identical request reclaim the turn (a stale-reclaim) must not flip `fallbackMode` — the
 * turn now belongs to that other request, which may be grading it successfully; flipping here
 * would strip AI grading from a healthy session for the rest of it, and clearing `answeredAt`
 * would wipe the winner's claim mark. So the release is bound to this request's own claim, and
 * the fallback flip runs only when that release actually wrote a row.
 */
async function gradingUnavailable(
  view: SessionView,
  pending: TurnRow,
  claimMark: Date
): Promise<SubmitAnswerResponse> {
  const session = await prisma.$transaction(async (tx) => {
    const released = await tx.interviewTurn.updateMany({
      where: { id: pending.id, answeredAt: claimMark },
      data: { answeredAt: null },
    });
    if (released.count === 0) return null;
    return tx.interviewSession.update({
      where: { id: view.session.id },
      data: { fallbackMode: true },
      select: sessionSelect,
    });
  });

  if (session === null) {
    // Lost the claim mid-grade: touch nothing, and above all do not flip the session. Replay
    // whatever the winning request recorded so this one still resolves coherently.
    return replayAnswer(view.session.id, view.session.userId, pending.id);
  }

  return {
    session: await toSessionState({ ...view, session }),
    grading: null,
    gradedTurnId: pending.id,
    nextQuestion: toQuestionResponse(pending, view.documents),
    conceptCompleted: null,
    // Nothing was graded, so there is no verdict to trace back from — the same question is
    // simply re-shown for the student to resend.
    tracedBack: null,
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

  // #288: same claim-bound write as the AI path. The window is far smaller here (no Gemini
  // await between claim and write), but the invariant is identical — a request that lost its
  // claim must neither overwrite the verdict nor advance the state machine a second time.
  const written = await prisma.interviewTurn.updateMany({
    where: { id: pending.id, answeredAt: now },
    data: { score, verdict },
  });

  if (written.count === 0) {
    return replayAnswer(sessionId, userId, pending.id);
  }

  const advance = await advanceToNextQuestion(await reloadView(sessionId, userId));

  return {
    session: await toSessionState(advance.view),
    grading: { score, feedback: null, verdict },
    gradedTurnId: pending.id,
    nextQuestion: advance.question,
    conceptCompleted: advance.completed[0] ?? null,
    // Always `null` today: self-grading only happens in fallback mode, and `advanceFallback`
    // never traces back — it has no live AI call to ask the prerequisite with. Wired from
    // `advance` rather than hard-coded so it stops being null the day that changes.
    tracedBack: advance.tracedBack,
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
    return { session: await toSessionState(await buildView(session)) };
  }
  if (session.status !== 'active') {
    throw new AppError('This interview session has already ended', 409, 'SESSION_ENDED');
  }

  const paused = await prisma.interviewSession.update({
    where: { id: session.id },
    data: { status: 'paused' },
    select: sessionSelect,
  });

  return { session: await toSessionState(await buildView(paused)) };
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
    session: await toSessionState(advance.view),
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
    return { session: await toSessionState(await buildView(session)), conceptCompleted: null };
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

  return { session: await toSessionState(await buildView(abandoned)), conceptCompleted };
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
    // Same pair as `finishConcept` — see the note there.
    select: { score: true, mode: true },
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
