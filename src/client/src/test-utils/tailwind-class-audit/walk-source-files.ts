/// <reference types="node" />
/**
 * `node:fs` chỉ có `globSync` ổn định từ Node 22 trở lên — CI pin Node 20 (`.github/workflows/ci.yml`),
 * nên gọi thẳng `globSync` sẽ crash ngay ở CI dù chạy được trên máy dev (Node 24). Thay bằng một bộ
 * duyệt cây thư mục đệ quy thuần `fs.readdirSync`, không phụ thuộc glob nào — theo đúng Platform
 * Leverage Ladder: dùng API nền tảng có sẵn trước khi cài thêm thư viện.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Liệt kê đường dẫn TƯƠNG ĐỐI (so với `root`, dùng `/` làm dấu phân cách bất kể hệ điều hành) của
 * mọi file dưới `root`, đệ quy toàn bộ thư mục con.
 */
export function walkSourceFiles(root: string): string[] {
  const result: string[] = [];

  function visit(absoluteDir: string, relativeDir: string): void {
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(path.join(absoluteDir, entry.name), relativePath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      }
    }
  }

  visit(root, '');
  return result;
}
