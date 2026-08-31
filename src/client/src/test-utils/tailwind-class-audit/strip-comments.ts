/**
 * Bóc `//` và `/* ... *\/` khỏi text nguồn TRƯỚC khi trích candidate ở `test-file-candidates.ts` —
 * nếu không, một comment chứa literal trùng cú pháp mang class (`className="..."`, `.toHaveClass(...)`)
 * sẽ tự bị hiểu nhầm là candidate thật (đúng loại tự nhiễm mà `production-text.ts` từng vướng ở
 * phía production, xem comment đầu file đó — đây là áp cùng cái nhìn sang phía test, theo review
 * @Lade1q trên PR #472).
 *
 * Giữ NGUYÊN độ dài text và mọi ký tự xuống dòng (chỉ đổi ký tự bị bóc thành khoảng trắng), để vị
 * trí dòng (`lineAt` ở `test-file-candidates.ts`) không bị lệch sau khi bóc.
 *
 * Theo dõi trạng thái CHUỖI đơn giản (`'`/`"`/`` ` ``, có escape `\`) để KHÔNG bóc nhầm `//` nằm
 * trong một chuỗi (ví dụ URL `'https://...'`) — đây chính là rủi ro over-strip mà review lo ngại.
 * GIỚI HẠN đã biết: không xử lý biểu thức lồng trong template literal (`` `${...}` ``) — nếu biểu
 * thức đó tự chứa dấu nháy, bộ theo dõi có thể lệch trạng thái. Chấp nhận được vì phạm vi #443 chỉ
 * cần đúng với cú pháp đang có trong repo, không phải một trình phân tích cú pháp đầy đủ (nhất
 * quán với `test-file-candidates.ts`: "regex thực dụng, không AST").
 */
export function stripComments(text: string): string {
  let result = '';
  let i = 0;
  let inString: string | null = null;
  let inBlockComment = false;
  let inLineComment = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += ch;
      } else {
        result += ' ';
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        result += '  ';
        inBlockComment = false;
        i += 2;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    if (inString !== null) {
      if (ch === '\\' && next !== undefined) {
        // Giữ nguyên cặp escape (vd `\"`, `\\`) để không đóng chuỗi nhầm chỗ.
        result += ch + next;
        i += 2;
        continue;
      }
      result += ch;
      if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += '  ';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += '  ';
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      result += ch;
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}
