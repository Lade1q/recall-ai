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
 *
 * ## Vì sao `IS_HEADING` phải có `<h[1-6]`
 *
 * Bản đầu chỉ khớp `font-heading|headingVariants|<Heading`. Một thẻ THÔ — `<h2>` mang
 * `font-semibold` cùng một cỡ 16px viết bằng cú pháp ngoặc vuông — không khớp cái nào ⇒
 * cổng mù hẳn.
 *
 * ⚠️ Ví dụ ấy trước đây viết ĐỦ token, và token ấy tự sinh ra `font-size:16px` trong CSS
 * xuất xưởng: **30 byte**. Trớ trêu đúng chỗ — #519 snap `DeadlinePanel` và
 * `MiniConceptGraph` từ 16px lên bậc `card`, tức gỡ hết cỡ ấy khỏi mã sản phẩm, nên câu
 * GIẢI THÍCH việc gỡ là thứ duy nhất còn giữ nó sống. Lần thứ hai trong cùng PR: xem ghi
 * chú 432 byte ở mục ranh giới bên dưới.
 * Nguy hơn: phạm vi của #387 được dựng bằng cách **liệt kê chỗ có chữ `font-heading`**,
 * nên thứ không viết chữ ấy vô hình với chính phép liệt kê đã sinh ra phạm vi.
 *
 * Đo được khi thêm `<h[1-6]\b` (chưa sửa mã nào): cổng chạm **17 tệp / 24 thẻ → 28 tệp /
 * 44 thẻ**, kiểm kê ngoài thang **10 → 30 mục**. Hai con số cùng tăng mới phân biệt được
 * "bắt thêm" với "bắt nhầm"; một con số đi một mình thì không.
 *
 * ⚠️ Con số 20 thẻ thô ấy lớn hơn con số 12 mà `git grep -E "<h[123][ >]"` đưa ra — grep
 * hụt `h4`-`h6` và hụt thẻ viết xuống dòng. Đừng lấy grep làm phạm vi; lấy cổng.
 *
 * ## Ranh giới của cổng — KHAI ra, không vá
 *
 * Cổng có ranh giới được khai thì dùng được; ranh giới ẨN thì nguy hơn không có cổng.
 * Mỗi dạng dưới đây đã kiểm bằng cách dựng thật hai lần (có probe / không probe) rồi so
 * CSS phát ra — grep theo KHAI BÁO `font-size:`, không theo tên selector (Tailwind escape
 * dấu chấm, `.text-\[1\.3rem\]`, nên grep tên là trượt) — kèm đối chứng âm và một đối
 * chứng dương vi sai để chắc cả dây sửa→quét→dựng→grep có bắn.
 *
 * ⚠️ Số trong các ví dụ dưới đây cố ý viết `…`. Tailwind quét **text thô, KHÔNG bóc
 * comment**, nên một ví dụ viết đủ số sẽ thành rule CSS **thật** trong bản dựng sản phẩm
 * mà không thẻ nào dùng. Đo được: viết đủ số ⇒ **+432 byte / 10 rule** CSS chết. Bộ audit của
 * #472 KHÔNG bắt được, vì nó bóc comment trước khi trích candidate — hai bộ gác trong
 * cùng repo bất đối xứng ở đúng điểm này. Cách viết đủ nằm ở PR mở cổng này.
 *
 * **Thoát PHÂN LOẠI nhưng KHÔNG thoát kiểm kê thẻ** — `KNOWN` đứng yên, nhưng cột token
 * của `HEADING_CENSUS` lệch ⇒ `toEqual` đỏ ⇒ vẫn buộc người sửa phải nhìn:
 *
 *   giá trị tuỳ ý đuôi rem, đuôi em     regex phân loại ép đuôi px
 *   cỡ đặt tên hoặc tuỳ ý, kèm          modifier line-height sau dấu gạch chéo phá neo `$`
 *     modifier line-height có ngoặc
 *   important ở đầu HOẶC cuối token     phá neo `^` và `$`
 *   giá trị tuỳ ý dạng calc(...)        `[0-9.]+` không nuốt calc (cả hai dạng dấu cách)
 *
 * **Mù hoàn toàn** — cả `KNOWN` lẫn kiểm kê đều đứng yên, đã đo:
 *
 *   style={{ fontSize: 32 }}          inline style đè mọi class; cổng không quét prop `style`
 *   chuỗi class trong tệp `.ts`       `walk()` chỉ nhặt `.tsx`
 *   chuỗi class trong tệp `.test.`    `walk()` loại hẳn — xem ngay dưới
 *   bù trừ trong CÙNG một tệp         xoá 1 thẻ 1-token, thêm 1 thẻ 1-token có bẫy
 *
 * **Ranh giới `.test.` — hai vế, thiếu vế nào cũng đọc sai.**
 *
 * *Vế 1 (đây là lỗ thật):* **bộ quét Tailwind ĐỌC tệp `.test.`, cổng này thì KHÔNG.** Nên
 * một cỡ tiêu đề ngoài thang có thể đi vào CSS sản phẩm qua một tệp test mà kiểm kê ở đây
 * không hề thấy. Độ lớn hôm nay là **0** — đo chứ không suy: gỡ bộ lọc ra rồi chạy lại
 * `scan()` thì số tệp quét 117 → **148** (đối chứng dương: thước thật sự chạm tới chúng),
 * còn kiểm kê **24/39** và `KNOWN` **25** đứng yên từng con số. Nhưng bề mặt vừa SỐNG:
 * #510 và #512 mỗi PR thêm một tệp test mới.
 *
 * *Vế 2 (vì sao vẫn giữ bộ lọc):* loại tệp test là **đúng chủ đích** — cổng này canh
 * **tiêu đề sản phẩm**, còn "class chỉ sống trong test" là việc của bộ audit #472. Quét cả
 * tệp test sẽ phình kiểm kê vì một lý do khác hẳn mục đích cổng. ⛔ Đừng gỡ bộ lọc.
 *
 * ⚠️ Chỗ hai bộ gác **không khớp mép**: #472 bóc comment TRƯỚC khi trích candidate, còn
 * Tailwind GIỮ comment. Một class nằm trong **comment của một tệp test** vì thế lọt qua
 * **cả hai** — đúng cái khe đã đốt 432 byte ở trên.
 *
 * **Đã LOẠI, không phải lỗ:** modifier line-height KHÔNG có ngoặc (dạng `/1.2` trần) —
 * dựng thật không sinh selector nào. Nó vẫn làm kiểm kê đỏ vì là một token `text-`
 * mới; đó là báo động về một class CHẾT, không phải báo động sai về cỡ chữ.
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

const IS_HEADING = /font-heading|headingVariants|<Heading\b|<h[1-6]\b/;

/**
 * Một lượt duy nhất: gỡ comment, và đánh dấu vị trí nào nằm TRONG chuỗi.
 *
 * Cả hai vế đều là lỗ ĐÃ ĐO trên chính cổng này, không phải giả thuyết — mỗi ca đều
 * qua `tsc` sạch, tức viết được trong mã thật:
 * - `// cỡ này > 40` trong thẻ mở: `>` đóng cửa sổ SỚM, `className` rơi ra ngoài, một
 *   một khai cỡ tuỳ ý biến mất khỏi kiểm kê mà cổng vẫn xanh. (Nhánh `block` đã bịt
 *   từ trước; nhánh `//` thì chưa.)
 * - `title="a > b"` đặt TRƯỚC `className` ⇒ xanh (lỗ); đặt SAU ⇒ đỏ. Thứ tự thuộc
 *   tính quyết định — đó là đối chứng cho thấy cơ chế đúng là cửa sổ, không phải gì khác.
 *
 * Comment thay bằng khoảng trắng CÙNG ĐỘ DÀI, giữ nguyên `\n`: mọi offset phải đứng
 * yên vì `seen` khử trùng thẻ theo `enc.start`.
 */
function scanSource(raw: string): { src: string; inString: Uint8Array } {
  const out = raw.split('');
  const inString = new Uint8Array(raw.length);
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      const stop = end === -1 ? raw.length : end + 2;
      for (let j = i; j < stop; j++) if (out[j] !== '\n') out[j] = ' ';
      i = stop;
    } else if (ch === '/' && raw[i + 1] === '/') {
      // Chỉ tới hết dòng, và KHÔNG nuốt `\n` — nuốt thì số dòng lệch.
      while (i < raw.length && raw[i] !== '\n') out[i++] = ' ';
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== ch) {
        if (raw[j] === '\\') inString[j++] = 1;
        if (j < raw.length) inString[j++] = 1;
      }
      i = j + 1;
    } else i++;
  }
  return { src: out.join(''), inString };
}

/**
 * Cửa sổ khoanh phần tử — ghim ở đây để người sau đếm ra CÙNG một số.
 * Lùi tới `<` gần nhất; tiến tới `>` đầu tiên ở **độ sâu ngoặc 0**, nên một
 * `{cn(...)}` trải nhiều dòng không bị cắt ngang. Bỏ qua mọi ký tự nằm trong chuỗi,
 * cho cả việc đếm độ sâu lẫn việc tìm `>`.
 */
function enclosingTag(
  src: string,
  inString: Uint8Array,
  idx: number
): { start: number; tag: string } | null {
  const start = src.lastIndexOf('<', idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (inString[i]) continue;
    const ch = src[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if (ch === '>' && depth === 0) return { start, tag: src.slice(start, i + 1) };
  }
  return null;
}

/**
 * Một token class → tầng + px. Tách theo dấu `:` **cuối cùng**: `\b` sau `:` vẫn
 * khớp, nên regex neo `\btext-` rồi đọc thẳng sẽ nuốt cả token có tiền tố `sm:` và báo nhầm là
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
    notation = 'ngoặc vuông';
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

type Census = Record<string, [tags: number, textTokens: number]>;

function scan(): { findings: Finding[]; filesScanned: number; census: Census } {
  const scale = scaleFromHeadingTsx();
  const findings: Finding[] = [];
  const files = walk(SRC);
  const census: Census = {};

  for (const p of files) {
    const { src, inString } = scanSource(readFileSync(p, 'utf-8'));
    const rel = p.slice(SRC.length + 1).replace(/\\/g, '/');
    const seen = new Set<number>();
    for (const m of src.matchAll(/\btext-/g)) {
      const enc = enclosingTag(src, inString, m.index!);
      if (!enc || seen.has(enc.start) || !IS_HEADING.test(enc.tag)) continue;
      seen.add(enc.start);
      const cell = (census[rel] ??= [0, 0]);
      cell[0]++;
      for (const lit of enc.tag.matchAll(/["'`]([^"'`]*)["'`]/g)) {
        for (const token of lit[1].split(/\s+/)) {
          // Cùng regex lái vòng ngoài, nên tự nhất quán: `^text-` sẽ TRƯỢT
          // token có tiền tố `sm:` và token mở đầu bằng important — hai dạng hay dùng nhất.
          if (/\btext-/.test(token)) cell[1]++;
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
  return { findings, filesScanned: files.length, census };
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

/**
 * Eyebrow: nhãn mục viết HOA, cỡ nhỏ, giãn chữ — mặc thẻ heading để có landmark ngữ
 * nghĩa cho trình đọc màn hình, KHÔNG phải để làm tiêu đề. Cùng lý do đã duyệt cho
 * `ScheduleDebtBar`. Giữ nguyên ⇒ 0 thay đổi thị giác. Quân chốt 02/09.
 *
 * Cả 14 chỗ một nhóm, một lý do. Quyết định ban đầu chỉ kê SÁU — tám chỗ còn lại vắng vì
 * phạm vi dựng bằng `git grep -E "<h[123][ >]"`, hụt `h4`. Cùng hình dạng đo được
 * (`uppercase` + `tracking-*` + cỡ ≤13px) thì cùng quyết định; giữ hai nhóm chỉ vì phép
 * liệt kê đầu tiên thiếu là lưu một phân biệt không có nội dung.
 */
const EYEBROWS_APPROVED = [
  'nền|11|features/history/components/AiNote.tsx|text-[11px]',
  'nền|11|features/history/components/FocusSessionList.tsx|text-[11px]',
  'nền|11|features/history/components/SessionList.tsx|text-[11px]',
  'nền|13|features/interview/components/AiSummaryCard.tsx|text-[13px]',
  'nền|13|features/interview/components/AiSummaryCard.tsx|text-[13px]',
  'nền|13|features/interview/components/AiSummaryCard.tsx|text-[13px]',
  'nền|11|features/study-planner/components/ConceptDetailPanel.tsx|text-[11px]',
  'nền|11|features/study-planner/components/ConceptDetailPanel.tsx|text-[11px]',
  'nền|11|features/study-planner/components/ConceptDetailPanel.tsx|text-[11px]',
  'nền|11|features/study-planner/components/ConceptDetailPanel.tsx|text-[11px]',
  'nền|11|pages/verify/InterviewPage.tsx|text-[11px]',
  'nền|11|pages/verify/InterviewPage.tsx|text-[11px]',
  'nền|11|pages/verify/InterviewSessionPage.tsx|text-[11px]',
  'nền|11|pages/verify/InterviewSessionPage.tsx|text-[11px]',
];

/**
 * Ngoại lệ đã quyết (Quân chốt 02/09): đã bọc `<Heading>` để vào thang về mặt cấu trúc,
 * nhưng GIỮ diện mạo cũ bằng override. Bậc `card`(18) lệch 5px = **+38%**, và bán kính là
 * mọi tiêu đề mục trong panel chi tiết phiên — quá lớn để đổi lấy sự đồng đều.
 *
 * ⚠️ Ngoại lệ này ghim **BA trục**, không riêng cỡ — đọc "ngoại lệ cỡ" là đọc hẹp hơn sự
 * thật, và bản đầu của docstring này đã đọc hẹp như thế. Bọc `<Heading>` kéo theo hai thứ
 * nữa mà không ai kê số: `card` có `tracking-[-0.015em]`, và `.font-heading` (`@layer
 * base`) có `line-height:1.25`. Đo trên bản dựng thật: leading 18,5714px → 16,25px
 * (**−12,5%**, mất 2,32px mỗi dòng), tracking 0 → −0,195px.
 *
 * ⚠️ 18,5714px KHÔNG phải 1,6 của `body`. Tổ tiên gần hơn là `TabsContent` mang `text-sm`,
 * mà `--text-sm--line-height` là `calc(1.25 / .875)` — KHÔNG đơn vị nên thừa kế theo TỈ LỆ:
 * 13 × 1,42857. Bản đầu của docstring này suy thẳng từ `body` mà không kiểm có gì chen
 * giữa, ra 20,8px và phóng đại mức hụt **1,96×**; bản vá theo số ấy còn NÂNG cỡ dòng +12%,
 * tức đổi diện mạo ngược với ý định. Override đúng là `leading-[inherit]`: nó phát biểu
 * đúng ý định — *đừng để `.font-heading` đặt line-height, cứ thừa kế như trước* — cộng
 * `text-[13px]` và `tracking-normal` (`--tracking-normal: 0em`).
 *
 * ⚠️ ĐỪNG thay bằng một `leading` arbitrary trỏ vào biến `--text-sm--line-height`, dù
 * dạng ấy tự khai nguồn tốt hơn.
 * Hai lý do, cả hai đo được:
 *
 *   gõ SAI tên biến vẫn ra ĐÚNG số   `var()` không giải được là *invalid at computed-value
 *                                    time*; `line-height` thừa kế nên rơi về `inherit`, tức
 *                                    18,5714px — cổng không thể bác. Dạng `inherit` gõ sai
 *                                    thì hỏng lúc parse, tụt 16,25px, KÊU TO.
 *   ghim vào token của người khác     nếu tổ tiên đổi `text-sm` → `text-base`, bản `var`
 *                                    kẹt ở 1,4286 trong khi chữ quanh nó nhảy 1,5 — đúng
 *                                    loại lệch #387 đang dọn. `inherit` thì đi theo.
 *
 * ⛔ Trục **mặt chữ** thì KHÔNG ghim được: `.font-heading` đổi sans → mono, và gỡ nó đi
 * thì không còn là `<Heading>` nữa. Đổi có chủ ý, Quân chấp nhận sau khi xem số.
 */
const SIZE_EXCEPTION = ['nền|13|features/history/components/SessionDetailPanel.tsx|text-[13px]'];

const KNOWN = [
  ...HERO_EXCEPTION,
  ...OUT_OF_SCOPE_LABELS,
  ...OUT_OF_SCOPE_WORDMARKS,
  ...RESPONSIVE_CONCESSION,
  ...EYEBROWS_APPROVED,
  ...SIZE_EXCEPTION,
].sort((a, b) => a.localeCompare(b));

/**
 * KIỂM KÊ THẺ — mỗi tệp: [số thẻ tiêu đề bộ quét CHẠM tới, số token khớp `/\btext-/`].
 *
 * Thay cho `expect(headingTags).toBeGreaterThan(20)` cũ. Ngưỡng ấy **che được**: nếu một
 * bẫy rơi vào thẻ ĐÃ được đếm sẵn thì tổng không nhúc nhích, và một tiêu đề 32px thật —
 * render thật, CSS sinh ra thật — vẫn đi qua với `vitest` xanh, `tsc -b && vite build`
 * EXIT=0, `lint` EXIT=0. Hai cột bắt hai chiều khác nhau:
 *
 *   bẫy ở thẻ CHƯA đếm  → cột 1 đổi
 *   bẫy ở thẻ ĐÃ đếm    → cột 2 đổi
 *
 * ⛔ Cột 2 cố ý KHÔNG lọc token cỡ: `text-balance`, `text-foreground` cũng tính. Lọc
 * xuống "chỉ token cỡ" thì `text-foreground` → `text-muted-foreground` (đổi chính đáng)
 * sẽ làm cổng ĐỎ OAN.
 *
 * ⛔ Và neo là `/\btext-/`, KHÔNG phải `^text-`: `classify()` cắt tiền tố bằng
 * `lastIndexOf(':')` rồi mới neo trên phần base, nên token trong `className` vẫn mang
 * nguyên tiền tố. `^text-` sẽ trượt token có tiền tố `sm:` và token mở đầu bằng important — hai dạng
 * hay dùng nhất. Dùng chính regex lái vòng ngoài thì không phải nghĩ về tiền tố nào cả.
 *
 * "Thẻ bộ quét CHẠM tới" ≠ "mọi thẻ tiêu đề": vòng quét chạy theo các lần xuất hiện của
 * `text-`, nên `<Heading size="page" className="leading-[1.1]">` (không có token `text-`
 * nào) KHÔNG có mặt ở đây. Không mất gì cho việc phát hiện — mọi cách viết mà `classify`
 * nhận ra đều bắt đầu bằng `text-` — nhưng đừng đọc con số này thành "tổng số tiêu đề".
 *
 * ⛔ **Cổng chứng nhận KHÔNG CÒN CỠ NGOÀI THANG. Nó KHÔNG chứng nhận mỗi tiêu đề chọn
 * ĐÚNG BẬC.** Lớp mù là **mọi lần đổi `size=`**, không riêng những thẻ đã rơi khỏi kiểm kê.
 * Hai đường vào lớp ấy:
 *
 *   thẻ bọc KHÔNG có token `text-`  → vắng mặt hẳn (vòng quét chạy theo `text-`)
 *   thẻ bọc CÓ token `text-`        → có mặt, nhưng override nuốt cỡ; đổi `card` → `page`
 *                                     chỉ làm `tracking-[-0.015em]` của bậc biến mất, mà
 *                                     cổng không nhìn `tracking`. Kiểm kê đứng yên.
 *
 * `SessionDetailPanel` là ca thứ hai — nó **vẫn nằm trong** kiểm kê mà vẫn đổi bậc được
 * mà không ai đỏ. Đây là giới hạn CẤU TRÚC, không phải lỗ hổng cục bộ; lưới đúng cho việc
 * ấy là kiểm tương thích thẻ↔bậc (`h1` không được `card`, `h3` không được `display`), chưa
 * dựng — và nó phải quét **thuộc tính `size`**, không nối dài được vòng quét `text-` này.
 *
 * Sinh ra từ chính `scan()` rồi đọc lại bằng mắt, không chép tay.
 *
 * 🔴 **Kiểm kê đỏ ở một tệp bạn KHÔNG cố ý đổi ⇒ ĐỪNG cập nhật bảng này.** Trước hết đi
 * tìm một dấu nháy ĐƠN nằm trong một thuộc tính nháy KÉP của thẻ tiêu đề, kiểu
 * `title="don't"`. Regex ghép literal ở `scan()` bắt cặp nháy tham lam, nên một nháy đơn
 * lẻ làm MỌI cặp nháy phía sau lệch một nhịp: vùng trong/ngoài nháy hoán đổi, và toàn bộ
 * token của thẻ đó biến mất. Đo được: cùng thẻ, `KNOWN` IM RE, chỉ cột token tụt `1 → 0`.
 * Chỉnh bảng cho khớp ⇒ xanh vĩnh viễn với một cỡ ngoài thang nằm im bên trong.
 *
 * Độ lớn hôm nay: **0** thuộc tính nháy kép chứa nháy đơn trong `.tsx` (đối chứng dương:
 * 2 394 thuộc tính nháy kép nói chung, nên phép đếm có bắn). Nhưng vật liệu thì sẵn.
 */
const HEADING_CENSUS: Record<string, [tags: number, textTokens: number]> = {
  'features/auth/components/LoginForm.tsx': [1, 1],
  'features/auth/components/SignupForm.tsx': [1, 1],
  'features/focus/components/RunningSession.tsx': [2, 2],
  'features/history/components/AiNote.tsx': [1, 1],
  'features/history/components/FocusSessionList.tsx': [1, 2],
  'features/history/components/SessionDetailPanel.tsx': [1, 1],
  'features/history/components/SessionList.tsx': [1, 2],
  'features/interview/components/AiSummaryCard.tsx': [4, 7],
  'features/interview/components/NextSessionPanel.tsx': [1, 1],
  'features/interview/components/ScoreBreakdown.tsx': [1, 1],
  'features/interview/components/SessionSummary.tsx': [2, 2],
  'features/interview/components/TracebackPanel.tsx': [1, 1],
  'features/interview/components/TurnHistory.tsx': [1, 1],
  'features/landing/components/ExtractScene.tsx': [1, 1],
  'features/landing/components/LandingHero.tsx': [1, 4],
  'features/landing/components/TracebackScene.tsx': [1, 1],
  'features/landing/components/VerdictScene.tsx': [1, 1],
  'features/schedule/components/MonthGrid.tsx': [1, 1],
  'features/schedule/components/ScheduleDebtBar.tsx': [2, 2],
  'features/study-planner/components/ConceptDetailPanel.tsx': [4, 8],
  'pages/focus/FocusPage.tsx': [2, 2],
  'pages/landing/LandingPage.tsx': [4, 5],
  'pages/verify/InterviewPage.tsx': [2, 4],
  'pages/verify/InterviewSessionPage.tsx': [2, 4],
};

describe('#387 — kiểm kê cỡ chữ ngoài thang trên phần tử tiêu đề', () => {
  it('đối chứng dương: thang đọc được từ heading.tsx, và bộ quét CHẠM tới mã thật', () => {
    expect([...scaleFromHeadingTsx()].sort((a, b) => a - b)).toEqual([18, 21, 30, 40]);
    // Sàn, không phải mốc cố định: số tệp `.tsx` chỉ tăng theo thời gian.
    expect(scan().filesScanned).toBeGreaterThanOrEqual(117);
  });

  it('🔴 kiểm kê thẻ tiêu đề từng tệp KHÔNG được xê dịch', () => {
    expect(scan().census).toEqual(HEADING_CENSUS);
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
    // Đối chứng dương: khoá tách được và không rỗng. Số TỆP nhỏ hơn số mục vì nhiều
    // tệp giữ nhiều mục (LandingPage: một nhãn + một wordmark; ConceptDetailPanel: 4 eyebrow).
    expect(files).toHaveLength(14);

    const thieu = files.filter((f) => !readFileSync(join(SRC, f), 'utf-8').includes('#387:'));
    expect(thieu).toEqual([]);
  });

  it('🔴 cả hai cách viết class đều được bộ quét nhận ra', () => {
    const notations = new Set(scan().findings.map((f) => f.notation));
    expect(notations.has('ngoặc vuông')).toBe(true);
    expect(notations.has('tên')).toBe(true); // `text-base` — cách viết từng bị sót
  });
});
