# Báo cáo lỗi — Document Upload

> **Module:** Upload tài liệu / Document  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 09/08/2026  
> **Phiên bản:** 1.0

---

## B016: Tên tệp tiếng Việt bị lỗi mã hóa khi upload

| Trường                    | Nội dung                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B016                                                                 |
| **Tiêu đề (Title)**       | Tên tệp upload tiếng Việt bị mojibake ngay khi lưu vào cơ sở dữ liệu |
| **Module / Function ID**  | Document Upload / `upload.middleware.ts`                             |
| **Mức độ (Severity)**     | Medium                                                               |
| **Độ ưu tiên (Priority)** | Medium                                                               |
| **Trạng thái (Status)**   | Closed                                                               |
| **Ngày báo cáo (Date)**   | 09/08/2026                                                           |
| **Phát hiện ở**           | Sprint 4                                                             |
| **Người báo cáo**         | Nguyễn Thế Quân                                                      |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                     |

### Mô tả

Multer/busboy giải mã `file.originalname` theo latin1 thay vì UTF-8. Tên tệp hỏng được lưu trực tiếp vào `Document.filename`, nên đây là lỗi dữ liệu từ tầng upload, không chỉ là lỗi hiển thị.

### Điều kiện tiên quyết

Có quyền upload tài liệu vào kế hoạch và có một tệp có tên chứa ký tự tiếng Việt, ví dụ `ngăn-xếp.txt`.

### Các bước tái hiện

1. Mở chức năng upload tài liệu của một kế hoạch.
2. Chọn tệp có tên `ngăn-xếp.txt` và hoàn tất upload.
3. Kiểm tra tên tài liệu trong ứng dụng hoặc giá trị `Document.filename` được lưu.

### Kết quả mong đợi

Tên tệp được lưu và hiển thị đúng UTF-8 là `ngăn-xếp.txt`.

### Kết quả thực tế

Tên tệp bị mojibake, ví dụ `ngăn-xếp.txt` trở thành `ngÄn-xáº¿p.txt`, và giá trị lỗi tiếp tục xuất hiện ở panel nguồn hoặc header tải xuống.

### Tài liệu đính kèm

- [GitHub issue #294](https://github.com/Lade1q/planning-ai/issues/294)

### Ghi chú

Nguyên nhân được nêu là thiếu `defParamCharset: 'utf8'` trong cấu hình Multer. Bản sửa cần bảo đảm dữ liệu mới đúng UTF-8; dữ liệu cũ đã hỏng cần được quyết định giữ nguyên hoặc migration riêng. Trạng thái GitHub hiện là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                | Defect Description                                     | Function ID     | Severity | Reported By     | Date Reported | Status | Comment                         |
| --------- | --------------------------- | ------------------------------------------------------ | --------------- | -------- | --------------- | ------------- | ------ | ------------------------------- |
| B016      | Mojibake tên tệp tiếng Việt | `originalname` bị giải mã latin1 và persist sai vào DB | Document Upload | Medium   | Nguyễn Thế Quân | 2026-08-09    | Closed | Cần xử lý riêng dữ liệu đã hỏng |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
