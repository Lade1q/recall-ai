/**
 * Lượt gợi ý (#392 hướng (c)): được chấm, vẫn hiện trong bản ghi, nhưng KHÔNG vào trung bình có
 * trọng số. Nó là chính câu hỏi cũ được thu hẹp lại nên dễ hơn lượt nó theo sau; tính vào công
 * thức sẽ đặt câu dễ nhất của chuỗi ở trọng số nặng nhất.
 *
 * ⛔ Client KHÔNG tự suy "lượt này có tính không" từ `mode`. Server trả sẵn `countsTowardMastery`
 * và đó là bản DUY NHẤT của luật chấm; suy lại ở đây là dựng bản thứ hai bằng một ngôn ngữ khác,
 * và hai bản sẽ trôi khỏi nhau. `mode` chỉ dùng để NÓI ("đây là lượt gợi ý"), không để TÍNH.
 */
import type { InterviewTurnResponse, SessionSummaryTurnResponse } from '../types/interview.types';
import { turnWeightLabel } from './turn-weights';

/**
 * Chữ của client — mockup `claude-design/` không có ô nào cho lượt gợi ý (nó có trước #392), nên
 * đây là ca client tự đặt chữ. **Quân chốt phương án A, 30/08/2026**: câu này thay vào ĐÚNG chỗ
 * `· trọng số gốc 0.x` từng đứng, vì đó chính là chỗ người đọc hỏi "sao lượt này không có
 * trọng số?" — trả lời tại chỗ câu hỏi nảy ra, không thêm thành phần thị giác mới.
 *
 * Giữ ở một chỗ duy nhất: hai màn dùng chung, sửa chữ là sửa một dòng.
 */
export const HINT_TURN_NOTE = 'lượt gợi ý, không tính điểm';

/** Dòng tóm tắt ở khối công thức: bao nhiêu lượt đã hỏi nhưng không vào phép tính. */
export function excludedTurnsNote(count: number): string {
  return `${count} lượt gợi ý không tính`;
}

/**
 * Vị trí của mỗi lượt TRONG công thức, theo `id`. Lượt không tính ⇒ vắng mặt khỏi map.
 *
 * Trục là **vị trí sau khi nén**, không phải `turnIndex`: bỏ lượt 2 ra khỏi công thức thì lượt 3
 * ăn trọng số thứ HAI. Đọc `TURN_WEIGHTS[turnIndex - 1]` sẽ gán trọng số 0.5 cho một lượt đang
 * được nhân 0.6 — con số trên màn không cộng ra chính con số bên cạnh nó.
 */
export function weightSlotByTurnId(turns: readonly InterviewTurnResponse[]): Map<string, number> {
  // Thứ tự đầu vào là thứ tự slot, nên hàm này TIN người gọi đã sắp theo `turnIndex`.
  const slots = new Map<string, number>();
  let slot = 0;
  for (const turn of turns) {
    if (turn.countsTowardMastery) slots.set(turn.id, slot++);
  }
  return slots;
}

/**
 * Slot công thức của các lượt thuộc MỘT khái niệm, tra theo `id`.
 *
 * Bọc `weightSlotByTurnId` kèm việc lọc-theo-khái-niệm và sắp-theo-`turnIndex`, để mọi màn lấy
 * slot từ **một** nguồn. Trước khi có hàm này, màn Lịch sử nén slot còn màn vấn đáp thì không —
 * cùng một lượt hiện hai trọng số khác nhau ở hai màn.
 */
export function weightSlotsForConcept(
  turns: readonly InterviewTurnResponse[],
  conceptId: string | null
): Map<string, number> {
  if (conceptId === null) return new Map();
  // `.sort()` là nhánh PHÒNG THỦ, không phải nhánh đang cứu ai: bỏ nó đi thì suite vẫn xanh, vì
  // cả hai nguồn nuôi màn này đã sắp sẵn ở server (`interview.service.ts` và
  // `session-summary.service.ts` đều `orderBy: { turnIndex: 'asc' }`). Nó đứng nhờ một bảo đảm ở
  // TẦNG KHÁC — nên giữ, và nêu tên bảo đảm đó ra đây thay vì để người sau tưởng nó thừa.
  return weightSlotByTurnId(
    turns.filter((turn) => turn.conceptId === conceptId).sort((a, b) => a.turnIndex - b.turnIndex)
  );
}

/**
 * Hàm tra nhãn trọng số cho các lượt của MỘT khái niệm.
 *
 * 🔴 Trả về một closure nhận **chính lượt đó**, không nhận số. Chữ ký khiến "truyền `turnIndex`
 * thay vì slot" thành **lỗi biên dịch — nhưng chỉ ở biên `page → labeller`**. Bên trong tệp này
 * luật cũ vẫn viết được và vẫn hợp kiểu (đo: đổi thân hàm sang `turn.turnIndex - 1` ⇒ `tsc`
 * XANH, test đỏ). Kiểu che một biên; phần còn lại do test che. Đừng đọc câu này thành "kiểu che
 * cả hàm".
 * Bản trước để call site tự tra slot rồi truyền số — và đo được: đột biến truyền `n - 1` ở call
 * site **sống qua cả suite**, vì màn ấy không có test render. Ghim được đơn vị mà không ghim
 * được dây nối thì bug chỉ dời chỗ.
 *
 * `undefined` (lượt chưa chấm) và lượt gợi ý cùng ra `null` — cả hai đều là "chưa/không có slot".
 */
export function turnWeightLabeller(
  turns: readonly InterviewTurnResponse[],
  conceptId: string | null,
  maxTurnsPerConcept: number
): (turn: InterviewTurnResponse | undefined) => string | null {
  const slots = weightSlotsForConcept(turns, conceptId);
  return (turn) =>
    turnWeightLabel(turn === undefined ? null : (slots.get(turn.id) ?? null), maxTurnsPerConcept);
}

/** Các lượt thực sự đi vào công thức, giữ nguyên thứ tự đã hỏi. */
export function countingTurns<T extends { countsTowardMastery: boolean }>(
  turns: readonly T[]
): T[] {
  return turns.filter((turn) => turn.countsTowardMastery);
}

export type SummaryTurn = SessionSummaryTurnResponse;
