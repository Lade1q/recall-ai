# Mẫu Bug Report — AI Examiner

> **Module:** AI Examiner & Interview State Machine
> **Người viết:** AI Assistant
> **Ngày tạo:** 2026-08-06
> **Phiên bản:** Sprint 4

---

## BR-AI-EXAMINER-002: Lỗi API Idempotency chặn đứng cả 2 request thay vì 1

| Trường                  | Nội dung                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| **Mã Bug**              | BR-AI-EXAMINER-002                                                       |
| **Tiêu đề**             | Lỗi API Idempotency: Gửi 2 request cùng lúc trả về 409 Conflict cho cả 2 |
| **Module**              | Interview API (POST /answers)                                            |
| **Mức độ nghiêm trọng** | High                                                                     |
| **Độ ưu tiên**          | High                                                                     |
| **Trạng thái**          | New                                                                      |
| **Phát hiện ở**         | Sprint 4 (Script kiểm thử tự động Idempotency)                           |
| **Người báo cáo**       | AI Assistant                                                             |
| **Người được giao**     | @NMP039                                                                  |
| **Môi trường**          | Backend (API Server)                                                     |

### Mô tả

Cơ chế Idempotency đang hoạt động sai logic khi nhận nhiều request đồng thời. Thay vì xử lý (chấp nhận 200 OK) request đầu tiên và chặn request thứ hai (hoặc trả về cache), hệ thống lại từ chối cả 2 request với mã lỗi 409 Conflict. Kết quả là không có lượt (turn) nào được lưu vào Database, gây mất điểm hoặc kẹt state.

### Điều kiện tiên quyết

- Có một phiên Interview đang `active`.
- Lấy token hợp lệ của user sở hữu phiên.

### Các bước tái hiện

1. Chạy kịch bản tự động gọi API `POST /api/v1/interviews/:id/answers`.
2. Gửi 2 request giống hệt nhau (cùng `answerText` và cùng chuỗi `Idempotency-Key` trong Header) song song cùng 1 lúc (concurrent).
3. Quan sát HTTP Status và Database.

### Kết quả mong đợi

- 1 request trả về `200 OK` (lượt trả lời được lưu thành công vào DB).
- 1 request bị chặn (có thể trả về `409` hoặc `200` nhưng lấy từ Cache).

### Kết quả thực tế

- Cả 2 request đều trả về mã lỗi `409 Conflict`.
- Database không ghi nhận bất kỳ dòng dữ liệu nào (0 turns created).
