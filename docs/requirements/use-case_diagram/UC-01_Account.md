# UC-01: Module Account Management

> **Module:** Account Management
> **Sprint:** 3 (tối giản)
> **DB liên quan:** `users`

---

## UC-01: Đăng ký tài khoản

| Trường                              | Nội dung                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| **Actor**                           | Student                                                   |
| **Mục tiêu**                        | Tạo tài khoản mới để sử dụng hệ thống                     |
| **Điều kiện tiên quyết**            | Người dùng chưa có tài khoản                              |
| **Điều kiện kết thúc (thành công)** | Tài khoản được tạo, người dùng được redirect về Dashboard |

### Luồng chính

1. Student truy cập trang Đăng ký
2. Nhập email và mật khẩu (+ xác nhận mật khẩu)
3. Hệ thống kiểm tra email chưa tồn tại trong DB
4. Hệ thống hash mật khẩu bằng bcrypt, lưu user vào DB
5. Hệ thống cấp JWT token, lưu vào client
6. Redirect về Dashboard

### Luồng thay thế

- **[A1] Đăng ký bằng Google OAuth — hoãn POST-MVP (đi cùng AM-06):**
  MVP chỉ đăng ký bằng email + mật khẩu ở luồng chính. Backend hiện chưa có route OAuth nào
  (`auth.routes.ts` chỉ có `/register`, `/login`, `/refresh`, `/me`) và cột `password_hash` là
  `NOT NULL`, nên **MVP không tạo tài khoản không mật khẩu**. Khi triển khai Google (POST-MVP):
  1. Student click "Đăng nhập bằng Google"
  2. Google OAuth trả về profile (email, name)
  3. Nếu email đã có tài khoản → liên kết theo email (silent merge, xem UC-Overview §5.6). Nếu chưa
     có → tạo tài khoản kèm **một mật khẩu ngẫu nhiên** để giữ ràng buộc `password_hash NOT NULL`;
     Student đặt lại mật khẩu qua AM-05 khi muốn đăng nhập bằng mật khẩu (AM-05 **cũng** là POST-MVP —
     xem `UC-Overview.md` §5.6 — nên hai hạng mục này về cùng một đợt, không có giai đoạn nào tài khoản
     Google tồn tại mà không có cách đặt lại mật khẩu). Cách này giữ nguyên lược đồ hiện tại — không
     cần cho `password_hash` nhận NULL.
  4. Redirect về Dashboard

### Luồng ngoại lệ

- **[E1] Email đã tồn tại:** Hệ thống hiển thị lỗi "Email này đã được đăng ký", giữ nguyên form, đề nghị đăng nhập
- **[E2] Mật khẩu không đạt yêu cầu** (ví dụ: < 8 ký tự): Hiển thị yêu cầu cụ thể, không gửi lên server
- **[E3] Hai trường mật khẩu không khớp:** Hiển thị lỗi inline, không submit
- **[E4] Lỗi server / timeout:** Hiển thị thông báo "Đã xảy ra lỗi, vui lòng thử lại"

---

## UC-02: Đăng nhập

| Trường                              | Nội dung                           |
| ----------------------------------- | ---------------------------------- |
| **Actor**                           | Student                            |
| **Mục tiêu**                        | Xác thực danh tính và vào hệ thống |
| **Điều kiện tiên quyết**            | Người dùng đã có tài khoản         |
| **Điều kiện kết thúc (thành công)** | Nhận JWT token, vào Dashboard      |

### Luồng chính

1. Student nhập email + mật khẩu
2. Hệ thống so khớp email trong DB
3. Hệ thống verify mật khẩu với bcrypt hash
4. Cấp JWT token (lưu vào localStorage/httpOnly cookie)
5. Redirect về Dashboard (hoặc trang đang truy cập trước đó)

### Luồng thay thế

- **[A1] Đăng nhập bằng Google OAuth — hoãn POST-MVP:** Tương tự AM-01 [A1]. Khi triển khai, email đã
  tồn tại thì liên kết theo email (silent merge); vì mọi tài khoản đều có mật khẩu, không phát sinh
  loại tài khoản "chỉ Google, không mật khẩu".

### Luồng ngoại lệ

- **[E1] Email không tồn tại hoặc mật khẩu sai:** Hiển thị lỗi chung "Email hoặc mật khẩu không đúng" (không phân biệt để bảo mật), giữ nguyên email đã nhập
- **[E2] Tài khoản bị khóa / chưa xác thực — hoãn POST-MVP** _(chốt 2026-08-11)_: MVP **không có
  đường nào chạm tới nhánh này**, nên đừng viết test case cho nó. Bảng `users` chỉ có
  `id/email/password_hash/name/pomodoro_config/created_at/updated_at` — không có `is_active`,
  `email_verified` hay `locked_until` — và `login()` trong `auth.service.ts` chỉ có đúng hai nhánh
  thất bại (không tìm thấy email; sai mật khẩu), cả hai trả cùng một lỗi 401 "Email or password
  incorrect". Để [E2] chạm được cần: (1) thêm cột trạng thái tài khoản vào `users`, (2) một nhánh lỗi
  riêng trong `login()` với mã lỗi khác 401 chung, (3) quy trình đặt trạng thái đó (xác thực email
  hoặc khóa sau N lần sai). Giữ lại mục này để không mất dấu thiết kế, **không** phải để implement ở MVP.
- **[E3] Lỗi server:** Hiển thị thông báo lỗi chung

---

## UC-03: Quản lý hồ sơ cá nhân

| Trường                   | Nội dung                           |
| ------------------------ | ---------------------------------- |
| **Actor**                | Student                            |
| **Mục tiêu**             | Xem và chỉnh sửa thông tin cá nhân |
| **Điều kiện tiên quyết** | Student đã đăng nhập               |

### Luồng chính

1. Student vào trang "Hồ sơ cá nhân"
2. Xem thông tin hiện tại (tên, email)
3. (Tùy chọn) Nhập mật khẩu cũ → mật khẩu mới → xác nhận → lưu

### Luồng ngoại lệ

- **[E1] Mật khẩu cũ nhập sai:** Từ chối cập nhật, hiển thị lỗi
- **[E2] Mật khẩu mới không đạt yêu cầu:** Hiển thị yêu cầu, không lưu

> **Ghi chú — mọi tài khoản đều có mật khẩu.** Vì Google OAuth được hoãn POST-MVP (AM-01 [A1]) và
> `password_hash` là `NOT NULL`, mọi tài khoản trong MVP đều có mật khẩu. Trang Hồ sơ vì thế **luôn**
> hiển thị "Đổi mật khẩu" (kèm ô mật khẩu hiện tại) — không có nhánh "Đặt mật khẩu" cho tài khoản
> không mật khẩu, và bảng `users` không cần cột `provider`/`google_id` trong MVP. Nhờ vậy AM-05 (đặt
> lại mật khẩu) chỉ đổi một mật khẩu sẵn có, không âm thầm biến tài khoản OAuth thành tài khoản mật
> khẩu. Chỉ báo "đã liên kết Google" trên hồ sơ thuộc AM-06 (POST-MVP); khi làm, nó chỉ thêm một dòng
> thông tin và không đổi hình dạng phần mật khẩu.

---

## UC-04: Đăng xuất

| Trường                   | Nội dung                |
| ------------------------ | ----------------------- |
| **Actor**                | Student                 |
| **Mục tiêu**             | Kết thúc phiên làm việc |
| **Điều kiện tiên quyết** | Student đang đăng nhập  |

### Luồng chính

1. Student click "Đăng xuất"
2. Hệ thống xóa JWT token ở client
3. Redirect về Landing Page / trang Đăng nhập
