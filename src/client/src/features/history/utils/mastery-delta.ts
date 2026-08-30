import type { InterviewSessionListConceptDelta } from '../types/history.types';

/**
 * Đọc một `InterviewSessionListConceptDelta` thành thứ hiển thị được — nơi DUY NHẤT trong màn
 * này quyết định "lần đầu" hay "mức tăng".
 *
 * Ràng buộc cứng (SPEC_DB-03 bước #4 / UC-Overview §5.3): `masteryBefore === null` là **chưa
 * đo**, không phải `0.0`. Nên khái niệm lần đầu hiện GIÁ TRỊ TUYỆT ĐỐI kèm nhãn "lần đầu";
 * `masteryBefore ?? 0` rồi vẽ `+0.72` là sai dữ liệu, không phải làm tròn cho đẹp.
 */
export type MasteryDeltaKind =
  /** Có điểm trước và sau ⇒ nói được mức tăng/giảm. */
  | 'changed'
  /** Lần đầu được chấm ⇒ chỉ có giá trị tuyệt đối. */
  | 'first'
  /** Phiên này không chấm được khái niệm đó lượt nào ⇒ không có gì để so. */
  | 'ungraded';

export interface MasteryDeltaView {
  kind: MasteryDeltaKind;
  /** Điểm sau phiên; `null` chỉ khi `kind === 'ungraded'`. */
  after: number | null;
  /** Điểm trước phiên; `null` khi chưa từng đo. */
  before: number | null;
  /** Hiệu số, chỉ có nghĩa khi `kind === 'changed'`. */
  difference: number | null;
}

export function readMasteryDelta(concept: InterviewSessionListConceptDelta): MasteryDeltaView {
  const { masteryBefore, masteryAfter } = concept;

  if (masteryAfter === null) {
    return { kind: 'ungraded', after: null, before: masteryBefore, difference: null };
  }

  // Tin `isFirstAssessment` do server tính, nhưng vẫn chặn theo `masteryBefore === null`: không
  // có điểm trước thì không có phép trừ nào hợp lệ, bất kể cờ kia nói gì.
  if (concept.isFirstAssessment || masteryBefore === null) {
    return { kind: 'first', after: masteryAfter, before: null, difference: null };
  }

  return {
    kind: 'changed',
    after: masteryAfter,
    before: masteryBefore,
    difference: masteryAfter - masteryBefore,
  };
}

/** `+0.14` / `−0.04` / `0.00`. Dùng dấu trừ thật (U+2212), không phải hyphen. */
export function formatDifference(difference: number): string {
  const rounded = Math.round(difference * 100) / 100;
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(2)}`;
  return `+${rounded.toFixed(2)}`;
}

/** `0.68`, hoặc `—` cho khái niệm phiên này không chấm. */
export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(2);
}
