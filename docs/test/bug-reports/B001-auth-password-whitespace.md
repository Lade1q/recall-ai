# Báo cáo lỗi — Authentication

> **Module:** Authentication  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-07-25  
> **Phiên bản:** 1.0

---

## B001: Đăng ký chấp nhận mật khẩu chỉ có khoảng trắng

| Trường                    | Nội dung                                                  |
| ------------------------- | --------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B001                                                      |
| **Tiêu đề (Title)**       | API đăng ký cho phép mật khẩu chỉ gồm dấu cách            |
| **Module / Function ID**  | Authentication — `POST /api/v1/auth/register`             |
| **Mức độ (Severity)**     | High                                                      |
| **Độ ưu tiên (Priority)** | High                                                      |
| **Trạng thái (Status)**   | Closed                                                    |
| **Ngày báo cáo (Date)**   | 2026-07-25                                                |
| **Phát hiện ở**           | Sprint 3                                                  |
| **Người báo cáo**         | Nguyễn Minh Phát                                          |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64) |

### Mô tả

API đăng ký chấp nhận mật khẩu gồm tám ký tự khoảng trắng và vẫn tạo tài khoản thành công, làm suy giảm yêu cầu về độ mạnh mật khẩu.

### Điều kiện tiên quyết

- Backend đang chạy và truy cập được endpoint đăng ký.
- Có email chưa được đăng ký, ví dụ `whitespace_pass@example.com`.

### Các bước tái hiện

1. Gửi yêu cầu `POST /api/v1/auth/register` với `Content-Type: application/json`.
2. Dùng payload có `email` là `whitespace_pass@example.com`, `password` là tám dấu cách và `name` là `Test User`.
3. Kiểm tra mã trạng thái và tài khoản được tạo.

### Kết quả mong đợi

Server từ chối yêu cầu bằng HTTP 400 và thông báo mật khẩu không được để trống hoặc chỉ gồm khoảng trắng.

### Kết quả thực tế

Server trả HTTP 201 Created và tạo người dùng có mật khẩu chỉ gồm khoảng trắng.

### Tài liệu đính kèm

- [GitHub issue #101](https://github.com/Lade1q/planning-ai/issues/101) — có ảnh kết quả kiểm thử Postman.

### Ghi chú

- Test case nguồn: `TC-AM-01-08`.
- Nguyên nhân được nêu trong issue: kiểm tra `min(8)` của Zod có thể thiếu `.trim()` hoặc quy tắc chặn chuỗi toàn khoảng trắng.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                          | Defect Description                                 | Function ID                  | Severity | Reported By      | Date Reported | Status | Comment                       |
| --------- | ------------------------------------- | -------------------------------------------------- | ---------------------------- | -------- | ---------------- | ------------- | ------ | ----------------------------- |
| B001      | Mật khẩu toàn dấu cách được chấp nhận | API tạo tài khoản dù mật khẩu chỉ gồm khoảng trắng | `POST /api/v1/auth/register` | High     | Nguyễn Minh Phát | 2026-07-25    | Closed | TC-AM-01-08; nguồn issue #101 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
