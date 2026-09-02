# Bản đồ `mockup → src` — màn Lịch ôn tập

Mockup: [`screen-plan-schedule.html`](screen-plan-schedule.html) (cùng thư mục này; HTML tĩnh, tự chạy khi mở bằng `file://`, font đã nhúng sẵn). **Nó KHÔNG phải nguồn code.** Nó là nguồn _hình_ và
_hành vi_. Mọi thứ dựng lại bằng component của `src/client/src`.

Ba nhóm: **TÁI DÙNG** (dùng nguyên) · **MỞ RỘNG** (thêm variant/prop vào **file cũ**, không fork) ·
**THÊM MỚI** (chưa có thật).

---

## 1. Bảng khối

| #   | Khối trong mockup                        | Nhóm                             | Ở đâu / làm gì                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Dòng mục trong panel (`.pitem`)          | **MỞ RỘNG**                      | `features/review-queue/components/ReviewQueueItemRow.tsx`. Đang có 3 variant `remove`/`restore`/`gone`, layout `<li>` `grid-cols-[30px_1fr_auto_auto_auto]` **có cột số thứ tự**. Thêm variant thứ 4 `'schedule'` **vào chính file này**: bỏ cột số, mở-rộng-tại-chỗ, 4 CTA.                                                                                                                                                                                                                                             |
| 2   | Badge `TRUY NGƯỢC · TẦNG N`              | **TÁI DÙNG**                     | `components/ui/badge.tsx` → `<Badge tone="remediate">`. Chuỗi dựng sẵn ở `ReviewQueueItemRow.tsx:72` — **chép logic đó, đừng viết lại**.                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | Ô mastery (chấm + nhãn)                  | **MỞ RỘNG**                      | `MasteryCell` nằm trong `ReviewQueueItemRow.tsx` nhưng **chưa export** → export ra. Dải điểm lấy từ `masteryBand`/`masteryLabel` (`components/ui/concept-node.tsx`).                                                                                                                                                                                                                                                                                                                                                     |
| 4   | Nút / CTA                                | **TÁI DÙNG**                     | `components/ui/button.tsx`. `.btn.pri`→`<Button size="sm">` · `.btn`→`<Button variant="outline" size="sm">`. Hành động kiểu link dùng `LINKISH_BUTTON_CLASS` đã có trong `ReviewQueueItemRow.tsx`.                                                                                                                                                                                                                                                                                                                       |
| 5   | Dropdown bộ lọc + checkbox               | **MỞ RỘNG**                      | `components/ui/dropdown-menu.tsx` chỉ export `Root/Trigger/Content/Item/Separator` — **không có `CheckboxItem`, không có `Label`**, và **không có `checkbox.tsx`** trong repo. Thêm `DropdownMenuCheckboxItem` (bọc `DropdownMenuPrimitive.CheckboxItem`) vào chính file đó.                                                                                                                                                                                                                                             |
| 6   | Popover "Dời sang ngày…"                 | **TÁI DÙNG**                     | Có tiền lệ nguyên si: `pages/CreatePlanPage.tsx:274-295` — `Popover` + `PopoverTrigger asChild` + `PopoverContent className="w-auto p-0"` + `Calendar mode="single"`. Chép **hình dạng** đó, đổi `disabled` predicate.                                                                                                                                                                                                                                                                                                   |
| 7   | Banner "N kế hoạch chưa xác nhận"        | **MỞ RỘNG**                      | Pattern gần nhất: `features/dashboard/components/BlockError.tsx` (`rounded-lg border border-l-2 border-l-mastery-weak bg-muted px-4 py-3.5 flex items-start gap-3`). Nâng nó thành callout dùng chung, đổi `border-l-ai-accent`.                                                                                                                                                                                                                                                                                         |
| 8   | Thanh "Còn nợ"                           | **THÊM MỚI**                     | `ScheduleDebtBar`. Theo đúng công thức của BlockError (border-l-2 + tint) nhưng render `<button>` vì bấm được.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | Lưới tháng + ô ngày                      | **THÊM MỚI**                     | `MonthGrid` + `DayCell`. Không có gì gần. ⚠️ Chip trong ô là `<span>` thường — **KHÔNG dùng `Badge`**: Badge là pill uppercase 11px, sai ngữ nghĩa cho tên khái niệm.                                                                                                                                                                                                                                                                                                                                                    |
| 10  | Thẻ "Tháng N chưa có buổi ôn nào"        | **MỞ RỘNG (tách khung)**         | ⚠️ **KHÔNG dùng lại `EmptyQueueMessage` trực tiếp** — props của nó là `planId / message / planStatus / hasActiveConcepts`, và tiêu đề + icon **do `resolveFrame()` tự quyết bên trong**, không nhận heading tự do. Việc phải làm: **tách phần trình bày** ra (icon + `font-heading text-[20px] tracking-[-0.02em]` + body + action tuỳ chọn + `max-w-130 mx-auto text-center`) thành khung dùng chung, rồi `EmptyQueueMessage` gọi lại khung đó. **Đừng chép class sang file mới** — thành hai công thức trôi khỏi nhau. |
| 11  | Chuyển view `Lịch` ⇄ `Kế hoạch`          | **THÊM MỚI**                     | Dùng `components/ui/tabs.tsx` (`Tabs`/`TabsList variant`/`TabsTrigger`). ⚠️ Xem cảnh báo (C) bên dưới.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | Lưới thẻ kế hoạch + tab strip trạng thái | **TÁI DÙNG NGUYÊN — KHÔNG ĐỤNG** | `features/study-planner/components/PlanCard.tsx` (props: `plan, now, onArchive, onRestore, onReanalyze, onDelete, isBusy`) và tab strip trong `pages/planning/PlansPage.tsx`. View `Kế hoạch` **chính là màn hiện tại**, giữ nguyên.                                                                                                                                                                                                                                                                                     |

---

## 2. (A) Thứ trong mockup là "vẽ cho giống" — **CẤM CHÉP**

| Trong `a.html`                                           | Vì sao cấm                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toàn bộ khối `:root{}` và `.dark{}`                      | Đó là **bản chép token** để file chạy độc lập. App đã có ở `global.css`. Chép vào = hai nguồn sự thật, đổi token một chỗ lệch chỗ kia.                                                  |
| `@font-face`                                             | App nạp qua `@fontsource-variable/geist`, `@fontsource-variable/jetbrains-mono`.                                                                                                        |
| `fitMenu()` (kẹp chiều cao + lật dropdown)               | **Radix tự làm.** `DropdownMenuContent`/`PopoverContent` có sẵn collision detection và biến `--radix-*-available-height`. Viết tay là làm lại thứ đã có.                                |
| `.btn` `.badge` `.chip` `.dot` `.mono` `.filt` `.frow` … | Tên **tôi tự đặt trong mockup**, không phải utility của dự án. Trùng tên với ý niệm thật nhưng không phải cùng thứ.                                                                     |
| `@media (max-width:680px)` viết tay                      | Dùng breakpoint Tailwind. Nếu 680 là mốc thật thì viết `max-[680px]:` — repo có tiền lệ mốc không tròn (`min-[721px]:` trong `ReviewQueueItemRow.tsx`), **đừng làm tròn về `sm`/`md`**. |

---

## 3. (B) Màu & cỡ chữ — lấy từ token, không lấy số trong mockup

Mọi màu mockup **map 1-1** sang token đã có: `--mastery-strong/learning/weak/untested`, `--remediate`,
`--ai-accent`, `--primary`, `--muted`, `--muted-foreground`, `--border`, `--card`, `--background`, `--foreground`.

- **Tint dùng cú pháp alpha của Tailwind** — `bg-remediate/14`, như `badge.tsx` đang làm.
  Mockup viết `color-mix(in oklab, …)` **chỉ vì nó là CSS thuần**; đừng bê sang.
- Heading dùng utility `font-heading`. `global.css` có ghi chú riêng về `font-weight` của nó —
  đọc trước, đừng để rơi về 400.
- Cỡ chữ: lấy theo thang đang dùng (`text-[13px]`, `text-[12.5px]`…), khớp component lân cận.

### 🔴 Mức tint — ĐÃ CHỐT bằng số đo, **quy tắc theo CHỮ NẰM TRÊN, không theo diện tích**

> **`/14` cho chip & badge · `/7` cho mọi mảng có chữ `--muted-foreground` nằm trên. Không dùng `/10`.**

Đo bằng canvas (pixel sRGB thật — `getComputedStyle` trả chuỗi `oklch` nên **không** đọc trực tiếp được),
tương phản của chữ trên nền đã hợp thành alpha:

| tint `--mastery-weak` | chữ `--muted-foreground` 12px, **light** | **dark** |
| --------------------- | ---------------------------------------- | -------- |
| `/7`                  | **4,53** ✅                              | 6,22 ✅  |
| `/10`                 | **4,31** ❌                              | 5,95 ✅  |
| `/14`                 | **4,05** ❌                              | 5,64 ✅  |

⇒ **`/10` và `/14` phá WCAG AA (4.5:1) ở light mode** cho chữ phụ — áp cho **cả** ô ngày quá hạn **và**
thanh "Còn nợ", vì cả hai đều có chữ `--muted-foreground` 11–12px nằm trên. Dark mode dư sức, **light mode
mới là ràng buộc**.

**Vì sao badge vẫn `/14` an toàn:** chữ trên badge là **chính token màu đó** (`text-remediate` trên
`bg-remediate/14`), không phải `--muted-foreground` → đo được **5,29–5,56** ✅. Nên `badge.tsx` **giữ nguyên**.

⚠️ **Đây là lỗi tái phát, không phải ca lạ.** `global.css` ghi rõ `--muted-foreground` từng được hạ
`0.55 → 0.53` **chính vì** nó rớt 4.5:1 trên các mặt phẳng chồng lớp (`--muted`, `--secondary`,
`--accent`, `--sidebar`), worst case 4,57. Đặt thêm một lớp tint xuống dưới nó là **phá lại đúng bản vá đó**.

**Giả thuyết ban đầu ("vùng lớn thì tint phải nhạt không thì đỏ rực") là SAI** — độ nổi của tint so với nền
chỉ 1,08–1,37 ở mọi mức, mắt thường gần như không thấy khác. Vấn đề thật nằm ở hướng ngược lại: tint làm
**tối mặt phẳng bên dưới chữ phụ**.

**Nếu sau này cần một mảng tint đậm hơn `/7`:** đổi chữ trên nó sang `--foreground` (đo được 12,7–14,7 ở
mọi mức) chứ đừng giữ `--muted-foreground`.

---

## 4. (C) Ba cái bẫy cụ thể

1. **`masteryBand`/`masteryLabel` là nguồn sự thật DUY NHẤT cho ba dải điểm.**
   Repo có **ba hằng số ngưỡng ở ba file** (0.6 traceback · 0.7 `MIN_COVERAGE` · 0.8 `MASTERY_STRONG`).
   **Không viết `score >= 0.8`** ở bất kỳ đâu trong màn này.

2. ⚠️ **`PlansPage.tsx` KHÔNG dùng `components/ui/tabs.tsx`.**
   Tab strip trạng thái là **hand-rolled** `role="tablist"` / `role="tab"` (`PlansPage.tsx:192-201`).
   ⇒ (a) **Đừng thay nó** bằng `Tabs` — ngoài phạm vi, và nó đang chạy đúng.
   (b) View switcher là **control khác nghĩa**, phải nhìn khác tab strip — nếu hai thứ trông giống nhau,
   người dùng sẽ tưởng `Lịch/Kế hoạch` cũng là bộ lọc trạng thái. Hai bộ lọc này **đã cố ý tách**:
   tab strip lọc _trạng thái kế hoạch_, dropdown lọc _kế hoạch nào hiện trên lịch_.

3. **`estimatedMinutes` không phải hằng số.** Payload thật có mục `3 phút` cạnh mục `19 phút`
   (`maxTurnsPerConcept` lấy từ phiên nguồn). ⇒ **Không vẽ thanh mật độ/`%` theo phút.**
   Số phút chỉ đáng tin ở mức "ngày này nặng hơn ngày kia" — **tương đối, không ngưỡng tuyệt đối**.

---

## 5. Không có trong hợp đồng API — đừng build

- **`foldedCount`** ("gộp N lần chấm") **không tồn tại** trong 16 trường của `items[]`. Đã gỡ khỏi mockup.
  Nếu thấy bản mockup cũ có dòng đó thì bỏ qua.
- **`isOverdue`** không có: suy bằng `dateKey < todayDateKey` (so chuỗi ISO).
