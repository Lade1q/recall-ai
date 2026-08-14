/**
 * Trọng số mỗi lượt trong công thức trung bình có trọng số của `mastery_score`
 * (UC-Overview §5.4) — khớp `TURN_WEIGHTS` ở `src/server/src/utils/mastery.ts:19`. Hằng số cố
 * định của cả hệ thống (định nghĩa luôn C6: `MAX_TURNS_PER_CONCEPT = TURN_WEIGHTS.length`),
 * không phải dữ liệu riêng của phiên — nên hiện ra không phải là bịa.
 */
export const TURN_WEIGHTS = [0.2, 0.3, 0.5] as const;

/**
 * Trọng số đã CHUẨN HOÁ lại trên số lượt thực có. Một verdict `wrong` kết thúc khái niệm sớm
 * (AE-02) nên dưới 3 lượt là chuyện bình thường: hai lượt dùng `[0.2, 0.3] / 0.5 = [0.4, 0.6]`,
 * một lượt dùng `[1.0]`. Chia cho đủ `1.0` sẽ âm thầm phạt thêm người kết thúc sớm — đúng chỗ
 * bản dựng trước tính sai, nên nó phải hiện thành chữ trên màn kết quả.
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
