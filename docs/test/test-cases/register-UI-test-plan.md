# TÍNH NĂNG ĐĂNG KÝ (REGISTER)

#### 1.1. Register thành công (Happy Path)

- **Mục tiêu:** Kiểm tra đăng ký tài khoản mới hợp lệ.
- **Dữ liệu test (Test Data):**
  - `Full Name`: `Nguyen Van A` _(đủ $\ge$ 2 ký tự)_
  - `Email`: `testuser01@example.com` _(email mới chưa từng đăng ký)_
  - `Password`: `Password123!` _(đủ $\ge$ 8 ký tự)_
  - `Confirm Password`: `Password123!` _(khớp với Password)_
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng ký (Register)**.
- **Kết quả mong đợi:**
  - Đăng ký thành công, hiển thị thông báo thành công (Toast/Notification).
  - Hệ thống tự động chuyển hướng người dùng sang trang **Dashboard** (hoặc trang Đăng nhập).
- **Kết quả thực tế:** Đăng ký thành công, hệ thống tự động chuyển hướng sang trang Dashboard (`/dashboard`).
- **Trạng thái:** **PASS**

---

#### 1.2. Register thất bại — Email đã tồn tại (Duplicate Email)

- **Mục tiêu:** Kiểm tra hệ thống chặn đăng ký email đã có trong hệ thống.
- **Dữ liệu test (Test Data):**
  - `Full Name`: `Nguyen Van B`
  - `Email`: `testuser01@example.com` _(dùng lại email đã đăng ký ở bài test 1.1)_
  - `Password`: `Password123!`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng ký**.
- **Kết quả mong đợi:**
  - Hệ thống hiển thị thông báo lỗi rõ ràng: _"Email đã được đăng ký"_ hoặc _"Email already exists"_.
  - Không chuyển trang, giữ nguyên dữ liệu ở form để người dùng sửa.
- **Kết quả thực tế:** Hiển thị thông báo toast ở góc dưới bên phải: _"Email already exists"_. Giữ nguyên vị trí ở form đăng ký.
- **Trạng thái:** **PASS**

---

#### 1.3. Register thất bại — Mật khẩu quá ngắn (< 8 ký tự)

- **Mục tiêu:** Kiểm tra validation độ dài mật khẩu.
- **Dữ liệu test (Test Data):**
  - `Full Name`: `Nguyen Van C`
  - `Email`: `test02@example.com`
  - `Password`: `Pass123` _(chỉ có 7 ký tự)_
  - `Confirm Password`: `Pass123`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng ký**.
- **Kết quả mong đợi:**
  - Hiển thị lỗi inline ngay dưới ô password: _"Mật khẩu phải có ít nhất 8 ký tự"_ / _"Password must be at least 8 characters"_.
  - Nút Đăng ký bị disable hoặc bị chặn gửi request.
- **Kết quả thực tế:** Hiển thị lỗi inline ngay bên dưới ô Password: _"Password must be at least 8 characters"_.
- **Trạng thái:** **PASS**

---

#### 1.4. Register thất bại — Sai định dạng Email

- **Mục tiêu:** Kiểm tra validation định dạng Email.
- **Dữ liệu test (Test Data):**
  - Các chuỗi email lỗi cần thử lần lượt:
    - `user@`
    - `user@com`
    - `user.com`
    - `user@domain..com`
- **Các bước:** Nhập email lỗi ➔ Click ra ngoài ô input (Blur) hoặc Bấm nút **Đăng ký**.
- **Kết quả mong đợi:** Hiển thị thông báo: _"Email không hợp lệ"_ / _"Invalid email address"_.
- **Kết quả thực tế:** Khi nhập các email sai định dạng (VD: `user@`), hệ thống hiển thị thông báo lỗi inline dưới ô Email: _"Invalid email address"_.
- **Trạng thái:** **PASS**

---

#### 1.5. Register thất bại — Tên quá ngắn (< 2 ký tự)

- **Mục tiêu:** Kiểm tra validation tên người dùng (Name).
- **Dữ liệu test (Test Data):**
  - `Full Name`: `A` _(chỉ 1 ký tự)_
  - `Email`: `testname@example.com`
  - `Password`: `Password123!`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng ký**.
- **Kết quả mong đợi:** Hiển thị thông báo lỗi: _"Tên phải có ít nhất 2 ký tự"_ / _"String must contain at least 2 character(s)"_.
- **Kết quả thực tế:** Hiển thị thông báo lỗi inline dưới ô Full Name: _"Name must be at least 2 characters"_.
- **Trạng thái:** **PASS**

---

#### 1.6. Register thất bại — Mật khẩu xác nhận không khớp (Nếu UI có ô Confirm Password)

- **Mục tiêu:** Kiểm tra ô nhập lại mật khẩu.
- **Dữ liệu test (Test Data):**
  - `Password`: `Password123!`
  - `Confirm Password`: `DifferentPass123!`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng ký**.
- **Kết quả mong đợi:** Hiển thị thông báo lỗi inline: _"Mật khẩu xác nhận không trùng khớp"_.
- **Kết quả thực tế:** Hiển thị thông báo lỗi inline dưới ô Confirm Password: _"Passwords do not match"_.
- **Trạng thái:** **PASS**

---

## Bảng tóm tắt kết quả kiểm thử (Register)

| STT | Mã / Tên Test Case               | Kết quả mong đợi                                    | Trạng thái | Ghi chú                |
| --- | -------------------------------- | --------------------------------------------------- | ---------- | ---------------------- |
| 1   | 1.1 Register thành công          | Tạo tài khoản & chuyển hướng Dashboard              | **PASS**   | Đã verified            |
| 2   | 1.2 Duplicate Email              | Toast thông báo "Email already exists"              | **PASS**   | Đã verified            |
| 3   | 1.3 Mật khẩu quá ngắn            | Lỗi inline "Password must be at least 8 characters" | **PASS**   | Đã verified            |
| 4   | 1.4 Sai định dạng Email          | Lỗi inline "Invalid email address"                  | **PASS**   | Tested 4 định dạng lỗi |
| 5   | 1.5 Tên quá ngắn (< 2 ký tự)     | Lỗi inline "Name must be at least 2 characters"     | **PASS**   | Đã verified            |
| 6   | 1.6 Mật khẩu xác nhận không khớp | Lỗi inline "Passwords do not match"                 | **PASS**   | Đã verified            |
