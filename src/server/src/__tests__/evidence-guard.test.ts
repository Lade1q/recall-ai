import {
  sanitizeEvidence,
  type RawEvidence,
  type SanitizedEvidence,
} from '../utils/evidence-guard';

// Cases spec'd by the co-planning session from the spike S0 findings. Every marker added to
// UNCERTAINTY_MARKERS must gain a case here — that is the guarantee the list stays phrase-level.
describe('sanitizeEvidence — deterministic INV-2 + enum backstop (spike S0)', () => {
  it('1. spike case: probed-then-still-unsure → downgraded, not punished', () => {
    const result = sanitizeEvidence({
      status: 'contradicted',
      quote: '…2 mũ m gì đó, quên phải trừ mấy…|…không chắc nữa',
    });
    expect(result).toEqual({ kind: 'downgraded' });
  });

  it('2. a demonstrated misconception is kept as contradicted', () => {
    const result = sanitizeEvidence({
      status: 'contradicted',
      quote: 'Lớp B octet đầu 192 tới 223',
    });
    expect(result).toEqual({ kind: 'kept', status: 'contradicted' });
  });

  it('3. the four §2.5 mandatory exclusions stay kept — a confident phrase must not match a marker', () => {
    const confident = [
      'chắc chắn là 2 mũ m trừ 2', // "chắc chắn" must not match "chắc là"
      'tôi nhớ rõ là phải trừ đi hai địa chỉ',
      'em biết rõ lớp B là 128 tới 191',
      'rõ ràng là phải trừ 2 địa chỉ đặc biệt',
    ];
    for (const quote of confident) {
      expect(sanitizeEvidence({ status: 'covered', quote })).toEqual({
        kind: 'kept',
        status: 'covered',
      });
    }
  });

  it('4. symmetric: a covered fire with an uncertain quote is downgraded too', () => {
    const result = sanitizeEvidence({
      status: 'covered',
      quote: 'hình như 2 mũ m gì đó, không chắc',
    });
    expect(result).toEqual({ kind: 'downgraded' });
  });

  it('5. never upgrades, never manufactures a penalty; enum-garbage drops, uncertainty downgrades', () => {
    const cases: { fire: RawEvidence; expected: SanitizedEvidence }[] = [
      {
        fire: { status: 'covered', quote: 'đúng rồi, hai octet đầu là mạng' },
        expected: { kind: 'kept', status: 'covered' },
      },
      {
        fire: { status: 'contradicted', quote: 'lớp B là 192 tới 223' },
        expected: { kind: 'kept', status: 'contradicted' },
      },
      { fire: { status: 'covered', quote: 'không nhớ' }, expected: { kind: 'downgraded' } },
      { fire: { status: 'contradicted', quote: 'hình như vậy' }, expected: { kind: 'downgraded' } },
      // enum garbage `dropped` and uncertainty `downgraded` are distinct outcomes (audit counts
      // enum leakage apart from downgrades) — assert the exact kind, not just "not kept".
      { fire: { status: 'Running', quote: 'bất kỳ' }, expected: { kind: 'dropped' } },
      { fire: { status: 'covered' }, expected: { kind: 'kept', status: 'covered' } },
    ];
    for (const { fire, expected } of cases) {
      expect(sanitizeEvidence(fire)).toEqual(expected);
    }
  });

  it('6. enum-drop runs before the quote check: a status outside the enum is dropped', () => {
    const result = sanitizeEvidence({ status: 'Running', quote: 'một câu hoàn toàn hợp lệ' });
    expect(result).toEqual({ kind: 'dropped' });
  });

  it('7. accented matching: a confident answer must not collide with a marker after diacritics', () => {
    // "không nhỏ" (≥) must not read as the marker "không nhớ" (I don't remember) — the collision a
    // diacritic-stripping matcher created. This exact phrasing is in the spike's own fixture domain.
    expect(
      sanitizeEvidence({
        status: 'covered',
        quote: 'số host mỗi subnet không nhỏ hơn 2 mũ m trừ 2',
      })
    ).toEqual({ kind: 'kept', status: 'covered' });
    // "chắc lắm" / "chắc lại" (assertions) must not be swallowed by the marker "chắc là" (maybe).
    expect(sanitizeEvidence({ status: 'covered', quote: 'cái này em chắc lắm' })).toEqual({
      kind: 'kept',
      status: 'covered',
    });
    expect(sanitizeEvidence({ status: 'covered', quote: 'em nói chắc lại một lần nữa' })).toEqual({
      kind: 'kept',
      status: 'covered',
    });
  });

  it('8. the real uncertainty answer from the spike still downgrades', () => {
    // p3-evidence transcript, fully accented as Gemini Live returns it.
    expect(
      sanitizeEvidence({
        status: 'contradicted',
        quote: 'thật ra tôi vẫn không nhớ, chắc có trừ gì đó mà tôi cũng không chắc nữa',
      })
    ).toEqual({ kind: 'downgraded' });
  });

  it('9. status is trimmed and case-folded before the enum test: legit fires survive, garbage drops', () => {
    expect(sanitizeEvidence({ status: 'Covered', quote: 'đúng rồi' })).toEqual({
      kind: 'kept',
      status: 'covered',
    });
    expect(sanitizeEvidence({ status: ' contradicted ', quote: 'lớp B là 192 tới 223' })).toEqual({
      kind: 'kept',
      status: 'contradicted',
    });
    expect(sanitizeEvidence({ status: 'Running', quote: 'câu hợp lệ' })).toEqual({
      kind: 'dropped',
    });
  });

  it('10. word boundary: a marker does not fire inside a longer word — "gì đó" ⊄ "gì đóng"', () => {
    // "gì đóng" (…plays the role…) contains the marker "gì đó" as an accented prefix, so accent
    // alone would not save this confident answer — only the Unicode letter-boundary fence does.
    expect(
      sanitizeEvidence({ status: 'covered', quote: 'router là cái gì đóng vai trò định tuyến' })
    ).toEqual({ kind: 'kept', status: 'covered' });
  });

  it('a missing quote: covered stays generous (kept), contradicted must not punish (downgraded)', () => {
    // covered with no quote to inspect is the generous direction — over-credit, never a penalty.
    expect(sanitizeEvidence({ status: 'covered' })).toEqual({ kind: 'kept', status: 'covered' });
    expect(sanitizeEvidence({ status: 'covered', quote: null })).toEqual({
      kind: 'kept',
      status: 'covered',
    });
    // contradicted with no quote is an UNVERIFIABLE penalty — one-directional safety downgrades it.
    expect(sanitizeEvidence({ status: 'contradicted' })).toEqual({ kind: 'downgraded' });
    expect(sanitizeEvidence({ status: 'contradicted', quote: null })).toEqual({
      kind: 'downgraded',
    });
    expect(sanitizeEvidence({ status: 'contradicted', quote: '   ' })).toEqual({
      kind: 'downgraded',
    });
  });

  it('11. SAFE markers catch un-accented AND mixed-accent text-fallback quotes (gateless)', () => {
    // The text path quotes what a student typed, often without diacritics. Safe markers (no
    // confident homograph) match on stripped text with no whole-quote gate, so a mixed-accent quote
    // is caught too — the regression the input-gate had is gone.
    for (const quote of [
      'em khong chac lam', // fully un-accented
      'toi khong chac về lớp B', // mixed accent — one accented word must not switch the pass off
      'hinh nhu vay thoi',
      'chac gi dung',
      'noi dai khai thoi',
    ]) {
      expect(sanitizeEvidence({ status: 'contradicted', quote })).toEqual({ kind: 'downgraded' });
    }
  });

  it('12. asymmetric — a covered stays strict: "không nhỏ" keeps its credit (accented-only match)', () => {
    // covered matches ACCENTED markers only, so the confident "không nhỏ" (>=) — and even its
    // un-accented form — is never mistaken for the marker "không nhớ".
    expect(
      sanitizeEvidence({ status: 'covered', quote: 'số host không nhỏ hơn 2 mũ m trừ 2' })
    ).toEqual({ kind: 'kept', status: 'covered' });
    expect(
      sanitizeEvidence({ status: 'covered', quote: 'so host khong nho hon 2 mu m tru 2' })
    ).toEqual({ kind: 'kept', status: 'covered' });
  });

  it('13. stripped folds đ→d and case for SAFE markers (guards the đ line + toLowerCase)', () => {
    // A student types plain "d" for "đ" and may not capitalise. đ (U+0111) is NOT a combining mark,
    // so a naive NFD+strip would leave it — the explicit đ→d + toLowerCase must hold for safe markers.
    for (const quote of [
      'nói gì đó thôi', // gì đó, accented
      'noi gi do thoi', // gì đó, plain-d un-accented
      'thoi dai khai vay', // đại khái, plain-d
      'KHONG CHAC LAM', // uppercase safe marker
      'Hinh Nhu Vay', // title case
    ]) {
      expect(sanitizeEvidence({ status: 'contradicted', quote })).toEqual({ kind: 'downgraded' });
    }
  });

  it('14. HOMOGRAPH markers are accented-only: confident look-alikes keep their status', () => {
    // "không nhỏ" (≥) — a real contradicted misconception must NOT be downgraded (that would drop it
    // from the denominator and inflate the score to a phantom 1.0).
    expect(
      sanitizeEvidence({ status: 'contradicted', quote: 'địa chỉ host không nhỏ hơn 2 mũ m' })
    ).toEqual({ kind: 'kept', status: 'contradicted' });
    // "không nằm … trong khoảng" (in range, verbatim in the spike) must not match "không nắm" —
    // even fully un-accented, where "khong nam" is ambiguous, it stays kept (never a deny-credit).
    expect(
      sanitizeEvidence({ status: 'covered', quote: 'octet đầu không nằm ngoài khoảng 128 đến 191' })
    ).toEqual({ kind: 'kept', status: 'covered' });
    expect(
      sanitizeEvidence({ status: 'contradicted', quote: 'gia tri nay khong nam trong dai private' })
    ).toEqual({ kind: 'kept', status: 'contradicted' });
    // "quen" (familiar) un-accented must not match the marker "em quên" — no phantom credit.
    expect(sanitizeEvidence({ status: 'contradicted', quote: 'em quen dang bai nay roi' })).toEqual(
      {
        kind: 'kept',
        status: 'contradicted',
      }
    );
  });

  it('15. bounded gap: un-accented HOMOGRAPH markers are not caught (irreducible ambiguity, tune ②)', () => {
    // "khong nho" un-accented is ambiguous — "không nhớ" (unsure) vs "không nhỏ" (≥) — so it stays
    // accented-only and its un-accented uncertain form is missed here. The ACCENTED form IS caught
    // (tests 8 and B). Documented, not papered over; revisit with a real corpus at ②.
    expect(
      sanitizeEvidence({ status: 'contradicted', quote: 'that ra toi khong nho cong thuc' })
    ).toEqual({ kind: 'kept', status: 'contradicted' });
  });

  it('B. every uncertainty marker fires on a natural sentence — a typo (dead) marker fails here', () => {
    // One realistic student sentence per marker, each targeting a single marker. A marker with a
    // typo would silently never match real phrasing (failing toward punishing) — and break a row.
    const perMarker: string[] = [
      'thầy ơi em không nhớ đoạn này',
      'cái này em không chắc luôn',
      'thật sự không biết chỗ đó',
      'không rõ lắm thầy',
      'phần này em không nắm',
      'quên rồi thầy ơi',
      'quên mất tiêu rồi',
      'tôi quên trừ đi hai địa chỉ',
      'em quên trừ đi hai địa chỉ',
      'mình quên trừ đi hai địa chỉ',
      'con quên trừ đi hai địa chỉ',
      'hình như là như vậy',
      'chắc là như thế',
      'chắc gì đã đúng',
      'đại khái là thế thôi',
      'đại loại gì đó thôi',
      'khái niệm này hơi mơ hồ',
      'đầu óc đang lơ mơ',
      'thôi hên xui vậy',
      'thôi đoán đại cho nhanh',
      'thôi chịu, không hiểu nổi',
    ];
    expect(perMarker).toHaveLength(21);
    for (const quote of perMarker) {
      expect(sanitizeEvidence({ status: 'contradicted', quote })).toEqual({ kind: 'downgraded' });
    }
  });
});
