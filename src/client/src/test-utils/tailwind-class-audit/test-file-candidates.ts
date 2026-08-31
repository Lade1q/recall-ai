/// <reference types="node" />
/**
 * Trích các chuỗi "trông như class Tailwind" từ file `*.test.*`, nhưng CHỈ ở những ngữ cảnh thật sự
 * mang class — không phải mọi chuỗi trong file test. Cụ thể bốn ngữ cảnh:
 *
 *   1. `className="..."` / `className='...'` — literal JSX.
 *   2. `className={cn(...)}` / `clsx(...)` / `cva(...)` — literal bên trong lệnh gọi.
 *   3. `.toHaveClass(...)` — literal truyền thẳng, HOẶC một biến `const NAME = '...'` khai báo
 *      trong cùng file rồi truyền vào (vd `const PRIMARY = 'bg-remediate/16'; ... toHaveClass(PRIMARY)`).
 *   4. `.className` (trực tiếp hoặc gán ra biến `const x = el.className;`) rồi so bằng
 *      `.toContain('...')` — đây là mẫu THẬT SỰ đang dùng trong `MonthGrid.test.tsx` để khoá các
 *      mốc `max-[680px]:...`; không bắt được mẫu này thì bỏ sót chính đối chứng dương của #443.
 *
 * CỐ Ý không bắt: text trong `it(...)`/`describe(...)`, comment, hay chuỗi tự do khác — đó là lý do
 * chữ "ordinal" nằm trong tên `it('...no ordinal...')` ở `focus/utils/format.test.ts` không được
 * trích ra (đối chứng âm bắt buộc của #443, xem spike ở `validate-candidate.ts`: `ordinal` VẪN là
 * một utility Tailwind hợp lệ, nên chỉ ngữ cảnh cú pháp ở đây mới lọc được nó).
 *
 * Bóc comment (`stripComments`) TRƯỚC khi áp 4 ngữ cảnh trên — nếu không, một comment chứa literal
 * trùng cú pháp mang class (vd `// className="max-[377px]:mt-[7px]"`) sẽ tự bị hiểu nhầm là
 * candidate thật (phát hiện ở review @Lade1q trên PR #472 — cùng loại tự nhiễm mà `production-text.ts`
 * đã xử ở phía production, áp cùng cái nhìn ấy sang phía test).
 *
 * Dùng regex thực dụng, không AST — chấp nhận bỏ sót các ca lồng ngữ cảnh phức tạp (biểu thức
 * `className` chứa object literal, spread, v.v.), vì phạm vi #443 chỉ cần bắt đúng các mẫu đang có
 * trong repo, không phải một parser class đầy đủ.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './strip-comments';
import { walkSourceFiles } from './walk-source-files';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../');
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;

export interface Location {
  file: string;
  line: number;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function addCandidate(
  result: Map<string, Location[]>,
  candidate: string,
  location: Location
): void {
  const trimmed = candidate.trim();
  if (trimmed === '') return;
  const locations = result.get(trimmed);
  if (locations) {
    locations.push(location);
  } else {
    result.set(trimmed, [location]);
  }
}

/** Tách một chuỗi class gộp ("a b c") thành từng token, bỏ token rỗng. */
function splitClassTokens(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** Đọc nội dung bên trong một cặp ngoặc `{`/`}` cân bằng, bắt đầu ngay sau vị trí `openIndex`. */
function readBalancedBraces(text: string, openIndex: number): string | null {
  let depth = 1;
  let i = openIndex + 1;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return depth === 0 ? text.slice(openIndex + 1, i - 1) : null;
}

/** Gom mọi `const NAME = 'literal';` ở cấp file, để giải quyết các biến truyền vào `toHaveClass(NAME)`. */
function collectLocalStringConsts(text: string): Map<string, string> {
  const consts = new Map<string, string>();
  const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])((?:(?!\2).)*)\2\s*;/g;
  for (const match of text.matchAll(pattern)) {
    consts.set(match[1], match[3]);
  }
  return consts;
}

/** Ngữ cảnh 1: `className="..."` / `className='...'`. */
function extractClassNameLiterals(
  text: string,
  file: string,
  result: Map<string, Location[]>
): void {
  const pattern = /className\s*=\s*(['"])((?:(?!\1).)*)\1/g;
  for (const match of text.matchAll(pattern)) {
    const line = lineAt(text, match.index);
    for (const token of splitClassTokens(match[2])) {
      addCandidate(result, token, { file, line });
    }
  }
}

/** Ngữ cảnh 2: `className={cn(...)}` / `clsx(...)` / `cva(...)` — literal bên trong lệnh gọi. */
function extractClassNameExpressionCalls(
  text: string,
  file: string,
  result: Map<string, Location[]>
): void {
  const openBracePattern = /className\s*=\s*\{/g;
  for (const brace of text.matchAll(openBracePattern)) {
    const openIndex = brace.index + brace[0].length - 1;
    const body = readBalancedBraces(text, openIndex);
    if (body === null || !/\b(?:cn|clsx|cva)\s*\(/.test(body)) continue;
    const line = lineAt(text, brace.index);
    for (const literal of body.matchAll(/(['"])((?:(?!\1).)*)\1/g)) {
      for (const token of splitClassTokens(literal[2])) {
        addCandidate(result, token, { file, line });
      }
    }
  }
}

/** Ngữ cảnh 3: `.toHaveClass(...)` — literal trực tiếp hoặc qua biến `const NAME = '...'`. */
function extractToHaveClassArgs(
  text: string,
  file: string,
  result: Map<string, Location[]>,
  localConsts: Map<string, string>
): void {
  const pattern = /\.toHaveClass\(([^)]*)\)/g;
  for (const match of text.matchAll(pattern)) {
    const line = lineAt(text, match.index);
    const argsText = match[1];
    for (const literal of argsText.matchAll(/(['"])((?:(?!\1).)*)\1/g)) {
      for (const token of splitClassTokens(literal[2])) {
        addCandidate(result, token, { file, line });
      }
    }
    for (const identifier of argsText.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const resolved = localConsts.get(identifier[0]);
      if (resolved !== undefined) {
        for (const token of splitClassTokens(resolved)) {
          addCandidate(result, token, { file, line });
        }
      }
    }
  }
}

/**
 * Ngữ cảnh 4: `.className` so bằng `.toContain('...')`, trực tiếp trên cùng biểu thức
 * (`el.className).toContain('...')`) hoặc qua một biến trung gian
 * (`const className = el.className; ... expect(className).toContain('...')`).
 */
function extractClassNameToContain(
  text: string,
  file: string,
  result: Map<string, Location[]>
): void {
  // Trực tiếp: `.className` rồi `.toContain('...')` cách nhau một quãng ngắn (đóng ngoặc/parens),
  // cho phép xuống dòng giữa `.toContain(` và chuỗi literal (Prettier hay tách khi dòng dài).
  const directPattern =
    /\.className\b[^;\n]{0,80}?\.toContain\(\s*(['"])((?:(?!\1)[\s\S])*)\1\s*\)/g;
  for (const match of text.matchAll(directPattern)) {
    addCandidate(result, match[2], { file, line: lineAt(text, match.index) });
  }

  // Qua biến trung gian: `const NAME = ....className;` rồi sau đó `NAME).toContain('...')`.
  const varPattern = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\.className\s*;/g;
  for (const varMatch of text.matchAll(varPattern)) {
    const varName = varMatch[1];
    const usagePattern = new RegExp(
      `\\b${varName}\\)(?:\\.not)?\\.toContain\\(\\s*(['"])((?:(?!\\1)[\\s\\S])*)\\1\\s*\\)`,
      'g'
    );
    for (const usage of text.matchAll(usagePattern)) {
      addCandidate(result, usage[2], { file, line: lineAt(text, usage.index) });
    }
  }
}

/**
 * Quét mọi file `*.test.*`/`*.spec.*` dưới `src/`, trả về map candidate → danh sách vị trí
 * (file:dòng) nơi candidate đó được tìm thấy trong một ngữ cảnh mang class.
 */
export function extractTestFileCandidates(): Map<string, Location[]> {
  const result = new Map<string, Location[]>();
  const files = walkSourceFiles(SRC_ROOT).filter((relativePath) =>
    TEST_FILE_PATTERN.test(relativePath)
  );

  for (const relativePath of files) {
    const text = stripComments(readFileSync(path.join(SRC_ROOT, relativePath), 'utf8'));
    const localConsts = collectLocalStringConsts(text);

    extractClassNameLiterals(text, relativePath, result);
    extractClassNameExpressionCalls(text, relativePath, result);
    extractToHaveClassArgs(text, relativePath, result, localConsts);
    extractClassNameToContain(text, relativePath, result);
  }

  return result;
}
