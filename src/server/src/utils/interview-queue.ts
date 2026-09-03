/**
 * The interview session's concept queue, and the rule for growing it mid-session (live
 * traceback).
 *
 * `InterviewSession.conceptQueue` is a JSON column that has always held a plain `string[]` of
 * concept ids. Live traceback needs each entry to also say *why* it is there — a prerequisite
 * pulled in because the student stumbled on something built on top of it is not the same thing
 * as a concept the session opened with, and the screen has to be able to say so ("nền của X").
 * Widening the JSON shape rather than adding columns is what keeps this migration-free; the
 * reader below accepts both shapes, so sessions written before this change keep working and no
 * backfill is needed.
 *
 * Pure — no Prisma, no Gemini, no clock, no randomness. The whole "should we trace back, and to
 * what" decision is deterministic software logic (C4) and must stay provable from plain objects
 * with the database and the API key switched off (SDP risk R05). Reading the graph and writing
 * the column belongs to `interview.service.ts`; picking the weak prerequisites belongs to
 * `traceback.service.ts`. This file only decides what the queue becomes.
 */

import { MAX_CONCEPTS_PER_SESSION } from './interview-state';

/** One concept the session will ask about, and how it got into the queue. */
export interface QueueEntry {
  conceptId: string;
  /**
   * Distance from the concepts the session opened with. `0` = chosen at start (by the student
   * or by the review queue); `1` = a direct prerequisite of a `0` the student stumbled on;
   * `2` = a prerequisite of *that*, and so on up to `MAX_TRACEBACK_HOPS`.
   *
   * Deliberately NOT the same number as `traceback.service.ts`'s `depth`. That one is how far a
   * single reverse-BFS walked from one concept (capped at `MAX_TRACEBACK_DEPTH = 2`) for the
   * *next* session's review queue. This one is how many times the live session has hopped
   * backwards, and each hop only ever takes `depth === 1` results — the chain is built by
   * recursion, not by one deep walk. Merging the two constants would silently retune the
   * offline review queue, which the demo does not touch.
   */
  hop: number;
  /** The concept whose wrong answer pulled this one in; `null` for `hop === 0`. */
  viaConceptId: string | null;
  /**
   * Did this entry *lengthen* the queue? True only for a bucket-1 insert.
   *
   * Deliberately not derived from `hop > 0`. A bucket-2 move also stamps a hop — that is how the
   * screen says "nền của X" for a concept the session was going to reach anyway — so `hop > 0`
   * counts moves as if they had cost a slot, and `MAX_LIVE_TRACEBACK_INSERTS` then runs out on a
   * session that has added nothing. That is not a corner case: a one-concept deep link is filled
   * from the seed's graph neighbours, which are usually its prerequisites, so the first hop is
   * typically all moves.
   */
  added: boolean;
}

/**
 * How far back the live session may hop. Distinct from `MAX_TRACEBACK_DEPTH` (see `hop` above).
 *
 * Hard-coded, never taken from a client: a deeper chain makes one sitting balloon, which is the
 * exact failure AE-07 E3 exists to prevent — the only difference here is that the cost lands on
 * the session the student is *in* rather than the next one, which makes it worse, not better.
 */
export const MAX_TRACEBACK_HOPS = 3;

/**
 * How many concepts live traceback may add to one session in total, across every hop.
 *
 * `MAX_TRACEBACK_HOPS` bounds the chain but not the fan-out: a concept with four weak
 * prerequisites would add four at hop 1 alone. Every added concept costs up to
 * `maxTurnsPerConcept` pairs of Gemini calls, so this is the value to lower first if a session
 * runs long.
 */
export const MAX_LIVE_TRACEBACK_INSERTS = 4;

/**
 * The most concepts one sitting can end up covering, inserts included — the ceiling that used to
 * exist only as arithmetic nobody performed.
 *
 * `MAX_CONCEPTS_PER_SESSION` is checked by the Zod schema on the way in, and live traceback then
 * grew the queue past it with no code anywhere comparing the two numbers. The worst case was
 * reachable from the product, not just in theory: the graph panel deep-links every root concept
 * at once, so five seeds each with its own weak chain reached nine concepts — 27 turns, 54 Gemini
 * calls — against a constant whose own docstring claimed to keep a session "inside a sitting and
 * inside the API budget".
 *
 * Derived rather than typed out, so lowering either input moves the ceiling and cannot leave a
 * third number stale. `planTracebackInsert` enforces it directly, which makes it hold even for a
 * queue that arrived over-long from an older row rather than from an insert.
 */
export const MAX_CONCEPTS_IN_QUEUE = MAX_CONCEPTS_PER_SESSION + MAX_LIVE_TRACEBACK_INSERTS;

/**
 * Reads the stored queue, accepting both the legacy `string[]` and the widened object form.
 *
 * A JSON column is validated rather than trusted. Legacy rows — every session created before
 * live traceback — read as `hop: 0`, which is exactly right: they were all chosen at start.
 * Anything that is neither a non-empty string nor an object with one is dropped rather than
 * throwing, same as the `string[]` filter this replaces: a single malformed entry must not
 * strand a whole session (`resolveCurrentConcept` already skips ids whose Concept row is gone).
 */
export function readConceptQueue(value: unknown): QueueEntry[] {
  if (!Array.isArray(value)) return [];

  const entries: QueueEntry[] = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      if (raw.length > 0)
        entries.push({ conceptId: raw, hop: 0, viaConceptId: null, added: false });
      continue;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;

    const candidate = raw as Record<string, unknown>;
    const conceptId = candidate.conceptId;
    if (typeof conceptId !== 'string' || conceptId.length === 0) continue;

    const hop = candidate.hop;
    const viaConceptId = candidate.viaConceptId;
    const added = candidate.added;
    const readHop = Number.isInteger(hop) && (hop as number) >= 0 ? (hop as number) : 0;
    entries.push({
      conceptId,
      // A non-integer / negative / absent hop reads as 0 rather than dropping the entry: the
      // concept is still a real thing to ask about, and 0 is the reading that under-states the
      // budget already spent, so a corrupt row can never *extend* the chain.
      hop: readHop,
      viaConceptId:
        typeof viaConceptId === 'string' && viaConceptId.length > 0 ? viaConceptId : null,
      // Absent `added` falls back to `hop > 0` — the only thing such a row can tell us, and it
      // errs toward *over*-counting the budget, so an old row can shorten a chain but never
      // extend one. Same direction as the `hop` fallback above.
      added: typeof added === 'boolean' ? added : readHop > 0,
    });
  }
  return entries;
}

/** Serialises the queue back into the JSON column. Always the object form from here on. */
export function writeConceptQueue(entries: readonly QueueEntry[]): unknown {
  return entries.map((entry) => ({
    conceptId: entry.conceptId,
    hop: entry.hop,
    viaConceptId: entry.viaConceptId,
    added: entry.added,
  }));
}

/**
 * The queue as a plain list of concept ids, in order — the reason each entry is there dropped.
 *
 * Lives here, next to `readConceptQueue`, rather than in `interview.service.ts`, so that the two
 * modules that need the order but not the reason (`session-summary.service.ts` for AE-09 and
 * `interview-history.service.ts`) can reach it without pulling in a service with Prisma and
 * Gemini behind it. That import cost is exactly why both of their suites used to `jest.mock` a
 * hand-written copy of this projection: the copy kept the pre-traceback `typeof id === 'string'`
 * filter, so an object-form queue read as `[]` in production while both suites stayed green —
 * a finished session whose result screen lists no concepts at all. A pure function they can
 * import for real is the fix; there is nothing left to keep in sync.
 */
export function parseConceptQueue(value: unknown): string[] {
  return readConceptQueue(value).map((entry) => entry.conceptId);
}

export interface TracebackInsertInput {
  /** The queue as stored, in order. */
  entries: readonly QueueEntry[];
  /** Index of the concept the student is on — the one whose answer was `wrong`. */
  cursor: number;
  /**
   * Weak direct prerequisites of the concept at `cursor`, nearest-first, as
   * `traceback.service.ts` returned them (filtered to `depth === 1` by the caller).
   */
  prerequisites: readonly { conceptId: string }[];
}

export interface TracebackInsertResult {
  /** The queue to store. Identical to the input when nothing could be inserted. */
  entries: QueueEntry[];
  /** Concept ids actually inserted, in queue order. Empty means "no live traceback here". */
  inserted: string[];
}

/**
 * Works out what the queue becomes when the concept at `cursor` needs remediating, and inserts
 * its weak prerequisites **immediately before it**.
 *
 * Inserting *before* rather than appending is what keeps the rest of the system honest:
 * `currentConceptIdx` is left where it is, so it now addresses the first prerequisite, and the
 * concept that failed slides down the queue still un-finalised — it is not duplicated, not
 * scored early, and `completedConcepts` (derived from the same index) stays truthful. When the
 * chain is done the cursor walks back onto it and its turn numbering simply continues, so the
 * C6 ceiling is spent across the whole visit rather than reset by the detour.
 *
 * A prerequisite lands in one of three buckets, and the middle one is the reason this function
 * is not just an insert:
 *   1. **Not in the queue** → inserted at the cursor. Costs the session one more concept, so it
 *      is what the budgets below are about.
 *   2. **In the queue, still AHEAD of the cursor** → *moved* to the cursor. It was going to be
 *      asked anyway; the whole point of live traceback is that it gets asked NOW, before the
 *      concept that needs it. Measured on real data, this is the common case rather than the
 *      exotic one: a one-concept deep link is filled out with the seed's graph neighbours, so
 *      the prerequisite a wrong answer traces to is usually already sitting further down the
 *      queue. Treating that as "already handled" was the first thing a live run caught — the
 *      base was reached eventually, but not in front of the concept it explains, which is the
 *      only thing that makes it a traceback rather than a running order. A move lengthens
 *      nothing, so it is free of both budgets.
 *   3. **At or BEHIND the cursor** → skipped, and this is not negotiable. That concept has been
 *      asked; its turns are spent and its score is written, so pulling it forward would re-open
 *      it with no turn budget left and close it again on the spot.
 *
 * ⚠️ Bucket 3 is NOT what terminates the chain, and four comments used to say it was. The claim
 * was "after a detour the base sits behind the cursor, so it can never be pulled again" — but
 * the cursor does not advance on a hop, so each insert pushes the concept being asked *behind*
 * the front of the queue and therefore *ahead* of the cursor, which is bucket 2's territory.
 * Measured on a cycle a→b→c→a with the queue opened on [a]: `a` was asked at turn 1 and was
 * still pulled back to the cursor two hops later, giving the ask order
 * `a#1 c#1 b#1 a#2 a#3 b#2 b#3 c#2 c#3`. It terminated — but on the hop budget, not on this
 * bucket. What actually bounds it is the pair of budgets below (and C6 keeps any one concept to
 * three turns however often it is revisited). Raise `MAX_TRACEBACK_HOPS` believing the old
 * comment and the cycling comes back.
 *
 * Two budgets, both on bucket 1 only:
 *   - **Hop budget** — a prerequisite inherits `parent.hop + 1` and is dropped past
 *     `MAX_TRACEBACK_HOPS`.
 *   - **Session budget** — at most `MAX_LIVE_TRACEBACK_INSERTS` *added* concepts across the
 *     whole session, counted from the queue itself (`entry.added`) rather than from a counter,
 *     so it survives a crash and a resume the same way every other piece of this state does.
 *     It must be `added` and not `hop > 0`: a move stamps a hop too, and counting those spent
 *     the whole budget on the common deep-link shape before a single concept had been added.
 *   - **Sitting ceiling** — the queue may not pass `MAX_CONCEPTS_IN_QUEUE` however few inserts
 *     have been spent. The insert budget alone bounds the *growth*, not the *total*, and the
 *     total is what a student sits through.
 *
 * An empty `inserted` is the caller's signal that there is nothing to hop to — the state
 * machine then falls back to the hint ladder, which is still the best remaining move.
 */
export function planTracebackInsert(input: TracebackInsertInput): TracebackInsertResult {
  const { entries, cursor, prerequisites } = input;
  const unchanged = { entries: [...entries], inserted: [] as string[] };

  const parent = entries[cursor];
  if (!parent) return unchanged;

  const nextHop = parent.hop + 1;
  if (nextHop > MAX_TRACEBACK_HOPS) return unchanged;

  const indexById = new Map(entries.map((entry, index) => [entry.conceptId, index]));
  // Counted from `added`, not from `hop > 0`: a moved entry carries a hop but never lengthened
  // the queue, and charging it here is what made the budget run out on sessions that had added
  // nothing (see `QueueEntry.added`).
  const addedSoFar = entries.filter((entry) => entry.added).length;
  // Two ceilings, and the smaller one wins. The first is the session's own insert budget; the
  // second is the length of the whole sitting, which the insert budget alone does not bound —
  // a five-concept session that spent nothing yet would otherwise still be allowed to reach
  // nine. `Math.max(0, …)` because a queue can arrive already over-length (an older row, or a
  // lowered constant), and a negative budget must read as "no room", not as an insert.
  let addBudget = Math.max(
    0,
    Math.min(MAX_LIVE_TRACEBACK_INSERTS - addedSoFar, MAX_CONCEPTS_IN_QUEUE - entries.length)
  );

  const front: QueueEntry[] = [];
  const movedFrom = new Set<number>();

  for (const prerequisite of prerequisites) {
    const at = indexById.get(prerequisite.conceptId);
    let added: boolean;

    if (at === undefined) {
      if (addBudget <= 0) continue;
      addBudget -= 1;
      added = true;
    } else if (at > cursor) {
      // Bucket 2 — already queued but not yet asked. Move it, do not add it: it keeps whatever
      // `added` it already had, so moving the same entry twice cannot charge the budget twice.
      movedFrom.add(at);
      added = entries[at]?.added ?? false;
    } else {
      continue; // Bucket 3 — at or behind the cursor.
    }

    front.push({
      conceptId: prerequisite.conceptId,
      hop: nextHop,
      viaConceptId: parent.conceptId,
      added,
    });
    // Guards a graph that lists the same prerequisite twice: the second sighting now resolves to
    // the entry we are about to place, not to its old slot.
    indexById.set(prerequisite.conceptId, cursor);
  }

  if (front.length === 0) return unchanged;

  const rest = entries.filter((_, index) => !movedFrom.has(index));
  // `cursor` still indexes the right element of `rest`: every moved entry came from *after* it.
  return {
    entries: [...rest.slice(0, cursor), ...front, ...rest.slice(cursor)],
    inserted: front.map((entry) => entry.conceptId),
  };
}

/**
 * Has the session already traced back from this concept?
 *
 * Derived from the queue rather than stored, for the same reason `decideNextStep` re-derives
 * everything from the turns: a resumed session must reach the same answer as the request that
 * crashed. Without it, the concept the chain returns to would still be showing a `wrong` verdict
 * as its last graded turn and would trace back again on the spot, forever.
 */
export function hasTracedBackFrom(entries: readonly QueueEntry[], conceptId: string): boolean {
  return entries.some((entry) => entry.viaConceptId === conceptId);
}
