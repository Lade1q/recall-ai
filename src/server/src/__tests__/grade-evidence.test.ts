import { mapGradeEvidence, tallyUnmapped, MAX_EVIDENCE_ENTRIES } from '../utils/grade-evidence';
import type { EvidenceRuler } from '../utils/grade-evidence';

/**
 * #346 §③/§④ — mapping `grade_answer`'s `evidence` onto the committed ruler.
 *
 * Pure fixtures: no Prisma, no Gemini, no clock, so this file proves the rule that decides whether
 * the database is touched at all with `DATABASE_URL` and `GEMINI_API_KEY` switched off (R05).
 *
 * The property under test throughout is that the MODEL never identifies a checkpoint. It hands
 * over a number; the id and the ruler snapshot are read out of the array the prompt was built
 * from. Every test that asserts a `checkpointId` is asserting that.
 */

const RULER: EvidenceRuler[] = [
  { id: 'cp-1', text: 'Nói được biến là một ô nhớ có tên' },
  { id: 'cp-2', text: 'Giải thích vì sao biến có kiểu' },
  { id: 'cp-3', text: 'Chỉ ra vì sao phải trừ đi hai địa chỉ đặc biệt' },
];

const ANSWER =
  'Biến là một ô nhớ có tên, và kiểu của nó quyết định phép toán nào dùng được. ' +
  'Phải trừ đi hai địa chỉ đặc biệt là địa chỉ mạng và địa chỉ broadcast.';

function item(overrides: Record<string, unknown> = {}) {
  return { checkpoint: 1, status: 'covered', quote: 'Biến là một ô nhớ có tên', ...overrides };
}

describe('mapGradeEvidence — resolving the index against the serialised ruler', () => {
  it('resolves a 1-based index to that position of the array it was given', () => {
    const result = mapGradeEvidence(
      [item({ checkpoint: 3, quote: 'địa chỉ mạng và địa chỉ broadcast' })],
      RULER,
      ANSWER
    );

    expect(result.unmapped).toEqual([]);
    expect(result.mapped).toEqual([
      {
        checkpointId: 'cp-3',
        checkpointText: 'Chỉ ra vì sao phải trừ đi hai địa chỉ đặc biệt',
        status: 'covered',
        quote: 'địa chỉ mạng và địa chỉ broadcast',
      },
    ]);
  });

  it('follows the array it is handed, so a differently ordered ruler resolves differently', () => {
    // The failure this guards against is silent: a re-read that returns the same rows in another
    // order maps every entry to the wrong checkpoint while every entry still looks valid. Nothing
    // can detect that after the fact, so the test pins the only defence there is — the index means
    // "the n-th line of THIS array".
    const reordered: EvidenceRuler[] = [RULER[2]!, RULER[1]!, RULER[0]!];

    const asServed = mapGradeEvidence([item({ checkpoint: 1 })], RULER, ANSWER);
    const asReordered = mapGradeEvidence([item({ checkpoint: 1 })], reordered, ANSWER);

    expect(asServed.mapped[0]!.checkpointId).toBe('cp-1');
    expect(asReordered.mapped[0]!.checkpointId).toBe('cp-3');
  });

  it('takes the checkpoint text from the ruler, never from the entry', () => {
    const result = mapGradeEvidence(
      [item({ checkpointText: 'văn bản do model tự đặt', text: 'cũng vậy', id: 'cp-99' })],
      RULER,
      ANSWER
    );

    expect(result.mapped[0]).toEqual({
      checkpointId: 'cp-1',
      checkpointText: 'Nói được biến là một ô nhớ có tên',
      status: 'covered',
      quote: 'Biến là một ô nhớ có tên',
    });
  });

  it('passes `status` through raw so `sanitizeEvidence` keeps owning the enum', () => {
    // "Running" is what the model actually emitted at spike S0. Adjudicating it here would move
    // the count out of #326's `dropped` — which is the number that measures schema leakage.
    const result = mapGradeEvidence([item({ status: 'Running' })], RULER, ANSWER);

    expect(result.unmapped).toEqual([]);
    expect(result.mapped[0]!.status).toBe('Running');
  });
});

describe('mapGradeEvidence — bad_index', () => {
  /**
   * `1.5`, `NaN` and `Infinity` belong HERE and not with the shape failures: the field arrived as
   * the right type, so what went wrong is the counting. The two reasons exist to separate "the
   * entry was malformed" from "the model pointed at a checkpoint that is not there", and only the
   * second tells anyone what to do about it.
   */
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the numeric-but-not-an-index %p as bad_index',
    (checkpoint) => {
      const result = mapGradeEvidence([item({ checkpoint })], RULER, ANSWER);

      expect(result.mapped).toEqual([]);
      expect(tallyUnmapped(result.unmapped)).toEqual({
        bad_index: 1,
        parse_failed: 0,
        quote_not_found: 0,
        self_contradicted: 0,
        over_limit: 0,
      });
    }
  );

  it.each([0, -1, 4, 99])('rejects index %p as bad_index and writes nothing', (checkpoint) => {
    const result = mapGradeEvidence([item({ checkpoint })], RULER, ANSWER);

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped)).toEqual({
      bad_index: 1,
      parse_failed: 0,
      quote_not_found: 0,
      self_contradicted: 0,
      over_limit: 0,
    });
  });

  it('rejects every entry when the concept has no ruler at all (C = 0)', () => {
    const result = mapGradeEvidence([item(), item({ checkpoint: 2 })], [], ANSWER);

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).bad_index).toBe(2);
  });

  it('keeps the good entries of a batch that also contains a bad index', () => {
    const result = mapGradeEvidence(
      [item({ checkpoint: 9 }), item({ checkpoint: 1 })],
      RULER,
      ANSWER
    );

    expect(result.mapped).toHaveLength(1);
    expect(result.mapped[0]!.checkpointId).toBe('cp-1');
    expect(tallyUnmapped(result.unmapped).bad_index).toBe(1);
  });
});

describe('mapGradeEvidence — parse_failed', () => {
  it.each([
    ['not an object', 'a string entry'],
    ['not an object', 42],
    ['not an object', null],
    ['a nested array', ['covered']],
  ])('rejects %s', (_label, entry) => {
    const result = mapGradeEvidence([entry], RULER, ANSWER);

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).parse_failed).toBe(1);
  });

  it.each([
    ['a non-string status', { status: 7 }],
    ['a missing quote', { quote: undefined }],
    ['a non-string quote', { quote: 12 }],
    // A STRING index is a shape failure — the field is the wrong type. A numeric-but-not-integer
    // index is not; see the `bad_index` block above for where those land and why.
    ['a string index', { checkpoint: '1' }],
    ['a null index', { checkpoint: null }],
  ])('rejects an entry with %s', (_label, overrides) => {
    const result = mapGradeEvidence([item(overrides)], RULER, ANSWER);

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).parse_failed).toBe(1);
  });

  it.each(['', '   '])(
    'rejects the empty quote %p rather than letting it pass grounding',
    (quote) => {
      // `''` is a substring of every answer, so an empty quote would sail through `includes` and be
      // stored as evidence carrying nothing. It is a missing quote, and it is counted as one.
      const result = mapGradeEvidence([item({ quote })], RULER, ANSWER);

      expect(result.mapped).toEqual([]);
      expect(tallyUnmapped(result.unmapped)).toEqual({
        bad_index: 0,
        parse_failed: 1,
        quote_not_found: 0,
        self_contradicted: 0,
        over_limit: 0,
      });
    }
  );

  it('counts a non-array evidence field once instead of reading it as "nothing to report"', () => {
    const result = mapGradeEvidence('covered', RULER, ANSWER);

    expect(result.absent).toBe(false);
    expect(tallyUnmapped(result.unmapped).parse_failed).toBe(1);
  });
});

describe('mapGradeEvidence — quote_not_found (§④)', () => {
  it('rejects a quote the student never said, for a covered entry', () => {
    const result = mapGradeEvidence(
      [item({ quote: 'biến là vùng nhớ được cấp phát động' })],
      RULER,
      ANSWER
    );

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).quote_not_found).toBe(1);
  });

  it('rejects it for a contradicted entry too — INV-2 forbids punishing unconfirmed evidence', () => {
    // The asymmetry is deliberate and stated: dropping a `contradicted` raises the ratio. An
    // unanchored quote is not evidence of a misconception, so it may not charge one.
    const result = mapGradeEvidence(
      [item({ status: 'contradicted', quote: 'sinh viên nói biến không có kiểu' })],
      RULER,
      ANSWER
    );

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).quote_not_found).toBe(1);
  });

  it('counts an out-of-range index as bad_index even when the quote is also ungrounded', () => {
    // Order of checks is part of the contract: one entry, one count, and always the same one.
    const result = mapGradeEvidence(
      [item({ checkpoint: 99, quote: 'không có trong câu trả lời' })],
      RULER,
      ANSWER
    );

    expect(tallyUnmapped(result.unmapped)).toEqual({
      bad_index: 1,
      parse_failed: 0,
      quote_not_found: 0,
      self_contradicted: 0,
      over_limit: 0,
    });
  });
});

describe('mapGradeEvidence — the batch is never rejected as a whole', () => {
  it('reports an absent field as absent, not as a failure', () => {
    for (const raw of [undefined, null]) {
      const result = mapGradeEvidence(raw, RULER, ANSWER);
      expect(result).toEqual({ mapped: [], unmapped: [], absent: true });
    }
  });

  it('reads an empty list as "nothing to report", which is not the same as absent', () => {
    expect(mapGradeEvidence([], RULER, ANSWER)).toEqual({
      mapped: [],
      unmapped: [],
      absent: false,
    });
  });

  it('never throws on a payload built to break it', () => {
    const hostile: unknown[] = [
      undefined,
      null,
      { checkpoint: Number.NaN, status: 'covered', quote: 'Biến là một ô nhớ có tên' },
      { checkpoint: Number.POSITIVE_INFINITY, status: 'covered', quote: 'x' },
      { checkpoint: 1, status: null, quote: null },
      item(),
    ];

    const result = mapGradeEvidence(hostile, RULER, ANSWER);

    // The one good entry survives its neighbours: a malformed entry costs that entry only.
    expect(result.mapped).toHaveLength(1);
    expect(result.unmapped).toHaveLength(5);
  });

  it('keeps both entries when the model repeats one checkpoint with the SAME verdict', () => {
    // A re-emit. The unique key makes them two writes to one cell (#330), so the row is the same
    // either way and there is nothing to resolve here.
    const result = mapGradeEvidence([item(), item({ quote: 'ô nhớ có tên' })], RULER, ANSWER);

    expect(result.mapped.map((entry) => entry.checkpointId)).toEqual(['cp-1', 'cp-1']);
    expect(result.unmapped).toEqual([]);
  });
});

/**
 * OBSERVED live at #346: one response emitted `covered` and then `contradicted` for the SAME
 * checkpoint. Previously last-write-wins settled it, which meant ARRAY ORDER decided whether the
 * student was charged a misconception on a checkpoint the same response also called covered.
 */
describe('mapGradeEvidence — self_contradicted', () => {
  it('drops BOTH entries when one checkpoint gets two opposite verdicts in one response', () => {
    const result = mapGradeEvidence(
      [item(), item({ status: 'contradicted', quote: 'ô nhớ có tên' })],
      RULER,
      ANSWER
    );

    // Not "the last one wins" and not "the first one wins" — neither is confirmed evidence, and
    // INV-2 forbids punishing on unconfirmed evidence. Dropping both pulls the checkpoint out of
    // numerator and denominator, so the concept drifts back towards "not assessed yet".
    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).self_contradicted).toBe(1);
  });

  it('leaves the OTHER checkpoints of the same response alone', () => {
    const result = mapGradeEvidence(
      [
        item(),
        item({ status: 'contradicted', quote: 'ô nhớ có tên' }),
        item({ checkpoint: 3, quote: 'địa chỉ mạng và địa chỉ broadcast' }),
      ],
      RULER,
      ANSWER
    );

    expect(result.mapped.map((entry) => entry.checkpointId)).toEqual(['cp-3']);
    expect(tallyUnmapped(result.unmapped).self_contradicted).toBe(1);
  });

  it('does NOT treat a good entry beside a garbage status as a contradiction', () => {
    // `covered` + `"Running"` is one real verdict and one piece of schema leakage, not the model
    // disagreeing with itself. Counting it here would take the entry away from `sanitizeEvidence`
    // and quietly drain the `dropped` counter that measures leakage (#326).
    const result = mapGradeEvidence(
      [item(), item({ status: 'Running', quote: 'ô nhớ có tên' })],
      RULER,
      ANSWER
    );

    expect(result.mapped).toHaveLength(2);
    expect(tallyUnmapped(result.unmapped).self_contradicted).toBe(0);
  });

  it('leaves the garbage entry of a contradicted checkpoint for the guard to drop', () => {
    // Three entries on ONE checkpoint: a contradiction AND a leak. Filtering by checkpoint id took
    // the leak away with the contradiction, so `dropped` read 0 for the response where the model
    // failed in two ways at once — the counter losing sensitivity exactly when it matters most.
    const result = mapGradeEvidence(
      [
        item(),
        item({ status: 'contradicted', quote: 'ô nhớ có tên' }),
        item({ status: 'Running', quote: 'một ô nhớ' }),
      ],
      RULER,
      ANSWER
    );

    expect(tallyUnmapped(result.unmapped).self_contradicted).toBe(1);
    // The two real verdicts are gone; the out-of-enum one survives mapping so `sanitizeEvidence`
    // still sees it and still counts it as leakage.
    expect(result.mapped).toEqual([
      expect.objectContaining({ checkpointId: 'cp-1', status: 'Running' }),
    ]);
  });

  it('compares statuses case-folded, the same way the guard does', () => {
    const result = mapGradeEvidence(
      [item({ status: 'COVERED' }), item({ status: ' contradicted ', quote: 'ô nhớ có tên' })],
      RULER,
      ANSWER
    );

    expect(result.mapped).toEqual([]);
    expect(tallyUnmapped(result.unmapped).self_contradicted).toBe(1);
  });
});

describe('mapGradeEvidence — over_limit', () => {
  it('examines at most MAX_EVIDENCE_ENTRIES and says so instead of slicing silently', () => {
    const flood = Array.from({ length: MAX_EVIDENCE_ENTRIES + 5 }, () => item());

    const result = mapGradeEvidence(flood, RULER, ANSWER);

    // The row count was never at risk — the unique key collapses these into one cell — but the
    // round-trip count was, and a cut nobody can see is indistinguishable from a bound the model
    // respected on its own.
    expect(result.mapped).toHaveLength(MAX_EVIDENCE_ENTRIES);
    expect(tallyUnmapped(result.unmapped).over_limit).toBe(1);
  });

  it('leaves a batch exactly at the bound untouched', () => {
    const exact = Array.from({ length: MAX_EVIDENCE_ENTRIES }, () => item());

    const result = mapGradeEvidence(exact, RULER, ANSWER);

    expect(result.mapped).toHaveLength(MAX_EVIDENCE_ENTRIES);
    expect(tallyUnmapped(result.unmapped).over_limit).toBe(0);
  });
});

describe('tallyUnmapped', () => {
  it('reports every reason including the zeroes, so a quiet backstop is still visible', () => {
    // Full equality, not a subset: a reason added to `UnmappedReason` without a zero here would
    // mean the per-turn line silently stops naming it, and a counter nobody prints is a counter
    // nobody has.
    expect(tallyUnmapped([])).toEqual({
      bad_index: 0,
      parse_failed: 0,
      quote_not_found: 0,
      self_contradicted: 0,
      over_limit: 0,
    });
  });
});
