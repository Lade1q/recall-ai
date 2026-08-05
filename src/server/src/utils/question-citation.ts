import type { DocumentKind } from '@prisma/client';
import type { QuestionSourceResponse } from '../types/interview.types';

/**
 * Which document/page an interview question gets to cite (C5), decided without touching the
 * database so the rule is provable on its own (R05).
 *
 * The anchors themselves are not computed here — `concept_sources` was already written by
 * `buildConceptSourceRows` during analysis. This module owns the two decisions around them:
 * whether a turn may *freeze* the concept's current anchor when it is asked, and whether that
 * frozen snapshot may still be *shown* when the transcript is read back.
 *
 * Both halves exist because a citation derived at read time is a citation about the document
 * the plan holds *now*, not the one the question came from. Change-document (SP-04) updates the
 * `documents` row in place — same `id`, different file — so a re-derived citation survives the
 * swap looking perfectly valid while pointing at pages that no longer exist. #239 shipped the
 * read-time version and had to hide every cached question to stay honest; snapshotting instead
 * lets cached questions cite too, and lets stale ones be identified rather than guessed at.
 */

/** A `documents` row as the interview read path loads it for the turns' snapshots. */
export interface CitedDocumentRow {
  id: string;
  filename: string;
  kind: DocumentKind;
  /** Bumped by SP-04 change-document; the signal that the file behind `id` is not the same one. */
  updatedAt: Date;
}

/** The anchor an `InterviewTurn` froze when it was asked, plus when that happened. */
export interface TurnCitationSnapshot {
  sourceDocumentId: string | null;
  sourcePageFrom: number | null;
  sourcePageTo: number | null;
  askedAt: Date;
}

/**
 * Whether a cached question (AE-05) may cite the concept's current anchor.
 *
 * Snapshotting at ask time is not enough on its own here, because a cached question is older
 * than the turn that serves it: the cache row is generated at T2 from document v1, a re-analysis
 * at T3 deletes and rewrites the concept's anchors, and the turn asked at T4 still serves the
 * T2 question. Freezing whatever anchor exists at T4 would hand a v1 question a v2 page number.
 *
 * So the anchor has to be no newer than the cache row it is being attached to. An anchor written
 * after the question was generated describes material the question was never generated from.
 */
export function anchorMatchesCachedQuestion(
  anchorCreatedAt: Date,
  cacheGeneratedAt: Date
): boolean {
  return anchorCreatedAt.getTime() <= cacheGeneratedAt.getTime();
}

/**
 * The citation for one turn, or `null` when there is nothing honest to show. None of the three
 * `null` arms is an error — the client simply renders no citation block:
 *
 * 1. **No snapshot.** The concept had no anchor when the question was asked (added by hand,
 *    #172, or `extract_concepts` returned neither page nor excerpt), or the turn predates
 *    snapshotting altogether — old rows are deliberately not backfilled.
 * 2. **The document is gone.** Deleting a document does not delete the turns that cited it
 *    (`sourceDocumentId` is a reference, not a foreign key), so a dangling id is expected.
 * 3. **The document was replaced after the question was asked.** `documentId` survives
 *    change-document but the file behind it does not, so citing it would name the wrong file.
 */
export function buildTurnCitation(
  turn: TurnCitationSnapshot,
  documents: Map<string, CitedDocumentRow>
): QuestionSourceResponse | null {
  if (!turn.sourceDocumentId) return null;

  const document = documents.get(turn.sourceDocumentId);
  if (!document) return null;
  if (document.updatedAt.getTime() > turn.askedAt.getTime()) return null;

  return {
    documentId: document.id,
    filename: document.filename,
    kind: document.kind,
    pageFrom: turn.sourcePageFrom,
    pageTo: turn.sourcePageTo,
  };
}
