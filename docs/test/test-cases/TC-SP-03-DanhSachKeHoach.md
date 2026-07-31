# Test Cases: SP-03 Xem danh sách Kế hoạch

> **Ngày tạo:** 2026-07-31
> **Loại kiểm thử:** Functionality + Security + Database

---

## UC-07: Xem danh sách kế hoạch ôn tập

**Endpoint:** `GET /api/v1/study-plans`

---

### TC-SP-07-01: Xem danh sách plans → hiển thị đúng plan vừa tạo

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | UC-07 — Luồng chính (Xem danh sách)                                                                                                                                                                                                                                                                                                                                                        |
| **Mã TC**                | TC-SP-07-01                                                                                                                                                                                                                                                                                                                                                                                |
| **Tiêu đề**              | Xem danh sách plans → plan vừa tạo xuất hiện với đầy đủ thông tin                                                                                                                                                                                                                                                                                                                          |
| **Mô tả**                | Sau khi tạo plan thành công (TC-SP-01-01), gọi API lấy danh sách plans. Plan vừa tạo phải xuất hiện với đầy đủ thông tin: tên, deadline, % tiến độ, số khái niệm.                                                                                                                                                                                                                          |
| **Loại kiểm thử**        | Functionality / Database                                                                                                                                                                                                                                                                                                                                                                   |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                                                                                                       |
| **Điều kiện tiên quyết** | - TC-SP-01-01 đã **Pass** (có ít nhất 1 plan `active`)<br>- Ghi lại `planId` từ TC-SP-01-01<br>- Student đã đăng nhập với cùng JWT token                                                                                                                                                                                                                                                   |
| **Các bước thực hiện**   | 1. Mở Postman, tạo request `GET /api/v1/study-plans`<br>2. Set Header: `Authorization: Bearer <valid_token>`<br>3. Gửi request<br>4. Kiểm tra HTTP status<br>5. Tìm plan với `id = planId` trong mảng response<br>6. Kiểm tra các trường của plan                                                                                                                                          |
| **Dữ liệu đầu vào**      | GET request với JWT token hợp lệ của student đã tạo plan<br>`planId` từ TC-SP-01-01: _(ghi lại động)_                                                                                                                                                                                                                                                                                      |
| **Kết quả mong đợi**     | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.plans` là mảng chứa plan với `id = planId`<br>- Plan item có: `id`, `name`, `deadline`, `status`, `createdAt`, `conceptCount` (số khái niệm)<br>- `name` = `"Ôn thi Cấu trúc Dữ liệu"`, `status` = `"active"`<br>- `deadline` là chuỗi ISO 8601 hợp lệ<br>- Nếu sắp xếp theo `createdAt` DESC, plan mới nhất nằm đầu danh sách |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                                                                                                                                                                                                                                                                                                                                      |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                                                                                                    |
| **Ghi chú**              | Danh sách chỉ hiển thị plan có `status = "active"` (không hiển thị bản nháp `draft`). Cần xác nhận với Dev xem `draft` có ẩn khỏi danh sách không.                                                                                                                                                                                                                                         |

---

### TC-SP-07-02: Xem danh sách khi chưa có plan → trả về mảng rỗng (E1)

| Trường                   | Nội dung                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-07 — Luồng ngoại lệ [E1] (Chưa có kế hoạch nào)                                                                                                                                 |
| **Mã TC**                | TC-SP-07-02                                                                                                                                                                        |
| **Tiêu đề**              | Xem danh sách khi user chưa có plan nào → trả về mảng rỗng (không phải null)                                                                                                       |
| **Mô tả**                | Student mới tạo tài khoản, chưa có plan nào. Gọi API danh sách phải trả về mảng rỗng `[]`, không phải `null` hoặc lỗi. Theo UC-07 [E1], giao diện sẽ hiển thị màn hình onboarding. |
| **Loại kiểm thử**        | Functionality / Database                                                                                                                                                           |
| **Độ ưu tiên**           | Medium                                                                                                                                                                             |
| **Điều kiện tiên quyết** | - Server đang chạy<br>- Student đã đăng nhập với tài khoản **mới chưa có plan nào**                                                                                                |
| **Các bước thực hiện**   | 1. Đăng nhập với tài khoản mới (chưa có plan)<br>2. Gọi `GET /api/v1/study-plans`<br>3. Kiểm tra HTTP status và response                                                           |
| **Dữ liệu đầu vào**      | JWT token của user mới, chưa tạo plan                                                                                                                                              |
| **Kết quả mong đợi**     | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.plans` = `[]` (mảng rỗng, **không phải** `null`)<br>- Không có lỗi 404 hay 500                                         |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                                                                                                                              |
| **Trạng thái**           | Not Run                                                                                                                                                                            |
| **Ghi chú**              | Quan trọng: `null` thay vì `[]` sẽ gây lỗi trong frontend khi try to `.map()`. Cần kiểm tra kỹ.                                                                                    |

---

### TC-SP-07-03: Danh sách chỉ chứa plan của user hiện tại — cách ly dữ liệu

| Trường                   | Nội dung                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-07 — Security (Cách ly dữ liệu giữa các user)                                                                                                                                                                                      |
| **Mã TC**                | TC-SP-07-03                                                                                                                                                                                                                           |
| **Tiêu đề**              | API trả về Plan tuân thủ cách ly dữ liệu giữa các User (Authorization - IDOR)                                                                                                                                                         |
| **Mô tả**                | Security test: User B không được phép nhìn thấy Plan của User A thông qua API danh sách (`GET /api/v1/study-plans`) cũng như API chi tiết (`GET /api/v1/study-plans/:id`).                                                            |
| **Loại kiểm thử**        | Security / Database                                                                                                                                                                                                                   |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                  |
| **Điều kiện tiên quyết** | - Có 2 user khác nhau: User A và User B, mỗi user có ít nhất 1 plan<br>- Có JWT token của cả 2 user                                                                                                                                   |
| **Các bước thực hiện**   | 1. Gọi `GET /api/v1/study-plans` với token User A → lấy `planId_A`<br>2. Thực hiện các sub-case bên dưới bằng token User B<br>3. Kiểm tra HTTP status và nội dung response.                                                           |
| **Dữ liệu đầu vào**      | `token_B`: JWT của User B.<br>Bộ 2 sub-case:<br>• **03a** — User B gọi API danh sách: `GET /api/v1/study-plans`<br>• **03b** — User B gọi API chi tiết của User A: `GET /api/v1/study-plans/{planId_A}`                               |
| **Kết quả mong đợi**     | - **03a**: HTTP **200 OK**, `data.plans` chỉ chứa plan của B, `planId_A` **không** xuất hiện trong list.<br>- **03b**: HTTP **403 Forbidden** hoặc **404 Not Found**, `"success": false`, hoàn toàn không lộ nội dung của `planId_A`. |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                                                                                                                                                                                 |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                               |
| **Ghi chú**              | _(Trống)_                                                                                                                                                                                                                             |

---

| Mã TC       | Tiêu đề ngắn                                 | Loại                     | Độ ưu tiên | Flow tham chiếu | Trạng thái |
| ----------- | -------------------------------------------- | ------------------------ | ---------- | --------------- | ---------- |
| TC-SP-07-01 | Xem danh sách → hiển thị đúng plan vừa tạo   | Functionality / Database | High       | Basic Flow      | Not Run    |
| TC-SP-07-02 | Xem danh sách khi chưa có plan → trả về `[]` | Functionality / Database | Medium     | [E1]            | Not Run    |
| TC-SP-07-03 | Danh sách chỉ chứa plan của user hiện tại    | Security / Database      | High       | Security        | Not Run    |
