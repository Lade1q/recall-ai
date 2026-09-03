import fs from 'fs';
import path from 'path';

/**
 * C4, clause 1: "AI must not be used as an orchestrator — all routing decisions (when to stop,
 * when to switch concepts, when to trigger trace-back) are deterministic software logic, not AI
 * decisions."
 *
 * `document_edges` is a study order produced by an AI call, so the question that clause asks of
 * it is: does it ever become a routing decision? Today the answer is no — it reaches the drawing
 * layer and nothing else. That is a property of the code, not of the schema, and the day someone
 * feeds it into the review schedule is the day the constraint is actually violated.
 *
 * This checks the identifier, not the concept, and it checks it in the files that route: reading
 * the code and concluding "nothing uses it" is exactly the kind of judgement that quietly stops
 * being true. Grepping the DECLARED name is what makes the test able to fail.
 */
const ROUTING_FILES = [
  'services/scheduling.service.ts',
  'services/concept-schedule.service.ts',
  'services/traceback.service.ts',
  'services/interview.service.ts',
];

const FORBIDDEN = ['documentEdge', 'document_edges', 'documentEdges'];

describe('C4 — the topic layer stays out of routing', () => {
  it.each(ROUTING_FILES)('%s does not read the AI-inferred study order', (relativePath) => {
    const absolute = path.join(__dirname, '..', relativePath);
    // A renamed or deleted file must fail loudly rather than pass by vacuum: a guard that
    // silently stops covering anything is worse than no guard.
    expect(fs.existsSync(absolute)).toBe(true);

    const source = fs.readFileSync(absolute, 'utf-8');
    for (const identifier of FORBIDDEN) {
      expect(source).not.toContain(identifier);
    }
  });

  it('the identifier really does exist elsewhere, so the check above is not vacuous', () => {
    const analysis = fs.readFileSync(
      path.join(__dirname, '..', 'services/analysis.service.ts'),
      'utf-8'
    );
    expect(analysis).toContain('documentEdge');
  });
});
