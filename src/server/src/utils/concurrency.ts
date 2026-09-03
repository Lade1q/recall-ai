/**
 * Runs `task` over every item with at most `limit` in flight at once, preserving input order in
 * the result.
 *
 * Phase 1 of plan analysis is one AI call per uploaded document, and those calls are independent
 * — running them sequentially makes an 8-file upload take eight times as long as a one-file one
 * for no reason. A bare `Promise.all` is the other extreme: it opens every call at once, and the
 * Gemini free tier answers a burst with 429s, a failure mode that looks nothing like the timeouts
 * the retry loop was written for.
 *
 * `Promise.allSettled` semantics are deliberately NOT used: the first rejection propagates, so a
 * document that fails all its retries fails the whole batch. Silently dropping it would leave the
 * student a plan missing a third of their syllabus with nothing on screen saying so.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const effectiveLimit = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return; // unreachable; `noUncheckedIndexedAccess` widens the index
      results[index] = await task(item, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(effectiveLimit, items.length) }, () => worker()));
  return results;
}
