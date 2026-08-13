# Báo cáo lỗi — Concept Detail

> **Module:** Concept Graph / Concept Detail Sidebar  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-08-08  
> **Phiên bản:** 1.0

---

## B013: Sidebar chi tiết khái niệm hiển thị tên biến thô

| Trường                    | Nội dung                                                                 |
| ------------------------- | ------------------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B013                                                                     |
| **Tiêu đề (Title)**       | Sidebar chi tiết khái niệm hiển thị tên biến thô thay vì nhãn thân thiện |
| **Module / Function ID**  | Concept Detail Sidebar                                                   |
| **Mức độ (Severity)**     | Low                                                                      |
| **Độ ưu tiên (Priority)** | Low                                                                      |
| **Trạng thái (Status)**   | Closed                                                                   |
| **Ngày báo cáo (Date)**   | 2026-08-08                                                               |
| **Phát hiện ở**           | Sprint 4                                                                 |
| **Người báo cáo**         | Nguyễn Minh Phát                                                         |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                |

### Mô tả

Thanh bên chi tiết Khái niệm hiển thị tên biến nội bộ thay vì nhãn dành cho người dùng, làm giao diện không nhất quán với node trên biểu đồ.

### Điều kiện tiên quyết

Có kế hoạch chứa khái niệm đã có dữ liệu `last_tested_at` hoặc `mastery_score` và người dùng có thể mở phần chi tiết của khái niệm.

### Các bước tái hiện

1. Mở đồ thị khái niệm của một kế hoạch.
2. Chọn một khái niệm để mở thanh bên chi tiết.
3. Quan sát các nhãn thông tin về lần kiểm tra gần nhất và điểm thành thạo.

### Kết quả mong đợi

Giao diện hiển thị nhãn đã định dạng: `Kiểm tra lần cuối` và `Mastery score`.

### Kết quả thực tế

Sidebar hiển thị tên biến thô `last_tested_at` và `mastery_score`.

### Tài liệu đính kèm

- [GitHub issue #286](https://github.com/Lade1q/planning-ai/issues/286)
- [Ảnh chụp màn hình trong issue](https://github.com/user-attachments/assets/af347c76-9b9d-4319-ab5d-106ca42ed90a)

### Ghi chú

Issue mô tả đây là hai lỗi UI nhỏ về tính nhất quán tên hiển thị; trạng thái hiện tại trên GitHub là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                  | Defect Description                                                     | Function ID            | Severity | Reported By      | Date Reported | Status | Comment                            |
| --------- | ----------------------------- | ---------------------------------------------------------------------- | ---------------------- | -------- | ---------------- | ------------- | ------ | ---------------------------------- |
| B013      | Sidebar hiển thị tên biến thô | `last_tested_at` và `mastery_score` xuất hiện thay cho nhãn thân thiện | Concept Detail Sidebar | Low      | Nguyễn Minh Phát | 2026-08-08    | Closed | Lỗi giao diện, đã đóng trên GitHub |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
