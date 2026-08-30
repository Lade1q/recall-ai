# UI Prototype — RecallAI (PA4 · mục b)

> **Hạn nộp:** 14/08/2026 · **Issue:** #253 · **Rubric:** _"Revise UI prototype — submit the final UI design chosen for the system."_

Thư mục này chứa bản **thiết kế UI cuối cùng** của hệ thống RecallAI, bao gồm toàn bộ 11 màn hình tương tác.

---

## 1. Interactive Prototype

Tất cả các màn hình được build thành **prototype có thể click qua được**. Mở trực tiếp bằng trình duyệt (cần server cục bộ hoặc Live Server extension):

### Cách chạy

Từ thư mục gốc của repo, chạy lệnh sau rồi mở trình duyệt:

    python -m http.server 8080

Hoặc dùng VS Code → **Live Server** (chuột phải file → Open with Live Server).

URL mẫu: `http://localhost:8080/docs/analysis%20and%20design/ui-prototype/screen-interview.html`

### Tính năng của các prototype trọng điểm (Sprint 4)

**screen-interview.html — AI Examiner**

- State machine 6 trạng thái: asking → loading → graded → paused → fallback → done
- Đồng hồ đếm thời gian phiên (real-time)
- Rail trái: hàng đợi khái niệm + turn tracker với trọng số
- Submit bằng nút hoặc Ctrl+Enter
- AI không phản hồi → fallback sang flashcard tự chấm (AE-05)
- Tạm dừng → overlay 3 lựa chọn: Tiếp tục / Kết thúc / Về Dashboard
- Thanh **State** ở góc dưới-phải để nhảy thẳng vào trạng thái bất kỳ khi demo

**screen-focus-session.html — Focus Session**

- State machine 6 trạng thái: config → running → paused → break → done → cancel
- Form cấu hình Pomodoro (work / short break / long break / cycles) trước khi bắt đầu
- Countdown timer thật với vòng SVG tiến độ và Pomodoro pip meter
- Panel ghi chú nhanh (FS-05) — float bên phải, phím tắt N
- Phím tắt: Space = tạm dừng/tiếp tục, N = mở ghi chú, Esc = đóng panel
- Hết Pomodoro → tự chuyển sang break → tự chuyển sang Pomodoro tiếp
- Kết thúc → link sang screen-interview.html

**screen-session-result.html — Session Result**

- Hiển thị kết quả phiên: traceback khái niệm (AE-08) + nhận xét tổng hợp AI (AE-09)
- Biến thể A/B: có/không có traceback (toggle ở góc)
- **Không** phải screen-history.html (lịch sử DB-03) — đây là màn kết quả ngay sau phiên

---

## Cấu trúc thư mục

    ui-prototype/
    ├── README.md                    ← file này
    ├── tokens.css                   ← design tokens (màu, font, spacing…)
    ├── screen-*.html                ← 11 màn hình chính của hệ thống
    └── components.html              ← thư viện component

---

## Ghi chú kỹ thuật

- **CSS tokens:** tất cả các prototype đều link tới `tokens.css` cùng thư mục — không có inline style ad-hoc
- **No framework:** thuần HTML + Vanilla JS + CSS — không cần build step, không cần npm
- **Print-safe:** thanh State (proto-bar) ẩn khi in qua @media print
