# Báo cáo lỗi — AI Examiner

> **Module:** AI Examiner — State Machine  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-08-06  
> **Phiên bản:** 1.0

---

## B010: Không kích hoạt Traceback hoặc Spaced Repetition khi trả lời sai hoàn toàn

| Trường                    | Nội dung                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B010                                                              |
| **Tiêu đề (Title)**       | State Machine không Traceback / Spaced Repetition khi trả lời sai |
| **Module / Function ID**  | AI Examiner — CF-03 và CF-04                                      |
| **Mức độ (Severity)**     | High                                                              |
| **Độ ưu tiên (Priority)** | High                                                              |
| **Trạng thái (Status)**   | Closed                                                            |
| **Ngày báo cáo (Date)**   | 2026-08-06                                                        |
| **Phát hiện ở**           | Sprint 4                                                          |
| **Người báo cáo**         | Nguyễn Minh Phát                                                  |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64)         |

### Mô tả

Khi sinh viên trả lời sai hoàn toàn (`0.00`, verdict `wrong`), State Machine vẫn hỏi câu tiếp theo của cùng khái niệm thay vì chuyển theo luồng Traceback hoặc Spaced Repetition.

### Điều kiện tiên quyết

- Có phiên AI Examiner đang `active` và đang kiểm tra một khái niệm.
- Chuẩn bị khái niệm có tiên quyết hoặc không có tiên quyết để kiểm tra hai nhánh điều hướng.

### Các bước tái hiện

1. Bắt đầu phiên vấn đáp với một khái niệm, ví dụ `Binary Search` hoặc `Search Algorithms`.
2. Trả lời sai hoàn toàn cho câu hỏi đầu tiên, ví dụ “Tôi không biết”.
3. Gửi câu trả lời và quan sát câu hỏi tiếp theo.

### Kết quả mong đợi

Khái niệm hiện tại phải dừng ngay. Nếu có khái niệm tiên quyết, hệ thống bắt đầu hỏi khái niệm tiên quyết (Traceback); nếu không có, hệ thống cất khái niệm hiện tại và chuyển sang khái niệm khác theo Spaced Repetition.

### Kết quả thực tế

Hệ thống tiếp tục trả câu hỏi thứ hai của chính khái niệm đã bị trả lời sai; cả kịch bản CF-03 và CF-04 đều cho cùng kết quả này.

### Tài liệu đính kèm

- [GitHub issue #267](https://github.com/Lade1q/planning-ai/issues/267)
- [Tham chiếu issue #120](https://github.com/Lade1q/planning-ai/issues/120#issuecomment-5195586750)

### Ghi chú

Lỗi làm sai luồng sư phạm và có thể khiến người dùng bị kẹt ở khái niệm đang không nắm được.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                                      | Defect Description                                   | Function ID               | Severity | Reported By      | Date Reported | Status | Comment                                                        |
| --------- | ------------------------------------------------- | ---------------------------------------------------- | ------------------------- | -------- | ---------------- | ------------- | ------ | -------------------------------------------------------------- |
| B010      | Không Traceback/Spaced Repetition khi trả lời sai | Câu hỏi tiếp theo vẫn thuộc khái niệm sai hoàn toàn. | AI Examiner — CF-03/CF-04 | High     | Nguyễn Minh Phát | 2026-08-06    | Closed | [Issue #267](https://github.com/Lade1q/planning-ai/issues/267) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
