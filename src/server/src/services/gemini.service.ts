import { GoogleGenAI } from '@google/genai';
import {
  aiExtractResponseSchema,
  aiExtractJsonSchema,
  AiExtractResponse,
} from '../schemas/ai-extract.schema';
import { AppError } from '../middleware/errorHandler';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL_EXTRACT ?? 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You extract a concept prerequisite graph from a university student's study material.
Rules:
- Only use concepts that actually appear in the material (do not invent external knowledge).
- "edges": {from, to} means "from" is a prerequisite of "to" (learn 'from' before 'to').
- The graph MUST be acyclic. Do not create cycles.
- "difficulty" is an integer from 1 (easiest) to 5 (hardest).
- Return ONLY the JSON object matching the provided schema.`;

const EXTRACT_PROMPT = 'Extract the concept prerequisite graph from this document.';

export type ExtractSource =
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
export async function extractConcepts(source: ExtractSource): Promise<AiExtractResponse> {
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
