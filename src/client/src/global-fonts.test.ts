import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ghim GIAO KÈO giữa các nửa của việc khai một font: token trong `@theme inline`,
 * dòng `@import` nạp mặt chữ, và `dependencies`. Ba nửa nằm rải trong hai tệp và
 * KHÔNG có gì buộc chúng khớp nhau — sửa một nửa thì trình duyệt lặng lẽ rơi về
 * font hệ thống, build vẫn xanh.
 *
 * Trước tệp này, lưới phủ chỗ đó gần như trống: grep
 * `font-heading|fontFamily|--font-heading|JetBrains|Noto` trong mọi `*.test.*`
 * cho đúng **1** dòng — `empty-state.test.tsx:27`, `toHaveClass('font-heading')`,
 * mới vào cùng #508. Dòng đó ghim TÊN CLASS, không ghim mặt chữ nào đứng sau
 * class ấy: đổi `--font-heading` thành rác thì nó vẫn xanh.
 *
 * ⛔ Test này KHÔNG kiểm font hiển thị ra sao — jsdom không tải CSS, nên
 * `getComputedStyle` ở đây vô dụng. Nó kiểm những mệnh đề TĨNH mà một lần đổi
 * font nửa vời sẽ vi phạm.
 */

const CLIENT_ROOT = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'global.css'), 'utf-8');
const pkgJson = JSON.parse(readFileSync(join(CLIENT_ROOT, 'package.json'), 'utf-8'));

/** Số gói fontsource mà `global.css` đang import. Đối chứng dương dùng số CHÍNH XÁC. */
const EXPECTED_FONT_PACKAGES = 3;

interface FontImport {
  /** Tên gói npm, ví dụ `@fontsource-variable/geist`. */
  pkg: string;
  /** Đường dẫn CSS để đọc: entry của gói, hoặc subpath nếu import chỉ rõ. */
  entry: string;
}

/**
 * `@import '@fontsource[-variable]/<gói>[/<subpath>]';`
 *
 * Tách scope+tên gói RIÊNG khỏi subpath. Một regex `[^']+` gộp cả hai sẽ coi
 * `@fontsource-variable/geist/wght.css` là tên gói — hỏng cho một import hợp lệ,
 * và làm mọi đột biến dạng subpath "chết" vì `readFileSync` ném chứ không vì
 * assert nào bắt được.
 */
function fontImports(): FontImport[] {
  const re = /@import\s+["'](@fontsource(?:-variable)?\/[^/"']+)(\/[^"']+)?["']/g;
  return [...css.matchAll(re)].map((m) => ({
    pkg: m[1],
    entry: m[2] ? `${m[1]}${m[2]}` : `${m[1]}/index.css`,
  }));
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

/** Các khai báo bên trong khối `.font-heading` của `@layer base`. */
function headingRule(): Record<string, string> {
  const block = css.match(/\.font-heading\s*\{([^}]*)\}/);
  if (!block) throw new Error('global.css không có khối .font-heading');
  return Object.fromEntries(
    [...block[1].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
}

/**
 * Chỉ những dòng THẬT SỰ khai báo font: `@import '@fontsource…'` và `--font-*`.
 * ⛔ Cố ý KHÔNG quét cả tệp: comment được phép nhắc mặt chữ cũ như lịch sử, và
 * assert quét cả tệp sẽ đỏ vì chuyện đó — đỏ vì lý do sai.
 */
function fontDeclarationLines(): string[] {
  return css
    .split('\n')
    .filter((l) => /^\s*@import\s+["']@fontsource/.test(l) || /^\s*--font-[a-z]+:/.test(l));
}

function packageCss(entry: string): string {
  return readFileSync(join(CLIENT_ROOT, 'node_modules', entry), 'utf-8');
}

describe('global.css — giao kèo token font ↔ gói được import', () => {
  it('đối chứng dương: đọc được đúng 3 gói, 3 token, và mọi tệp CSS của gói đều tồn tại', () => {
    const imports = fontImports();
    expect(imports.map((i) => i.pkg)).toHaveLength(EXPECTED_FONT_PACKAGES);
    expect(fontDeclarationLines()).toHaveLength(EXPECTED_FONT_PACKAGES * 2);
    // Thiếu tệp phải thành ASSERT ĐỎ có tên, không phải `failed to run` ở tầng trên.
    expect(
      imports
        .filter((i) => !existsSync(join(CLIENT_ROOT, 'node_modules', i.entry)))
        .map((i) => i.entry)
    ).toEqual([]);
  });

  it.each(['font-sans', 'font-heading', 'font-mono'])(
    '🔴 mặt chữ đầu tiên của --%s phải do một gói ĐANG import khai báo',
    (token) => {
      const declared = new Set(
        fontImports().flatMap((i) =>
          [...packageCss(i.entry).matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])
        )
      );
      expect([...declared]).toContain(firstFamily(token));
    }
  );

  it('🔴 --font-heading là JetBrains Mono Variable (đổi có chủ đích thì sửa dòng này)', () => {
    expect(firstFamily('font-heading')).toBe('JetBrains Mono Variable');
    expect(fontImports().map((i) => i.pkg)).toContain('@fontsource-variable/jetbrains-mono');
  });

  it('🔴 mặt chữ tiêu đề PHẢI có subset vietnamese — ràng buộc sống lâu hơn mọi lựa chọn font', () => {
    const heading = firstFamily('font-heading');
    const owner = fontImports().find((i) =>
      packageCss(i.entry).includes(`font-family: '${heading}'`)
    );
    expect(owner, `không gói nào đang import khai báo '${heading}'`).toBeDefined();
    // U+1EA0-1EF9 = khối chữ Việt dựng sẵn. Không có nó thì tiêu đề tiếng Việt
    // rơi về font hệ thống ở đúng những ký tự có dấu — lỗi chỉ thấy khi nhìn.
    expect(packageCss(owner!.entry)).toMatch(/U\+1EA0-1EF9/);
  });

  it('🔴 weight của tiêu đề là 700, và nó nằm ở @layer base chứ không ở nơi gọi', () => {
    expect(headingRule()['font-weight']).toBe('700');
  });

  it('🔴 tracking/leading giữ đúng giá trị mà comment phía trên đã ĐO để bảo vệ', () => {
    const rule = headingRule();
    expect(rule['letter-spacing']).toBe('-0.02em');
    // 1.25 chứ không 1.1: dấu chồng `Ẫ Ế Ộ Ữ Ợ` @30px tràn +2.5px thay vì +7.0px.
    expect(rule['line-height']).toBe('1.25');
  });

  it('🔴 VẮNG MẶT: mặt chữ cũ không còn ở dòng khai báo nào, cũng không còn trong dependencies', () => {
    // `toContain` không thể bắt một mục CÒN SÓT LẠI — sự vắng mặt phải hỏi riêng.
    // Ca thật: thêm lại `@import '@fontsource/noto-serif';` BÊN CẠNH dòng jetbrains
    // thì mọi assert dạng dương vẫn xanh, mà `dist` phình thêm 8 tệp woff2.
    for (const line of fontDeclarationLines()) expect(line).not.toMatch(/noto[- ]?serif/i);
    expect(Object.keys(pkgJson.dependencies).filter((d) => /noto/i.test(d))).toEqual([]);
  });

  it('🔴 ba vai trò font là ba mặt chữ KHÁC nhau, không phải một mặt chữ mang ba tên', () => {
    const three = ['font-sans', 'font-heading', 'font-mono'].map(firstFamily);
    expect(new Set(three).size).toBe(3);
  });

  it('🔴 mọi gói font được import đều phải có trong dependencies', () => {
    for (const { pkg } of fontImports()) expect(Object.keys(pkgJson.dependencies)).toContain(pkg);
  });
});
