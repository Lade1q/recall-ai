import type { ConceptStatus } from '@prisma/client';
import type { ConceptExtract } from '../schemas/ai-extract.schema';

/**
 * Reconciling a fresh AI extraction against the concepts a plan already holds (SP-05 / #170).
 *
 * Re-analysing is not re-importing: by the time a student asks for it they may have sat
 * interviews against half the graph, and every mastery score, review-queue row and interview
 * turn hangs off a Concept id. So the extraction is merged, never replayed onto an empty
 * plan — same name keeps its row (and therefore its score and its history), a name the new
 * document no longer mentions is *deprecated* rather than deleted, and only genuinely new
 * names are inserted.
 *
 * Pure function — no Prisma, no clock. The merge policy is deterministic software logic (C4)
 * and must be provable from mock data with the database switched off (SDP risk R05).
 */

/** The columns of an already-stored Concept this merge needs to make its decision. */
export interface ExistingConcept {
  id: string;
  name: string;
  status: ConceptStatus;
}

/** An existing row the new extraction still contains, carrying its refreshed fields. */
export interface KeptConcept {
  id: string;
  /** The extracted spelling, which becomes the row's name — casing may have changed. */
  name: string;
  difficulty: number;
}

export interface ConceptMergePlan {
  /** Names with no counterpart: inserted fresh, so `masteryScore` starts null. */
  toCreate: ConceptExtract[];
  /** Matched rows: keep the id (and the score), refresh name/difficulty, force back to active. */
  toKeep: KeptConcept[];
  /** Ids of active rows the new extraction dropped. Marked deprecated — never deleted. */
  toDeprecate: string[];
}

/**
 * The identity two concepts are considered "the same" under.
 *
 * Trimmed and case-folded because the model is not stable about either between runs, and
 * "Cây nhị phân" arriving as "cây nhị phân" must not fork into a second concept that silently
 * resets the student's score to null. Exported so edge endpoints, which reference concepts by
 * name, resolve through exactly the same key.
 */
export function normalizeConceptKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Works out what to insert, update and deprecate for one re-analysis.
 *
 * Degenerates cleanly for a brand-new plan: with no existing concepts every name lands in
 * `toCreate` and nothing is deprecated, which is exactly the first-analysis behaviour — so
 * the caller runs one code path for both (SP-01 and SP-05).
 *
 * Duplicate names within a single extraction collapse to the first occurrence: the graph is
 * keyed by name, so two rows sharing one key would make every edge touching it ambiguous.
 */
export function planConceptMerge(
  existing: readonly ExistingConcept[],
  extracted: readonly ConceptExtract[]
): ConceptMergePlan {
  // An active row wins over a deprecated one sharing a key, so a concept revived by an
  // earlier re-analysis is not shadowed by the tombstone it left behind.
  const existingByKey = new Map<string, ExistingConcept>();
  for (const concept of existing) {
    const key = normalizeConceptKey(concept.name);
    const incumbent = existingByKey.get(key);
    if (!incumbent || (incumbent.status === 'deprecated' && concept.status === 'active')) {
      existingByKey.set(key, concept);
    }
  }

  const toCreate: ConceptExtract[] = [];
  const toKeep: KeptConcept[] = [];
  const seenKeys = new Set<string>();

  for (const concept of extracted) {
    const key = normalizeConceptKey(concept.name);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    const match = existingByKey.get(key);
    if (match) {
      toKeep.push({ id: match.id, name: concept.name, difficulty: concept.difficulty });
    } else {
      toCreate.push(concept);
    }
  }

  const toDeprecate = existing
    .filter((c) => c.status === 'active' && !seenKeys.has(normalizeConceptKey(c.name)))
    .map((c) => c.id);

  return { toCreate, toKeep, toDeprecate };
}
