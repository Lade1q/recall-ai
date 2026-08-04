import { GoogleGenAI } from '@google/genai';
import type { ZodType } from 'zod';
import {
  aiExtractResponseSchema,
  aiExtractJsonSchema,
  AiExtractResponse,
} from '../schemas/ai-extract.schema';
import {
  generateQuestionResponseSchema,
  generateQuestionJsonSchema,
  gradeAnswerResponseSchema,
  gradeAnswerJsonSchema,
  summarizeSessionResponseSchema,
  summarizeSessionJsonSchema,
  GenerateQuestionResponse,
  GradeAnswerResponse,
  SummarizeSessionResponse,
  QuestionMode,
  Verdict,
} from '../schemas/ai-interview.schema';
import { reconcileVerdict } from '../utils/interview-grading';
import { mockGenerateQuestion, mockGradeAnswer, mockSummarizeSession } from '../utils/mock-ai';
import { AppError } from '../middleware/errorHandler';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL_EXTRACT ?? 'gemini-2.5-flash';
const MODEL_INTERVIEW = process.env.GEMINI_MODEL_INTERVIEW ?? 'gemini-flash-latest';

const SYSTEM_INSTRUCTION = `You extract a concept prerequisite graph from a university student's study material.
Rules:
- Only use concepts that actually appear in the material (do not invent external knowledge).
- "edges": {from, to} means "from" is a prerequisite of "to" (learn 'from' before 'to').
- The graph MUST be acyclic. Do not create cycles.
- "difficulty" is an integer from 1 (easiest) to 5 (hardest).
- "source_excerpt": a short verbatim quote (a sentence or two, at most ~300 characters) copied
  exactly from the material where this concept is defined or introduced. Do not paraphrase.
- "source_page": the 1-based page number where that excerpt appears. For PDFs give the real page;
  for plain text or images with no page structure, use null.
- Return ONLY the JSON object matching the provided schema.`;

const EXTRACT_PROMPT = 'Extract the concept prerequisite graph from this document.';

/** How a study document is handed to Gemini: inline text, or a File API URI. */
export type AiMaterial =
  | { kind: 'text'; text: string }
  | { kind: 'image'; uri: string; mimeType: string }
  | { kind: 'document'; uri: string; mimeType: string };

/**
 * Uploaded files start in PROCESSING and can't be referenced by an interaction
 * until they reach ACTIVE — poll with a short bound instead of racing it.
 */
async function waitForFileActive(fileName: string): Promise<void> {
  const MAX_ATTEMPTS = 10;
  const DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const file = await ai.files.get({ name: fileName });
    if (file.state === 'ACTIVE') return;
    if (file.state === 'FAILED') {
      throw new AppError('Gemini file processing failed', 502, 'AI_FILE_FAILED');
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
  throw new AppError('Gemini file did not become active in time', 504, 'AI_FILE_TIMEOUT');
}

/** Uploads a local file to Gemini's File API and returns its URI once ready to use. */
export async function uploadFile(
  absolutePath: string,
  mimeType: string
): Promise<{ uri: string; mimeType: string }> {
  if (process.env.USE_MOCK_AI === 'true') {
    return { uri: `mock-uri://${absolutePath}`, mimeType };
  }

  const file = await ai.files.upload({ file: absolutePath, config: { mimeType } });
  if (file.name) {
    await waitForFileActive(file.name);
  }
  if (!file.uri) {
    throw new AppError('Gemini file upload did not return a URI', 502, 'AI_FILE_FAILED');
  }
  return { uri: file.uri, mimeType: file.mimeType ?? mimeType };
}

/** Calls the extract_concepts schema. Text goes inline; images/PDFs are passed by File API URI. */
export async function extractConcepts(source: AiMaterial): Promise<AiExtractResponse> {
  if (process.env.USE_MOCK_AI === 'true') {
    if (source.kind === 'text') {
      if (source.text.includes('FAIL_MOCK')) {
        throw new Error('Mock AI Extract Failed');
      }
      if (source.text.includes('CYCLE_MOCK')) {
        return MOCK_EXTRACT_RESULT_CYCLE;
      }
    }
    return MOCK_EXTRACT_RESULT;
  }

  const input =
    source.kind === 'text'
      ? source.text
      : [
          { type: 'text' as const, text: EXTRACT_PROMPT },
          {
            type: source.kind,
            uri: source.uri,
            mime_type: source.mimeType,
          },
        ];

  const interaction = await ai.interactions.create({
    model: MODEL,
    input,
    system_instruction: SYSTEM_INSTRUCTION,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: aiExtractJsonSchema,
    },
    generation_config: { thinking_level: 'low' },
  });

  if (!interaction.output_text) {
    throw new AppError('AI returned an empty response', 502, 'AI_EMPTY_RESPONSE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw new AppError('AI returned malformed JSON', 502, 'AI_BAD_FORMAT');
  }

  const result = aiExtractResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError('AI JSON does not match schema', 502, 'AI_BAD_FORMAT');
  }
  return result.data;
}

// ===================================================================================
// AI Examiner: generate_question + grade_answer (I6.2 / #114)
//
// These two calls only produce a question or a grade. Nothing here decides whether the
// interview continues, which concept comes next, or which mode to use — the caller
// (I6.3) owns all of that, because routing must stay deterministic software logic (C4).
// ===================================================================================

const QUESTION_SYSTEM_INSTRUCTION = `You write one exam question for a university student, about ONE concept from THEIR OWN uploaded material.
Rules:
- Ask ONLY about content present in the provided material. Never use outside knowledge.
- Ask exactly ONE question. Do not answer it and do not add commentary.
- Write the question in the same language as the material.
- "question_type": "recall" = state a fact or definition; "application" = apply it to a case;
  "why" = explain a mechanism or a reason.
- Do not decide whether the interview should continue — you are only writing this one question.
- Return ONLY the JSON object matching the provided schema.`;

const GRADE_SYSTEM_INSTRUCTION = `You are grading a university student's spoken-style answer against THEIR OWN uploaded material.
Rules:
- Grade ONLY against the provided material. Never use outside knowledge.
- score: 0.0 (completely wrong) to 1.0 (demonstrates deep understanding).
- verdict: "deep" = explains the why/mechanism; "shallow" = restates a definition
  without understanding; "wrong" = factually incorrect or off-topic.
- score and verdict must agree: "deep" requires score >= 0.7, "wrong" requires score < 0.4.
- feedback: 1-3 sentences, in the same language as the material, addressed to the student.
- Do not decide whether the interview should continue — you are only grading this answer.
- Return ONLY the JSON object matching the provided schema.`;

/** Per-mode steer for the next question. The caller picks the mode, never the model (C4). */
const MODE_INSTRUCTION: Record<QuestionMode, string> = {
  initial: 'This is the opening question. Check whether the student knows this concept at all.',
  deeper:
    'The student answered the previous question well. Ask a HARDER question that goes one level ' +
    'deeper into the same concept — target the underlying mechanism or an edge case, not a restatement.',
  probe:
    'The student answered the previous question superficially. Ask a question that forces them to ' +
    'explain the specific point they glossed over. Do not move on to a different concept.',
};

/** 1 initial call + 1 retry, per AE-02 exception flows E2 (API error) and E3 (bad JSON). */
const INTERVIEW_ATTEMPTS = 2;

/** A turn already asked in this session, used to steer 'deeper' / 'probe' questions. */
export interface PreviousTurn {
  questionText: string;
  answerText?: string | null;
  verdict?: Verdict | null;
}

/** Marks a response we could not parse, so a retry is attempted before giving up. */
class AiFormatError extends Error {}

/** Text goes inline; images/PDFs are passed by File API URI, as in extractConcepts. */
function buildInput(material: AiMaterial, prompt: string) {
  if (material.kind === 'text') {
    return `${prompt}\n\n--- MATERIAL ---\n${material.text}`;
  }
  return [
    { type: 'text' as const, text: prompt },
    { type: material.kind, uri: material.uri, mime_type: material.mimeType },
  ];
}

/**
 * One structured Gemini call, retried once on failure, then surfaced as an AppError the
 * caller can branch on: AI_BAD_FORMAT for unparseable output (E3), AI_UNAVAILABLE for a
 * transport/API failure (E2). Both mean I6.3 should fall back to the question cache.
 */
async function callStructured<T>(
  systemInstruction: string,
  jsonSchema: unknown,
  schema: ZodType<T>,
  input: ReturnType<typeof buildInput>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < INTERVIEW_ATTEMPTS; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model: MODEL_INTERVIEW,
        input,
        system_instruction: systemInstruction,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: jsonSchema,
        },
        // Both calls sit inside a live conversation, so latency beats depth here.
        generation_config: { thinking_level: 'low' },
      });

      if (!interaction.output_text) {
        throw new AiFormatError('AI returned an empty response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(interaction.output_text);
      } catch {
        throw new AiFormatError('AI returned malformed JSON');
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new AiFormatError('AI JSON does not match schema');
      }
      return result.data;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof AiFormatError) {
    throw new AppError(lastError.message, 502, 'AI_BAD_FORMAT');
  }
  const detail = lastError instanceof Error ? lastError.message : 'unknown error';
  throw new AppError(`AI call failed: ${detail}`, 502, 'AI_UNAVAILABLE');
}

/** Renders prior turns so 'deeper'/'probe' can reference what was actually said. */
function formatPreviousTurns(previousTurns: PreviousTurn[]): string {
  if (previousTurns.length === 0) return '';

  const lines = previousTurns.map((turn, index) => {
    const answer = turn.answerText?.trim() ? turn.answerText : '(no answer given)';
    const verdict = turn.verdict ? ` [graded: ${turn.verdict}]` : '';
    return `Turn ${index + 1}:\nQ: ${turn.questionText}\nA: ${answer}${verdict}`;
  });

  return `\n\nEarlier in this session:\n${lines.join('\n\n')}\n\nDo not repeat a question already asked above.`;
}

export interface GenerateQuestionParams {
  conceptName: string;
  material: AiMaterial;
  turnIndex: number;
  mode: QuestionMode;
  previousTurns?: PreviousTurn[];
  /** From extract_concepts' `language_detected`; falls back to the material's language. */
  language?: string;
}

/** Calls the generate_question schema for one concept and one turn (AE-02). */
export async function generateQuestion(
  params: GenerateQuestionParams
): Promise<GenerateQuestionResponse> {
  const { conceptName, material, turnIndex, mode, previousTurns = [], language } = params;

  if (process.env.USE_MOCK_AI === 'true') {
    return mockGenerateQuestion(conceptName, mode);
  }

  const languageLine = language ? `\nWrite the question in ${language}.` : '';
  const prompt =
    `Concept under examination: "${conceptName}".\n` +
    `This is question number ${turnIndex} for this concept.\n` +
    `${MODE_INSTRUCTION[mode]}${languageLine}` +
    formatPreviousTurns(previousTurns);

  return callStructured(
    QUESTION_SYSTEM_INSTRUCTION,
    generateQuestionJsonSchema,
    generateQuestionResponseSchema,
    buildInput(material, prompt)
  );
}

export interface GradeAnswerParams {
  conceptName: string;
  material: AiMaterial;
  questionText: string;
  answerText: string;
  /** From extract_concepts' `language_detected`; falls back to the material's language. */
  language?: string;
}

/**
 * Calls the grade_answer schema (AE-03). The returned verdict is reconciled against the
 * score before it leaves this function, so callers can rely on the two agreeing.
 */
export async function gradeAnswer(params: GradeAnswerParams): Promise<GradeAnswerResponse> {
  const { conceptName, material, questionText, answerText, language } = params;

  if (process.env.USE_MOCK_AI === 'true') {
    return mockGradeAnswer(answerText);
  }

  const languageLine = language ? `\nWrite the feedback in ${language}.` : '';
  const prompt =
    `Concept under examination: "${conceptName}".\n` +
    `Question asked:\n${questionText}\n\n` +
    `The student answered:\n${answerText}\n\n` +
    `Grade this answer against the material.${languageLine}`;

  const graded = await callStructured(
    GRADE_SYSTEM_INSTRUCTION,
    gradeAnswerJsonSchema,
    gradeAnswerResponseSchema,
    buildInput(material, prompt)
  );

  const { verdict, corrected } = reconcileVerdict(graded.score, graded.verdict);
  if (corrected) {
    console.warn(
      `[gemini] grade_answer returned verdict "${graded.verdict}" with score ${graded.score}; ` +
        `overriding to "${verdict}" (score is authoritative)`
    );
  }
  return { ...graded, verdict };
}

// ===================================================================================
// AI Examiner: summarize_session (I6.5 / AE-09) — the fourth and last AI call.
//
// Unlike generate_question/grade_answer, this call takes NO material and NO document upload:
// it only sees the numbers I6.3/I7.2 already computed, never the source text. That keeps the
// call cheap (a few lines of JSON in, not a whole document) and structurally unable to grade
// or re-grade anything — it can only comment on scores that already exist (C4).
// ===================================================================================

const SUMMARIZE_SYSTEM_INSTRUCTION = `You are writing a short study report for a university student who just finished
a self-assessment interview. You are given ONLY their scores and verdicts.
Rules:
- Do NOT invent facts about the subject matter. Comment only on performance.
- strengths: concepts scoring >= 0.7. weaknesses: concepts scoring < 0.6.
- recommendations: concrete, actionable, max 3 items.
- Write in the same language as the concept names. Warm but honest tone.
- Return ONLY the JSON object matching the provided schema.`;

/** One concept's result for the session, as summarize_session sees it — scores only. */
export interface SessionConceptSummaryInput {
  conceptName: string;
  /** `null` when the concept was queued but never actually assessed. */
  masteryScore: number | null;
  /** Every turn's verdict for this concept, oldest first. */
  verdicts: Verdict[];
}

export interface SummarizeSessionParams {
  concepts: SessionConceptSummaryInput[];
  /** From extract_concepts' `language_detected`; falls back to the material's language. */
  language?: string;
}

/** Renders the scores as plain text — the only input this call ever sees (no material). */
function formatConceptResults(concepts: SessionConceptSummaryInput[]): string {
  return concepts
    .map((concept) => {
      const mastery =
        concept.masteryScore === null ? 'not graded' : concept.masteryScore.toFixed(2);
      const verdicts = concept.verdicts.length > 0 ? concept.verdicts.join(', ') : 'none';
      return `- ${concept.conceptName}: mastery_score=${mastery}, verdicts=[${verdicts}]`;
    })
    .join('\n');
}

/** Calls the summarize_session schema (AE-09). Never sees the source document. */
export async function summarizeSession(
  params: SummarizeSessionParams
): Promise<SummarizeSessionResponse> {
  const { concepts, language } = params;

  if (process.env.USE_MOCK_AI === 'true') {
    return mockSummarizeSession(concepts);
  }

  const languageLine = language ? `\nWrite in ${language}.` : '';
  const prompt = `Student's results this session:\n${formatConceptResults(concepts)}${languageLine}`;

  return callStructured(
    SUMMARIZE_SYSTEM_INSTRUCTION,
    summarizeSessionJsonSchema,
    summarizeSessionResponseSchema,
    prompt
  );
}

// --- Plan material cache -----------------------------------------------------------
// Sprint 4 re-sends the whole document on every turn (option A in #114). Uploading it
// again each turn would be wasteful, so the File API result is cached per plan.
// Loading is passed in as a callback to keep Prisma out of this module.
// Tech debt for Sprint 5: send per-concept excerpts instead of the whole file.

const PLAN_MATERIAL_TTL_MS = 12 * 60 * 60 * 1000;

const planMaterialCache = new Map<string, { material: AiMaterial; expiresAt: number }>();

/** Returns the plan's material, loading and caching it on first use in this process. */
export async function getPlanMaterial(
  planId: string,
  load: () => Promise<AiMaterial>
): Promise<AiMaterial> {
  const cached = planMaterialCache.get(planId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.material;
  }

  const material = await load();
  planMaterialCache.set(planId, { material, expiresAt: Date.now() + PLAN_MATERIAL_TTL_MS });
  return material;
}

/** Drops a cached upload — call when a plan's documents change. */
export function invalidatePlanMaterial(planId: string): void {
  planMaterialCache.delete(planId);
}
