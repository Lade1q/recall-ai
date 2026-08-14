import { sanitizeEvidence } from './evidence-guard';
import type { EvidenceStatus, RawEvidence } from './evidence-guard';

/**
 * Whether one evidence fire earns a stored row, and what that row says (#330, §2.2).
 *
 * One step downstream of `evidence-guard.ts`: the guard decides whether a fire is TRUSTWORTHY,
 * this decides what STORAGE does about it. They are separate because the guard's verdict is a
 * statement about the AI's claim, while the mapping "downgraded means no row at all" is a storage
 * policy — the reason `not_discussed` never needs a column. A checkpoint the student left
 * unresolved is represented by the ABSENCE of a row, and #331 infers it at scoring time
 * (`checkpoints committed − checkpoints with evidence`).
 *
 * Pure — no Prisma, no Gemini, no clock — so the rule that decides whether the database is
 * touched at all stays provable from fixtures with `DATABASE_URL` and `GEMINI_API_KEY` switched
 * off (SDP risk R05). `interview-evidence.service.ts` does the touching.
 */

/**
 * What to do with one fire.
 *
 * `skip` keeps the guard's two rejection reasons apart even though storage treats them
 * identically (no row either way): `dropped` counts enum leakage — the model leaving its declared
 * `{covered, contradicted}` schema, which spike S0 measured live — while `downgraded` counts
 * INV-2 saves, an answer too uncertain to punish. Collapsing them into one "skipped" would erase
 * the only signal that says which failure is getting worse.
 */
export type EvidenceWriteDecision =
  | { kind: 'write'; status: EvidenceStatus; quote: string | null }
  | { kind: 'skip'; reason: 'downgraded' | 'dropped' };

/**
 * The stored spelling of a quote: trimmed, and empty collapsed to `null`.
 *
 * Only the edges are trimmed — the quote is a verbatim record of what the student said, and it is
 * what a human re-checks a disputed label against, so nothing inside it is rewritten. `''`,
 * `'   '` and absent all become one value, so "no quote" is a single state in an audit rather
 * than three that have to be tested for separately.
 *
 * A stored row may legitimately have no quote: the guard only *requires* one for `contradicted`
 * (a misconception nobody can point at is downgraded rather than charged), so a `covered` fire
 * with an empty quote is kept, and lands here as `null`.
 */
function storedQuote(quote: string | null | undefined): string | null {
  const trimmed = (quote ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Runs the deterministic guard over one fire and turns its verdict into a storage decision.
 *
 * Every write path must come through here rather than calling `sanitizeEvidence` and then
 * deciding for itself — that is what makes "no fire reaches the table unguarded" a property of
 * one function instead of a rule each caller is trusted to remember.
 *
 * Note what is NOT decided here: the identity of the row (`sessionId`, `conceptId`,
 * `checkpointId`) and the `checkpointText` snapshot come from the caller untouched. This function
 * never sees them, so it cannot silently retarget a fire at a different checkpoint than the one
 * the examiner measured.
 */
export function decideEvidenceWrite(fire: RawEvidence): EvidenceWriteDecision {
  const sanitized = sanitizeEvidence(fire);

  switch (sanitized.kind) {
    case 'kept':
      return { kind: 'write', status: sanitized.status, quote: storedQuote(fire.quote) };
    case 'downgraded':
      return { kind: 'skip', reason: 'downgraded' };
    case 'dropped':
      return { kind: 'skip', reason: 'dropped' };
  }
}
