/**
 * Deterministic backstop for the evidence the AI examiner emits per checkpoint, run over
 * EVERY fire before the coverage formula (`coverageMasteryScore`, `mastery.ts`) counts it.
 *
 * Spike S0 (11/08) proved LIVE on Vertex native-audio that a declared constraint does not bind
 * the model on the Live async path — neither the schema nor the prompt:
 *   - INV-2 is not enforceable by prompt: the model probed correctly ("do you remember to
 *     subtract the two special addresses?"), heard "I don't remember, not sure", and still
 *     fired `contradicted`. An unresolved answer got punished as a misconception.
 *   - the enum is not reliable on async lag: under WHEN_IDLE the model emitted `status:"Running"`
 *     — outside the declared `{covered, contradicted}` enum — treating the tool like a job with
 *     a lifecycle. (SILENT kept the enum in that run, but n=1 is not a guarantee.)
 *
 * So the safety moves from AI-schema/prompt-trust to code here. Pure — no Prisma, no Gemini, no
 * clock — so it stays provable from fixtures with the database and API key switched off (R05).
 *
 * The rubric argument, stated precisely. At the STATUS level the guard is one-directional: it
 * never upgrades a status (a fire is only ever kept as-is, downgraded, or dropped) and it never
 * manufactures a penalty out of `not_discussed`. What it does NOT promise is that a fire can only
 * move a score UP: downgrading a `covered` pulls that checkpoint out of BOTH the numerator and
 * denominator of `coverageMasteryScore` (score down); downgrading a `contradicted` pulls it out of
 * the denominator only (score UP — a phantom credit that can reach 1.0, flip a band, switch
 * traceback off, the "2/4 → 1.0" §2.3's floor exists to stop). So a marker false positive is
 * harmful in BOTH directions.
 *
 * Marker precision is therefore load-bearing, and the lexicon is SPLIT by whether a marker's
 * diacritic-stripped form collides with a confident Vietnamese word:
 *   - a `covered` fire is matched on ACCENTED markers only — diacritics are semantic ("nhớ"
 *     remember vs "nhỏ" small), so a confident "không nhỏ" (≥) is never taken for "không nhớ".
 *   - a `contradicted` fire (the text path, §2.1 fallback, quotes what the student TYPED — often
 *     without diacritics) is matched on accented markers PLUS a diacritic-STRIPPED pass over the
 *     SAFE markers, run over ANY quote (accented too), so an un-accented or mixed "khong chac" is
 *     caught. The safe set is homograph-free, so this pass does not false-positive — bar two
 *     marginal markers kept for catch value (see the SAFE note), which can rarely downgrade a
 *     confident look-alike (a phantom credit), an accepted tradeoff to tune at ②.
 *   - the HOMOGRAPH markers are NEVER stripped (accented-only, both statuses): "không nhớ" →
 *     "khong nho" == "không nhỏ" (≥); "không nắm" → "khong nam" == "không nằm … trong khoảng"
 *     (in range, verbatim in the spike transcript); the "quên" (forget) family → "quen"
 *     (familiar). Their un-accented forms are the guard's one bounded gap — an IRREDUCIBLE
 *     ambiguity (losing the diacritics genuinely loses the word), documented, tune at ②. No
 *     whole-quote gate: the safe markers strip unconditionally, so a mixed-accent quote is handled.
 *
 * Boundary: this guards against punishing-the-uncertain (INV-2) and enum garbage. It does NOT
 * police status fidelity of the covered↔contradicted kind on a CONFIDENT answer — that is grain
 * quality, measured separately at S1 with fixture transcripts.
 */

/** The only two statuses the coverage formula can consume. Anything else is dropped. */
export type EvidenceStatus = 'covered' | 'contradicted';

const IN_ENUM: ReadonlySet<string> = new Set<EvidenceStatus>(['covered', 'contradicted']);

/** Narrows a raw status string to the enum without a cast at the call site. */
function isEvidenceStatus(status: string): status is EvidenceStatus {
  return IN_ENUM.has(status);
}

/**
 * Lower-case + NFC, keeping the diacritics. Vietnamese diacritics are semantic — "nhớ" (remember)
 * and "nhỏ" (small) are different words — so accented matching keeps the marker phrases apart from
 * their confident look-alikes. NFC so a precomposed marker and a decomposed quote (or vice versa)
 * still compare equal.
 */
function normalizeAccented(text: string): string {
  return text.toLowerCase().normalize('NFC');
}

/**
 * Lower-case + strip Vietnamese diacritics (and đ→d). Used for the SAFE markers' stripped pass on a
 * `contradicted` — those with no confident homograph — so an un-accented or mixed "khong chac"
 * typed on the text fallback is still caught, with no false-positive risk. Combining marks
 * (U+0300–U+036F, left by NFD) are filtered by code point rather than a regex holding literal
 * combining characters, which source tooling can mangle.
 */
function normalizeStripped(text: string): string {
  const decomposed = text.toLowerCase().normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // combining diacritical mark
    out += ch === 'đ' ? 'd' : ch;
  }
  return out;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fence a normalized marker with Unicode letter boundaries so it matches a whole phrase, not a
 *  substring inside a longer word ("chắc là" must not fire inside "chắc lắm"). No `g` flag, so
 *  `.test()` is stateless (no `lastIndex` carry-over). */
function compileMarker(normalized: string): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(normalized)}(?!\\p{L})`, 'u');
}

/**
 * Markers matched as whole PHRASES — never a bare stem (a stem like "chắc" would swallow the
 * assertion "chắc chắn"), never a substring inside a longer word (the two-token forms keep
 * "chắc chắn" / "nhớ rõ" / "biết rõ" / "rõ ràng" clear). First-person forms carry the pronoun a
 * student uses with a teacher ("em"/"mình"/"con"), not just "tôi". Every marker here must come
 * with a fixture test — see `evidence-guard.test.ts`.
 *
 * HOMOGRAPH markers: their diacritic-stripped form equals a CONFIDENT word, so they are matched
 * ACCENTED-ONLY (never stripped) — stripping would deny a covered answer its credit, or downgrade a
 * real contradicted out of the denominator (phantom credit). The un-accented forms of these are the
 * guard's one bounded gap — irreducible ambiguity, not laziness. Confirmed collisions, not guessed.
 */
const HOMOGRAPH_MARKER_PHRASES: readonly string[] = [
  'không nhớ', // "khong nho"  ≡ "không nhỏ" (≥)
  'không nắm', // "khong nam"  ≡ "không nằm … trong khoảng" (in range)
  'quên rồi', //  "quen roi"   ≡ "quen rồi"  (already familiar)
  'quên mất', //  "quen mat"   ≡ "quen mặt"  (recognise a face)
  'tôi quên', //  "toi quen"   ≡ "tôi quen"  (I'm familiar with)
  'em quên', //   "em quen"    ≡ "em quen"   (I'm familiar with)
  'mình quên', // "minh quen"  ≡ "mình quen" (I'm familiar with)
  'con quên', //  "con quen"   ≡ "con/còn quen"
];

/**
 * SAFE markers: matched on the stripped quote — which is stripped UNCONDITIONALLY, so this pass
 * also sees accented voice quotes, not just un-accented text-fallback ones. Eleven of these have no
 * confident homograph, so they never false-positive. TWO are kept in this set deliberately for
 * their high catch value ("gì đó" is the frequent hedge in the cp_7 fixture): "gì đó" ↔
 * "cái gì đo được" (measurable) and "đoán đại" ↔ "đoạn dài" (segment) / "đoàn đại biểu"
 * (delegation). These DO have a low-frequency confident homograph, so they can downgrade a real
 * misconception (a phantom credit — score up, band flip, traceback off) even on an accented quote —
 * a one-directional cost (covered never strips, so never a deny-credit). An accepted tradeoff, all
 * collisions rare in the IP domain; "đoán đại" has several look-alikes and is the first candidate to
 * reclassify as HOMOGRAPH once a real corpus at ② shows the true frequencies.
 */
const SAFE_MARKER_PHRASES: readonly string[] = [
  'không chắc',
  'không biết',
  'không rõ',
  'hình như',
  'chắc là',
  'chắc gì',
  'đại khái',
  'gì đó',
  'mơ hồ',
  'lơ mơ',
  'hên xui',
  'đoán đại',
  'chịu, không',
];

/** All markers, for the accented pass (both statuses). */
const ACCENTED_MARKERS: readonly RegExp[] = [
  ...HOMOGRAPH_MARKER_PHRASES,
  ...SAFE_MARKER_PHRASES,
].map((phrase) => compileMarker(normalizeAccented(phrase)));

/** Only the homograph-free markers, for the stripped pass on a `contradicted`. */
const SAFE_STRIPPED_MARKERS: readonly RegExp[] = SAFE_MARKER_PHRASES.map((phrase) =>
  compileMarker(normalizeStripped(phrase))
);

/** What the AI actually emitted for one checkpoint — `status` may be outside the enum. */
export interface RawEvidence {
  status: string;
  quote?: string | null;
}

/**
 * The outcome of sanitizing one fire. Only `kept` feeds the coverage denominator; `downgraded`
 * and `dropped` both mean "no evidence for this checkpoint" for scoring, but are distinguished
 * so an audit can count enum leakage (`dropped`) apart from uncertainty downgrades.
 */
export type SanitizedEvidence =
  | { kind: 'kept'; status: EvidenceStatus }
  | { kind: 'downgraded' } // uncertain / unverifiable → not_discussed (INV-2)
  | { kind: 'dropped' }; //   status outside the enum → treat as never fired

/**
 * (a) status outside `{covered, contradicted}` → DROP (garbage, e.g. "Running"). Trim + case-fold
 *     first as cheap defence: the spike proved the model can leave the enum (`Running`), so
 *     rescuing a case/space variant of a real status (`Covered` / `contradicted `) is prudent —
 *     though the observed run only produced lowercase in-enum values plus `Running`, so this is
 *     precaution, not a fix for a case that was actually seen.
 * (b) a `covered` whose quote carries an ACCENTED marker → downgrade (a confident "không nhỏ" keeps
 *     its credit). Otherwise keep. Known residual: a marker that is a real prefix of a confident
 *     idiom still fires (e.g. "không biết" in "không biết bao nhiêu" = countless, "ai mà không
 *     biết" = everyone knows); low frequency, tune the lexicon at ②.
 * (c) a `contradicted` with no quote, or whose quote carries a marker → downgrade. Markers match on
 *     the accented quote (all of them), and the SAFE markers additionally on the diacritic-stripped
 *     quote — stripped UNCONDITIONALLY, so this pass also sees accented voice quotes. The 8
 *     homograph markers are accented-only, so THEY can never drop a real misconception from the
 *     denominator; 11 of the 13 safe markers are homograph-free too, and the 2 marginal ones can
 *     (see the SAFE note). Otherwise keep.
 *
 * (a) runs before the rest: a `Running` fire is dropped regardless of its quote. Composes with
 * the `(sessionId, conceptId, checkpointId)` upsert — a dropped `Running` leaves the row
 * untouched, and a later real `covered` still lands on the right cell.
 */
export function sanitizeEvidence(fire: RawEvidence): SanitizedEvidence {
  const status = fire.status.trim().toLowerCase();
  if (!isEvidenceStatus(status)) {
    return { kind: 'dropped' };
  }
  const raw = fire.quote ?? '';
  const accented = normalizeAccented(raw);

  if (status === 'covered') {
    return ACCENTED_MARKERS.some((marker) => marker.test(accented))
      ? { kind: 'downgraded' }
      : { kind: 'kept', status };
  }

  // status === 'contradicted': accented markers (all), plus a stripped pass over the SAFE markers
  // only — no whole-quote gate, because the safe markers have no confident homograph so they never
  // false-positive, and the homograph markers stay accented-only (above).
  if (accented.trim() === '' || ACCENTED_MARKERS.some((marker) => marker.test(accented))) {
    return { kind: 'downgraded' };
  }
  const stripped = normalizeStripped(raw);
  if (SAFE_STRIPPED_MARKERS.some((marker) => marker.test(stripped))) {
    return { kind: 'downgraded' };
  }
  return { kind: 'kept', status };
}
