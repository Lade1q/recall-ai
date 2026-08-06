# Mẫu Bug Report — AI Examiner

> **Module:** AI Examiner & Interview State Machine
> **Người viết:** AI Assistant
> **Ngày tạo:** 2026-08-06
> **Phiên bản:** Sprint 4

---

## BR-AI-EXAMINER-003: Giao diện kẹt (Mất ô nhập chat) khi kết thúc một khái niệm

| Trường                  | Nội dung                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Mã Bug**              | BR-AI-EXAMINER-003                                                                   |
| **Tiêu đề**             | Giao diện mất ô nhập chat / không có nút điều hướng sau khi hoàn thành một khái niệm |
| **Module**              | UI/UX Front-end (Màn hình Interview)                                                 |
| **Mức độ nghiêm trọng** | Medium                                                                               |
| **Độ ưu tiên**          | Medium                                                                               |
| **Trạng thái**          | New                                                                                  |
| **Phát hiện ở**         | Sprint 4 (Kiểm thử Kịch bản CF-01)                                                   |
| **Người báo cáo**       | AI Assistant                                                                         |
| **Người được giao**     | @NMP039                                                                              |
| **Môi trường**          | Client Front-end                                                                     |

### Mô tả

Khi người dùng hoàn thành xuất sắc 3 lượt hỏi (hoặc đạt đủ điều kiện để hệ thống ghi nhận khái niệm đó đã học xong), State Machine chuyển trạng thái thành công, nhưng giao diện Client không chịu render ra "Ô nhập chat" hoặc "Nút chuyển khái niệm tiếp theo". Người dùng bị mắc kẹt trên màn hình và không biết làm thế nào để đi tiếp.

### Điều kiện tiên quyết

- Đang học một khái niệm trong giao diện Chat.

### Các bước tái hiện

1. Trả lời đúng (đạt verdict `deep`) liên tục cho 3 câu hỏi của một khái niệm.
2. Đợi hệ thống phản hồi xong câu thứ 3.
3. Quan sát giao diện phần dưới đáy màn hình.

### Kết quả mong đợi

- Giao diện phải thông báo "Hoàn thành bài học" và hiển thị Nút "Sang bài tiếp theo" (Next Concept), hoặc tự động load câu hỏi đầu tiên của bài mới và hiện ô chat để trả lời.

### Kết quả thực tế

Giao diện mất luôn ô chat, không có thành phần nào để người dùng bấm tương tác chuyển bài, phải thực hiện tải lại trang mới thoát khỏi tình trạng này.
