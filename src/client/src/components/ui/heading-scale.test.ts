import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KIỂM KÊ mọi cỡ chữ NGOÀI thang bốn bậc của `heading.tsx`, trên phần tử tiêu đề.
 *
 * Vì sao cần: cổng trước của #387 công bố "đạt" trong khi 10 khai ở tầng
 * breakpoint còn nguyên — nó chỉ đo **một** cách viết ở **một** tầng. Cổng này
 * phủ ba cách viết × ba tầng, và là một danh sách CỐ ĐỊNH: thêm bất kỳ khai cỡ
 * nào ngoài thang, ở bất kỳ cách viết hay tầng nào, đều làm nó đỏ.
 *
 * ⛔ Nó KHÔNG phán chỗ nào đúng chỗ nào sai. Việc của test là: không cho danh sách
 * dài thêm, và bắt phải sửa danh sách khi có chỗ được snap.
 */

const SRC = join(__dirname, '..', '..');

/** Thang bốn bậc — nguồn sự thật là `heading.tsx`, đọc ra chứ không chép tay. */
function scaleFromHeadingTsx(): Set<number> {
  const src = readFileSync(join(__dirname, 'heading.tsx'), 'utf-8');
  const variants = src.slice(src.indexOf('size: {'), src.indexOf('}', src.indexOf('size: {')));
  return new Set([...variants.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1])));
}

/** Thang cỡ đặt tên của Tailwind v4 (dự án không khai lại — `global.css` không có `--text-*`). */
const NAMED: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};

const IS_HEADING = /font-heading|headingVariants|<Heading\b/;

/**
 * Cửa sổ khoanh phần tử — ghim ở đây để người sau đếm ra CÙNG một số.
 * Lùi tới `<` gần nhất; tiến tới `>` đầu tiên ở **độ sâu ngoặc 0**, nên một
 * `{cn(...)}` trải nhiều dòng không bị cắt ngang.
 */
function enclosingTag(src: string, idx: number): { start: number; tag: string } | null {
  const start = src.lastIndexOf('<', idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if (ch === '>' && depth === 0) return { start, tag: src.slice(start, i + 1) };
  }
  return null;
}

/**
 * Một token class → tầng + px. Tách theo dấu `:` **cuối cùng**: `\b` sau `:` vẫn
 * khớp, nên regex kiểu `\btext-\[` sẽ nuốt cả `sm:text-[32px]` và báo nhầm là
 * khai ở tầng nền — đúng lỗi đã xảy ra một lần.
 */
function classify(token: string): { tier: string; px: number; notation: string } | null {
  const cut = token.lastIndexOf(':');
  const prefix = cut === -1 ? '' : token.slice(0, cut);
  const base = token.slice(cut + 1);
  let px: number | null = null;
  let notation = '';
  const arbitrary = /^text-\[([0-9.]+)px\]$/.exec(base);
  if (arbitrary) {
    px = Number(arbitrary[1]);
    notation = 'text-[Npx]';
  } else {
    const named = /^text-([a-z0-9]+)$/.exec(base);
    if (named && named[1] in NAMED) {
      px = NAMED[named[1]];
      notation = 'tên';
    }
  }
  if (px === null) return null;
  const tier = prefix === '' ? 'nền' : prefix.startsWith('max-') ? 'max-width' : 'breakpoint';
  return { tier, px, notation };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(p);
  }
  return out;
}

interface Finding {
  tier: string;
  px: number;
  where: string;
  token: string;
  notation: string;
}

function scan(): { findings: Finding[]; filesScanned: number; headingTags: number } {
  const scale = scaleFromHeadingTsx();
  const findings: Finding[] = [];
  const files = walk(SRC);
  let headingTags = 0;

  for (const p of files) {
    // Gỡ comment TRƯỚC khi khoanh thẻ. Một ký tự `>` trong comment JSX đóng cửa sổ
    // sớm và findings BIẾN MẤT lặng lẽ — đã xảy ra thật khi một comment chứa `> 40`
    // làm cả ba khai cỡ của hero rơi khỏi kiểm kê. Thay bằng khoảng trắng cùng độ
    // dài để số dòng không lệch.
    const src = readFileSync(p, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\n]/g, ' ')
    );
    const rel = p.slice(SRC.length + 1).replace(/\\/g, '/');
    const seen = new Set<number>();
    for (const m of src.matchAll(/\btext-/g)) {
      const enc = enclosingTag(src, m.index!);
      if (!enc || seen.has(enc.start) || !IS_HEADING.test(enc.tag)) continue;
      seen.add(enc.start);
      headingTags++;
      for (const lit of enc.tag.matchAll(/["'`]([^"'`]*)["'`]/g)) {
        for (const token of lit[1].split(/\s+/)) {
          const c = classify(token);
          if (c && !scale.has(c.px)) findings.push({ ...c, where: rel, token });
        }
      }
    }
  }

  // Cách viết thứ ba: `font-size:` trong `global.css`, ở rule dính tới tiêu đề.
  // Đã sót một lần ở #380 (`.node__diff`) vì cổng chỉ quét class Tailwind.
  const css = readFileSync(join(SRC, 'global.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().split('\n').pop() ?? '';
    if (!IS_HEADING.test(selector)) continue;
    for (const fs of rule[2].matchAll(/font-size:\s*([0-9.]+)px/g)) {
      const px = Number(fs[1]);
      if (!scale.has(px)) {
        findings.push({
          tier: 'nền',
          px,
          where: 'global.css',
          token: selector,
          notation: 'font-size',
        });
      }
    }
  }

  findings.sort((a, b) =>
    `${a.tier}|${a.px}|${a.where}|${a.token}`.localeCompare(
      `${b.tier}|${b.px}|${b.where}|${b.token}`
    )
  );
  return { findings, filesScanned: files.length, headingTags };
}

/**
 * Allowlist ĐÍCH DANH những chỗ được phép nằm ngoài thang, chia theo lý do.
 *
 * ⛔ Cố ý KHÔNG viết dưới dạng luật rộng (kiểu "bỏ qua mọi cỡ > 40" hay "bỏ qua
 * mọi `max-[…]:`"): luật rộng sẽ tha luôn mọi hồi quy tương lai ở cùng vùng. Mỗi
 * mục ở đây phải có một quyết định đứng sau nó, ghi ngay trên nhóm chứa nó.
 *
 * Không có số dòng: dòng trôi mỗi lần sửa chỗ khác, mà danh sách này chỉ nói
 * *cái gì* còn ngoài thang, không nói nó nằm ở dòng nào.
 */

/** Ngoại lệ DUY NHẤT của thang (Quân chốt 02/09). Đỉnh thang 40px < 54px, ép về
 *  `display` làm hero trên laptop nhỏ đi 26% và mất nhịp phóng. */
const HERO_EXCEPTION = [
  'breakpoint|44|features/landing/components/LandingHero.tsx|sm:text-[44px]',
  'breakpoint|54|features/landing/components/LandingHero.tsx|lg:text-[54px]',
  'nền|34|features/landing/components/LandingHero.tsx|text-[34px]',
];

/** Nhãn: mượn `font-heading` để lấy BỘ CHỮ, không phải để làm tiêu đề. Ngoài phạm vi thang. */
const OUT_OF_SCOPE_LABELS = [
  'nền|15|features/schedule/components/ScheduleDebtBar.tsx|text-[15px]',
  'nền|15|features/schedule/components/ScheduleDebtBar.tsx|text-[15px]',
  'nền|15|pages/landing/LandingPage.tsx|text-[15px]',
];

/** Wordmark "Recall AI" — phụ lục D1 của #387 đã loại khỏi phạm vi. */
const OUT_OF_SCOPE_WORDMARKS = [
  'nền|16|features/auth/components/LoginForm.tsx|text-base',
  'nền|16|features/auth/components/SignupForm.tsx|text-base',
  'nền|16|pages/landing/LandingPage.tsx|text-base',
];

/**
 * Nhượng bộ responsive (Quân chốt 02/09) — KHÔNG phải trôi thang: nền của nó đã
 * đúng bậc `card` (18px) qua `headingVariants({ size: 'card' })`. Dưới 680px thẻ
 * mất `min-w-[130px]` và phải co giữa hai nút ‹ ›, nên hạ 18 → 15 ở riêng tầng đó.
 * Đây là mục `max-width` DUY NHẤT, nên test "cả ba tầng đều có mặt" tựa vào nó.
 */
const RESPONSIVE_CONCESSION = [
  'max-width|15|features/schedule/components/MonthGrid.tsx|max-[680px]:text-[15px]',
];

const KNOWN = [
  ...HERO_EXCEPTION,
  ...OUT_OF_SCOPE_LABELS,
  ...OUT_OF_SCOPE_WORDMARKS,
  ...RESPONSIVE_CONCESSION,
].sort((a, b) => a.localeCompare(b));

describe('#387 — kiểm kê cỡ chữ ngoài thang trên phần tử tiêu đề', () => {
  it('đối chứng dương: thang đọc được từ heading.tsx, và bộ quét CHẠM tới mã thật', () => {
    expect([...scaleFromHeadingTsx()].sort((a, b) => a - b)).toEqual([18, 21, 30, 40]);
    const { filesScanned, headingTags } = scan();
    expect(filesScanned).toBeGreaterThan(100);
    expect(headingTags).toBeGreaterThan(20);
  });

  it('🔴 danh sách khai cỡ ngoài thang KHÔNG được dài thêm', () => {
    const got = scan().findings.map((f) => `${f.tier}|${f.px}|${f.where}|${f.token}`);
    expect(got).toEqual(KNOWN);
  });

  it('🔴 cả ba tầng đều có mặt trong lưới, không tầng nào bị bỏ quên', () => {
    const tiers = new Set(scan().findings.map((f) => f.tier));
    expect([...tiers].sort()).toEqual(['breakpoint', 'max-width', 'nền']);
  });

  /**
   * Đường tra ngược allowlist → mã. Quy ước sẵn có trong repo là một comment mở đầu
   * bằng `#387:` ngay tại chỗ khai; không có nó thì người sửa luật của một nhóm sẽ
   * grep marker và SÓT đúng những chỗ chưa được đánh dấu — đã thủng 3/4 một lần.
   *
   * Chỉ kiểm marker CÓ MẶT, không kiểm nội dung: nội dung là việc của người đọc, còn
   * thứ rơi rụng lặng lẽ là cái marker.
   */
  it('🔴 mọi tệp trong allowlist đều mang marker `#387:` tại chỗ khai', () => {
    const files = [...new Set(KNOWN.map((k) => k.split('|')[2]))].sort();
    // Đối chứng dương: khoá tách được và không rỗng. 6 chứ không phải 7 — LandingPage.tsx
    // giữ HAI mục (một nhãn, một wordmark) nhưng chỉ là MỘT tệp.
    expect(files).toHaveLength(6);

    const thieu = files.filter((f) => !readFileSync(join(SRC, f), 'utf-8').includes('#387:'));
    expect(thieu).toEqual([]);
  });

  it('🔴 cả hai cách viết class đều được bộ quét nhận ra', () => {
    const notations = new Set(scan().findings.map((f) => f.notation));
    expect(notations.has('text-[Npx]')).toBe(true);
    expect(notations.has('tên')).toBe(true); // `text-base` — cách viết từng bị sót
  });
});
