import {
  gradeAnswerAskSchema,
  gradeAnswerJsonSchema,
  gradeAnswerResponseSchema,
} from '../schemas/ai-interview.schema';

/**
 * #346 — `grade_answer` asks strictly and accepts leniently, and the gap between the two is
 * deliberate.
 *
 * This file exists because that gap is invisible to every other test. Loosening the JSON Schema
 * changes nothing any test observes (parsing goes through the response schema), and tightening the
 * response schema only shows up on a payload nobody writes a fixture for. Both directions are
 * behaviour-neutral for the rest of the suite, so they get their own net here.
 */

const jsonSchema = gradeAnswerJsonSchema as {
  properties: Record<string, unknown>;
  required?: string[];
};

describe('gradeAnswerJsonSchema — what the model is ASKED for', () => {
  it('declares the full evidence item shape, so structured output keeps the model on the rails', () => {
    const evidence = jsonSchema.properties.evidence as {
      type: string;
      items: { properties: Record<string, { type?: string; enum?: string[]; minimum?: number }> };
    };

    expect(evidence.type).toBe('array');
    // The index is what makes a wrong answer CHECKABLE (`1 ≤ i ≤ N` is arithmetic). An id would
    // not be: `InterviewEvidence.checkpointId` is not a foreign key, so an invented uuid writes
    // successfully.
    expect(evidence.items.properties.checkpoint).toMatchObject({ type: 'integer', minimum: 1 });
    expect(evidence.items.properties.status).toMatchObject({
      enum: ['covered', 'contradicted'],
    });
    expect(evidence.items.properties.quote).toMatchObject({ type: 'string' });
  });

  it('asks for evidence on every grade rather than leaving the field optional', () => {
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining(['score', 'feedback', 'verdict', 'evidence'])
    );
  });

  it('rejects a forged checkpoint id at the ask schema — indices only', () => {
    const parsed = gradeAnswerAskSchema.safeParse({
      score: 0.5,
      feedback: 'ok',
      verdict: 'shallow',
      evidence: [{ checkpoint: 'cp-1', status: 'covered', quote: 'x' }],
    });

    expect(parsed.success).toBe(false);
  });
});

describe('gradeAnswerResponseSchema — what is ACCEPTED', () => {
  const grade = { score: 0.55, feedback: 'Bạn mới nêu định nghĩa.', verdict: 'shallow' };

  it.each([
    ['a well-formed list', [{ checkpoint: 1, status: 'covered', quote: 'x' }]],
    ['an empty list', []],
    ['a bare string', 'covered'],
    ['a list of nulls', [null, null]],
    ['entries missing every field', [{}]],
    ['an absent field', undefined],
  ])('parses the grade when evidence is %s', (_label, evidence) => {
    const parsed = gradeAnswerResponseSchema.safeParse({ ...grade, evidence });

    // A Zod failure here would become AI_BAD_FORMAT, drop the whole response and send the session
    // to `gradingUnavailable` — costing the student an answer that was graded correctly. Evidence
    // is additive; it may never take the grade down with it.
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject(grade);
  });

  it('still enforces the fields the grade itself is made of', () => {
    expect(gradeAnswerResponseSchema.safeParse({ ...grade, score: 2 }).success).toBe(false);
    expect(gradeAnswerResponseSchema.safeParse({ ...grade, verdict: 'maybe' }).success).toBe(false);
    expect(gradeAnswerResponseSchema.safeParse({ feedback: 'x', verdict: 'deep' }).success).toBe(
      false
    );
  });
});
