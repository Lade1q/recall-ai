# Báo cáo lỗi — AI Planning

> **Module:** AI Planning  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 02/08/2026  
> **Phiên bản:** 1.0

---

## B006: Upload tệp đúng 10 MB bị từ chối

| Trường                    | Nội dung                                           |
| ------------------------- | -------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B006                                               |
| **Tiêu đề (Title)**       | API tạo Plan từ chối file có kích thước đúng 10 MB |
| **Module / Function ID**  | AI Planning — `POST /api/v1/plans` / upload file   |
| **Mức độ (Severity)**     | Medium                                             |
| **Độ ưu tiên (Priority)** | Medium                                             |
| **Trạng thái (Status)**   | Closed                                             |
| **Ngày báo cáo (Date)**   | 02/08/2026                                         |
| **Phát hiện ở**           | Sprint 4                                           |
| **Người báo cáo**         | Nguyễn Minh Phát                                   |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)   |

### Mô tả

Ràng buộc dung lượng upload xử lý sai giá trị biên: file có kích thước chính xác 10 MiB bị từ chối, dù giới hạn 10 MB phải bao gồm giá trị `<= 10 MB`.

### Điều kiện tiên quyết

- Backend có thể nhận yêu cầu tạo Plan tại `POST /api/v1/plans`.
- Có file PDF hợp lệ kích thước chính xác `10 * 1024 * 1024` bytes.

### Các bước tái hiện

1. Gửi yêu cầu `POST /api/v1/plans` để tạo Plan mới với dữ liệu hợp lệ.
2. Đính kèm file PDF có kích thước đúng `10 * 1024 * 1024` bytes.
3. Kiểm tra mã trạng thái phản hồi.

### Kết quả mong đợi

API chấp nhận file ở đúng mốc giới hạn và trả HTTP 201 Created.

### Kết quả thực tế

API từ chối yêu cầu và trả HTTP 400 Bad Request.

### Tài liệu đính kèm

- [GitHub issue #195](https://github.com/Lade1q/planning-ai/issues/195).
- [Tệp mẫu `exactly_10mb.pdf`](https://github.com/user-attachments/files/30626640/exactly_10mb.pdf).

### Ghi chú

- Cần kiểm tra điều kiện giới hạn dung lượng theo hướng inclusive (`size <= 10 * 1024 * 1024`) thay vì loại cả giá trị bằng 10 MiB.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title               | Defect Description                             | Function ID          | Severity | Reported By      | Date Reported | Status | Comment                      |
| --------- | -------------------------- | ---------------------------------------------- | -------------------- | -------- | ---------------- | ------------- | ------ | ---------------------------- |
| B006      | File đúng 10 MB bị từ chối | Boundary 10 MiB trả 400 thay vì được chấp nhận | `POST /api/v1/plans` | Medium   | Nguyễn Minh Phát | 2026-08-02    | Closed | Có tệp mẫu; nguồn issue #195 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
