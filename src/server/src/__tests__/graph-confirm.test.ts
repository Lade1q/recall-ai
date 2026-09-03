import { shouldActivate } from '../services/graph.service';
import { replaceGraphSchema } from '../schemas/graph.schema';

/**
 * Regression coverage: PUT /plans/:id/graph is shared by two different callers — the
 * editor re-sending the whole graph after every edit for a live DAG check, and the
 * explicit "Confirm Graph" button (I3.5). Activation must key off `confirm`, not off
 * "the write succeeded", or a plan would go active on its first edited edge.
 */
describe('shouldActivate', () => {
  it('activates a draft plan on an explicit confirm with concepts', () => {
    expect(shouldActivate('draft', true, 3)).toBe(true);
  });

  it('does not activate a draft plan on a plain edit (no confirm)', () => {
    expect(shouldActivate('draft', false, 3)).toBe(false);
  });

  it('does not activate a draft plan with an empty graph, even on confirm', () => {
    expect(shouldActivate('draft', true, 0)).toBe(false);
  });

  it('does not re-trigger activation on an already active plan', () => {
    expect(shouldActivate('active', true, 3)).toBe(false);
  });

  it('does not activate a completed plan', () => {
    expect(shouldActivate('completed', true, 3)).toBe(false);
  });
});

describe('replaceGraphSchema confirm field', () => {
  const base = { concepts: [{ name: 'A' }], edges: [] };

  it('defaults confirm to false when omitted', () => {
    expect(replaceGraphSchema.parse(base).confirm).toBe(false);
  });

  it('accepts an explicit confirm: true', () => {
    expect(replaceGraphSchema.parse({ ...base, confirm: true }).confirm).toBe(true);
  });

  it('accepts an explicit confirm: false', () => {
    expect(replaceGraphSchema.parse({ ...base, confirm: false }).confirm).toBe(false);
  });
});

/**
 * 🔴 `documentEdges` must NOT default to `[]`.
 *
 * `confirm` right above it defaults, and the natural instinct when adding an array field is to
 * do the same. Here that would be destructive: the editor's live DAG re-check re-sends the
 * concept graph on every edit and never mentions topics, so a defaulted empty list would read as
 * "the student deleted every arrow between documents" and wipe the study order on the first
 * keystroke — with the topic layer not even on screen.
 *
 * This is a SCHEMA test on purpose: `replacePlanGraph`'s own tests call the service with a typed
 * object and never touch Zod, so they cannot see this default at all (measured 03/09 — adding
 * `.default([])` left every service test green).
 */
describe('replaceGraphSchema documentEdges field', () => {
  const base = { concepts: [{ name: 'A' }], edges: [] };

  it('stays undefined when omitted — absence means "leave the topic layer alone"', () => {
    expect(replaceGraphSchema.parse(base).documentEdges).toBeUndefined();
  });

  it('keeps an explicit empty list distinguishable from omission', () => {
    expect(replaceGraphSchema.parse({ ...base, documentEdges: [] }).documentEdges).toEqual([]);
  });

  it('accepts document ids and rejects anything that is not a uuid', () => {
    const from = '11111111-1111-4111-8111-111111111111';
    const to = '22222222-2222-4222-8222-222222222222';

    expect(
      replaceGraphSchema.parse({ ...base, documentEdges: [{ from, to }] }).documentEdges
    ).toEqual([{ from, to }]);
    expect(
      replaceGraphSchema.safeParse({ ...base, documentEdges: [{ from: 'LN02.pdf', to }] }).success
    ).toBe(false);
  });
});
