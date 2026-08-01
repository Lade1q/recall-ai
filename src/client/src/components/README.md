# Thư mục Components

Thư mục này chứa tất cả các thành phần giao diện (UI Components) tái sử dụng của ứng dụng.

## 📂 Cấu trúc thư mục con

- **`ui/`**: Chứa các component giao diện cơ bản, xuất phát từ **shadcn/ui** nhưng đã chỉnh lại theo
  **Design System v3 "Warm Editorial Minimalism"** (`docs/analysis and design/claude-design/components.html`
  là nguồn tham chiếu — mọi thay đổi giao diện của primitive nên đối chiếu lại file đó trước).
  Hạn chế sửa trực tiếp logic các file này trừ khi cần tùy biến sâu giao diện hệ thống.
- **`shared/`**: Chứa các component dùng chung do đội ngũ tự phát triển (ví dụ: `Header`, `Footer`, `Sidebar`, `LoadingSpinner`, v.v.) xuất hiện ở nhiều trang khác nhau.

### Danh mục `ui/` theo components.html

| Component                                                    | File               | Mục trong components.html                                 |
| ------------------------------------------------------------ | ------------------ | --------------------------------------------------------- |
| `Button`                                                     | `button.tsx`       | Buttons (default/secondary/outline/ghost, `loading` prop) |
| `Card`, `CardTitle`, ...                                     | `card.tsx`         | Card                                                      |
| `Input`                                                      | `input.tsx`        | Form controls                                             |
| `Field`, `FieldLabel`, `FieldError`, `FieldRequirement`, ... | `field.tsx`        | Form controls                                             |
| `Dialog`, `DialogContent`, ...                               | `dialog.tsx`       | Modal / Dialog                                            |
| `Badge`                                                      | `badge.tsx`        | Badges / Tags                                             |
| `ConceptNode`, `masteryBand()`                               | `concept-node.tsx` | Concept Graph Nodes                                       |
| `ChatBubble`                                                 | `chat-bubble.tsx`  | Chat Bubbles — AI Examiner                                |
| `Kbd`, `MetaMono`                                            | `kbd.tsx`          | Metadata / Keystroke                                      |
| `Heading`                                                    | `heading.tsx`      | Editorial heading                                         |
| `LockedValue`                                                | `locked-value.tsx` | Form controls — dòng chỉ-đọc (`.locked`)                  |
| `Spinner`                                                    | `spinner.tsx`      | Buttons — trạng thái Loading                              |

Quy ước áp dụng cho toàn bộ `ui/`: bo góc suy ra từ `--radius` (nút 0.8×, ô nhập 0.65×, thẻ 1.35×),
không dùng `rounded-full` ngoại trừ `Badge`, và mỗi accent ngữ nghĩa (`ai-accent`, `mastery-*`,
`remediate`) chỉ mang đúng một nghĩa cố định — xem thêm `docs/design-system.md`.
