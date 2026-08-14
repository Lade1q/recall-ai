import { decideEvidenceWrite, type EvidenceWriteDecision } from '../utils/evidence-write';
import type { RawEvidence } from '../utils/evidence-guard';

// The rule that decides whether the database is touched at all (#330). Pure — these run with
// DATABASE_URL and GEMINI_API_KEY stripped (R05); the DB-facing half is in
// `interview-evidence-service.test.ts`.
describe('decideEvidenceWrite — guard decides, storage obeys', () => {
  it('a trustworthy fire earns a row carrying the guard’s status', () => {
    expect(decideEvidenceWrite({ status: 'covered', quote: 'hai octet đầu là phần mạng' })).toEqual(
      {
        kind: 'write',
        status: 'covered',
        quote: 'hai octet đầu là phần mạng',
      }
    );

    expect(
      decideEvidenceWrite({ status: 'contradicted', quote: 'Lớp B octet đầu 192 tới 223' })
    ).toEqual({
      kind: 'write',
      status: 'contradicted',
      quote: 'Lớp B octet đầu 192 tới 223',
    });
  });

  it('an INV-2 downgrade writes NOTHING — an unresolved checkpoint is an absent row', () => {
    // The spike S0 case: probed, answered "I don't remember", still fired `contradicted`. No row
    // means #331 infers `not_discussed` for it, which is the whole point of storing nothing.
    expect(
      decideEvidenceWrite({
        status: 'contradicted',
        quote: '…2 mũ m gì đó, quên phải trừ mấy…|…không chắc nữa',
      })
    ).toEqual({ kind: 'skip', reason: 'downgraded' });

    // Symmetric: a `covered` claim resting on an uncertain quote earns no credit either.
    expect(
      decideEvidenceWrite({ status: 'covered', quote: 'hình như 2 mũ m gì đó, không chắc' })
    ).toEqual({ kind: 'skip', reason: 'downgraded' });
  });

  it('enum leakage writes NOTHING, and stays countable apart from a downgrade', () => {
    // `Running` is what the model actually emitted under async lag at spike S0.
    expect(decideEvidenceWrite({ status: 'Running', quote: 'một câu trả lời hợp lệ' })).toEqual({
      kind: 'skip',
      reason: 'dropped',
    });

    // Storage treats both skips identically; the audit must still be able to tell schema leakage
    // (`dropped`) from an uncertainty save (`downgraded`), so the reasons stay distinct values.
    const leak = decideEvidenceWrite({ status: 'Running', quote: 'bất kỳ' });
    const unsure = decideEvidenceWrite({ status: 'covered', quote: 'không nhớ' });
    expect(leak).not.toEqual(unsure);
  });

  it('“no quote” is ONE stored value, whatever shape it arrived in', () => {
    // The guard keeps a `covered` fire without a quote (it only demands one for `contradicted`),
    // so this row really is reachable — and `''`, blanks and absent must not become three states.
    const noQuote: RawEvidence[] = [
      { status: 'covered' },
      { status: 'covered', quote: '' },
      { status: 'covered', quote: '   ' },
      { status: 'covered', quote: null },
    ];
    for (const fire of noQuote) {
      expect(decideEvidenceWrite(fire)).toEqual({ kind: 'write', status: 'covered', quote: null });
    }
  });

  it('stores the quote verbatim apart from its edges — a disputed label is re-checked against it', () => {
    const decision = decideEvidenceWrite({
      status: 'contradicted',
      quote: '  Lớp B  bắt   đầu từ 192\n',
    });
    // Trimmed at the ends, untouched inside: internal runs, newlines and casing all survive.
    expect(decision).toEqual({
      kind: 'write',
      status: 'contradicted',
      quote: 'Lớp B  bắt   đầu từ 192',
    });
  });

  it('never invents a status the guard did not keep', () => {
    // The guard's one-directional promise, restated at the storage boundary: for any input, this
    // either writes a status the guard itself returned, or writes nothing at all. A `dropped`
    // status must never be rescued into a row.
    const fires: RawEvidence[] = [
      { status: 'covered', quote: 'chắc chắn là 2 mũ m trừ 2' },
      { status: 'contradicted', quote: 'lớp B là 192 tới 223' },
      { status: 'covered', quote: 'không nhớ' },
      { status: 'contradicted' },
      { status: 'Running', quote: 'bất kỳ' },
      { status: 'COVERED ', quote: 'hai octet đầu là phần mạng' },
      { status: '', quote: 'rỗng' },
    ];

    for (const fire of fires) {
      const decision: EvidenceWriteDecision = decideEvidenceWrite(fire);
      if (decision.kind === 'write') {
        // Case/space variants are rescued by the guard, so compare on the normalised spelling.
        expect(decision.status).toBe(fire.status.trim().toLowerCase());
      } else {
        expect(['downgraded', 'dropped']).toContain(decision.reason);
      }
    }
  });
});
