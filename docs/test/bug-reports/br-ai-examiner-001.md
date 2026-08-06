# Mẫu Bug Report — AI Examiner

> **Module:** AI Examiner & Interview State Machine
> **Người viết:** AI Assistant
> **Ngày tạo:** 2026-08-06
> **Phiên bản:** Sprint 4

---

## BR-AI-EXAMINER-001: Lỗi State Machine không Traceback / Spaced Repetition khi trả lời sai

| Trường                  | Nội dung                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| **Mã Bug**              | BR-AI-EXAMINER-001                                                                         |
| **Tiêu đề**             | State Machine không chuyển sang khái niệm Tiên quyết / Khác khi user trả lời sai hoàn toàn |
| **Module**              | AI Examiner (Backend Service / State Machine)                                              |
| **Mức độ nghiêm trọng** | High                                                                                       |
| **Độ ưu tiên**          | High                                                                                       |
| **Trạng thái**          | New                                                                                        |
| **Phát hiện ở**         | Sprint 4 (Kiểm thử Kịch bản CF-03 & CF-04)                                                 |
| **Người báo cáo**       | AI Assistant                                                                               |
| **Người được giao**     | @NMP039                                                                                    |
| **Môi trường**          | Development (Node.js) / Trình duyệt Chrome                                                 |

### Mô tả

Khi sinh viên trả lời sai hoàn toàn (nhận điểm 0.00 / verdict: `wrong`) cho một khái niệm, hệ thống tiếp tục hỏi câu tiếp theo của chính khái niệm đó thay vì kích hoạt luồng Traceback (nếu có khái niệm tiên quyết) hoặc Spaced Repetition (nếu không có tiên quyết). Lỗi này khiến người dùng bị kẹt mãi ở một khái niệm thay vì được điều hướng phù hợp theo kịch bản sư phạm.

### Điều kiện tiên quyết

- Đang kiểm tra một khái niệm trong phiên AI Examiner.

### Các bước tái hiện

1. Bắt đầu phiên vấn đáp bằng cách chọn một khái niệm (VD: `Binary Search` hoặc `Search Algorithms`).
2. Ở câu hỏi đầu tiên, nhập câu trả lời sai hoàn toàn (VD: "Tôi không biết" hoặc "Sai").
3. Gửi câu trả lời và xem câu hỏi tiếp theo được trả về.

### Kết quả mong đợi

- Concept hiện tại phải dừng ngay lập tức.
- Nếu có bài tiên quyết: Bắt đầu hỏi về bài tiên quyết (Traceback).
- Nếu không có bài tiên quyết: Cất bài hiện tại đi và chuyển sang bài khác (Spaced Repetition).

### Kết quả thực tế

Hệ thống không đổi bài mà vẫn tiếp tục nhả câu hỏi thứ 2 của chính khái niệm đang bị sai đó. (Kịch bản CF-03 và CF-04 đều gặp chung kết quả này).

### Tài liệu đính kèm

(Xem Execution Log file `ai_examiner_test_execution_log.md` phần CF-03 & CF-04).
