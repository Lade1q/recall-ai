import { getPlanMaterial, invalidatePlanMaterial, AiMaterial } from '../services/gemini.service';

/**
 * The per-document material cache (§4 / multi-document plans).
 *
 * Before this, material was cached and looked up per PLAN. That was correct while a plan held one
 * file; with a whole subject in one plan it meant every concept was quizzed against whichever
 * file the first question happened to load — a question about chapter 8 generated and graded
 * from chapter 2, and its C5 citation naming chapter 2 as the source.
 */
describe('getPlanMaterial — keyed per document', () => {
  const PLAN = 'plan-1';
  const text = (t: string): AiMaterial => ({ kind: 'text', text: t });

  afterEach(() => invalidatePlanMaterial(PLAN));

  it('caches per document, so two topics of one plan do not share material', async () => {
    const a = await getPlanMaterial(PLAN, 'doc-a', () => Promise.resolve(text('chapter 2')));
    const b = await getPlanMaterial(PLAN, 'doc-b', () => Promise.resolve(text('chapter 8')));

    expect(a).toEqual(text('chapter 2'));
    expect(b).toEqual(text('chapter 8'));
  });

  it('still serves the second call for the same document from cache', async () => {
    const load = jest.fn().mockResolvedValue(text('chapter 2'));

    await getPlanMaterial(PLAN, 'doc-a', load);
    await getPlanMaterial(PLAN, 'doc-a', load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('treats a null document as its own key, not as any document', async () => {
    const load = jest.fn().mockResolvedValue(text('fallback'));

    await getPlanMaterial(PLAN, 'doc-a', () => Promise.resolve(text('chapter 2')));
    const fallback = await getPlanMaterial(PLAN, null, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(fallback).toEqual(text('fallback'));
  });

  /**
   * 🔴 The load-bearing half of the key change. `delete(planId)` would now miss every real entry,
   * so a plan whose documents were replaced would keep answering from the old uploads for the
   * rest of the 12h TTL — silently, and only for the topics that had been interviewed.
   */
  it('invalidation drops EVERY document of the plan, not one key', async () => {
    const reload = jest.fn().mockResolvedValue(text('reloaded'));
    await getPlanMaterial(PLAN, 'doc-a', () => Promise.resolve(text('old a')));
    await getPlanMaterial(PLAN, 'doc-b', () => Promise.resolve(text('old b')));
    await getPlanMaterial(PLAN, null, () => Promise.resolve(text('old default')));

    invalidatePlanMaterial(PLAN);

    expect(await getPlanMaterial(PLAN, 'doc-a', reload)).toEqual(text('reloaded'));
    expect(await getPlanMaterial(PLAN, 'doc-b', reload)).toEqual(text('reloaded'));
    expect(await getPlanMaterial(PLAN, null, reload)).toEqual(text('reloaded'));
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it('leaves another plan’s cache alone', async () => {
    const other = jest.fn().mockResolvedValue(text('other reloaded'));
    await getPlanMaterial(PLAN, 'doc-a', () => Promise.resolve(text('mine')));
    await getPlanMaterial('plan-2', 'doc-a', () => Promise.resolve(text('theirs')));

    invalidatePlanMaterial(PLAN);

    expect(await getPlanMaterial('plan-2', 'doc-a', other)).toEqual(text('theirs'));
    expect(other).not.toHaveBeenCalled();
    invalidatePlanMaterial('plan-2');
  });

  /**
   * A plan id that is a prefix of another must not be caught by the prefix sweep. `plan-1` and
   * `plan-10` are exactly the shape uuid-free test ids and any future slug scheme would produce.
   */
  it('does not invalidate a plan whose id merely starts with the same characters', async () => {
    const neighbour = jest.fn().mockResolvedValue(text('reloaded'));
    await getPlanMaterial('plan-10', 'doc-a', () => Promise.resolve(text('neighbour')));

    invalidatePlanMaterial('plan-1');

    expect(await getPlanMaterial('plan-10', 'doc-a', neighbour)).toEqual(text('neighbour'));
    expect(neighbour).not.toHaveBeenCalled();
    invalidatePlanMaterial('plan-10');
  });
});
