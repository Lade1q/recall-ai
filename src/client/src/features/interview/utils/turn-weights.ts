/**
 * Trọng số mỗi lượt trong công thức trung bình có trọng số của `mastery_score`
 * (UC-Overview §5.4) — khớp `TURN_WEIGHTS` ở `src/server/src/utils/mastery.ts:19`. Hằng số cố
 * định của cả hệ thống (định nghĩa luôn C6: `MAX_TURNS_PER_CONCEPT = TURN_WEIGHTS.length`),
 * không phải dữ liệu riêng của phiên — nên hiện ra không phải là bịa.
 */
export const TURN_WEIGHTS = [0.2, 0.3, 0.5] as const;

/**
 * Trọng số đã CHUẨN HOÁ lại trên số lượt thực có. Dưới 3 lượt vẫn có thể xảy ra — khái niệm bị bỏ
 * qua, hoặc phiên cấu hình `maxTurnsPerConcept` thấp hơn trần C6 — nên hai lượt dùng
 * `[0.2, 0.3] / 0.5 = [0.4, 0.6]`, một lượt dùng `[1.0]`. Chia cho đủ `1.0` sẽ âm thầm phạt thêm
 * người kết thúc sớm — đúng chỗ bản dựng trước tính sai, nên nó phải hiện thành chữ trên màn kết quả.
 *
 * ⚠️ (#392) Một verdict `wrong` KHÔNG còn tự kết thúc khái niệm ngay (AE-02 bước 9 đã sửa) — nó
 * tốn một lượt gợi ý thay vì kết thúc, tới trần C6 mới đóng. Dưới cấu hình mặc định (3 lượt), mọi
 * khái niệm giờ chạy đủ 3 lượt trừ khi bị bỏ qua; hàm chuẩn hoá này vẫn đúng cho hai trường hợp
 * trên, chỉ là "sao dưới 3 lượt là chuyện bình thường" không còn đúng vì lý do cũ nữa — khớp fix
 * cùng tên ở `src/server/src/utils/mastery.ts:39`.
 *
 * Trả về `null` phòng thủ khi số lượt vượt quá mảng trọng số (dữ liệu lượt dị dạng):
 * thà không hiện công thức còn hơn hiện một công thức sai.
 */
export function normalizedTurnWeights(turnCount: number): number[] | null {
  if (turnCount <= 0 || turnCount > TURN_WEIGHTS.length) return null;

  const weights = TURN_WEIGHTS.slice(0, turnCount);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/**
 * Nhãn trọng số của một lượt trên dải lượt của màn vấn đáp (`×0.2` trong mockup).
 *
 * `null` — tức KHÔNG hiện gì — ở ba ca, và cả ba đều là "thà im còn hơn gán sai":
 *  - `counts === false`: lượt gợi ý không có trọng số nào (#392 (c)). Gắn một con số cho nó là
 *    nói dối ngay trên màn sinh viên đang trả lời.
 *  - phiên dùng `maxTurnsPerConcept` khác trần mặc định: mảng hằng số này không mô tả nó.
 *  - `turnIndex` vượt ngoài mảng.
 *
 * Ở đây thay vì trong `InterviewSessionPage` vì nó là hàm thuần của `TURN_WEIGHTS` — và vì một
 * hàm chỉ sống trong tệp trang thì không ai ghim được nó mà không dựng cả trang.
 */
export function turnWeightLabel(
  turnIndex: number,
  maxTurnsPerConcept: number,
  counts: boolean
): string | null {
  if (!counts) return null;
  if (maxTurnsPerConcept !== TURN_WEIGHTS.length) return null;
  const weight: number | undefined = TURN_WEIGHTS[turnIndex - 1];
  return weight !== undefined ? `×${weight}` : null;
}
