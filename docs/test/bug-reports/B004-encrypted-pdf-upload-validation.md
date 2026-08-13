# Báo cáo lỗi — AI Planning

> **Module:** AI Planning  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 2026-08-01  
> **Phiên bản:** 1.0

---

## B004: PDF mã hóa không bị chặn trước khi phân tích

| Trường                    | Nội dung                                                     |
| ------------------------- | ------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B004                                                         |
| **Tiêu đề (Title)**       | Upload chấp nhận PDF mã hóa nhưng Gemini không thể phân tích |
| **Module / Function ID**  | AI Planning — `upload.middleware.ts` / tạo Plan              |
| **Mức độ (Severity)**     | Medium                                                       |
| **Độ ưu tiên (Priority)** | Low                                                          |
| **Trạng thái (Status)**   | Closed                                                       |
| **Ngày báo cáo (Date)**   | 2026-08-01                                                   |
| **Phát hiện ở**           | Sprint 4                                                     |
| **Người báo cáo**         | Nguyễn Thế Quân                                              |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64)    |

### Mô tả

Upload middleware chỉ kiểm tra MIME type và dung lượng, nên cho qua PDF có `/Encrypt`. Tệp vẫn mở được bằng trình đọc PDF nhưng Gemini File API không đọc được trang nào, làm job phân tích retry vô ích trước khi thất bại.

### Điều kiện tiên quyết

- Luồng tạo Plan và dịch vụ Gemini được cấu hình.
- Có PDF hợp lệ về MIME/dung lượng nhưng bị mã hóa, chứa `/Encrypt` (ca kiểm thử là PDF 76 trang).

### Các bước tái hiện

1. Tạo Plan mới và tải lên PDF bị mã hóa.
2. Hoàn tất gửi yêu cầu tạo Plan.
3. Theo dõi việc tạo `AnalysisJob` và kết quả phân tích.

### Kết quả mong đợi

Hệ thống phát hiện PDF không đọc được ngay khi upload, trả HTTP 400 với thông báo rõ ràng, và không tạo `AnalysisJob`.

### Kết quả thực tế

Tệp được chấp nhận. Gemini trả `400 The document has no pages.`; `AnalysisJob` chạy đủ ba lần `MAX_ATTEMPTS` (khoảng 20 giây, tốn ba lần gọi Gemini) rồi thất bại.

### Tài liệu đính kèm

- [GitHub issue #184](https://github.com/Lade1q/planning-ai/issues/184).

### Ghi chú

- Cần kiểm tra nhẹ khả năng đọc/mã hóa PDF tại `upload.middleware.ts` hoặc trước khi tạo `AnalysisJob`.
- Liên quan issue #183 và #75.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                   | Defect Description                                                | Function ID            | Severity | Reported By     | Date Reported | Status | Comment                               |
| --------- | ------------------------------ | ----------------------------------------------------------------- | ---------------------- | -------- | --------------- | ------------- | ------ | ------------------------------------- |
| B004      | PDF mã hóa không được validate | Tệp qua upload nhưng Gemini không đọc được, retry ba lần rồi fail | `upload.middleware.ts` | Medium   | Nguyễn Thế Quân | 2026-08-01    | Closed | Liên quan #183, #75; nguồn issue #184 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
