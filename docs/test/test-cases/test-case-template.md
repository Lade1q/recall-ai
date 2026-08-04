# Mẫu Test Case — [Tên Module]

> **Module:** [VD: Authentication / AI Planning / Focus Session / ...]  
> **Use Case tham chiếu:** [Mã UC hoặc Tên tính năng liên quan]  
> **Người viết:** [Họ tên]  
> **Ngày tạo:** [YYYY-MM-DD]  
> **Ngày cập nhật:** [YYYY-MM-DD]  
> **Phiên bản:** [1.0]  
> **Loại kiểm thử chung:** [VD: Integration (API) + Database / E2E / Unit]

---

## TC-[MODULE]-001: [Tên ngắn gọn của test case]

| Trường                   | Nội dung                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **Function / Feature**   | [Tính năng cụ thể hoặc Bước trong luồng, VD: SP-01 Basic Flow — Bước 3–4]                     |
| **Mã TC**                | TC-[MODULE]-001                                                                               |
| **Tiêu đề**              | [Tên ngắn gọn, rõ ràng của test case]                                                         |
| **Mô tả**                | [Mô tả chi tiết kịch bản test này làm gì]                                                     |
| **Loại kiểm thử**        | [Functionality / Security / Usability / Interface / Database / Compatibility / Performance]   |
| **Độ ưu tiên**           | [High / Medium / Low]                                                                         |
| **Điều kiện tiên quyết** | [Cần chuẩn bị gì trước khi test? VD: Đã có tài khoản test, app đang chạy]                     |
| **Các bước thực hiện**   | 1. [Bước 1]<br>2. [Bước 2]<br>3. [Bước 3]                                                     |
| **Dữ liệu đầu vào**      | [Nhập gì vào form/field? VD: Email: test@example.com · Mật khẩu: Test@1234]                   |
| **Kết quả mong đợi**     | - [Điều gì phải xảy ra — đây là chuẩn để đánh giá Pass/Fail]<br>- [Có thể liệt kê nhiều dòng] |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                                         |
| **Trạng thái**           | Not Run                                                                                       |
| **Ghi chú**              | [Thông tin bổ sung nếu có]                                                                    |
| **Nhận xét**             | [Đánh giá, nhận xét thêm về behavior sau khi test xong]                                       |

---

## TC-[MODULE]-002: [Tên ngắn gọn]

| Trường                   | Nội dung              |
| ------------------------ | --------------------- |
| **Function / Feature**   |                       |
| **Mã TC**                | TC-[MODULE]-002       |
| **Tiêu đề**              |                       |
| **Mô tả**                |                       |
| **Loại kiểm thử**        |                       |
| **Độ ưu tiên**           |                       |
| **Điều kiện tiên quyết** |                       |
| **Các bước thực hiện**   | 1. <br>2. <br>3.      |
| **Dữ liệu đầu vào**      |                       |
| **Kết quả mong đợi**     | -                     |
| **Kết quả thực tế**      | _(điền sau khi test)_ |
| **Trạng thái**           | Not Run               |
| **Ghi chú**              |                       |
| **Nhận xét**             |                       |

---

## Bảng tóm tắt — [Tên Module]

| Mã TC           | Tiêu đề | Loại | Độ ưu tiên | Trạng thái |
| --------------- | ------- | ---- | ---------- | ---------- |
| TC-[MODULE]-001 |         |      |            | Not Run    |
| TC-[MODULE]-002 |         |      |            | Not Run    |

---

## Chú thích trạng thái

| Trạng thái | Ý nghĩa                                                  |
| ---------- | -------------------------------------------------------- |
| Not Run    | Chưa thực hiện test                                      |
| Pass       | Test qua — kết quả thực tế khớp với kết quả mong đợi     |
| Fail       | Test không qua — có bug → tạo bug report                 |
| Blocked    | Không thể test — phụ thuộc vào phần khác chưa hoàn thành |

---

## Chú thích loại kiểm thử

| Loại kiểm thử     | Kiểm tra điều gì                                       | Ví dụ trong dự án                                                |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| **Functionality** | Tính năng có hoạt động đúng như mô tả không?           | Đăng nhập thành công với email/mật khẩu hợp lệ                   |
| **Security**      | Dữ liệu người dùng có được bảo vệ không?               | Người dùng A không truy cập được data của người dùng B           |
| **Usability**     | Người dùng có dễ sử dụng, dễ hiểu không?               | Thông báo lỗi có rõ ràng không? Người dùng có bị nhầm lẫn không? |
| **Interface**     | Các thành phần hệ thống có giao tiếp đúng không?       | Frontend gửi dữ liệu → Backend nhận và xử lý đúng                |
| **Database**      | Dữ liệu có được lưu/đọc/xóa đúng không?                | Sau khi tạo plan, database có record đúng không?                 |
| **Compatibility** | App có chạy đúng trên các trình duyệt khác nhau không? | Tính năng upload ảnh có hoạt động trên Firefox không?            |
| **Performance**   | App có chạy nhanh, không bị lag không?                 | Trang Dashboard load dưới 3 giây?                                |
