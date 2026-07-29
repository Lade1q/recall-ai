import { z } from 'zod';

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
});

export const edgeExtractSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const aiExtractResponseSchema = z.object({
  concepts: z.array(conceptExtractSchema).min(1),
  edges: z.array(edgeExtractSchema),
  language_detected: z.string().min(2).max(10).catch('en'),
});

export type ConceptExtract = z.infer<typeof conceptExtractSchema>;
export type EdgeExtract = z.infer<typeof edgeExtractSchema>;
export type AiExtractResponse = z.infer<typeof aiExtractResponseSchema>;

// JSON Schema passed to Gemini's response_format so output matches aiExtractResponseSchema.
export const aiExtractJsonSchema = z.toJSONSchema(aiExtractResponseSchema);
