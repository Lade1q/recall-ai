/// <reference types="node" />
/**
 * Mô phỏng ĐÚNG cách Tailwind tự quét source: đọc raw text của mọi file production dưới `src/`
 * (loại `*.test.*`, `*.spec.*`, `setupTests.ts`) rồi tìm chuỗi candidate bằng substring match thô
 * — không AST, không phân biệt code/comment/string literal. Tailwind cũng quét đúng kiểu này khi
 * dựng bảng utilities thật sự được dùng, nên một class "chỉ sống trong file test" (#443) chính là
 * một class không xuất hiện, dù chỉ substring, ở bất kỳ đâu trong khối text này.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { walkSourceFiles } from './walk-source-files';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../');
const PRODUCTION_EXTENSIONS = /\.(ts|tsx|js|jsx|css)$/;
// Tự loại chính thư mục audit này: các comment ở `test-file-candidates.ts`/`validate-candidate.ts`
// trích literal ví dụ (`max-[680px]:min-h-[58px]`, `bg-remediate/16`, `ordinal`...) — nếu không loại,
// một class BỊ xoá khỏi production thật vẫn "tồn tại trong production text" nhờ chính comment mô tả
// nó, khiến đối chứng dương bắt buộc của #443 (xoá class khỏi production ⇒ test phải đỏ) không bao
// giờ đỏ được.
const EXCLUDE_PATTERNS = [
  /\.test\.[^./]+$/,
  /\.spec\.[^./]+$/,
  /(^|\/)setupTests\.ts$/,
  /(^|\/)test-utils\/tailwind-class-audit\//,
];

let cachedText: string | null = null;

function isProductionFile(relativePath: string): boolean {
  return (
    PRODUCTION_EXTENSIONS.test(relativePath) &&
    !EXCLUDE_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

function readProductionText(): string {
  const files = walkSourceFiles(SRC_ROOT).filter(isProductionFile);
  return files
    .map((relativePath) => readFileSync(path.join(SRC_ROOT, relativePath), 'utf8'))
    .join('\n');
}

// Ký tự có thể là một phần của token class Tailwind (chữ/số, biến thể `:`, giá trị tuỳ ý `[]`,
// phủ định/thang đo `-`, độ mờ `/`, thập phân `.`, phần trăm `%`, important `!`, `#` trong màu hex).
// Dùng để chặn false-negative kiểu `max-[680px]:flex` bị coi là "tồn tại" chỉ vì production còn
// `max-[680px]:flex-1` — substring khớp nhưng KHÔNG phải cùng một class, vì ký tự `-1` ngay sau vẫn
// tiếp tục token. Không dùng `\b` (word boundary) vì token Tailwind chứa nhiều ký tự không phải \w.
function isClassTokenChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_\-./:[\]%#!]/.test(char);
}

/**
 * Có xuất hiện `candidate` ở bất kỳ đâu trong `text` dưới dạng một TOKEN trọn vẹn hay không — không
 * phải substring của một token dài hơn (ví dụ `flex` không được coi là "có mặt" chỉ vì `text` chứa
 * `flex-1`, vì ký tự `-1` ngay sau vẫn tiếp tục token). Tách riêng khỏi việc đọc file để có thể kiểm
 * thử trực tiếp bằng văn bản giả, không cần dựng fixture trên đĩa.
 */
export function textContainsClassToken(text: string, candidate: string): boolean {
  let fromIndex = 0;
  for (;;) {
    const index = text.indexOf(candidate, fromIndex);
    if (index === -1) return false;
    const before = index > 0 ? text[index - 1] : undefined;
    const after = text[index + candidate.length];
    if (!isClassTokenChar(before) && !isClassTokenChar(after)) return true;
    fromIndex = index + 1;
  }
}

/**
 * Có xuất hiện `candidate` ở bất kỳ đâu trong text thô của mọi file production (`src/client/src`,
 * trừ file test) hay không. Đọc và gộp text một lần duy nhất, cache lại — hàm này được gọi lặp lại
 * với nhiều candidate khác nhau trong cùng một lượt kiểm tra.
 */
export function existsInProductionText(candidate: string): boolean {
  if (cachedText === null) {
    cachedText = readProductionText();
  }
  return textContainsClassToken(cachedText, candidate);
}
