# Báo cáo lỗi — Authentication

> **Module:** Authentication  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-07-25  
> **Phiên bản:** 1.0

---

## B002: Đăng nhập bị treo khi nhập sai mật khẩu

| Trường                    | Nội dung                                                  |
| ------------------------- | --------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B002                                                      |
| **Tiêu đề (Title)**       | Màn hình đăng nhập treo khi API trả sai mật khẩu          |
| **Module / Function ID**  | Authentication — `LoginPage` / Sign In                    |
| **Mức độ (Severity)**     | Medium                                                    |
| **Độ ưu tiên (Priority)** | Medium                                                    |
| **Trạng thái (Status)**   | Closed                                                    |
| **Ngày báo cáo (Date)**   | 2026-07-25                                                |
| **Phát hiện ở**           | Sprint 3                                                  |
| **Người báo cáo**         | Nguyễn Minh Phát                                          |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64) |

### Mô tả

Trong lần kiểm thử ban đầu, trạng thái tải ở biểu mẫu đăng nhập không kết thúc sau khi nhập sai mật khẩu, khiến người dùng không nhận được phản hồi lỗi rõ ràng.

### Điều kiện tiên quyết

- Frontend và backend cùng đang chạy.
- Có một tài khoản đã được tạo trên cùng môi trường chạy backend, ví dụ `testuser01@example.com`.

### Các bước tái hiện

1. Mở `http://localhost:5173/login`.
2. Nhập email của tài khoản đã tồn tại, ví dụ `testuser01@example.com`.
3. Nhập mật khẩu sai, ví dụ `WrongPassword999!`.
4. Nhấn **Sign In** và quan sát biểu mẫu.

### Kết quả mong đợi

Ứng dụng dừng trạng thái tải, xử lý phản hồi 401 Unauthorized và hiển thị thông báo sai mật khẩu để người dùng có thể thử lại.

### Kết quả thực tế

Biểu mẫu đăng nhập bị treo ở trạng thái tải sau khi gửi mật khẩu sai.

### Tài liệu đính kèm

- [GitHub issue #134](https://github.com/Lade1q/planning-ai/issues/134) — có ảnh chụp màn hình lỗi ban đầu.

### Ghi chú

- Issue nhận định khối `try...catch...finally` có thể chưa reset `setIsLoading(false)` hoặc chưa hiển thị lỗi trong nhánh 401.
- Khi kiểm tra lại, bug không tái hiện được; issue được đóng sau khi tác giả xác nhận lần test lại đã pass. Cần chạy cả server và client với tài khoản tồn tại ở đúng môi trường để tái hiện đáng tin cậy.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                    | Defect Description                                     | Function ID           | Severity | Reported By      | Date Reported | Status | Comment                                     |
| --------- | ------------------------------- | ------------------------------------------------------ | --------------------- | -------- | ---------------- | ------------- | ------ | ------------------------------------------- |
| B002      | Đăng nhập treo khi sai mật khẩu | Loading không kết thúc sau phản hồi đăng nhập thất bại | `LoginPage` / Sign In | Medium   | Nguyễn Minh Phát | 2026-07-25    | Closed | Không tái hiện khi retest; nguồn issue #134 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
