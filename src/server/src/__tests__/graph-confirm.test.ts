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
