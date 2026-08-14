import { z } from 'zod';

/**
 * Longest a single checkpoint may be. A checkpoint is one thing to demonstrate, not a
 * paragraph — matching `ConceptCheckpoint.text`'s column width, so a value that parses here
 * always fits the row. An over-long one degrades to `''` and is dropped downstream
 * (`normalizeCheckpoints`) rather than failing the concept's whole checkpoint list.
 */
export const CHECKPOINT_MAX_LENGTH = 300;

export const conceptExtractSchema = z.object({
  name: z.string().min(1).max(255),
  difficulty: z.number().int().min(1).max(5).catch(1),
  description: z.string().max(2000).optional(),
  // Source anchor (concept_sources): where in the material this concept was found.
  // Best-effort and independent — a bad/absent value degrades to null (`.catch`) so it
  // never fails the whole extraction. `source_page` is null for non-paginated input
  // (plain text/images); `source_excerpt` is the verbatim passage used to ground it (C5).
  source_page: z.number().int().min(1).nullish().catch(null),
  source_excerpt: z.string().min(1).max(2000).nullish().catch(null),
  // What the student must demonstrate to be counted as understanding this concept — the ruler
  // Interview v2 grades against, committed HERE at analysis time and immutable while grading
  // (INV-1, #329). No weight field by design: a harder checkpoint is simply written as more
  // lines, so scoring keeps one constant in one place (§2.3).
  //
  // `null` here is NOT "no checkpoints" — it is "the model did not answer", and the two must
  // never be collapsed:
  //   - `[]`   the model deliberately returned none. A real answer: `C = 0`, a concept the
  //            §2.4 guard routes to the text path.
  //   - `null` the field was absent, null, or not an array. NO answer, so nothing may be
  //            concluded from it — `persistCheckpoints` keeps whatever is already stored.
  // Collapsing them is what would let one malformed re-analysis wipe a concept's whole ruler
  // (and, once #330 lands, the evidence hanging off it). Spike S0 is why this schema tolerates a
  // malformed answer at all; it is equally why a malformed answer must not be read as an
  // authoritative empty one. Nullable rather than a bare `.catch` so the two states are distinct
  // in the TYPE as well — the same shape `source_page`/`source_excerpt` above already use.
  //
  // A single unusable ENTRY is separate and cheaper: it becomes `''`, dropped by
  // `normalizeCheckpoints`, costing that entry alone. Entry-level failure still leaves a
  // NON-EMPTY array, which is how `readExtractedCheckpoints` tells "every entry died" (degraded)
  // apart from a deliberate `[]`.
  checkpoints: z
    .array(z.string().min(1).max(CHECKPOINT_MAX_LENGTH).catch(''))
    .nullable()
    .catch(null),
});

export const edgeExtractSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const aiExtractResponseSchema = z.object({
  concepts: z.array(conceptExtractSchema).min(1),
  edges: z.array(edgeExtractSchema),
  // Width matches StudyPlan.languageDetected. 20 leaves room for regional BCP-47 tags
  // (ca-ES-valencia is 14): the `.catch` below means an over-long tag would silently
  // become 'en' and the student would be examined in the wrong language.
  language_detected: z.string().min(2).max(20).catch('en'),
});

export type ConceptExtract = z.infer<typeof conceptExtractSchema>;
export type EdgeExtract = z.infer<typeof edgeExtractSchema>;
export type AiExtractResponse = z.infer<typeof aiExtractResponseSchema>;

// JSON Schema passed to Gemini's response_format so output matches aiExtractResponseSchema.
export const aiExtractJsonSchema = z.toJSONSchema(aiExtractResponseSchema);
