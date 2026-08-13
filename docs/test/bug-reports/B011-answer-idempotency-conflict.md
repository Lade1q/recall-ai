# Báo cáo lỗi — AI Examiner

> **Module:** AI Examiner — Gửi câu trả lời  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-08-06  
> **Phiên bản:** 1.0

---

## B011: Idempotency chặn cả hai request trả lời đồng thời

| Trường                    | Nội dung                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B011                                                              |
| **Tiêu đề (Title)**       | API Idempotency chặn cả hai request thay vì chỉ request trùng lặp |
| **Module / Function ID**  | AI Examiner — `POST /api/v1/interviews/:id/answers`               |
| **Mức độ (Severity)**     | High                                                              |
| **Độ ưu tiên (Priority)** | High                                                              |
| **Trạng thái (Status)**   | Closed                                                            |
| **Ngày báo cáo (Date)**   | 2026-08-06                                                        |
| **Phát hiện ở**           | Sprint 4                                                          |
| **Người báo cáo**         | Nguyễn Minh Phát                                                  |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                  |

### Mô tả

Cơ chế idempotency xử lý sai hai request trả lời giống nhau gửi đồng thời: cả hai đều bị từ chối `409 Conflict`, không có lượt trả lời nào được lưu.

### Điều kiện tiên quyết

- Có phiên Interview đang `active`.
- Có token hợp lệ của người dùng sở hữu phiên.

### Các bước tái hiện

1. Chuẩn bị request `POST /api/v1/interviews/:id/answers` với `answerText` và header `Idempotency-Key`.
2. Gửi đồng thời hai request giống hệt nhau.
3. Kiểm tra HTTP status của từng request và dữ liệu turn trong cơ sở dữ liệu.

### Kết quả mong đợi

Request đầu tiên được xử lý thành công (`200 OK`) và lưu một turn. Request trùng lặp còn lại bị chặn bằng `409 Conflict` hoặc nhận `200 OK` từ kết quả đã lưu trong cache.

### Kết quả thực tế

Cả hai request đều trả về `409 Conflict`; cơ sở dữ liệu không có turn nào được tạo, có thể làm mất lần trả lời hoặc khiến phiên bị kẹt trạng thái.

### Tài liệu đính kèm

- [GitHub issue #268](https://github.com/Lade1q/planning-ai/issues/268)
- [Tham chiếu issue #120](https://github.com/Lade1q/planning-ai/issues/120#issuecomment-5195586750)

### Ghi chú

Đây là lỗi cạnh tranh khi request đồng thời dùng cùng khóa idempotency; cần bảo đảm một request thắng được phép hoàn tất trước khi xử lý request trùng lặp.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                    | Defect Description                                 | Function ID              | Severity | Reported By      | Date Reported | Status | Comment                                                        |
| --------- | ------------------------------- | -------------------------------------------------- | ------------------------ | -------- | ---------------- | ------------- | ------ | -------------------------------------------------------------- |
| B011      | Idempotency chặn cả hai request | Hai request đồng thời đều lỗi 409, không tạo turn. | AI Examiner — Answer API | High     | Nguyễn Minh Phát | 2026-08-06    | Closed | [Issue #268](https://github.com/Lade1q/planning-ai/issues/268) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
