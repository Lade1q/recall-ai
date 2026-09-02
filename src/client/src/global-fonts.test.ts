import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ghim GIAO KÈO giữa hai nửa của việc khai một font: token trong `@theme inline`
 * và dòng `@import` nạp mặt chữ đó. Hai nửa nằm cách nhau ~25 dòng trong cùng một
 * tệp và KHÔNG có gì buộc chúng khớp nhau — sửa một nửa thì trình duyệt lặng lẽ
 * rơi về font hệ thống, build vẫn xanh, không test nào đỏ.
 *
 * Đo trước khi viết test này (02/09): grep toàn `src/client/src` cho
 * `font-heading|fontFamily|--font-heading|JetBrains|Noto` trong tệp `*.test.*`
 * cho ra **0 dòng**. Đây là lưới đầu tiên phủ chỗ đó.
 *
 * ⛔ Test này KHÔNG kiểm font hiển thị ra sao — jsdom không tải CSS, nên
 * `getComputedStyle` ở đây vô dụng. Nó chỉ kiểm: mặt chữ mà token gọi tên có
 * THẬT SỰ được một gói đang import khai báo hay không.
 */

const CLIENT_ROOT = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'global.css'), 'utf-8');

/** `@import '@fontsource[-variable]/<gói>';` — chỉ lấy gói font, bỏ tailwindcss/shadcn. */
function importedFontPackages(): string[] {
  return [...css.matchAll(/@import\s+'(@fontsource(?:-variable)?\/[^']+)'/g)].map((m) => m[1]);
}

/** Tên family đầu tiên trong một token font, đã bỏ nháy. */
function firstFamily(token: string): string {
  const m = css.match(new RegExp(`--${token}:\\s*([^;]+);`));
  if (!m) throw new Error(`global.css không khai --${token}`);
  return m[1]
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

/** Mọi `font-family` mà các gói đang import khai báo trong @font-face của chúng. */
function familiesDeclaredByImports(): Set<string> {
  const out = new Set<string>();
  for (const pkg of importedFontPackages()) {
    const entry = pkg.endsWith('.css') ? pkg : `${pkg}/index.css`;
    const text = readFileSync(join(CLIENT_ROOT, 'node_modules', entry), 'utf-8');
    for (const m of text.matchAll(/font-family:\s*'([^']+)'/g)) out.add(m[1]);
  }
  return out;
}

describe('global.css — token font ↔ gói được import', () => {
  it('đối chứng dương: đọc được cả token lẫn gói (nếu regex hỏng, mọi assert dưới thành rỗng)', () => {
    expect(importedFontPackages().length).toBeGreaterThan(0);
    expect(familiesDeclaredByImports().size).toBeGreaterThan(0);
    expect(['font-sans', 'font-heading', 'font-mono'].map(firstFamily)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
  });

  it.each(['font-sans', 'font-heading', 'font-mono'])(
    '🔴 mặt chữ đầu tiên của --%s phải do một gói ĐANG import khai báo',
    (token) => {
      expect([...familiesDeclaredByImports()]).toContain(firstFamily(token));
    }
  );

  it('🔴 --font-heading là JetBrains Mono Variable (đổi có chủ đích thì sửa dòng này)', () => {
    expect(firstFamily('font-heading')).toBe('JetBrains Mono Variable');
    expect(importedFontPackages()).toContain('@fontsource-variable/jetbrains-mono');
  });

  it('🔴 không còn gói font nào được import mà package.json không khai', () => {
    const deps = JSON.parse(readFileSync(join(CLIENT_ROOT, 'package.json'), 'utf-8')).dependencies;
    for (const pkg of importedFontPackages()) expect(Object.keys(deps)).toContain(pkg);
  });
});
