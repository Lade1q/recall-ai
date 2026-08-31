/**
 * Ghi chú môi trường: file này CỐ Ý không override sang môi trường Node (Vitest quét pragma kiểu
 * comment ở bất kỳ đâu trong toàn bộ text file — kể cả bên trong một chuỗi giải thích như thế này
 * — nên viết ra chính cú pháp override đó, dù chỉ để MÔ TẢ nó, sẽ tự kích hoạt override; đây là
 * đúng loại tự nhiễm mà `production-text.ts` từng vướng, xem comment ở đầu file đó).
 * `setupFiles` trong `vite.config.ts` là cấu hình global, chạy cho MỌI file test bất kể override
 * môi trường theo từng file — và `setupTests.ts` tham chiếu thẳng biến toàn cục của trình duyệt mà
 * không có guard, nên override môi trường sẽ làm cả file này crash ngay ở bước setup, trước khi
 * chạy được dòng nào. Test này chỉ dùng `node:fs`/`node:path`/`@tailwindcss/node` — các API này
 * chạy bình thường dưới môi trường mặc định của dự án (môi trường giả lập trình duyệt chỉ THÊM
 * global trình duyệt vào tiến trình Node, không hề chặn API Node gốc) nên không có lý do kỹ thuật
 * nào bắt buộc phải override.
 *
 * Bài test ghim bất biến cho issue #443: một class Tailwind CHỈ được viết ra ở file test (JSX
 * literal / `cn`-`clsx`-`cva` / `.toHaveClass` / `.className...toContain`) mà KHÔNG hề tồn tại
 * trong text thô của bất kỳ file production nào, thì đó là bằng chứng test đang khoá một class
 * đã bị xoá (hoặc chưa từng có) khỏi component thật — test đó là test giả (false positive tiềm
 * ẩn), phải bị bài test này bắt và FAIL.
 *
 * Ba trụ cột phối hợp:
 *   - `extractTestFileCandidates()` — candidate nào được VIẾT RA trong file test, ở ngữ cảnh mang
 *     class thật (không phải văn xuôi trong `it(...)`).
 *   - `existsInProductionText()` — candidate đó có xuất hiện ở text thô của production hay không
 *     (Tailwind quét kiểu substring thô, không AST — nên đối chiếu phải cùng kiểu để tránh vênh).
 *   - `isValidTailwindUtility()` — lọc nhiễu: candidate phải THẬT SỰ là một utility Tailwind hợp
 *     lệ mới đáng báo; loại bỏ rác/typo/token không phải class (vd một chuỗi tình cờ khớp regex
 *     nhưng compile ra rỗng).
 */
import { describe, expect, it } from 'vitest';
import { existsInProductionText, textContainsClassToken } from './production-text';
import { extractTestFileCandidates, type Location } from './test-file-candidates';
import { isValidTailwindUtility } from './validate-candidate';

function formatLocations(locations: Location[]): string {
  return locations.map((location) => `${location.file}:${location.line}`).join(', ');
}

describe('không có class Tailwind nào chỉ sống trong test (issue #443)', () => {
  it('mọi candidate class trong file test đều tồn tại trong text production, hoặc không phải utility Tailwind hợp lệ', async () => {
    const candidates = extractTestFileCandidates();
    // Sàn gần con số thật thay vì `> 0` — góp ý từ review @Lade1q trên PR #472: cổng `> 0` vẫn
    // xanh nếu bộ trích một ngày nào đó tụt còn 1, không còn nói lên được điều nó định nói. Đo
    // thật lúc viết dòng này (31/08/2026, 26 tệp *.test.{ts,tsx} dưới src/client/src): 28 candidate.
    expect(candidates.size).toBeGreaterThan(20);

    const offenders: { candidate: string; locations: Location[] }[] = [];

    for (const [candidate, locations] of candidates) {
      if (existsInProductionText(candidate)) continue;
      if (await isValidTailwindUtility(candidate)) {
        offenders.push({ candidate, locations });
      }
    }

    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - "${o.candidate}" (chỉ thấy ở: ${formatLocations(o.locations)})`)
        .join('\n');
      expect.fail(
        `Tìm thấy ${offenders.length} class Tailwind chỉ sống trong file test (không có trong ` +
          `production):\n${report}\n\nNhững class này có thể đã bị xoá/gõ sai ở component thật ` +
          `nhưng test vẫn xanh vì assertion so sánh với chính literal đã copy vào test.`
      );
    }
  });

  it('[đối chứng dương] cơ chế phải bắt được: class production bị đổi thành ghép-chuỗi động vẫn còn nguyên literal trong test', async () => {
    // Mô phỏng đúng kịch bản #443: production đổi từ literal tĩnh sang ghép chuỗi động
    // (`` `max-[680px]:${suffix}` ``), nên literal đầy đủ không còn xuất hiện, dù chỉ là substring,
    // trong text thô của production — trong khi file test vẫn còn giữ nguyên literal đầy đủ để so
    // khớp (`toContain('max-[680px]:min-h-[58px]')`).
    // Gọi THẲNG `textContainsClassToken` — hàm so khớp THẬT dùng bên trong `existsInProductionText`
    // — trên một văn bản "production giả" tự dựng, thay vì chép lại logic `.includes()` (nếu chép
    // lại thì test này không còn chứng minh được gì về hàm thật, đúng điều DoD #443 cảnh báo: "không
    // có vế này thì nó là một phép đo không thể sai").
    const fakeTestCandidate = 'max-[680px]:min-h-[58px]';
    // Đây là văn bản NGUỒN (chưa chạy) của "production giả" — biến `suffix` chỉ là một tên biến
    // trong source, giá trị thật của nó (trùng với `fakeTestCandidate` khi ghép) không nằm sẵn ở
    // đây dưới dạng literal, đúng như production thật khi Tailwind quét văn bản tĩnh.
    const fakeProductionText = [
      'const NARROW = "max-[680px]:";',
      'className={NARROW + `${suffix}`}',
    ].join('\n');

    const existsInFakeProduction = textContainsClassToken(fakeProductionText, fakeTestCandidate);
    expect(existsInFakeProduction).toBe(false);

    // Và candidate đó vẫn là một utility Tailwind hợp lệ thật sự (không phải rác) — nên cơ chế
    // thật (dùng đúng `isValidTailwindUtility`) sẽ coi đây là một offender thật.
    const isValid = await isValidTailwindUtility(fakeTestCandidate);
    expect(isValid).toBe(true);

    // Kết hợp hai điều kiện trên đúng là điều kiện offender trong test chính ở trên
    // (`!existsInProductionText(candidate) && isValidTailwindUtility(candidate)`) — chứng minh
    // cơ chế phát hiện hoạt động đúng với kịch bản ghép-chuỗi động mà #443 mô tả.
    expect(!existsInFakeProduction && isValid).toBe(true);
  });

  it('[đối chứng dương — hồi quy] literal bị xoá khỏi production không được "cứu" bởi một literal dài hơn cùng tiền tố', () => {
    // Phát hiện thật trong lượt review #443: nếu `existsInProductionText` chỉ dùng `.includes()`
    // thô, xoá `max-[680px]:flex` khỏi production vẫn bị coi là "còn tồn tại" hễ đâu đó còn
    // `max-[680px]:flex-1` — vì chuỗi ngắn là substring của chuỗi dài, dù đây là hai class Tailwind
    // hoàn toàn khác nhau. Ghim lại bằng chính văn bản gây lỗi thật (`MonthGrid.tsx` có cả hai).
    // CỐ Ý không viết literal `className="..."` trong chuỗi giả này — `textContainsClassToken` chỉ
    // so khớp text thô, không quan tâm cú pháp JSX, nhưng viết đúng cú pháp đó sẽ khiến CHÍNH tệp
    // test này bị `extractTestFileCandidates()` (quét mọi *.test.*) hiểu nhầm là một `className`
    // JSX thật và tự trích ra candidate — một dạng tự nhiễm khác của đúng loại lỗi #443 mô tả.
    const fakeProductionText = '... max-[680px]:flex-1 ...';
    expect(textContainsClassToken(fakeProductionText, 'max-[680px]:flex')).toBe(false);
    // Đối chứng ngược: literal trọn vẹn thì vẫn phải khớp bình thường.
    expect(textContainsClassToken(fakeProductionText, 'max-[680px]:flex-1')).toBe(true);

    // Vế đối xứng, phát hiện ở review @Lade1q trên PR #472: guard có HAI vế (`before` và `after`),
    // ca trên chỉ tập thể dục vế `after` (ký tự ngay sau vị trí khớp). Không có ca nào ép vế
    // `before` (ký tự ngay TRƯỚC vị trí khớp) chạy thật, nên một đột biến bỏ vế đó sẽ sống sót.
    // Ghim bằng đúng false-negative mà review chỉ ra: `flex` bị "cứu" bởi `hover:flex` còn sót lại,
    // dù `flex` (bare) đã bị xoá khỏi production thật và hai candidate này compile ra CSS khác nhau.
    expect(textContainsClassToken('... hover:flex ...', 'flex')).toBe(false);
  });

  // ⚠️ Dòng comment NGAY DƯỚI ĐÂY là fixture cố ý cho ca kế tiếp — một className JSX GIẢ chỉ tồn
  // tại trong văn bản comment này, không phải trong code thật của file: className="max-[377px]:mt-[7px]"
  it('[đối chứng dương — comment tự nhiễm] literal chỉ nằm trong COMMENT của tệp test không được trích ra như candidate thật', () => {
    // Phát hiện ở review @Lade1q trên PR #472: trước khi có `stripComments`, một comment chứa
    // literal trùng cú pháp `className="..."` (như dòng ⚠️ ngay phía trên `it(...)` này) cũng đủ
    // khiến `extractTestFileCandidates()` hiểu nhầm là một className JSX thật — an toàn (đỏ oan,
    // không phải xanh oan) nhưng gây nhiễu khó hiểu cho người sau. Đúng loại tự nhiễm mà
    // `production-text.ts` đã xử ở phía production; áp cùng cái nhìn ấy sang phía test.
    const candidates = extractTestFileCandidates();
    expect(candidates.has('max-[377px]:mt-[7px]')).toBe(false);

    // Đối chứng ngược, BẮT BUỘC đi kèm: `stripComments` không được bóc nhầm CODE THẬT. Hai candidate
    // này đến từ ngữ cảnh 4 (`.className...toContain(...)`) trong `MonthGrid.test.tsx` — không nằm
    // trong comment nào — nếu chúng biến mất sau khi thêm bước bóc comment, đó là over-strip.
    expect(candidates.has('max-[680px]:min-h-[58px]')).toBe(true);
    expect(candidates.has('max-[680px]:flex')).toBe(true);
  });

  it('[đối chứng âm] class chỉ có ở production không bị báo, và "ordinal" trong tên it(...) không bị trích ra dù là utility hợp lệ', async () => {
    // Class chỉ tồn tại ở production (không có ở test) — không được coi là offender vì
    // `extractTestFileCandidates()` sẽ không bao giờ sinh ra candidate đó.
    const candidates = extractTestFileCandidates();
    expect(candidates.has('production-only-fake-class-not-in-any-test')).toBe(false);

    // "ordinal" là một utility Tailwind hợp lệ thật (đã verify ở validate-candidate.ts)...
    await expect(isValidTailwindUtility('ordinal')).resolves.toBe(true);

    // ...nhưng nó chỉ xuất hiện trong văn xuôi của `it('...no ordinal...')`, không phải trong một
    // ngữ cảnh mang class thật (className/cn/clsx/cva/toHaveClass/className...toContain) — nên
    // `extractTestFileCandidates()` KHÔNG được trích nó ra như một candidate.
    expect(candidates.has('ordinal')).toBe(false);
  });
});
