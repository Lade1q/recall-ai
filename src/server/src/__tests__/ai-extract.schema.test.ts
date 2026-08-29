import {
  CHECKPOINT_MAX_LENGTH,
  SOURCE_CONTEXT_MAX_LENGTH,
  SOURCE_SECTION_MAX_LENGTH,
  aiExtractJsonSchema,
  aiExtractResponseSchema,
} from '../schemas/ai-extract.schema';
import { normalizeCheckpoints, readExtractedCheckpoints } from '../utils/checkpoint';

/**
 * The `checkpoints` half of the `extract_concepts` contract (#329).
 *
 * What is being pinned is the DEGRADATION, not the happy path: this schema parses the output of a
 * model, and spike S0 measured that a declared constraint does not bind one. So the questions are
 * what a missing field costs, what a single bad entry costs, and whether either can take down an
 * extraction that is otherwise fine.
 */

/** Only the corner of the generated JSON Schema this test reads. */
interface JsonSchemaShape {
  properties: {
    concepts: { items: { required: string[]; properties: Record<string, unknown> } };
  };
}

const CONCEPT = {
  name: 'Subnet mask',
  difficulty: 3,
  source_page: 4,
  source_excerpt: 'A subnet mask splits an address into a network part and a host part.',
};

function parseCheckpoints(raw: unknown): string[] | null | undefined {
  const result = aiExtractResponseSchema.safeParse({
    concepts: [{ ...CONCEPT, checkpoints: raw }],
    edges: [],
    language_detected: 'vi',
  });
  if (!result.success) {
    throw new Error(`extraction rejected: ${result.error.issues[0]?.message}`);
  }
  return result.data.concepts[0]?.checkpoints;
}

describe('conceptExtractSchema — checkpoints', () => {
  it('keeps a well-formed list as given', () => {
    expect(parseCheckpoints(['Nêu được định nghĩa', 'Tính số host của một mạng'])).toEqual([
      'Nêu được định nghĩa',
      'Tính số host của một mạng',
    ]);
  });

  it('degrades a missing, null or non-array field to null — "no answer", NOT "no checkpoints"', () => {
    // The distinction is the whole point: `[]` deletes a concept's stored checkpoints, so a
    // malformed answer must not arrive at the write path wearing the same clothes as a
    // deliberate empty one. `null` never fails the extraction either — it just says nothing.
    const result = aiExtractResponseSchema.safeParse({
      concepts: [CONCEPT], // no `checkpoints` key at all
      edges: [],
      language_detected: 'vi',
    });

    expect(result.success).toBe(true);
    expect(result.data?.concepts[0]?.checkpoints).toBeNull();
    expect(parseCheckpoints(null)).toBeNull();
    expect(parseCheckpoints('Nêu được định nghĩa, tính số host')).toBeNull();
    expect(parseCheckpoints({ 0: 'Nêu được định nghĩa' })).toBeNull();
  });

  it('keeps a deliberate empty list as an answer in its own right', () => {
    // `C = 0`: the model looked and found nothing to check. Distinct from every case above.
    expect(parseCheckpoints([])).toEqual([]);
    expect(readExtractedCheckpoints(parseCheckpoints([]) ?? null)).toEqual({
      status: 'committed',
      texts: [],
    });
  });

  it('costs one entry, not the list, when a single checkpoint is unusable', () => {
    // Over-long / wrong-typed entries are caught to '' here and dropped by normalizeCheckpoints —
    // the two steps are separate so that a bad neighbour cannot erase good checkpoints.
    const parsed = parseCheckpoints([
      'Nêu được định nghĩa',
      'x'.repeat(CHECKPOINT_MAX_LENGTH + 1),
      42,
      'Tính số host của một mạng',
    ]);

    expect(parsed).toEqual(['Nêu được định nghĩa', '', '', 'Tính số host của một mạng']);
    expect(normalizeCheckpoints(parsed ?? [])).toEqual([
      'Nêu được định nghĩa',
      'Tính số host của một mạng',
    ]);
  });

  it('reports a list whose entries ALL died as degraded, not as an empty answer', () => {
    // Entry failures leave '' placeholders, so the array stays non-empty — which is the only
    // thing separating "the model listed two checkpoints, both malformed" from "it listed none".
    const parsed = parseCheckpoints(['x'.repeat(CHECKPOINT_MAX_LENGTH + 1), { text: 'nope' }]);

    expect(parsed).toEqual(['', '']);
    expect(readExtractedCheckpoints(parsed ?? null)).toEqual({ status: 'degraded' });
  });

  it('asks the model for checkpoints as a required, bounded field', () => {
    // The JSON schema is what Gemini is actually held to (C4: fixed schema). If `checkpoints`
    // stopped being required, a model would simply omit it and every concept would come back
    // with C = 0 — silently unassessable rather than visibly broken.
    const item = (aiExtractJsonSchema as unknown as JsonSchemaShape).properties.concepts.items;

    expect(item.required).toContain('checkpoints');
    // Nullable in the parser (see above), so the wire schema offers array-or-null. What must not
    // regress is the array branch: a list of strings, bounded at the column width.
    const { anyOf } = item.properties.checkpoints as { anyOf: Record<string, unknown>[] };
    expect(anyOf).toContainEqual(
      expect.objectContaining({
        type: 'array',
        items: expect.objectContaining({ type: 'string', maxLength: CHECKPOINT_MAX_LENGTH }),
      })
    );
  });

  /**
   * #373 — the wire schema must keep offering `null` for `source_excerpt`.
   *
   * The honest empty state ("Đoạn này chỉ có neo vị trí, không có câu trích dẫn.") has existed in
   * `DocumentExcerpt` since #227 but was unreachable: 0/87 stored rows had a null excerpt, because
   * the system instruction accepted a quote "where this concept is defined **or introduced**" and
   * a bare mention satisfies "introduced". #373 removed that clause and told the model to answer
   * null when the material never says what the concept is.
   *
   * Measured A/B on live Gemini, one variable changed, 2 runs per arm: for a prerequisite the
   * material only names, the old instruction quoted the prerequisite LIST LINE for two different
   * concepts (byte-identical), the new one returned null in both runs.
   *
   * That fix only works while the wire schema still permits null. Tighten this to a bare string
   * and the model can no longer express "the material does not define this" — it would go back to
   * quoting a mention, which is the defect, not the fallback.
   */
  it('lets the model say the material never defines a concept', () => {
    const item = (aiExtractJsonSchema as unknown as JsonSchemaShape).properties.concepts.items;

    const { anyOf } = item.properties.source_excerpt as { anyOf: Record<string, unknown>[] };
    expect(anyOf).toContainEqual(expect.objectContaining({ type: 'null' }));
    expect(anyOf).toContainEqual(expect.objectContaining({ type: 'string' }));
    // A null excerpt must not drag the whole concept down with it.
    expect(item.required ?? []).not.toContain('source_excerpt');
  });
});

/**
 * #296 — `source_section`/`source_context` enrich FS-04 state 6 with a section heading and the
 * paragraph around the excerpt. Same shape as `source_excerpt` above: best-effort, nullable, and
 * must not become required — the model has no section structure to report for plain text/images.
 */
describe('conceptExtractSchema — source_section / source_context (#296)', () => {
  function parseWith(overrides: Record<string, unknown>) {
    return aiExtractResponseSchema.safeParse({
      concepts: [{ ...CONCEPT, ...overrides }],
      edges: [],
      language_detected: 'vi',
    });
  }

  it('keeps a well-formed section title and context', () => {
    const result = parseWith({
      source_section: '4.2 Ngăn xếp',
      source_context: 'A stack follows LIFO order. Push and pop both happen at the top.',
    });

    expect(result.success).toBe(true);
    expect(result.data?.concepts[0]?.source_section).toBe('4.2 Ngăn xếp');
    expect(result.data?.concepts[0]?.source_context).toBe(
      'A stack follows LIFO order. Push and pop both happen at the top.'
    );
  });

  it('degrades a null or malformed value to null rather than failing the concept', () => {
    // Same `.nullish().catch(null)` shape as `source_page`/`source_excerpt`: an absent key parses
    // as `undefined` (nothing to catch — no error occurred), while an explicit bad value is caught
    // to `null`. Both read as "no section/context" downstream; the distinction is not load-bearing
    // here the way `checkpoints`' `null` vs `[]` is.
    expect(parseWith({}).data?.concepts[0]?.source_section).toBeUndefined();
    expect(parseWith({ source_section: null }).data?.concepts[0]?.source_section).toBeNull();
    // Empty string fails `.min(1)` — degrade, don't reject the whole extraction.
    expect(parseWith({ source_section: '' }).data?.concepts[0]?.source_section).toBeNull();
    expect(parseWith({ source_context: 42 }).data?.concepts[0]?.source_context).toBeNull();
  });

  it('does not require either field in the wire schema — both are best-effort', () => {
    const item = (aiExtractJsonSchema as unknown as JsonSchemaShape).properties.concepts.items;

    expect(item.required ?? []).not.toContain('source_section');
    expect(item.required ?? []).not.toContain('source_context');
  });

  it('still lets the model answer null for both, same as source_excerpt', () => {
    const item = (aiExtractJsonSchema as unknown as JsonSchemaShape).properties.concepts.items;

    for (const field of ['source_section', 'source_context']) {
      const { anyOf } = item.properties[field] as { anyOf: Record<string, unknown>[] };
      expect(anyOf).toContainEqual(expect.objectContaining({ type: 'null' }));
      expect(anyOf).toContainEqual(expect.objectContaining({ type: 'string' }));
    }
  });

  /**
   * Review #425 (Quân) — two mutations survived 916/916 unnoticed: `SOURCE_CONTEXT_MAX_LENGTH`
   * 2000→200 and `SOURCE_SECTION_MAX_LENGTH` 200→20000. `SOURCE_SECTION_MAX_LENGTH`'s 200-char
   * cap was the ONLY thing stopping the model from stuffing a whole paragraph into the field FS-04
   * renders as an `<h3>`. These pin the boundary directly at both constants.
   */
  // Review #425 round 2 (Quân) — these two originally pinned the RELATION between the boundary
  // strings and the constant ('x'.repeat(CONST + 1)), not the constant's actual value, so an edit
  // to the constant itself silently dragged the test along with it. Confirmed live: renaming
  // SOURCE_CONTEXT_MAX_LENGTH 2000→200 and SOURCE_SECTION_MAX_LENGTH 200→20000 both still passed
  // 926/926. Pinning the absolute value is what makes an accidental edit to the constant fail.
  it('SOURCE_SECTION_MAX_LENGTH is 200 — a heading, not a paragraph', () => {
    expect(SOURCE_SECTION_MAX_LENGTH).toBe(200);
  });

  it('SOURCE_CONTEXT_MAX_LENGTH is 2000 — wide enough for a real paragraph, capped so the model cannot stuff a whole chapter in', () => {
    expect(SOURCE_CONTEXT_MAX_LENGTH).toBe(2000);
  });

  it('accepts source_section at exactly SOURCE_SECTION_MAX_LENGTH, degrades one char over', () => {
    const atMax = 'x'.repeat(SOURCE_SECTION_MAX_LENGTH);
    const overMax = 'x'.repeat(SOURCE_SECTION_MAX_LENGTH + 1);

    expect(parseWith({ source_section: atMax }).data?.concepts[0]?.source_section).toBe(atMax);
    expect(parseWith({ source_section: overMax }).data?.concepts[0]?.source_section).toBeNull();
  });

  it('accepts source_context at exactly SOURCE_CONTEXT_MAX_LENGTH, degrades one char over', () => {
    const atMax = 'x'.repeat(SOURCE_CONTEXT_MAX_LENGTH);
    const overMax = 'x'.repeat(SOURCE_CONTEXT_MAX_LENGTH + 1);

    expect(parseWith({ source_context: atMax }).data?.concepts[0]?.source_context).toBe(atMax);
    expect(parseWith({ source_context: overMax }).data?.concepts[0]?.source_context).toBeNull();
  });
});
