# TÍNH NĂNG ĐĂNG NHẬP (LOGIN)

#### 1. Login thành công (Happy Path)

- **Mục tiêu:** Kiểm tra đăng nhập với tài khoản hợp lệ.
- **Dữ liệu test (Test Data):**
  - `Email`: `testuser01@example.com` _(tài khoản đã đăng ký thành công)_
  - `Password`: `Password123!`
- **Các bước:** Nhập Email & Password ➔ Bấm nút **Đăng nhập (Login)**.
- **Kết quả mong đợi:**
  - Đăng nhập thành công, chuyển hướng vào trang **Dashboard** / trang chủ.
  - Tên người dùng (`Nguyen Van A`) hoặc Avatar hiển thị ở Header/Sidebar.
- **Kết quả thực tế:** Đăng nhập thành công, hệ thống hiển thị thông báo toast _"Signed in successfully!"_ góc dưới bên phải và tự động chuyển hướng vào trang Dashboard (`/dashboard`).
- **Trạng thái:** **PASS**

---

#### 2. Login thất bại — Sai Mật khẩu (Incorrect Password)

- **Mục tiêu:** Kiểm tra báo lỗi khi nhập đúng email nhưng sai password.
- **Dữ liệu test (Test Data):**
  - `Email`: `testuser01@example.com`
  - `Password`: `WrongPassword999!`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng nhập**.
- **Kết quả mong đợi:**
  - Hiển thị thông báo lỗi chung: _"Email hoặc mật khẩu không chính xác"_ (tránh ghi chi tiết "Sai mật khẩu" để bảo mật).
  - Không cho phép truy cập vào Dashboard.
- **Kết quả thực tế:** Nút **Sign In** chuyển sang trạng thái loading (spinner) và bị treo vô hạn, hệ thống không hiển thị thông báo lỗi _"Email or password incorrect"_ hay giải phóng trạng thái nút bấm.
- **Trạng thái:** **FAIL** _(Lỗi treo trạng thái Loading khi sai mật khẩu)_

---

#### 3. Login thất bại — Email chưa từng đăng ký (Non-existent Email)

- **Mục tiêu:** Kiểm tra đăng nhập với email chưa có trong CSDL.
- **Dữ liệu test (Test Data):**
  - `Email`: `notfound_user999@example.com`
  - `Password`: `Password123!`
- **Các bước:** Nhập thông tin ➔ Bấm nút **Đăng nhập**.
- **Kết quả mong đợi:** Hiển thị thông báo lỗi: _"Email hoặc mật khẩu không chính xác"_.
- **Kết quả thực tế:** Hiển thị thông báo lỗi toast ở góc dưới bên phải: _"Email or password incorrect"_. Không cho phép đăng nhập.
- **Trạng thái:** **PASS**

---

#### 4. Login thất bại — Để trống các trường bắt buộc

- **Mục tiêu:** Kiểm tra validate các ô input trống.
- **Dữ liệu test (Test Data):**
  - Case A: Đặt Email = rỗng, Password = `Password123!`
  - Case B: Đặt Email = `testuser01@example.com`, Password = rỗng
- **Các bước:** Bấm nút **Đăng nhập**.
- **Kết quả mong đợi:**
  - Hiển thị báo lỗi: _"Vui lòng nhập Email / Mật khẩu"_.
  - Hệ thống không gửi request lên backend.
- **Kết quả thực tế:**
  - **Case A (Để trống Email):** Hiển thị lỗi inline ngay dưới ô Email: _"Email is required"_.
  - **Case B (Để trống Password):** Hiển thị lỗi inline ngay dưới ô Password: _"Password must be at least 8 characters"_.
  - Hệ thống chặn submit và không gửi request lên backend.
- **Trạng thái:** **PASS**

---

## Bảng tóm tắt kết quả kiểm thử (Login)

| STT | Test Case                                 | Kết quả mong đợi                            | Trạng thái | Ghi chú                                 |
| --- | ----------------------------------------- | ------------------------------------------- | ---------- | --------------------------------------- |
| 1   | Login thành công                          | Chuyển hướng Dashboard, báo thành công      | **PASS**   | Đã verified                             |
| 2   | Login thất bại — Sai Mật khẩu             | Báo lỗi "Email/mật khẩu không chính xác"    | **FAIL**   | Bug: Nút Sign In bị treo loading vô hạn |
| 3   | Login thất bại — Email chưa từng đăng ký  | Toast báo lỗi "Email or password incorrect" | **PASS**   | Đã verified                             |
| 4   | Login thất bại — Để trống trường bắt buộc | Hiển thị lỗi validation inline              | **PASS**   | Đã verified cả 2 case A & B             |
