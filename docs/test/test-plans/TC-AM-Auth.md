# Test Cases — Module Authentication (AM)

> **Module:** Account Management — Authentication  
> **Use Case tham chiếu:** UC-01 (Đăng ký), UC-02 (Đăng nhập)  
> **Người viết:** Nguyễn Minh Phát
> **Ngày tạo:** 2026-07-24  
> **Ngày cập nhật:** 2026-07-24  
> **Phiên bản:** 1.0  
> **Loại kiểm thử chung:** Integration (API) + Functionality

---

## Mục lục

### UC-01: Register (Đăng ký tài khoản)

**API Tests**

- [TC-AM-01-01](#tc-am-01-01-register-thành-công-với-dữ-liệu-hợp-lệ) — Register thành công với dữ liệu hợp lệ
- [TC-AM-01-02](#tc-am-01-02-register-thất-bại-khi-email-đã-tồn-tại) — Register thất bại — Email đã tồn tại (409)
- [TC-AM-01-03](#tc-am-01-03-register-thất-bại-khi-password-8-ký-tự) — Register thất bại — Password < 8 ký tự (400)
- [TC-AM-01-04](#tc-am-01-04-register-thất-bại-khi-email-format-sai) — Register thất bại — Email format sai (400)
- [TC-AM-01-05](#tc-am-01-05-register-thất-bại-khi-thiếu-trường-bắt-buộc) — Register thất bại — Thiếu trường bắt buộc (400)
- [TC-AM-01-06](#tc-am-01-06-register-thất-bại-khi-name-1-ký-tự) — Register thất bại — `name` < 2 ký tự (400)
- [TC-AM-01-07](#tc-am-01-07-register-thành-công--response-body-đúng-schema) — Register thành công — Response body đúng schema
- [TC-AM-01-08](#tc-am-01-08-register-thất-bại-khi-password-chỉ-có-khoảng-trắng) — Register thất bại — Password chỉ là khoảng trắng (400)

**UI / E2E Tests**

- [TC-AM-01-UI-01](#tc-am-01-ui-01-register-thành-công-happy-path) — Register thành công (Happy Path)
- [TC-AM-01-UI-02](#tc-am-01-ui-02-register-thất-bại--email-đã-tồn-tại) — Register thất bại — Email đã tồn tại
- [TC-AM-01-UI-03](#tc-am-01-ui-03-register-thất-bại--mật-khẩu-quá-ngắn) — Register thất bại — Mật khẩu quá ngắn (< 8 ký tự)
- [TC-AM-01-UI-04](#tc-am-01-ui-04-register-thất-bại--sai-định-dạng-email) — Register thất bại — Sai định dạng Email
- [TC-AM-01-UI-05](#tc-am-01-ui-05-register-thất-bại--tên-quá-ngắn) — Register thất bại — Tên quá ngắn (< 2 ký tự)
- [TC-AM-01-UI-06](#tc-am-01-ui-06-register-thất-bại--mật-khẩu-xác-nhận-không-khớp) — Register thất bại — Mật khẩu xác nhận không khớp

### UC-02: Login (Đăng nhập)

**API Tests**

- [TC-AM-02-01](#tc-am-02-01-login-thành-công-với-dữ-liệu-hợp-lệ) — Login thành công với dữ liệu hợp lệ
- [TC-AM-02-02](#tc-am-02-02-login-thất-bại-khi-sai-password) — Login thất bại — Sai password (401)
- [TC-AM-02-03](#tc-am-02-03-login-thất-bại-khi-email-không-tồn-tại) — Login thất bại — Email không tồn tại (401)
- [TC-AM-02-04](#tc-am-02-04-truy-cập-protected-route-không-có-token) — Protected route — Không có token (401)
- [TC-AM-02-05](#tc-am-02-05-truy-cập-protected-route-với-token-hết-hạn) — Protected route — Token hết hạn (401)
- [TC-AM-02-06](#tc-am-02-06-login-thất-bại-khi-thiếu-trường-password) — Login thất bại — Thiếu trường bắt buộc (400)
- [TC-AM-02-07](#tc-am-02-07-truy-cập-protected-route-với-token-hợp-lệ) — Protected route — Token hợp lệ (200)
- [TC-AM-02-08](#tc-am-02-08-refresh-token-thành-công) — Refresh Token thành công (200)
- [TC-AM-02-09](#tc-am-02-09-refresh-token-thất-bại-khi-token-không-hợp-lệ) — Refresh Token thất bại — Token sai/hết hạn (401)
- [TC-AM-02-10](#tc-am-02-10-protected-route-với-token-sai-định-dạng-bearer) — Protected route — Token sai định dạng Bearer (401)

**UI / E2E Tests**

- [TC-AM-02-UI-01](#tc-am-02-ui-01-login-thành-công-happy-path) — Login thành công (Happy Path)
- [TC-AM-02-UI-02](#tc-am-02-ui-02-login-thất-bại--sai-mật-khẩu) — Login thất bại — Sai mật khẩu
- [TC-AM-02-UI-03](#tc-am-02-ui-03-login-thất-bại--email-chưa-từng-đăng-ký) — Login thất bại — Email chưa từng đăng ký
- [TC-AM-02-UI-04](#tc-am-02-ui-04-login-thất-bại--để-trống-các-trường-bắt-buộc) — Login thất bại — Để trống các trường bắt buộc

---

## UC-01: Đăng ký tài khoản (Register)

**Endpoint:** `POST /api/v1/auth/register`

---

### TC-AM-01-01: Register thành công với dữ liệu hợp lệ

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | UC-01 — Đăng ký tài khoản                                                                                                                                                                                                                                                                                                |
| **Mã TC**                | TC-AM-01-01                                                                                                                                                                                                                                                                                                              |
| **Tiêu đề**              | Register thành công với dữ liệu hợp lệ                                                                                                                                                                                                                                                                                   |
| **Mô tả**                | Gửi request POST với email hợp lệ, password đủ 8 ký tự, name đủ 2 ký tự. Hệ thống phải tạo tài khoản mới và trả về JWT token.                                                                                                                                                                                            |
| **Loại kiểm thử**        | Functionality / Interface                                                                                                                                                                                                                                                                                                |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                                     |
| **Điều kiện tiên quyết** | - Server đang chạy tại `http://localhost:3001`<br>- Database test đang kết nối<br>- Email `newuser@example.com` chưa tồn tại trong DB (đã được reset bởi `npm run test:seed`)                                                                                                                                            |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body (xem bên dưới)<br>4. Gửi request<br>5. Kiểm tra HTTP status code<br>6. Kiểm tra Response Body                                                                                         |
| **Dữ liệu đầu vào**      | `email: "newuser@example.com"`<br>`password: "SecurePass1"`<br>`name: "Nguyen Van A"`                                                                                                                                                                                                                                    |
| **Kết quả mong đợi**     | - HTTP Status: **201 Created**<br>- Response body có `"success": true`<br>- `data.user` có `id`, `email`, `name` đúng<br>- `data.accessToken` là chuỗi JWT khác rỗng<br>- `data.refreshToken` là chuỗi JWT khác rỗng<br>- `password` **không** xuất hiện trong response<br>- Database có bản ghi user mới với email trên |
| **Kết quả thực tế**      | HTTP 201 Created. `success: true`. `data.user` có đúng 3 trường `id`, `email`, `name`. `accessToken` và `refreshToken` là JWT hợp lệ. `password` không lộ trong response.                                                                                                                                                |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                                                                                     |
| **Ghi chú**              | Đây là happy path chính. Nếu TC này Fail, các TC khác của UC-01 có thể không chạy được.                                                                                                                                                                                                                                  |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                          |

---

### TC-AM-01-02: Register thất bại khi email đã tồn tại

| Trường                   | Nội dung                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Luồng ngoại lệ [E1]                                                                                                                                                                                                                          |
| **Mã TC**                | TC-AM-01-02                                                                                                                                                                                                                                          |
| **Tiêu đề**              | Register thất bại khi email đã tồn tại trong hệ thống                                                                                                                                                                                                |
| **Mô tả**                | Gửi request đăng ký với email đã có trong DB. Hệ thống phải từ chối và trả về HTTP 409 Conflict với error code `EMAIL_CONFLICT`.                                                                                                                     |
| **Loại kiểm thử**        | Functionality / Database                                                                                                                                                                                                                             |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                 |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Tài khoản với email `existing@example.com` **đã tồn tại** trong DB (có thể tạo trước bằng TC-AM-01-01)                                                                                                                       |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với email đã tồn tại<br>4. Gửi request<br>5. Kiểm tra HTTP status code<br>6. Kiểm tra Response Body và error code |
| **Dữ liệu đầu vào**      | `email: "existing@example.com"` _(email đã tồn tại)_<br>`password: "AnotherPass1"`<br>`name: "Nguyen Van B"`                                                                                                                                         |
| **Kết quả mong đợi**     | - HTTP Status: **409 Conflict**<br>- Response body có `"success": false`<br>- `error.code` = `"EMAIL_CONFLICT"`<br>- `error.message` chứa nội dung thông báo lỗi email đã tồn tại<br>- **Không** tạo thêm bản ghi mới trong DB                       |
| **Kết quả thực tế**      | HTTP 409 Conflict. `success: false`. `error.code: "EMAIL_CONFLICT"`. `error.message` mô tả lỗi email đã tồn tại. Không tạo thêm bản ghi trùng trong DB.                                                                                              |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                 |
| **Ghi chú**              | Quan trọng: Kiểm tra thêm DB để chắc chắn không có duplicate record.                                                                                                                                                                                 |
| **Nhận xét**             |                                                                                                                                                                                                                                                      |

---

### TC-AM-01-03: Register thất bại khi password < 8 ký tự

| Trường                   | Nội dung                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Luồng ngoại lệ [E2]                                                                                                                                                                                                               |
| **Mã TC**                | TC-AM-01-03                                                                                                                                                                                                                               |
| **Tiêu đề**              | Register thất bại khi password có độ dài dưới 8 ký tự                                                                                                                                                                                     |
| **Mô tả**                | Gửi request đăng ký với password chỉ có 7 ký tự. Hệ thống phải từ chối ở tầng validation và trả về HTTP 400 với error code `VALIDATION_ERROR`.                                                                                            |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                                             |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                      |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Email `shortpass@example.com` chưa tồn tại trong DB                                                                                                                                                               |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với password có 7 ký tự<br>4. Gửi request<br>5. Kiểm tra HTTP status code<br>6. Kiểm tra Response Body |
| **Dữ liệu đầu vào**      | `email: "shortpass@example.com"`<br>`password: "Pass123"` _(7 ký tự)_<br>`name: "Test User"`                                                                                                                                              |
| **Kết quả mong đợi**     | - HTTP Status: **400 Bad Request**<br>- Response body có `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` chứa thông tin lỗi trường `password`<br>- **Không** tạo bản ghi trong DB                        |
| **Kết quả thực tế**      | HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ trường `password` không đủ độ dài.                                                                                                       |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                      |
| **Ghi chú**              | Test boundary: password đúng 7 ký tự (< 8). Cũng nên test password đúng 8 ký tự → phải Pass (xem TC-AM-01-01).                                                                                                                            |
| **Nhận xét**             |                                                                                                                                                                                                                                           |

---

### TC-AM-01-04: Register thất bại khi email format sai

| Trường                   | Nội dung                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation                                                                                                                                                                                                                                               |
| **Mã TC**                | TC-AM-01-04                                                                                                                                                                                                                                                      |
| **Tiêu đề**              | Register thất bại khi email không đúng định dạng                                                                                                                                                                                                                 |
| **Mô tả**                | Gửi request đăng ký với email không đúng định dạng (thiếu `@`, thiếu domain...). Hệ thống phải từ chối và trả về HTTP 400.                                                                                                                                       |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                                                                    |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                             |
| **Điều kiện tiên quyết** | - Server đang chạy                                                                                                                                                                                                                                               |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với email không hợp lệ<br>4. Gửi request<br>5. Kiểm tra HTTP status code<br>6. Kiểm tra Response Body                         |
| **Dữ liệu đầu vào**      | Bộ test tách thành 4 sub-case độc lập (TC-AM-01-04a đến 04d):<br>• **04a** `"spaces in@email.com"` _(có khoảng trắng)_<br>• **04b** `"notanemail"` _(không có @)_<br>• **04c** `"missing@"` _(thiếu domain)_<br>• **04d** `"@nodomain.com"` _(thiếu local part)_ |
| **Kết quả mong đợi**     | Với mỗi email không hợp lệ:<br>- HTTP Status: **400 Bad Request**<br>- Response body có `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` chứa thông tin lỗi trường `email`<br>- **Không** tạo bản ghi trong DB                   |
| **Kết quả thực tế**      | Tất cả 4 sub-case đều trả về HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ trường `email` không hợp lệ.                                                                                                       |
| **Trạng thái**           | Pass (4/4 sub-cases)                                                                                                                                                                                                                                             |
| **Ghi chú**              | Bộ test được tách thành 4 file `.request.yaml` riêng lẻ (TC-AM-01-04a đến 04d) để báo cáo chi tiết hơn.                                                                                                                                                          |
| **Nhận xét**             |                                                                                                                                                                                                                                                                  |

---

### TC-AM-01-05: Register thất bại khi thiếu trường bắt buộc

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation                                                                                                                                                                                                                                                                                                                                      |
| **Mã TC**                | TC-AM-01-05                                                                                                                                                                                                                                                                                                                                             |
| **Tiêu đề**              | Register thất bại khi thiếu trường bắt buộc trong request body                                                                                                                                                                                                                                                                                          |
| **Mô tả**                | Gửi request đăng ký thiếu một hoặc nhiều trường bắt buộc (`email`, `password`, `name`). Hệ thống phải trả về HTTP 400.                                                                                                                                                                                                                                  |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                                                                                                                                                           |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                                                                                                                                                                                  |
| **Điều kiện tiên quyết** | - Server đang chạy                                                                                                                                                                                                                                                                                                                                      |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Gửi các body thiếu trường (từng case)<br>4. Kiểm tra HTTP status code và response                                                                                                                                                      |
| **Dữ liệu đầu vào**      | Bộ test tách thành 4 sub-case độc lập (TC-AM-01-05a đến 05d):<br>• **05a** — Thiếu `email`: `{ "password": "SecurePass1", "name": "Test" }`<br>• **05b** — Thiếu `password`: `{ "email": "test@example.com", "name": "Test" }`<br>• **05c** — Thiếu `name`: `{ "email": "test@example.com", "password": "SecurePass1" }`<br>• **05d** — Body rỗng: `{}` |
| **Kết quả mong đợi**     | Mỗi case:<br>- HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` nêu rõ trường nào bị thiếu                                                                                                                                                                                        |
| **Kết quả thực tế**      | Tất cả 4 sub-case đều trả về HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ trường bị thiếu trong từng case.                                                                                                                                                                                          |
| **Trạng thái**           | Pass (4/4 sub-cases)                                                                                                                                                                                                                                                                                                                                    |
| **Ghi chú**              | Bộ test được tách thành 4 file `.request.yaml` riêng lẻ (TC-AM-01-05a đến 05d) để báo cáo chi tiết hơn.                                                                                                                                                                                                                                                 |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                         |

---

### TC-AM-01-06: Register thất bại khi name < 2 ký tự

| Trường                   | Nội dung                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation (Zod: name >= 2 chars)                                                                                                                                                    |
| **Mã TC**                | TC-AM-01-06                                                                                                                                                                                  |
| **Tiêu đề**              | Register thất bại khi `name` có độ dài dưới 2 ký tự                                                                                                                                          |
| **Mô tả**                | Zod schema yêu cầu `name >= 2 ký tự`. Gửi request với `name` là 1 ký tự phải bị từ chối với HTTP 400.                                                                                        |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                       |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Email `shortname@example.com` chưa tồn tại trong DB                                                                                                                  |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với `name` 1 ký tự<br>4. Gửi request và kiểm tra response |
| **Dữ liệu đầu vào**      | `email: "shortname@example.com"`<br>`password: "SecurePass1"`<br>`name: "A"` _(1 ký tự)_                                                                                                     |
| **Kết quả mong đợi**     | - HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` chứa thông tin lỗi trường `name`                                    |
| **Kết quả thực tế**      | HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ trường `name` không đủ độ dài tối thiểu 2 ký tự.                                            |
| **Trạng thái**           | Pass                                                                                                                                                                                         |
| **Ghi chú**              | Boundary test: name = 1 char (fail) vs name = 2 chars (pass).                                                                                                                                |
| **Nhận xét**             |                                                                                                                                                                                              |

---

### TC-AM-01-07: Register thành công — Response body đúng schema

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Contract Testing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Mã TC**                | TC-AM-01-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Tiêu đề**              | Register thành công — Validate toàn bộ response schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Mô tả**                | Kiểm tra chi tiết cấu trúc JSON response khi Register thành công: đầy đủ các trường, đúng kiểu dữ liệu, không lộ thông tin nhạy cảm.                                                                                                                                                                                                                                                                                                                                                                                               |
| **Loại kiểm thử**        | Interface / Security                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Email `schema@example.com` chưa tồn tại trong DB                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Các bước thực hiện**   | 1. Gửi request Register thành công với dữ liệu hợp lệ<br>2. Kiểm tra từng trường trong response body:<br>&nbsp;&nbsp;a. `success` là `true` (boolean)<br>&nbsp;&nbsp;b. `data.user.id` là string (UUID format)<br>&nbsp;&nbsp;c. `data.user.email` khớp với email đã nhập<br>&nbsp;&nbsp;d. `data.user.name` khớp với name đã nhập<br>&nbsp;&nbsp;e. `data.accessToken` là string không rỗng<br>&nbsp;&nbsp;f. `data.refreshToken` là string không rỗng<br>3. Kiểm tra response **không có** trường `password` hoặc `passwordHash` |
| **Dữ liệu đầu vào**      | `email: "schema@example.com"`<br>`password: "SecurePass1"`<br>`name: "Schema Test"`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Kết quả mong đợi**     | - HTTP Status: **201 Created**<br>- `data.user` có đúng 3 trường: `id`, `email`, `name`<br>- `data.user.password` **không tồn tại**<br>- `data.accessToken` và `data.refreshToken` đều là JWT hợp lệ (có thể decode được header/payload)                                                                                                                                                                                                                                                                                           |
| **Kết quả thực tế**      | HTTP 201 Created. `data.user` có đúng 3 trường `id`, `email`, `name`. `password` và `passwordHash` không xuất hiện trong response. `accessToken` và `refreshToken` là JWT hợp lệ.                                                                                                                                                                                                                                                                                                                                                  |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Ghi chú**              | Security check: mật khẩu tuyệt đối không được lộ trong response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

### TC-AM-01-08: Register thất bại khi password chỉ có khoảng trắng

| Trường                   | Nội dung                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation (edge case)                                                                                                                                      |
| **Mã TC**                | TC-AM-01-08                                                                                                                                                         |
| **Tiêu đề**              | Register thất bại khi password chỉ gồm khoảng trắng                                                                                                                 |
| **Mô tả**                | Password `"        "` (8 khoảng trắng) về mặt kỹ thuật đủ 8 ký tự nhưng về mặt bảo mật không nên được chấp nhận. Kiểm tra hệ thống xử lý edge case này như thế nào. |
| **Loại kiểm thử**        | Security / Functionality                                                                                                                                            |
| **Độ ưu tiên**           | Medium                                                                                                                                                              |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Email `spacepass@example.com` chưa tồn tại                                                                                                  |
| **Các bước thực hiện**   | 1. Gửi request Register với password là 8 khoảng trắng<br>2. Kiểm tra HTTP status và response                                                                       |
| **Dữ liệu đầu vào**      | `email: "spacepass@example.com"`<br>`password: "        "` _(8 ký tự khoảng trắng)_<br>`name: "Space Test"`                                                         |
| **Kết quả mong đợi**     | - HTTP Status: **400 Bad Request** _(nên reject vì lý do bảo mật)_                                                                                                  |
| **Kết quả thực tế**      | **HTTP 400 Bad Request**. Server từ chối request với password toàn khoảng trắng và trả về lỗi validation.                                                           |
| **Trạng thái**           | Pass                                                                                                                                                                |
| **Ghi chú**              | Security check: Zod validator xử lý loại bỏ/kiểm tra khoảng trắng (`trim()`) thành công, không cho phép mật khẩu chỉ chứa khoảng trắng.                             |
| **Nhận xét**             |                                                                                                                                                                     |

---

## UC-01: UI / E2E Tests — Đăng ký (Register)

> **Loại kiểm thử:** UI / End-to-End  
> **Công cụ:** Trình duyệt (Chrome/Firefox) — kiểm tra thủ công trên giao diện  
> **Môi trường:** Frontend chạy tại `http://localhost:5173` (hoặc tương đương)

---

### TC-AM-01-UI-01: Register thành công (Happy Path)

| Trường                   | Nội dung                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Đăng ký tài khoản (UI)                                                                                                                                                                                                                     |
| **Mã TC**                | TC-AM-01-UI-01                                                                                                                                                                                                                                     |
| **Tiêu đề**              | Register thành công với dữ liệu hợp lệ trên giao diện                                                                                                                                                                                              |
| **Mô tả**                | Điền đầy đủ form đăng ký với dữ liệu hợp lệ, nhấn nút Đăng ký. Hệ thống phải tạo tài khoản thành công và tự động chuyển trang.                                                                                                                     |
| **Loại kiểm thử**        | UI / E2E                                                                                                                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                               |
| **Điều kiện tiên quyết** | - Frontend đang chạy<br>- Email `testuser01@example.com` chưa tồn tại trong DB                                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Mở trang đăng ký trên trình duyệt<br>2. Nhập `Full Name`: `Nguyen Van A`<br>3. Nhập `Email`: `testuser01@example.com`<br>4. Nhập `Password`: `Password123!`<br>5. Nhập `Confirm Password`: `Password123!`<br>6. Nhấn nút **Đăng ký (Register)** |
| **Dữ liệu đầu vào**      | `Full Name`: `Nguyen Van A` _(≥ 2 ký tự)_<br>`Email`: `testuser01@example.com` _(email mới chưa đăng ký)_<br>`Password`: `Password123!` _(≥ 8 ký tự)_<br>`Confirm Password`: `Password123!` _(khớp)_                                               |
| **Kết quả mong đợi**     | - Đăng ký thành công, hiển thị Toast/Notification thành công<br>- Tự động chuyển hướng sang trang **Dashboard** (hoặc trang Đăng nhập)                                                                                                             |
| **Kết quả thực tế**      | Đăng ký thành công, hệ thống tự động chuyển hướng sang trang Dashboard (`/dashboard`).                                                                                                                                                             |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                               |
| **Ghi chú**              | Happy path chính của luồng UI Register.                                                                                                                                                                                                            |
| **Nhận xét**             |                                                                                                                                                                                                                                                    |

---

### TC-AM-01-UI-02: Register thất bại — Email đã tồn tại

| Trường                   | Nội dung                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Luồng ngoại lệ (UI)                                                                                                                                         |
| **Mã TC**                | TC-AM-01-UI-02                                                                                                                                                      |
| **Tiêu đề**              | Register thất bại khi email đã tồn tại trong hệ thống (UI)                                                                                                          |
| **Mô tả**                | Điền form đăng ký với email đã có trong DB. UI phải hiển thị thông báo lỗi và giữ nguyên form.                                                                      |
| **Loại kiểm thử**        | UI / E2E                                                                                                                                                            |
| **Độ ưu tiên**           | High                                                                                                                                                                |
| **Điều kiện tiên quyết** | - Frontend đang chạy<br>- Email `testuser01@example.com` **đã tồn tại** trong DB (dùng lại email từ TC-AM-01-UI-01)                                                 |
| **Các bước thực hiện**   | 1. Mở trang đăng ký<br>2. Nhập `Full Name`: `Nguyen Van B`, `Email`: `testuser01@example.com` _(đã tồn tại)_, `Password`: `Password123!`<br>3. Nhấn nút **Đăng ký** |
| **Dữ liệu đầu vào**      | `Full Name`: `Nguyen Van B`<br>`Email`: `testuser01@example.com` _(dùng lại email đã đăng ký ở TC-AM-01-UI-01)_<br>`Password`: `Password123!`                       |
| **Kết quả mong đợi**     | - UI hiển thị thông báo lỗi rõ ràng: _"Email đã được đăng ký"_ hoặc _"Email already exists"_<br>- Không chuyển trang, giữ nguyên dữ liệu ở form                     |
| **Kết quả thực tế**      | Hiển thị thông báo toast ở góc dưới bên phải: _"Email already exists"_. Giữ nguyên vị trí ở form đăng ký.                                                           |
| **Trạng thái**           | Pass                                                                                                                                                                |
| **Ghi chú**              | Tương đồng với TC-AM-01-02 ở tầng API; TC này xác nhận UI xử lý đúng error response từ Backend.                                                                     |
| **Nhận xét**             |                                                                                                                                                                     |

---

### TC-AM-01-UI-03: Register thất bại — Mật khẩu quá ngắn

| Trường                   | Nội dung                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation UI                                                                                                                                                                  |
| **Mã TC**                | TC-AM-01-UI-03                                                                                                                                                                         |
| **Tiêu đề**              | Register thất bại khi mật khẩu có độ dài dưới 8 ký tự (UI)                                                                                                                             |
| **Mô tả**                | Điền password chỉ 7 ký tự. UI phải hiển thị lỗi validation inline và không gửi request lên backend.                                                                                    |
| **Loại kiểm thử**        | UI / Validation                                                                                                                                                                        |
| **Độ ưu tiên**           | High                                                                                                                                                                                   |
| **Điều kiện tiên quyết** | - Frontend đang chạy                                                                                                                                                                   |
| **Các bước thực hiện**   | 1. Mở trang đăng ký<br>2. Nhập `Full Name`: `Nguyen Van C`, `Email`: `test02@example.com`, `Password`: `Pass123` _(7 ký tự)_, `Confirm Password`: `Pass123`<br>3. Nhấn nút **Đăng ký** |
| **Dữ liệu đầu vào**      | `Full Name`: `Nguyen Van C`<br>`Email`: `test02@example.com`<br>`Password`: `Pass123` _(chỉ có 7 ký tự)_<br>`Confirm Password`: `Pass123`                                              |
| **Kết quả mong đợi**     | - Hiển thị lỗi inline ngay dưới ô password: _"Mật khẩu phải có ít nhất 8 ký tự"_ / _"Password must be at least 8 characters"_<br>- Nút Đăng ký bị disable hoặc bị chặn gửi request     |
| **Kết quả thực tế**      | Hiển thị lỗi inline ngay bên dưới ô Password: _"Password must be at least 8 characters"_.                                                                                              |
| **Trạng thái**           | Pass                                                                                                                                                                                   |
| **Ghi chú**              | Validation xảy ra ở tầng Frontend (client-side), không gửi request lên Backend.                                                                                                        |
| **Nhận xét**             |                                                                                                                                                                                        |

---

### TC-AM-01-UI-04: Register thất bại — Sai định dạng Email

| Trường                   | Nội dung                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | UC-01 — Validation UI                                                                                                                      |
| **Mã TC**                | TC-AM-01-UI-04                                                                                                                             |
| **Tiêu đề**              | Register thất bại khi email không đúng định dạng (UI)                                                                                      |
| **Mô tả**                | Điền email sai định dạng. UI phải hiển thị lỗi validation inline ngay sau khi blur hoặc submit.                                            |
| **Loại kiểm thử**        | UI / Validation                                                                                                                            |
| **Độ ưu tiên**           | High                                                                                                                                       |
| **Điều kiện tiên quyết** | - Frontend đang chạy                                                                                                                       |
| **Các bước thực hiện**   | 1. Mở trang đăng ký<br>2. Lần lượt thử các email sai định dạng trong ô Email<br>3. Click ra ngoài ô input (Blur) hoặc nhấn nút **Đăng ký** |
| **Dữ liệu đầu vào**      | Các chuỗi email lỗi cần thử lần lượt:<br>• `user@`<br>• `user@com`<br>• `user.com`<br>• `user@domain..com`                                 |
| **Kết quả mong đợi**     | Hiển thị thông báo lỗi inline: _"Email không hợp lệ"_ / _"Invalid email address"_                                                          |
| **Kết quả thực tế**      | Khi nhập các email sai định dạng (VD: `user@`), hệ thống hiển thị thông báo lỗi inline dưới ô Email: _"Invalid email address"_.            |
| **Trạng thái**           | Pass                                                                                                                                       |
| **Ghi chú**              | Tested 4 định dạng lỗi. Validation xảy ra ở tầng Frontend.                                                                                 |
| **Nhận xét**             |                                                                                                                                            |

---

### TC-AM-01-UI-05: Register thất bại — Tên quá ngắn

| Trường                   | Nội dung                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation UI                                                                                                                               |
| **Mã TC**                | TC-AM-01-UI-05                                                                                                                                      |
| **Tiêu đề**              | Register thất bại khi tên người dùng có độ dài dưới 2 ký tự (UI)                                                                                    |
| **Mô tả**                | Điền Full Name chỉ 1 ký tự. UI phải hiển thị lỗi validation inline.                                                                                 |
| **Loại kiểm thử**        | UI / Validation                                                                                                                                     |
| **Độ ưu tiên**           | Medium                                                                                                                                              |
| **Điều kiện tiên quyết** | - Frontend đang chạy                                                                                                                                |
| **Các bước thực hiện**   | 1. Mở trang đăng ký<br>2. Nhập `Full Name`: `A` _(1 ký tự)_, `Email`: `testname@example.com`, `Password`: `Password123!`<br>3. Nhấn nút **Đăng ký** |
| **Dữ liệu đầu vào**      | `Full Name`: `A` _(chỉ 1 ký tự)_<br>`Email`: `testname@example.com`<br>`Password`: `Password123!`                                                   |
| **Kết quả mong đợi**     | Hiển thị thông báo lỗi: _"Tên phải có ít nhất 2 ký tự"_ / _"String must contain at least 2 character(s)"_                                           |
| **Kết quả thực tế**      | Hiển thị thông báo lỗi inline dưới ô Full Name: _"Name must be at least 2 characters"_.                                                             |
| **Trạng thái**           | Pass                                                                                                                                                |
| **Ghi chú**              | Boundary test: name = 1 char → fail; name = 2 chars → pass.                                                                                         |
| **Nhận xét**             |                                                                                                                                                     |

---

### TC-AM-01-UI-06: Register thất bại — Mật khẩu xác nhận không khớp

| Trường                   | Nội dung                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-01 — Validation UI                                                                                                         |
| **Mã TC**                | TC-AM-01-UI-06                                                                                                                |
| **Tiêu đề**              | Register thất bại khi mật khẩu xác nhận không trùng khớp (UI)                                                                 |
| **Mô tả**                | Điền Confirm Password khác với Password. UI phải hiển thị lỗi validation inline.                                              |
| **Loại kiểm thử**        | UI / Validation                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                          |
| **Điều kiện tiên quyết** | - Frontend đang chạy                                                                                                          |
| **Các bước thực hiện**   | 1. Mở trang đăng ký<br>2. Nhập `Password`: `Password123!`, `Confirm Password`: `DifferentPass123!`<br>3. Nhấn nút **Đăng ký** |
| **Dữ liệu đầu vào**      | `Password`: `Password123!`<br>`Confirm Password`: `DifferentPass123!`                                                         |
| **Kết quả mong đợi**     | Hiển thị thông báo lỗi inline: _"Mật khẩu xác nhận không trùng khớp"_ / _"Passwords do not match"_                            |
| **Kết quả thực tế**      | Hiển thị thông báo lỗi inline dưới ô Confirm Password: _"Passwords do not match"_.                                            |
| **Trạng thái**           | Pass                                                                                                                          |
| **Ghi chú**              | Validation này chỉ có ở tầng Frontend (không có trường Confirm Password trong API request).                                   |
| **Nhận xét**             |                                                                                                                               |

---

## UC-02: Đăng nhập (Login)

**Endpoint chính:** `POST /api/v1/auth/login`  
**Protected route dùng để test:** `GET /api/v1/auth/me`

---

### TC-AM-02-01: Login thành công với dữ liệu hợp lệ

| Trường                   | Nội dung                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Đăng nhập                                                                                                                                                                                                                                                |
| **Mã TC**                | TC-AM-02-01                                                                                                                                                                                                                                                      |
| **Tiêu đề**              | Login thành công với email và password hợp lệ                                                                                                                                                                                                                    |
| **Mô tả**                | Gửi request POST Login với đúng email và password đã đăng ký. Hệ thống phải xác thực thành công và trả về JWT tokens.                                                                                                                                            |
| **Loại kiểm thử**        | Functionality / Interface                                                                                                                                                                                                                                        |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                             |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Tài khoản với email `logintest@example.com` và password `SecurePass1` **đã tồn tại** trong DB (chạy TC-AM-01-01 trước hoặc seed data)                                                                                                    |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body<br>4. Gửi request<br>5. Kiểm tra HTTP status code<br>6. Kiểm tra Response Body và lưu `accessToken` để dùng cho các TC tiếp theo |
| **Dữ liệu đầu vào**      | `email: "logintest@example.com"`<br>`password: "SecurePass1"`                                                                                                                                                                                                    |
| **Kết quả mong đợi**     | - HTTP Status: **200 OK**<br>- Response body có `"success": true`<br>- `data.user` có `id`, `email`, `name`<br>- `data.accessToken` là chuỗi JWT hợp lệ<br>- `data.refreshToken` là chuỗi JWT hợp lệ<br>- `password` **không** xuất hiện trong response          |
| **Kết quả thực tế**      | HTTP 200 OK. `success: true`. `data.user` có `id`, `email`, `name`. `accessToken` và `refreshToken` là JWT hợp lệ. `password` không lộ trong response. Script tự động lưu token vào Postman Environment.                                                         |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                             |
| **Ghi chú**              | **Lưu accessToken & refreshToken** từ response — script tự động thực hiện việc này vào Postman Environment để dùng cho các TC tiếp theo.                                                                                                                         |
| **Nhận xét**             |                                                                                                                                                                                                                                                                  |

---

### TC-AM-02-02: Login thất bại khi sai password

| Trường                   | Nội dung                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Luồng ngoại lệ [E1]                                                                                                                                                                                                                                   |
| **Mã TC**                | TC-AM-02-02                                                                                                                                                                                                                                                   |
| **Tiêu đề**              | Login thất bại khi nhập sai password                                                                                                                                                                                                                          |
| **Mô tả**                | Gửi request Login với email đúng nhưng password sai. Hệ thống phải từ chối và trả về HTTP 401 với thông báo lỗi chung (không phân biệt email/password sai để tránh User Enumeration Attack).                                                                  |
| **Loại kiểm thử**        | Functionality / Security                                                                                                                                                                                                                                      |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                          |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Tài khoản `logintest@example.com` đã tồn tại                                                                                                                                                                                          |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với password sai<br>4. Gửi request<br>5. Kiểm tra HTTP status code và response                                                |
| **Dữ liệu đầu vào**      | `email: "logintest@example.com"` _(email đúng)_<br>`password: "WrongPassword"` _(password sai)_                                                                                                                                                               |
| **Kết quả mong đợi**     | - HTTP Status: **401 Unauthorized**<br>- Response body có `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Email or password incorrect"` _(thông báo chung, không tiết lộ email đúng/sai)_<br>- Response **không** chứa token |
| **Kết quả thực tế**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Email or password incorrect"` — thông báo chung, không phân biệt nguyên nhân để tránh User Enumeration Attack.                                                        |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                          |
| **Ghi chú**              | Security check: message lỗi phải giống hệt TC-AM-02-03 để ngăn User Enumeration. Đã xác nhận 2 message này giống nhau.                                                                                                                                        |
| **Nhận xét**             |                                                                                                                                                                                                                                                               |

---

### TC-AM-02-03: Login thất bại khi email không tồn tại

| Trường                   | Nội dung                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Luồng ngoại lệ [E1]                                                                                                                                                                                                        |
| **Mã TC**                | TC-AM-02-03                                                                                                                                                                                                                        |
| **Tiêu đề**              | Login thất bại khi email không tồn tại trong hệ thống                                                                                                                                                                              |
| **Mô tả**                | Gửi request Login với email chưa được đăng ký. Hệ thống phải từ chối với HTTP 401 và thông báo lỗi chung (giống như trường hợp sai password).                                                                                      |
| **Loại kiểm thử**        | Functionality / Security                                                                                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                               |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Email `notexist@example.com` **chưa** tồn tại trong DB                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với email không tồn tại<br>4. Gửi request<br>5. Kiểm tra HTTP status code và response              |
| **Dữ liệu đầu vào**      | `email: "notexist@example.com"` _(email không tồn tại)_<br>`password: "SomePassword1"`                                                                                                                                             |
| **Kết quả mong đợi**     | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Email or password incorrect"` _(thông báo **giống hệt** TC-AM-02-02)_<br>- Response **không** chứa token |
| **Kết quả thực tế**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Email or password incorrect"` — giống hệt TC-AM-02-02, xác nhận Server không phân biệt email sai hay password sai.                         |
| **Trạng thái**           | Pass                                                                                                                                                                                                                               |
| **Ghi chú**              | **Critical Security Check:** message của TC-AM-02-02 và TC-AM-02-03 **giống nhau hoàn toàn** — đã xác nhận, không có User Enumeration Vulnerability.                                                                               |
| **Nhận xét**             |                                                                                                                                                                                                                                    |

---

### TC-AM-02-04: Truy cập protected route không có token

| Trường                   | Nội dung                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Authorization / Middleware                                                                                                                                |
| **Mã TC**                | TC-AM-02-04                                                                                                                                                       |
| **Tiêu đề**              | Truy cập protected route `GET /api/v1/auth/me` không có Authorization header                                                                                      |
| **Mô tả**                | Gửi request đến endpoint cần xác thực mà không đính kèm Bearer token. Middleware auth phải chặn và trả về HTTP 401.                                               |
| **Loại kiểm thử**        | Security / Functionality                                                                                                                                          |
| **Độ ưu tiên**           | High                                                                                                                                                              |
| **Điều kiện tiên quyết** | - Server đang chạy                                                                                                                                                |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `GET /api/v1/auth/me`<br>2. **Không** thêm Authorization header<br>3. Gửi request<br>4. Kiểm tra HTTP status code và response          |
| **Dữ liệu đầu vào**      | Không có (request không có Authorization header)                                                                                                                  |
| **Kết quả mong đợi**     | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Token not provided"` (hoặc tương đương) |
| **Kết quả thực tế**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. Middleware Auth chặn request thành công trước khi vào logic handler.                       |
| **Trạng thái**           | Pass                                                                                                                                                              |
| **Ghi chú**              | Test cả trường hợp header `Authorization` có nhưng rỗng.                                                                                                          |
| **Nhận xét**             |                                                                                                                                                                   |

---

### TC-AM-02-05: Truy cập protected route với token hết hạn

| Trường                   | Nội dung                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Authorization / Token Expiry                                                                                                                                      |
| **Mã TC**                | TC-AM-02-05                                                                                                                                                               |
| **Tiêu đề**              | Truy cập protected route `GET /api/v1/auth/me` với Access Token đã hết hạn                                                                                                |
| **Mô tả**                | Gửi request đến endpoint cần xác thực với Access Token đã hết hạn (expire). Middleware phải phát hiện token không hợp lệ và trả về HTTP 401.                              |
| **Loại kiểm thử**        | Security / Functionality                                                                                                                                                  |
| **Độ ưu tiên**           | High                                                                                                                                                                      |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Có một expired JWT Access Token (có thể tạo bằng cách: dùng token cũ sau 15 phút, hoặc tạo token thủ công với exp trong quá khứ)                  |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `GET /api/v1/auth/me`<br>2. Thêm header: `Authorization: Bearer <expired_token>`<br>3. Gửi request<br>4. Kiểm tra HTTP status code và response |
| **Dữ liệu đầu vào**      | Header: `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...` _(expired token — hardcoded JWT với exp trong quá khứ)_                                                           |
| **Kết quả mong đợi**     | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Invalid or expired token"`                      |
| **Kết quả thực tế**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Invalid or expired token"`. Middleware từ chối token hết hạn thành công.          |
| **Trạng thái**           | Pass                                                                                                                                                                      |
| **Ghi chú**              | Token giả được hardcode trực tiếp trong test file để đảm bảo tính ổn định của test case (không phụ thuộc vào thời gian chờ).                                              |
| **Nhận xét**             |                                                                                                                                                                           |

---

### TC-AM-02-06: Login thất bại khi thiếu trường password

| Trường                   | Nội dung                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Validation                                                                                                                                                                  |
| **Mã TC**                | TC-AM-02-06                                                                                                                                                                         |
| **Tiêu đề**              | Login thất bại khi request body thiếu trường bắt buộc                                                                                                                               |
| **Mô tả**                | Gửi request Login chỉ có email, thiếu password (hoặc body rỗng). Hệ thống phải từ chối ngay ở tầng validation.                                                                      |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                       |
| **Độ ưu tiên**           | Medium                                                                                                                                                                              |
| **Điều kiện tiên quyết** | - Server đang chạy                                                                                                                                                                  |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body chỉ có email<br>4. Gửi request và kiểm tra response |
| **Dữ liệu đầu vào**      | Case A: `{ "email": "logintest@example.com" }` _(thiếu password)_<br>Case B: `{}` _(body rỗng)_<br>Case C: `{ "password": "SecurePass1" }` _(thiếu email)_                          |
| **Kết quả mong đợi**     | - HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` chỉ rõ trường bị thiếu                                     |
| **Kết quả thực tế**      | Tất cả 3 sub-case đều trả về HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ trường bị thiếu trong từng case.                      |
| **Trạng thái**           | Pass (3/3 sub-cases)                                                                                                                                                                |
| **Ghi chú**              | —                                                                                                                                                                                   |
| **Nhận xét**             |                                                                                                                                                                                     |

---

### TC-AM-02-07: Truy cập protected route với token hợp lệ

| Trường                   | Nội dung                                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Authorization (Happy Path)                                                                                                                                                                                         |
| **Mã TC**                | TC-AM-02-07                                                                                                                                                                                                                |
| **Tiêu đề**              | Truy cập protected route `GET /api/v1/auth/me` với Access Token hợp lệ                                                                                                                                                     |
| **Mô tả**                | Sau khi đăng nhập thành công, dùng Access Token để gọi API lấy thông tin cá nhân. Hệ thống phải trả về thông tin user đúng.                                                                                                |
| **Loại kiểm thử**        | Functionality / Interface                                                                                                                                                                                                  |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                       |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Đã thực hiện TC-AM-02-01 và lưu được `accessToken`                                                                                                                                                 |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `GET /api/v1/auth/me`<br>2. Thêm header: `Authorization: Bearer <valid_access_token>`<br>3. Gửi request<br>4. Kiểm tra HTTP status code và response body                                        |
| **Dữ liệu đầu vào**      | Header: `Authorization: Bearer <accessToken từ TC-AM-02-01>`                                                                                                                                                               |
| **Kết quả mong đợi**     | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.id` khớp với user đã đăng nhập<br>- `data.email` = `"logintest@example.com"`<br>- `data.name` đúng với tên đã đăng ký<br>- `data.password` **không** xuất hiện |
| **Kết quả thực tế**      | HTTP 200 OK. `success: true`. `data.email: "logintest@example.com"`. `data.name` và `data.id` tồn tại. `password` không lộ trong response.                                                                                 |
| **Trạng thái**           | Pass                                                                                                                                                                                                                       |
| **Ghi chú**              | TC này xác nhận luồng end-to-end: Register → Login → Dùng token.                                                                                                                                                           |
| **Nhận xét**             |                                                                                                                                                                                                                            |

---

### TC-AM-02-08: Refresh Token thành công

| Trường                   | Nội dung                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Token Refresh (Session Management)                                                                                                                                                                                                                          |
| **Mã TC**                | TC-AM-02-08                                                                                                                                                                                                                                                         |
| **Tiêu đề**              | Refresh Token thành công — Nhận Access Token mới                                                                                                                                                                                                                    |
| **Mô tả**                | Dùng `refreshToken` hợp lệ để đổi lấy `accessToken` mới. Đây là cơ chế duy trì session sau khi access token hết hạn (15 phút).                                                                                                                                      |
| **Loại kiểm thử**        | Functionality / Interface                                                                                                                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Đã thực hiện TC-AM-02-01 và lưu được `refreshToken`                                                                                                                                                                                         |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/refresh`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với refreshToken<br>4. Gửi request<br>5. Kiểm tra HTTP status code và response<br>6. Xác nhận `accessToken` mới khác với token cũ |
| **Dữ liệu đầu vào**      | `refreshToken: "<refreshToken từ TC-AM-02-01>"`                                                                                                                                                                                                                     |
| **Kết quả mong đợi**     | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.accessToken` là chuỗi JWT mới, hợp lệ<br>- `data.accessToken` **khác** với accessToken cũ                                                                                                               |
| **Kết quả thực tế**      | HTTP 200 OK. `success: true`. `accessToken` mới được cấp thành công và khác với token cũ (nhờ pre-request delay 1s).                                                                                                                                                |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                                |
| **Ghi chú**              | - Dùng `accessToken` mới từ TC này để gọi lại `GET /api/v1/auth/me` — phải trả về 200. <br> - Delay 1s trước khi tạo token tránh token bị tạo trùng do test chạy quá nhanh.                                                                                         |
| **Nhận xét**             |                                                                                                                                                                                                                                                                     |

---

### TC-AM-02-09: Refresh Token thất bại khi token không hợp lệ

| Trường                   | Nội dung                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | UC-02 — Token Refresh / Security                                                                                                                                                                                                                                   |
| **Mã TC**                | TC-AM-02-09                                                                                                                                                                                                                                                        |
| **Tiêu đề**              | Refresh Token thất bại khi `refreshToken` không hợp lệ hoặc đã hết hạn                                                                                                                                                                                             |
| **Mô tả**                | Gửi request Refresh với token giả, token hết hạn, hoặc token bị thiếu. Hệ thống phải từ chối với HTTP 401.                                                                                                                                                         |
| **Loại kiểm thử**        | Security / Functionality                                                                                                                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                               |
| **Điều kiện tiên quyết** | - Server đang chạy                                                                                                                                                                                                                                                 |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `POST /api/v1/auth/refresh`<br>2. Set Header: `Content-Type: application/json`<br>3. Nhập Request Body với token không hợp lệ<br>4. Gửi request và kiểm tra response                                                                    |
| **Dữ liệu đầu vào**      | Bộ test tách thành 2 sub-case độc lập (TC-AM-02-09a và 09b):<br>• **09a** — Token giả: `{ "refreshToken": "invalid.token.string" }` → kỳ vọng **401**<br>• **09b** — Thiếu field: `{}` → kỳ vọng **400 VALIDATION_ERROR** (Zod chặn trước middleware Auth)         |
| **Kết quả mong đợi**     | **09a:** HTTP 401, `error.code: "UNAUTHORIZED"`, `error.message: "Invalid or expired refresh token"`<br>**09b:** HTTP 400, `error.code: "VALIDATION_ERROR"`, `error.details` chỉ rõ `refreshToken` bị thiếu                                                        |
| **Kết quả thực tế**      | **09a:** HTTP 401 Unauthorized. `error.code: "UNAUTHORIZED"`. `error.message: "Invalid or expired refresh token"`. <br>**09b:** HTTP 400 Bad Request. `error.code: "VALIDATION_ERROR"`. `error.details` chỉ rõ `refreshToken` expected string, received undefined. |
| **Trạng thái**           | Pass (2/2 sub-cases)                                                                                                                                                                                                                                               |
| **Ghi chú**              | **Lưu ý thiết kế:** Case B (body rỗng) trả về 400 chứ không phải 401 vì Zod Validation ở tầng middleware chặn trước khi request vào Auth logic. Đây là hành vi đúng theo thiết kế RESTful — test đã được điều chỉnh để phản ánh đúng hành vi thực tế.              |
| **Nhận xét**             |                                                                                                                                                                                                                                                                    |

---

### TC-AM-02-10: Protected route với token sai định dạng Bearer

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Authorization / Security                                                                                                                                                                                                                                                                     |
| **Mã TC**                | TC-AM-02-10                                                                                                                                                                                                                                                                                          |
| **Tiêu đề**              | Protected route trả về 401 khi Authorization header sai định dạng                                                                                                                                                                                                                                    |
| **Mô tả**                | Gửi token hợp lệ nhưng header `Authorization` không đúng định dạng `Bearer <token>`. Hệ thống phải từ chối.                                                                                                                                                                                          |
| **Loại kiểm thử**        | Security                                                                                                                                                                                                                                                                                             |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                                                                                                                               |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Có valid `accessToken` từ TC-AM-02-01 (lưu trong Environment)                                                                                                                                                                                                                |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `GET /api/v1/auth/me`<br>2. Test lần lượt các cách truyền token sai<br>3. Kiểm tra HTTP status code và response                                                                                                                                                           |
| **Dữ liệu đầu vào**      | Bộ test tách thành 3 sub-case độc lập (TC-AM-02-10a đến 10c):<br>• **10a** — Sai prefix: `Authorization: Token {{accessToken}}`<br>• **10b** — Thiếu "Bearer": `Authorization: {{accessToken}}` _(token trực tiếp không có prefix)_<br>• **10c** — Token giả: `Authorization: Bearer fake.token.xyz` |
| **Kết quả mong đợi**     | Mỗi case:<br>- HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`                                                                                                                                                                                        |
| **Kết quả thực tế**      | Tất cả 3 sub-case đều trả về HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. Middleware từ chối token không đúng định dạng Bearer.                                                                                                                                            |
| **Trạng thái**           | Pass (3/3 sub-cases)                                                                                                                                                                                                                                                                                 |
| **Ghi chú**              | Bộ test được tách thành 3 file `.request.yaml` riêng lẻ (TC-AM-02-10a đến 10c) để báo cáo chi tiết hơn.                                                                                                                                                                                              |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                      |

---

## UC-02: UI / E2E Tests — Đăng nhập (Login)

> **Loại kiểm thử:** UI / End-to-End  
> **Công cụ:** Trình duyệt (Chrome/Firefox) — kiểm tra thủ công trên giao diện  
> **Môi trường:** Frontend chạy tại `http://localhost:5173` (hoặc tương đương)

---

### TC-AM-02-UI-01: Login thành công (Happy Path)

| Trường                   | Nội dung                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Đăng nhập (UI)                                                                                                                                            |
| **Mã TC**                | TC-AM-02-UI-01                                                                                                                                                    |
| **Tiêu đề**              | Login thành công với tài khoản hợp lệ trên giao diện                                                                                                              |
| **Mô tả**                | Điền đúng email và password đã đăng ký. UI phải chuyển hướng vào Dashboard và hiển thị thông tin người dùng.                                                      |
| **Loại kiểm thử**        | UI / E2E                                                                                                                                                          |
| **Độ ưu tiên**           | High                                                                                                                                                              |
| **Điều kiện tiên quyết** | - Frontend đang chạy<br>- Tài khoản `testuser01@example.com` / `Password123!` đã tồn tại (chạy TC-AM-01-UI-01 trước)                                              |
| **Các bước thực hiện**   | 1. Mở trang đăng nhập<br>2. Nhập `Email`: `testuser01@example.com`<br>3. Nhập `Password`: `Password123!`<br>4. Nhấn nút **Đăng nhập (Login)**                     |
| **Dữ liệu đầu vào**      | `Email`: `testuser01@example.com` _(tài khoản đã đăng ký thành công)_<br>`Password`: `Password123!`                                                               |
| **Kết quả mong đợi**     | - Đăng nhập thành công, chuyển hướng vào trang **Dashboard** / trang chủ<br>- Tên người dùng (`Nguyen Van A`) hoặc Avatar hiển thị ở Header/Sidebar               |
| **Kết quả thực tế**      | Đăng nhập thành công, hệ thống hiển thị thông báo toast _"Signed in successfully!"_ góc dưới bên phải và tự động chuyển hướng vào trang Dashboard (`/dashboard`). |
| **Trạng thái**           | Pass                                                                                                                                                              |
| **Ghi chú**              | Happy path chính của luồng UI Login.                                                                                                                              |
| **Nhận xét**             |                                                                                                                                                                   |

---

### TC-AM-02-UI-02: Login thất bại — Sai mật khẩu

| Trường                   | Nội dung                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Luồng ngoại lệ (UI)                                                                                                                                                                                      |
| **Mã TC**                | TC-AM-02-UI-02                                                                                                                                                                                                   |
| **Tiêu đề**              | Login thất bại khi nhập đúng email nhưng sai password (UI)                                                                                                                                                       |
| **Mô tả**                | Điền đúng email nhưng sai password. UI phải hiển thị thông báo lỗi và không cho phép truy cập Dashboard.                                                                                                         |
| **Loại kiểm thử**        | UI / E2E                                                                                                                                                                                                         |
| **Độ ưu tiên**           | High                                                                                                                                                                                                             |
| **Điều kiện tiên quyết** | - Frontend đang chạy<br>- Tài khoản `testuser01@example.com` đã tồn tại                                                                                                                                          |
| **Các bước thực hiện**   | 1. Mở trang đăng nhập<br>2. Nhập `Email`: `testuser01@example.com`, `Password`: `WrongPassword999!`<br>3. Nhấn nút **Đăng nhập**                                                                                 |
| **Dữ liệu đầu vào**      | `Email`: `testuser01@example.com`<br>`Password`: `WrongPassword999!`                                                                                                                                             |
| **Kết quả mong đợi**     | - Hiển thị thông báo lỗi chung: _"Email hoặc mật khẩu không chính xác"_ (tránh ghi chi tiết "Sai mật khẩu" để bảo mật)<br>- Không cho phép truy cập vào Dashboard                                                |
| **Kết quả thực tế**      | Nút **Sign In** chuyển sang trạng thái loading (spinner) và bị treo vô hạn, hệ thống không hiển thị thông báo lỗi _"Email or password incorrect"_ hay giải phóng trạng thái nút bấm.                             |
| **Trạng thái**           | **Fail** _(Lỗi treo trạng thái Loading khi sai mật khẩu)_                                                                                                                                                        |
| **Ghi chú**              | **BUG:** Nút Sign In bị kẹt ở trạng thái loading vô hạn khi API trả về lỗi 401. Frontend không xử lý error state, cần kiểm tra error handler trong submit function. Tạo bug report tại `docs/test/bug-reports/`. |
| **Nhận xét**             |                                                                                                                                                                                                                  |

---

### TC-AM-02-UI-03: Login thất bại — Email chưa từng đăng ký

| Trường                   | Nội dung                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Luồng ngoại lệ (UI)                                                                                                               |
| **Mã TC**                | TC-AM-02-UI-03                                                                                                                            |
| **Tiêu đề**              | Login thất bại khi đăng nhập với email chưa có trong hệ thống (UI)                                                                        |
| **Mô tả**                | Điền email chưa tồn tại trong DB. UI phải hiển thị thông báo lỗi và không cho phép đăng nhập.                                             |
| **Loại kiểm thử**        | UI / E2E                                                                                                                                  |
| **Độ ưu tiên**           | High                                                                                                                                      |
| **Điều kiện tiên quyết** | - Frontend đang chạy<br>- Email `notfound_user999@example.com` chưa tồn tại trong DB                                                      |
| **Các bước thực hiện**   | 1. Mở trang đăng nhập<br>2. Nhập `Email`: `notfound_user999@example.com`, `Password`: `Password123!`<br>3. Nhấn nút **Đăng nhập**         |
| **Dữ liệu đầu vào**      | `Email`: `notfound_user999@example.com`<br>`Password`: `Password123!`                                                                     |
| **Kết quả mong đợi**     | Hiển thị thông báo lỗi: _"Email hoặc mật khẩu không chính xác"_                                                                           |
| **Kết quả thực tế**      | Hiển thị thông báo lỗi toast ở góc dưới bên phải: _"Email or password incorrect"_. Không cho phép đăng nhập.                              |
| **Trạng thái**           | Pass                                                                                                                                      |
| **Ghi chú**              | So sánh với TC-AM-02-UI-02 (Sai password): message lỗi hiển thị giống nhau → không lộ nguyên nhân chi tiết (User Enumeration prevention). |
| **Nhận xét**             |                                                                                                                                           |

---

### TC-AM-02-UI-04: Login thất bại — Để trống các trường bắt buộc

| Trường                   | Nội dung                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-02 — Validation UI                                                                                                                                                                                                                                                         |
| **Mã TC**                | TC-AM-02-UI-04                                                                                                                                                                                                                                                                |
| **Tiêu đề**              | Login thất bại khi để trống các trường bắt buộc (UI)                                                                                                                                                                                                                          |
| **Mô tả**                | Bấm nút Đăng nhập khi để trống Email hoặc Password. UI phải hiển thị lỗi validation inline và không gửi request lên backend.                                                                                                                                                  |
| **Loại kiểm thử**        | UI / Validation                                                                                                                                                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                          |
| **Điều kiện tiên quyết** | - Frontend đang chạy                                                                                                                                                                                                                                                          |
| **Các bước thực hiện**   | **Case A:** Để trống Email, nhập Password hợp lệ → Nhấn **Đăng nhập**<br>**Case B:** Nhập Email hợp lệ, để trống Password → Nhấn **Đăng nhập**                                                                                                                                |
| **Dữ liệu đầu vào**      | Case A: `Email` = rỗng, `Password` = `Password123!`<br>Case B: `Email` = `testuser01@example.com`, `Password` = rỗng                                                                                                                                                          |
| **Kết quả mong đợi**     | - Hiển thị báo lỗi: _"Vui lòng nhập Email / Mật khẩu"_<br>- Hệ thống không gửi request lên backend                                                                                                                                                                            |
| **Kết quả thực tế**      | **Case A** (Để trống Email): Hiển thị lỗi inline ngay dưới ô Email: _"Email is required"_.<br>**Case B** (Để trống Password): Hiển thị lỗi inline ngay dưới ô Password: _"Password must be at least 8 characters"_.<br>Hệ thống chặn submit và không gửi request lên backend. |
| **Trạng thái**           | Pass                                                                                                                                                                                                                                                                          |
| **Ghi chú**              | Đã verified cả 2 case A & B. Validation ở tầng Frontend.                                                                                                                                                                                                                      |
| **Nhận xét**             |                                                                                                                                                                                                                                                                               |

---

## Bảng tóm tắt — Module Authentication (AM)

> **API Tests — Lần chạy cuối:** 2026-07-25 | **Công cụ:** Postman CLI v1.44.0 | **Tổng requests:** 29 | **Tổng assertions:** 123 | **Thời gian:** 2.6s  
> **UI/E2E Tests — Lần chạy cuối:** 2026-07-25 | **Công cụ:** Trình duyệt thủ công

### API Tests

| Mã TC          | Use Case | Tiêu đề                                                   | Loại                     | Độ ưu tiên | Happy/Negative | Trạng thái |
| -------------- | -------- | --------------------------------------------------------- | ------------------------ | ---------- | -------------- | ---------- |
| TC-AM-01-01    | UC-01    | Register thành công với dữ liệu hợp lệ                    | Functionality            | High       | Happy          | Pass       |
| TC-AM-01-02    | UC-01    | Register thất bại — Email đã tồn tại (409)                | Functionality / Database | High       | Negative       | Pass       |
| TC-AM-01-03    | UC-01    | Register thất bại — Password < 8 ký tự (400)              | Functionality            | High       | Negative       | Pass       |
| TC-AM-01-04a~d | UC-01    | Register thất bại — Email format sai (400) [4 cases]      | Functionality            | High       | Negative       | Pass (4/4) |
| TC-AM-01-05a~d | UC-01    | Register thất bại — Thiếu trường bắt buộc (400) [4 cases] | Functionality            | Medium     | Negative       | Pass (4/4) |
| TC-AM-01-06    | UC-01    | Register thất bại — `name` < 2 ký tự (400)                | Functionality            | Medium     | Negative       | Pass       |
| TC-AM-01-07    | UC-01    | Register thành công — Validate response schema            | Interface / Security     | High       | Happy          | Pass       |
| TC-AM-01-08    | UC-01    | Register thất bại — Password chỉ là khoảng trắng          | Security                 | Medium     | Negative       | Pass       |
| TC-AM-02-01    | UC-02    | Login thành công với dữ liệu hợp lệ                       | Functionality            | High       | Happy          | Pass       |
| TC-AM-02-02    | UC-02    | Login thất bại — Sai password (401)                       | Functionality / Security | High       | Negative       | Pass       |
| TC-AM-02-03    | UC-02    | Login thất bại — Email không tồn tại (401)                | Functionality / Security | High       | Negative       | Pass       |
| TC-AM-02-04    | UC-02    | Protected route — Không có token (401)                    | Security                 | High       | Negative       | Pass       |
| TC-AM-02-05    | UC-02    | Protected route — Token hết hạn (401)                     | Security                 | High       | Negative       | Pass       |
| TC-AM-02-06a~c | UC-02    | Login thất bại — Thiếu trường bắt buộc (400) [3 cases]    | Functionality            | Medium     | Negative       | Pass (3/3) |
| TC-AM-02-07    | UC-02    | Protected route — Token hợp lệ → 200 OK                   | Functionality            | High       | Happy          | Pass       |
| TC-AM-02-08    | UC-02    | Refresh Token thành công (200)                            | Functionality            | High       | Happy          | Pass       |
| TC-AM-02-09a~b | UC-02    | Refresh Token thất bại — Token giả/Body rỗng [2 cases]    | Security                 | High       | Negative       | Pass (2/2) |
| TC-AM-02-10a~c | UC-02    | Protected route — Sai định dạng Bearer (401) [3 cases]    | Security                 | Medium     | Negative       | Pass (3/3) |

**Tổng cộng API:** 18 test cases gốc → **29 requests** | Happy Path: 5 | Negative: 13 | **Pass: 29** | **Fail: 0** | **Warning: 0**

### UI / E2E Tests

| Mã TC          | Use Case | Tiêu đề                                             | Loại            | Độ ưu tiên | Happy/Negative | Trạng thái                       |
| -------------- | -------- | --------------------------------------------------- | --------------- | ---------- | -------------- | -------------------------------- |
| TC-AM-01-UI-01 | UC-01    | Register thành công (Happy Path)                    | UI / E2E        | High       | Happy          | Pass                             |
| TC-AM-01-UI-02 | UC-01    | Register thất bại — Email đã tồn tại                | UI / E2E        | High       | Negative       | Pass                             |
| TC-AM-01-UI-03 | UC-01    | Register thất bại — Mật khẩu quá ngắn               | UI / Validation | High       | Negative       | Pass                             |
| TC-AM-01-UI-04 | UC-01    | Register thất bại — Sai định dạng Email [4 formats] | UI / Validation | High       | Negative       | Pass                             |
| TC-AM-01-UI-05 | UC-01    | Register thất bại — Tên quá ngắn (< 2 ký tự)        | UI / Validation | Medium     | Negative       | Pass                             |
| TC-AM-01-UI-06 | UC-01    | Register thất bại — Mật khẩu xác nhận không khớp    | UI / Validation | High       | Negative       | Pass                             |
| TC-AM-02-UI-01 | UC-02    | Login thành công (Happy Path)                       | UI / E2E        | High       | Happy          | Pass                             |
| TC-AM-02-UI-02 | UC-02    | Login thất bại — Sai mật khẩu                       | UI / E2E        | High       | Negative       | **Fail — Bug (Loading bị treo)** |
| TC-AM-02-UI-03 | UC-02    | Login thất bại — Email chưa từng đăng ký            | UI / E2E        | High       | Negative       | Pass                             |
| TC-AM-02-UI-04 | UC-02    | Login thất bại — Để trống trường bắt buộc [2 cases] | UI / Validation | High       | Negative       | Pass                             |

**Tổng cộng UI/E2E:** 10 test cases | Happy Path: 2 | Negative: 8 | **Pass: 9** | **Fail: 1 (Bug Frontend)** | **Warning: 0**

---

### Tổng hợp toàn module

| Loại kiểm thử | Tổng TC | Pass   | Fail  | Warning |
| ------------- | ------- | ------ | ----- | ------- |
| API           | 18      | 18     | 0     | 0       |
| UI / E2E      | 10      | 9      | 1     | 0       |
| **Tổng**      | **28**  | **27** | **1** | **0**   |

---

## Chú thích

### Trạng thái

| Trạng thái | Ý nghĩa                                                |
| ---------- | ------------------------------------------------------ |
| Not Run    | Chưa thực hiện test                                    |
| Pass       | Kết quả thực tế khớp kết quả mong đợi                  |
| Fail       | Có bug → tạo bug report trong `docs/test/bug-reports/` |
| Blocked    | Không thể test — phụ thuộc phần khác chưa hoàn thành   |

### Thứ tự chạy test đề xuất

Để các TC có dependency chạy đúng thứ tự:

```
TC-AM-01-01 (Register)
    ↓
TC-AM-02-01 (Login → lưu accessToken & refreshToken)
    ↓
TC-AM-02-07 (Gọi /me với token hợp lệ)
TC-AM-02-08 (Refresh token)
    ↓
TC-AM-02-05 (Dùng expired token)
```

Các TC validate độc lập (01-02 ~ 01-08, 02-02 ~ 02-06, 02-09, 02-10) có thể chạy theo bất kỳ thứ tự nào.
