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
 * 🔴 Nhận **slot trong công thức**, KHÔNG nhận `turnIndex`. Đó là toàn bộ điểm của hàm này: bỏ
 * một lượt gợi ý ra khỏi công thức thì lượt sau nó **tụt slot**, nên `TURN_WEIGHTS[turnIndex - 1]`
 * gán 0.5 cho một lượt đang được nhân 0.6. Bản đầu của hàm này nhận `turnIndex` và làm đúng lỗi
 * ấy — trong khi comment ở `turn-mode.ts` đang cảnh báo về chính dòng đó.
 *
 * Không có tham số `counts` nữa: lượt gợi ý **không có slot**, nên nó tự rơi vào `null`. Một
 * đại lượng, một đường vào — "quên nén" trở thành thứ không diễn đạt được.
 *
 * `null` — tức KHÔNG hiện gì — ở ba ca, cả ba đều là "thà im còn hơn gán sai":
 *  - `weightSlot === null`: lượt gợi ý (không có slot), hoặc **người gọi không đưa lượt nào**.
 *
 *    ⚠️ Ca thứ hai KHÔNG phải "chưa biết được slot". Sự thật này đã có sẵn trong repo, ở comment
 *    ngay trên dòng `mode,` trong `create` của `askQuestion` (`interview.service.ts`) — trích
 *    nguyên văn, đừng diễn đạt lại:
 *
 *      > "`mode` was already decided above and handed to `generateQuestion`; this only writes
 *      >  down what was asked for — the AI call surface is untouched (C4)."
 *
 *    `mode` được quyết và GHI ngay lúc tạo câu hỏi ⇒ một lượt chưa chấm vẫn tra được slot, và
 *    header của màn vấn đáp làm đúng thế. Dải lượt câm vì **chính nó lọc `verdict !== null`
 *    trước khi tra** — lựa chọn hiển thị của người gọi, không phải giới hạn nhận thức.
 *  - phiên dùng `maxTurnsPerConcept` khác trần mặc định: mảng hằng số này không mô tả nó.
 *  - slot vượt ngoài mảng.
 *
 * Ở đây thay vì trong `InterviewSessionPage` vì nó là hàm thuần của `TURN_WEIGHTS` — và vì một
 * hàm chỉ sống trong tệp trang thì không ai ghim được nó mà không dựng cả trang.
 */
export function turnWeightLabel(
  weightSlot: number | null,
  maxTurnsPerConcept: number
): string | null {
  if (weightSlot === null) return null;
  if (maxTurnsPerConcept !== TURN_WEIGHTS.length) return null;
  const weight: number | undefined = TURN_WEIGHTS[weightSlot];
  return weight !== undefined ? `×${weight}` : null;
}
