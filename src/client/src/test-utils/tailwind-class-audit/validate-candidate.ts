/// <reference types="node" />
/**
 * SPIKE (issue #443, task 0) — kết quả và lựa chọn API:
 *
 * `tailwindcss@4.3.2` (pin `^4.3.1`) export `compile`/`compileAst` cấp cao ở gói gốc `tailwindcss`,
 * nhưng cả hai đều yêu cầu một `loadStylesheet` để tự resolve `@import 'tailwindcss'` v.v. — không
 * cung cấp sẵn. `@tailwindcss/node` (transitive qua `@tailwindcss/vite`, đã ghim làm devDependency
 * ở `package.json` vì được import trực tiếp) bọc lại đúng phần đó và export thêm
 * `__unstable__loadDesignSystem(css, { base })`, trả về một `DesignSystem` có method
 * `candidatesToCss(classes: string[]): (string | null)[]` — feed thẳng `global.css` thật + một
 * candidate, trả về CSS rule (string) nếu candidate là utility Tailwind hợp lệ, hoặc `null` nếu
 * không phải. Đây là API rẻ nhất: không cần dựng file JSX/HTML tạm, không cần Vite/CLI, không cần
 * dọn dẹp gì sau khi chạy — nên spike KHÔNG dùng tới phương án dự phòng (build CSS qua
 * `@tailwindcss/vite`/CLI trên fixture tạm).
 *
 * Đã xác nhận cả hai candidate mẫu đều sinh CSS non-null:
 *   - `max-[680px]:min-h-[58px]` → `.max-\[680px\]\:min-h-\[58px\] { @media (width < 680px) { ... } }`
 *   - `ordinal` → `.ordinal { --tw-ordinal: ordinal; font-variant-numeric: ...; }` — `ordinal` LÀ
 *     một utility thật (font-variant-numeric), không phải chuỗi vô nghĩa.
 *
 * ⇒ Hàm `isValidTailwindUtility` dưới đây CHỈ trả lời "candidate có phải là một utility Tailwind
 * hợp lệ hay không". Nó KHÔNG đủ để tự lọc ra `.ordinal` khỏi các test đang nói "no ordinal" bằng
 * văn xuôi (`format.test.ts`) — vì theo đúng spike trên, `ordinal` hợp lệ 100% về mặt Tailwind. Việc
 * phân biệt "đây là một class thật trong JSX/`toHaveClass`" với "đây là một từ tiếng Anh nằm trong
 * tên `it(...)`" phải do `test-file-candidates.ts` làm bằng ngữ cảnh cú pháp — hai bước phải dùng
 * CÙNG NHAU, một mình bước này không nói lên điều gì về nơi candidate được viết ra.
 */
import { __unstable__loadDesignSystem } from '@tailwindcss/node';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

const GLOBAL_CSS_PATH = path.resolve(import.meta.dirname, '../../global.css');
const GLOBAL_CSS_BASE = path.dirname(GLOBAL_CSS_PATH);

let designSystemPromise: Promise<DesignSystem> | null = null;

function loadDesignSystem(): Promise<DesignSystem> {
  if (designSystemPromise === null) {
    const css = readFileSync(GLOBAL_CSS_PATH, 'utf8');
    designSystemPromise = __unstable__loadDesignSystem(css, { base: GLOBAL_CSS_BASE });
  }
  return designSystemPromise;
}

/**
 * Candidate có phải là một utility Tailwind thật (biên dịch ra CSS non-empty dựa trên `global.css`
 * thật của dự án) hay không. Xem cảnh báo ở comment đầu file: kết quả `true` không có nghĩa là
 * candidate xuất hiện dưới dạng class trong code — chỉ có nghĩa là NẾU nó xuất hiện dưới dạng class
 * thì Tailwind sẽ sinh CSS cho nó.
 */
export async function isValidTailwindUtility(candidate: string): Promise<boolean> {
  const designSystem = await loadDesignSystem();
  const [css] = designSystem.candidatesToCss([candidate]);
  return typeof css === 'string' && css.trim().length > 0;
}
