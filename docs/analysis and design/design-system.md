# Recall AI — Design System v3 "Warm Editorial Minimalism"

> Thay thế hoàn toàn v2 (Indigo/Slate, shadcn preset `bPJV3d2hv`). Lý do đổi: v2 đúng về mặt
> kỹ thuật (semantic tokens, oklch, dark mode, accessibility) nhưng thẩm mỹ là "generic AI SaaS"
> — Indigo/Violet bão hòa cao, bo góc lớn, hero-color CTA. v3 giữ **nguyên toàn bộ cấu trúc
> token và ràng buộc chức năng của v2** (chỉ đổi giá trị màu + typography + shape), theo hướng
> minimalist/editorial: canvas đơn sắc ấm, màu chỉ dùng cho 5 accent ngữ nghĩa, không gradient,
> không shadow nặng, không pill-shape cho container lớn.
>
> Token thật nằm trong [`src/global.css`](../src/frontend/src/global.css) — tài liệu này mô tả,
> không phải nguồn chân lý; nếu hai bên lệch nhau, `global.css` luôn đúng.

---

## 0. Ràng buộc chức năng — KHÔNG đổi khi redesign

Ba điều này là quyết định sản phẩm đã chốt, độc lập với trường phái thẩm mỹ:

1. **Dark mode là mục tiêu chính**, không phải chế độ phụ — sinh viên học đêm gần deadline.
2. **Focus Session: animation = 0.** Class `.focus-session-active` tắt toàn bộ animation/transition
   bên trong nó bằng `!important`. Không được gỡ constraint này vì lý do thẩm mỹ.
3. **Màu mastery không bao giờ là tín hiệu duy nhất** (WCAG 1.4.1) — luôn kết hợp icon/label.

---

## 1. Visual Theme & Atmosphere

Công cụ học tập nghiêm túc, không phải sản phẩm marketing. Sinh viên dùng lúc căng thẳng (gần
deadline, ôn đêm khuya) — giao diện phải rõ ràng, đáng tin cậy, **không gây thêm lo âu**: giống
phòng lab yên tĩnh / một cuốn sổ tay biên tập kỹ lưỡng hơn là landing page hào nhoáng.

- **Density:** 6/10 — nghiêng dense (đồ thị khái niệm, hàng đợi ôn tập, số liệu mastery cùng lúc)
  nhưng giữ nhịp thở bằng khoảng trắng lớn (macro-whitespace), không nhồi nhét kiểu cockpit.
- **Color as scarce resource:** canvas + text luôn đơn sắc ấm (warm monochrome). Màu chỉ xuất
  hiện ở 5 accent ngữ nghĩa (xem §3.2) — không có "brand color" tô nền lớn.
- **Motion:** im lặng, gần như vô hình — trừ ngoại lệ cứng Focus Session = 0 (xem §0).

---

## 2. Typography

Ba họ font, phân vai rõ ràng — không dùng chung một font cho mọi thứ như v2:

| Vai trò                                                               | Font           | Khi nào dùng                                                                                     |
| --------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| **UI / Body** (`font-sans`)                                           | Geist Variable | Toàn bộ UI: nav, button, form, bảng, card body                                                   |
| **Editorial heading** (`font-heading`, class `.font-heading`)         | Noto Serif     | Tiêu đề lớn: Dashboard title, kết quả cuối phiên, landing hero — **không** dùng cho label UI nhỏ |
| **Metadata / số liệu** (`font-mono`, class `.meta-mono` hoặc `<kbd>`) | Geist Mono     | Đồng hồ Pomodoro, `mastery_score`, phím tắt                                                      |

> **Vì sao Noto Serif chứ không phải Newsreader/Playfair** (gợi ý mặc định của protocol
> minimalist): Noto Serif có sẵn subset `vietnamese` (U+1EA0–1EF9, đủ dấu tiếng Việt) trong từng
> file weight của `@fontsource/noto-serif` — ưu tiên đúng nội dung tiếng Việt của app hơn là bám
> chính xác gợi ý font của skill.

**Text color:** không bao giờ dùng đen/trắng tuyệt đối — `--foreground`/`--background` luôn có
chút warm chroma (hue ~75-80, xem §3.1). `line-height: 1.6` cho body.

| Role                   | Class Tailwind                    | Font       | Size                   |
| ---------------------- | --------------------------------- | ---------- | ---------------------- |
| Landing/Dashboard hero | `font-heading text-4xl font-bold` | Noto Serif | 36px, tracking -0.02em |
| Page title             | `text-2xl font-bold`              | Geist Sans | 24px                   |
| Section heading        | `text-xl font-semibold`           | Geist Sans | 20px                   |
| Card title             | `text-lg font-medium`             | Geist Sans | 18px                   |
| Body / Chat            | `text-base`                       | Geist Sans | 16px                   |
| Metadata / timer       | `.meta-mono text-sm`              | Geist Mono | 14px                   |
| Node label (graph)     | `text-xs`                         | Geist Sans | 12px                   |

---

## 3. Color System

### 3.1 Canvas & Neutral (warm monochrome — never pure black/white)

| Token                | Light (oklch)               | Dark (oklch)                  | Vai trò                                        |
| -------------------- | --------------------------- | ----------------------------- | ---------------------------------------------- |
| `--background`       | `0.984 0.004 80` bone       | `0.17 0.006 75` warm charcoal | Canvas                                         |
| `--foreground`       | `0.24 0.008 75`             | `0.93 0.005 75`               | Body text                                      |
| `--card`             | `0.995 0.002 80`            | `0.21 0.007 75`               | Surface, viền 1px `--border`, **không shadow** |
| `--border`           | `0.9 0.005 75` (~`#EAEAEA`) | `1 0 0 / 8%`                  | Divider, card outline                          |
| `--primary`          | `0.24 0.008 75` (ink)       | `0.93 0.005 75` (paper)       | CTA solid — **không** còn là Indigo như v2     |
| `--muted-foreground` | `0.55 0.012 75`             | `0.68 0.012 75`               | Text phụ                                       |

`--primary` đảo ink/paper giữa 2 mode (light: chữ trắng trên nền than; dark: chữ than trên nền
kem) — đúng logic "editorial" chứ không phải một brand-blue cố định.

### 3.2 Semantic Accent (5 token — muted, không bao giờ vivid)

Cùng cấu trúc token với v2 (giữ tên biến, đổi giá trị), cùng cơ chế derive nền nhạt:
`background: oklch(from var(--token) l c h / 0.1)`.

| Token                | Ý nghĩa                                       | Hue                 | Ghi chú                                             |
| -------------------- | --------------------------------------------- | ------------------- | --------------------------------------------------- |
| `--ai-accent`        | AI Examiner, "Đang vấn đáp", badge AI Planner | ~235 (blue, muted)  | **Token mới** — tách khỏi `--accent` (xem §3.3)     |
| `--mastery-strong`   | Concept vững (score ≥ 0.8)                    | ~155 (green, muted) |                                                     |
| `--mastery-learning` | Đang học (0.6 ≤ score < 0.8)                  | ~85 (amber, muted)  | Cùng hue với `--focus-session`                      |
| `--mastery-weak`     | Yếu/Sai (score < 0.6)                         | ~25 (red, muted)    |                                                     |
| `--remediate`        | Hệ thống tự chèn prerequisite                 | ~55 (orange, muted) | Phải tách biệt `--mastery-weak` — ý nghĩa khác nhau |
| `--mastery-untested` | Chưa kiểm tra                                 | warm gray           |                                                     |
| `--focus-session`    | Pomodoro đang chạy                            | ~85 (amber)         |                                                     |

### 3.3 Sửa lỗi lệch tài liệu/code từ v2

v2 mô tả `--accent` = "Violet — AI Examiner" trong tài liệu, nhưng giá trị thật trong
`global.css` lại là xám trung tính — tài liệu và code đã lệch nhau. v3 sửa dứt điểm: `--accent`
là **hover surface trung tính** dùng chung toàn hệ thống (dropdown, menu item hover — đúng vai
trò gốc của shadcn), còn ngữ nghĩa "AI" chuyển hẳn sang token riêng `--ai-accent` ở trên.

### 3.4 Chart Tokens

`--chart-1..5` map trực tiếp theo hue của 5 accent ở §3.2 (blue/green/red/amber/gray) để biểu đồ
và UI dùng chung một ngôn ngữ màu.

---

## 4. Spacing & Layout

Không đổi so với v2 — hệ 8pt grid vẫn đúng, không xung đột với minimalist (chỉ cần dùng
`space-8`/`space-12`/`space-16` rộng rãi hơn cho section break, đúng tinh thần macro-whitespace).

| Token      | Size | Dùng cho                |
| ---------- | ---- | ----------------------- |
| `space-1`  | 4px  | Icon gap, tight padding |
| `space-2`  | 8px  | Component internal gap  |
| `space-3`  | 12px | Label-to-input gap      |
| `space-4`  | 16px | Card padding, form gap  |
| `space-6`  | 24px | Card-to-card gap        |
| `space-8`  | 32px | Section padding         |
| `space-12` | 48px | Major section breaks    |
| `space-16` | 64px | Hero sections           |

**Desktop Layout (primary target):**

```
┌─────────────────────────────────────────────────┐
│  Sidebar (240px fixed)  │  Main Content area     │
│  ─ Logo                 │  (fluid, min 600px)    │
│  ─ Dashboard            │                        │
│  ─ Kế hoạch ôn tập      │  [react-flow canvas /  │
│  ─ Focus Session        │   chat UI / timeline]  │
│  ─ Hồ sơ                │                        │
└─────────────────────────────────────────────────┘
```

**Border Radius:** `--radius: 0.625rem` (10px, giảm từ 0.875rem của v2) — crisp, không pill cho
container lớn. Badge/tag vẫn được phép pill-shape (`rounded-full`) — đây là ngoại lệ duy nhất.

---

## 5. Elevation & Motion

### 5.1 Shadow — hầu như không tồn tại

Card được định nghĩa bằng **viền 1px `--border`**, không phải shadow. Chỉ một token shadow duy
nhất, cực nhạt, dùng cho hover-lift:

```css
--shadow-soft: 0 2px 8px oklch(0 0 0 / 0.04); /* light */
--shadow-soft: 0 2px 10px oklch(0 0 0 / 0.22); /* dark */
```

Cấm dùng `shadow-md`/`shadow-lg`/`shadow-xl` mặc định của Tailwind ở bất kỳ đâu.

### 5.2 Animation Tokens

| Token               | Giá trị                             | Dùng cho                        |
| ------------------- | ----------------------------------- | ------------------------------- |
| `--duration-fast`   | `150ms`                             | Hover, micro-interactions       |
| `--duration-normal` | `250ms`                             | Dialog open/close               |
| `--duration-slow`   | `400ms`                             | Page transitions, graph animate |
| `--duration-reveal` | `600ms`                             | Scroll-reveal (mới, xem §5.3)   |
| `--ease-standard`   | `cubic-bezier(0.4, 0, 0.2, 1)`      | General transitions             |
| `--ease-spring`     | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Graph node pop-in               |
| `--ease-reveal`     | `cubic-bezier(0.16, 1, 0.3, 1)`     | Scroll-reveal (mới)             |

### 5.3 Scroll-Reveal (mới trong v3)

Class `.reveal-on-scroll` — ẩn (opacity 0, translateY 12px) đến khi vào viewport, resolve trong
600ms. Bắt buộc gắn qua `IntersectionObserver`, **không** dùng `scroll` event listener (hiệu năng).
Danh sách/lưới dùng `.reveal-stagger` + biến `--index` per-item để tạo hiệu ứng lần lượt
(`calc(var(--index) * 80ms)` delay).

**Nguyên tắc bất biến (không đổi từ v2):**

- **Focus Session: animation = 0** — xem §0, hard constraint.
- Graph DAG load: node fade-in theo layer delay.
- Remediate insert: `pulse-remediate`, đã giảm biên độ/opacity so với v2 cho "quiet sophistication".

---

## 6. Concept Graph — Node Styling

CSS classes cho react-flow nodes trong `global.css`. Node giờ **flat, viền 1px**, không còn nền
tô đậm 20-30% opacity như v2 — chỉ 10% tint, hover dùng `--shadow-soft` thay vì `filter: brightness`.

| Class                        | Score       | Visual                                       |
| ---------------------------- | ----------- | -------------------------------------------- |
| `.concept-node--strong`      | ≥ 0.8       | Viền/chữ muted green, nền tint 10%           |
| `.concept-node--learning`    | 0.6 – 0.8   | Viền/chữ muted amber, nền tint 10%           |
| `.concept-node--weak`        | < 0.6       | Viền/chữ muted red, nền tint 10%             |
| `.concept-node--untested`    | `null`      | Nền `--muted`, viền dashed                   |
| `.concept-node--remediating` | Đang ôn lại | Viền orange, pulse nhẹ (2s, không phải 1.5s) |

Hàm map không đổi so với v2 (`getMasteryLevel`) — chỉ CSS thay đổi, logic giữ nguyên.

---

## 7. AI Examiner Chat — Bubble Styling

| Class               | Alignment | Token                                       | Ghi chú                                          |
| ------------------- | --------- | ------------------------------------------- | ------------------------------------------------ |
| `.chat-bubble-ai`   | Left      | `--ai-accent` (blue, 8% tint nền, 30% viền) | Thay Violet của v2                               |
| `.chat-bubble-user` | Right     | `--secondary` (trung tính)                  | Màu chỉ dành cho AI — "color as scarce resource" |

---

## 8. Components (shadcn/ui)

Danh sách component không đổi so với v2 — v3 chỉ đổi token/theme áp lên chúng, không đổi lựa
chọn component. Xem v2 changelog trong lịch sử git nếu cần đối chiếu.

**Icon library:** hiện dùng `lucide-react` — protocol minimalist khuyến nghị Phosphor/Radix
Icons (nét dày hơn, ít "generic thin-line" hơn). **Chưa đổi trong v3** — đây là thay đổi chạm
vào nhiều component đã code thật (LoginForm, SignupForm, Sidebar), cần một PR riêng có test
trực quan, không làm lẫn trong lần đổi token này.

---

## 9. Accessibility

Không đổi so với v2 — các yêu cầu WCAG vẫn giữ nguyên, giá trị oklch mới đã được chọn để vẫn đạt
contrast ratio tương đương hoặc tốt hơn v2 (do dùng chroma thấp hơn, độ tương phản L dễ kiểm
soát hơn màu bão hòa cao).

| Yêu cầu                          | Standard        | Áp dụng cho                               |
| -------------------------------- | --------------- | ----------------------------------------- |
| Text contrast                    | WCAG AA (4.5:1) | Mọi body text, chat bubbles               |
| Graph node contrast              | WCAG AA (3:1+)  | Node label trên colored bg                |
| Mastery color không dùng đơn độc | WCAG 1.4.1      | Kết hợp icon: ✅ 🔄 ⚠️ ❓                 |
| Keyboard navigation              | WCAG 2.1.1      | react-flow keyboard pan/zoom              |
| Focus indicators                 | Visible         | `--ring` = ink/paper theo mode, 2px solid |
| `prefers-reduced-motion`         | WCAG 2.3.3      | Tắt pulse + scroll-reveal                 |

---

## 10. Technical Notes

- **Tailwind version:** v4 — `@theme inline` trong `global.css`, không dùng `tailwind.config.ts`.
- **Color space:** oklch — không dùng HSL/hex trực tiếp trong token.
- **Dark mode:** class `.dark` trên `<html>` — dark-first orientation (xem §0).
- **Font packages mới cần cài** (đã cài trong session redesign này):
  `@fontsource-variable/geist-mono`, `@fontsource/noto-serif`.
- **Custom Tailwind utilities** đăng ký trong `@theme inline`: `bg-mastery-strong`,
  `text-ai-accent`, `border-remediate`, v.v.
