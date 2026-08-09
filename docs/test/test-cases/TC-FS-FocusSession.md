# Test Cases — Focus Session

> **Module:** Focus Session  
> **Use Case tham chiếu:** UC-03 (UC-09, UC-10), FS-01  
> **Người viết:** Nguyễn Minh Phát  
> **Tài liệu nguồn:** `UC-03_FocusSession.md`, `SPEC_FS-01_ThucHienPhienHoc.md`  
> **Ngày tạo:** 2026-08-07  
> **Ngày cập nhật:** 2026-08-09  
> **Phiên bản:** 1.0  
> **Loại kiểm thử chung:** Functionality / UI-E2E / Integration

---

## Quy ước dữ liệu và môi trường

- Student A đã đăng nhập, có plan P1 với các concept C1, C2, C3 và tài liệu PDF hợp lệ.
- Student B là người dùng khác, có dữ liệu riêng; dùng để kiểm tra cô lập dữ liệu khi cần.
- Có thể cấu hình timer test ngắn (ví dụ 1 phút) **chỉ ở môi trường kiểm thử** để không phải chờ 25 phút; kết quả phải tương đương Pomodoro mặc định 25 phút.
- SRE test double có thể trả kết quả thành công, danh sách gợi ý hoặc lỗi có kiểm soát.
- Thời gian học thực tế là thời gian timer chạy; không gồm thời gian pause, rời tab trong Strict Mode hoặc thời gian sau khi hủy.
- Các trường **Kết quả thực tế**, **Trạng thái**, **Nhận xét** được để trống / `Not Run` để đội kiểm thử điền khi thực thi.

---

## Ma trận bao phủ yêu cầu

| Yêu cầu / luồng                              | Test case bao phủ    |
| -------------------------------------------- | -------------------- |
| Điều kiện đăng nhập và có kế hoạch           | TC-FS-001            |
| Thiết lập, chọn concept, Pomodoro mặc định   | TC-FS-002, TC-FS-003 |
| Bắt đầu, timer, PDF                          | TC-FS-004, TC-FS-005 |
| Ghi chú và auto-save                         | TC-FS-006            |
| Timer hết giờ, thông báo, hoàn tất           | TC-FS-007            |
| Kết thúc sớm                                 | TC-FS-008            |
| Pause / Resume                               | TC-FS-009            |
| Free Timer                                   | TC-FS-010            |
| Gợi ý concept từ SRE                         | TC-FS-011            |
| Strict Mode / rời tab                        | TC-FS-012            |
| Hủy phiên                                    | TC-FS-013            |
| Lưu record, thông báo SRE, không đổi mastery | TC-FS-014            |
| Mất mạng và đồng bộ lại                      | TC-FS-015            |
| Đóng tab / khôi phục phiên gián đoạn         | TC-FS-016            |
| Lịch sử, thống kê và trạng thái rỗng         | TC-FS-017, TC-FS-018 |
| SRE lỗi / không phản hồi khi gợi ý           | TC-FS-019            |
| Auto-save ghi chú khi mất mạng               | TC-FS-020            |
| PDF không tải được                           | TC-FS-021            |
| Cô lập dữ liệu phiên học giữa Student        | TC-FS-022            |

---

## UC-09 / FS-01 — Thực hiện phiên học

### TC-FS-001: Kiểm tra điều kiện tiên quyết để truy cập Focus Session

| Trường                   | Nội dung                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 / FS-01 — Pre-conditions                                                                                                                                                                                                                          |
| **Mã TC**                | TC-FS-001                                                                                                                                                                                                                                               |
| **Tiêu đề**              | Chỉ Student đã đăng nhập và có kế hoạch mới có thể bắt đầu phiên học                                                                                                                                                                                    |
| **Mô tả**                | Xác minh các điều kiện tiên quyết được áp dụng trước khi tạo hoặc chạy phiên học.                                                                                                                                                                       |
| **Loại kiểm thử**        | UI-E2E / Security                                                                                                                                                                                                                                       |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                                                     |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                    |
| **Điều kiện tiên quyết** | Có tài khoản Student A; có một tài khoản/chế độ chưa đăng nhập; có Student C đã đăng nhập nhưng chưa có plan.                                                                                                                                           |
| **Các bước thực hiện**   | 1. Thử mở màn hình Focus Session hoặc gọi thao tác bắt đầu khi chưa đăng nhập.<br>2. Đăng nhập bằng Student C chưa có plan, mở Focus Session.<br>3. Đăng nhập bằng Student A có P1 và mở Focus Session.                                                 |
| **Dữ liệu đầu vào**      | a) Không có phiên đăng nhập.<br>b) Student C không có plan.<br>c) Student A có P1, C1–C3.                                                                                                                                                               |
| **Kết quả mong đợi**     | a) Không cho tạo phiên; điều hướng đăng nhập hoặc trả lỗi xác thực; không có record mới.<br>b) Không cho bắt đầu phiên; hiển thị hướng dẫn/CTA tạo kế hoạch; không có record mới.<br>c) Hiển thị được màn hình thiết lập có danh sách concept thuộc P1. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                         |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                 |
| **Ghi chú**              | Không chấp nhận chỉ chặn ở UI: endpoint tạo phiên cũng phải từ chối request chưa xác thực.                                                                                                                                                              |
| **Nhận xét**             |                                                                                                                                                                                                                                                         |

---

### TC-FS-002: Hiển thị thiết lập phiên và cấu hình Pomodoro mặc định

| Trường                   | Nội dung                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 1–2                                                                                                                                                                                                                          |
| **Mã TC**                | TC-FS-002                                                                                                                                                                                                                                            |
| **Tiêu đề**              | Màn hình thiết lập hiển thị concept và Pomodoro 25 phút mặc định                                                                                                                                                                                     |
| **Mô tả**                | Từ Dashboard hoặc màn hình chi tiết môn học, Student mở một phiên mới.                                                                                                                                                                               |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                                                                                                               |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                                                  |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                 |
| **Điều kiện tiên quyết** | Student A đăng nhập, P1 đã có C1–C3.                                                                                                                                                                                                                 |
| **Các bước thực hiện**   | 1. Vào Focus Session từ Dashboard.<br>2. Quay lại và vào Focus Session từ màn hình chi tiết môn học.<br>3. Quan sát màn hình thiết lập trước khi chọn / bắt đầu.                                                                                     |
| **Dữ liệu đầu vào**      | P1 với C1, C2, C3.                                                                                                                                                                                                                                   |
| **Kết quả mong đợi**     | Cả hai điểm vào đều mở đúng màn hình thiết lập; danh sách concept của P1 được hiển thị; phương pháp mặc định là Pomodoro với thời lượng 25 phút; có thao tác chọn concept, xem gợi ý và xác nhận/bắt đầu. Chưa có timer chạy hoặc record hoàn thành. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                      |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                              |
| **Ghi chú**              | Kiểm thử 25 phút qua cấu hình timer test ngắn, không thay đổi ý nghĩa cấu hình mặc định trên production.                                                                                                                                             |
| **Nhận xét**             |                                                                                                                                                                                                                                                      |

---

### TC-FS-003: Chọn concept hợp lệ trước khi bắt đầu

| Trường                   | Nội dung                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 2–3                                                                                                                                                              |
| **Mã TC**                | TC-FS-003                                                                                                                                                                                |
| **Tiêu đề**              | Bắt buộc chọn concept và lưu đúng tập concept đã chọn                                                                                                                                    |
| **Mô tả**                | Kiểm tra validation lựa chọn concept và các tổ hợp lựa chọn hợp lệ.                                                                                                                      |
| **Loại kiểm thử**        | UI-E2E / Validation                                                                                                                                                                      |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                      |
| **Độ ưu tiên**           | High                                                                                                                                                                                     |
| **Điều kiện tiên quyết** | Đang ở màn hình thiết lập của P1.                                                                                                                                                        |
| **Các bước thực hiện**   | 1. Không chọn concept, nhấn Bắt đầu.<br>2. Chọn riêng C1 rồi bắt đầu và kết thúc phiên.<br>3. Tạo phiên khác, chọn đồng thời C1, C2, C3 rồi kết thúc.                                    |
| **Dữ liệu đầu vào**      | a) `concept_ids = []`.<br>b) `[C1]`.<br>c) `[C1, C2, C3]`.                                                                                                                               |
| **Kết quả mong đợi**     | a) Không thể bắt đầu; hiển thị lỗi yêu cầu chọn ít nhất một concept; không tạo record.<br>b) Phiên chỉ liên kết C1.<br>c) Phiên liên kết đủ C1, C2, C3, không mất hoặc nhân bản concept. |
| **Kết quả thực tế**      |                                                                                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                                                                  |
| **Ghi chú**              | Kiểm tra cả payload/DB nếu hệ thống có API hoặc DB test.                                                                                                                                 |
| **Nhận xét**             |                                                                                                                                                                                          |

---

### TC-FS-004: Bắt đầu phiên Pomodoro và timer đếm ngược

| Trường                   | Nội dung                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 3–6                                                                                                                                                                                       |
| **Mã TC**                | TC-FS-004                                                                                                                                                                                                         |
| **Tiêu đề**              | Timer chạy khi Student nhấn Bắt đầu phiên Pomodoro                                                                                                                                                                |
| **Mô tả**                | Kiểm tra chuyển từ thiết lập sang giao diện học và trạng thái timer đang chạy.                                                                                                                                    |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                                                                            |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                               |
| **Độ ưu tiên**           | Critical                                                                                                                                                                                                          |
| **Điều kiện tiên quyết** | Đã chọn C1; Pomodoro mặc định đang được chọn.                                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Nhấn xác nhận/bắt đầu ở màn hình thiết lập.<br>2. Ở giao diện phiên học, nhấn **Bắt đầu**.<br>3. Quan sát timer trong ít nhất hai nhịp.                                                                        |
| **Dữ liệu đầu vào**      | `concept_ids = [C1]`, mode Pomodoro 25 phút.                                                                                                                                                                      |
| **Kết quả mong đợi**     | Hiển thị giao diện học chính gồm timer, tài liệu PDF, ghi chú và các điều khiển phiên. Sau khi nhấn Bắt đầu, timer đếm ngược liên tục từ thời lượng đã cấu hình; chỉ thời gian đang chạy mới được tính vào phiên. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                   |
| **Trạng thái**           | Not Run                                                                                                                                                                                                           |
| **Ghi chú**              | Ghi nhận `started_at` theo thiết kế lưu cục bộ/phiên để hỗ trợ khôi phục khi đóng tab.                                                                                                                            |
| **Nhận xét**             |                                                                                                                                                                                                                   |

---

### TC-FS-005: Hiển thị tài liệu PDF song song trong phiên học

| Trường                   | Nội dung                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 4, 7                                                                                                                                                      |
| **Mã TC**                | TC-FS-005                                                                                                                                                                         |
| **Tiêu đề**              | Student có thể xem tài liệu gốc PDF trong giao diện side-by-side                                                                                                                  |
| **Mô tả**                | Xác minh tài liệu gốc của plan được mở đồng thời với timer/ghi chú, không làm gián đoạn phiên.                                                                                    |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                                            |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                  |
| **Độ ưu tiên**           | Medium                                                                                                                                                                            |
| **Điều kiện tiên quyết** | P1 có tài liệu PDF có thể đọc; phiên Pomodoro đang chạy cho C1.                                                                                                                   |
| **Các bước thực hiện**   | 1. Mở phiên đang chạy.<br>2. Quan sát khung PDF và khung timer/ghi chú.<br>3. Cuộn hoặc chuyển trang PDF (nếu tài liệu nhiều trang).<br>4. Xác nhận timer tiếp tục chạy.          |
| **Dữ liệu đầu vào**      | PDF nhiều trang liên kết với P1.                                                                                                                                                  |
| **Kết quả mong đợi**     | PDF gốc hiển thị được trong khung song song; Student đọc/điều hướng tài liệu bình thường; timer và nội dung ghi chú vẫn giữ trạng thái, không bị reset hoặc dừng vì thao tác PDF. |
| **Kết quả thực tế**      |                                                                                                                                                                                   |
| **Trạng thái**           | Not Run                                                                                                                                                                           |
| **Ghi chú**              | Đặc tả chỉ quy định PDF có sẵn trong phiên; hành vi chi tiết khi file không tải được cần có yêu cầu lỗi riêng.                                                                    |
| **Nhận xét**             |                                                                                                                                                                                   |

---

### TC-FS-006: Nhập, liên kết concept và auto-save ghi chú

| Trường                   | Nội dung                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 7–8                                                                                                                                                                         |
| **Mã TC**                | TC-FS-006                                                                                                                                                                                           |
| **Tiêu đề**              | Ghi chú nhanh được tự lưu và liên kết đúng concept                                                                                                                                                  |
| **Mô tả**                | Kiểm tra auto-save trong lúc học và tính toàn vẹn dữ liệu ghi chú sau khi hoàn tất.                                                                                                                 |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                 |
| **Độ ưu tiên**           | High                                                                                                                                                                                                |
| **Điều kiện tiên quyết** | Phiên đang chạy với C1 và C2 được chọn.                                                                                                                                                             |
| **Các bước thực hiện**   | 1. Nhập ghi chú N1, liên kết C1; chờ chu kỳ auto-save hoặc chỉ báo đã lưu.<br>2. Sửa N1, thêm ghi chú N2 liên kết C2; chờ auto-save.<br>3. Kết thúc phiên và mở lại record/lịch sử phiên.           |
| **Dữ liệu đầu vào**      | N1: `"Định nghĩa cây nhị phân"` → C1.<br>N2: `"Duyệt inorder: trái-gốc-phải"` → C2.                                                                                                                 |
| **Kết quả mong đợi**     | Mỗi lần auto-save, nội dung mới nhất được giữ mà không cần kết thúc phiên; sau khi hoàn tất N1/N2 tồn tại, thuộc đúng phiên và liên kết đúng C1/C2; nội dung cũ của N1 không thay thế bản sửa cuối. |
| **Kết quả thực tế**      |                                                                                                                                                                                                     |
| **Trạng thái**           | Not Run                                                                                                                                                                                             |
| **Ghi chú**              | Có thể kiểm tra reload nhẹ sau auto-save nếu môi trường không làm mất phiên.                                                                                                                        |
| **Nhận xét**             |                                                                                                                                                                                                     |

---

### TC-FS-007: Tự động hoàn tất khi Pomodoro hết giờ

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Main Flow — bước 5–7; FS-01 bước 9–12                                                                                                                                                                                                                                                          |
| **Mã TC**                | TC-FS-007                                                                                                                                                                                                                                                                                            |
| **Tiêu đề**              | Hết giờ Pomodoro phát thông báo và lưu phiên hoàn thành                                                                                                                                                                                                                                              |
| **Mô tả**                | Kiểm tra điểm kết thúc tự nhiên của timer.                                                                                                                                                                                                                                                           |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                                                                                                                 |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                                                                                                  |
| **Độ ưu tiên**           | Critical                                                                                                                                                                                                                                                                                             |
| **Điều kiện tiên quyết** | Phiên Pomodoro timer test ngắn đang chạy, có C1 và ghi chú đã auto-save.                                                                                                                                                                                                                             |
| **Các bước thực hiện**   | 1. Chờ timer đếm về 0, không nhấn Kết thúc sớm.<br>2. Quan sát thông báo hoàn thành.<br>3. Xác nhận thao tác Kết thúc phiên học nếu giao diện yêu cầu xác nhận.<br>4. Mở tổng kết/record phiên.                                                                                                      |
| **Dữ liệu đầu vào**      | Pomodoro C1, timer test 1 phút.                                                                                                                                                                                                                                                                      |
| **Kết quả mong đợi**     | Khi 0: hệ thống phát thông báo âm thanh **hoặc** trực quan; không đếm âm; phiên chuyển sang hoàn tất sau thao tác xác nhận cần thiết; lưu `user_id`, `concept_ids`, `started_at`, `ended_at`, `duration_minutes` và ghi chú; hiển thị tổng kết cùng lựa chọn nghỉ hoặc chuyển AI Examiner/Interview. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                      |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                              |
| **Ghi chú**              | Chấp nhận một trong hai hình thức thông báo theo UC-09.                                                                                                                                                                                                                                              |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                      |

---

### TC-FS-008: Kết thúc phiên Pomodoro sớm

| Trường                   | Nội dung                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Alternative A1; FS-01 bước 9                                                                                                                                          |
| **Mã TC**                | TC-FS-008                                                                                                                                                                   |
| **Tiêu đề**              | Kết thúc sớm lưu thời gian thực tế, không ghi đủ 25 phút                                                                                                                    |
| **Mô tả**                | Student chủ động kết thúc trước khi timer bằng 0.                                                                                                                           |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                        |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                         |
| **Độ ưu tiên**           | High                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Pomodoro 25 phút đang chạy cho C1.                                                                                                                                          |
| **Các bước thực hiện**   | 1. Để timer chạy khoảng 5 phút (hoặc 10 giây ở môi trường test).<br>2. Nhấn **Kết thúc phiên**.<br>3. Hoàn tất xác nhận nếu có và kiểm tra record/tổng kết.                 |
| **Dữ liệu đầu vào**      | C1; thời gian chạy thực tế T, với `0 < T < 25 phút`.                                                                                                                        |
| **Kết quả mong đợi**     | Phiên hoàn thành; `ended_at` được ghi nhận; `duration_minutes`/thời lượng thực tế xấp xỉ T theo quy tắc làm tròn của hệ thống và **nhỏ hơn 25 phút**; không tự gán 25 phút. |
| **Kết quả thực tế**      |                                                                                                                                                                             |
| **Trạng thái**           | Not Run                                                                                                                                                                     |
| **Ghi chú**              | Sai số chỉ do độ phân giải timer / quy tắc làm tròn; cần thống nhất quy tắc này nếu API trả phút nguyên.                                                                    |
| **Nhận xét**             |                                                                                                                                                                             |

---

### TC-FS-009: Tạm dừng và tiếp tục phiên học

| Trường                   | Nội dung                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Alternative A2; FS-01 Alternative flow 3                                                                                                                                                                            |
| **Mã TC**                | TC-FS-009                                                                                                                                                                                                                 |
| **Tiêu đề**              | Pause dừng timer, Resume chạy tiếp và loại trừ toàn bộ thời gian pause                                                                                                                                                    |
| **Mô tả**                | Kiểm tra một và nhiều lần pause/resume trong cùng phiên.                                                                                                                                                                  |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                                      |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                       |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                      |
| **Điều kiện tiên quyết** | Pomodoro đang chạy với C1.                                                                                                                                                                                                |
| **Các bước thực hiện**   | 1. Chạy T1, nhấn Tạm dừng và giữ pause P1.<br>2. Xác minh số đếm không đổi trong P1; nhấn Tiếp tục và chạy T2.<br>3. Lặp lại Pause/Resume với P2, chạy T3 rồi kết thúc sớm.                                               |
| **Dữ liệu đầu vào**      | T1, T2, T3 > 0; P1, P2 > 0.                                                                                                                                                                                               |
| **Kết quả mong đợi**     | Mỗi lần Pause, timer dừng chính xác và trạng thái được giữ; Resume tiếp tục từ thời lượng còn lại, không reset; record cuối có thời lượng xấp xỉ `T1 + T2 + T3`, không gồm `P1 + P2`; không tạo record tách rời do pause. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                           |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                   |
| **Ghi chú**              | Phủ trường hợp lặp pause/resume, không chỉ một lần.                                                                                                                                                                       |
| **Nhận xét**             |                                                                                                                                                                                                                           |

---

### TC-FS-010: Thực hiện Free Timer

| Trường                   | Nội dung                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Alternative A3                                                                                                                                                                                      |
| **Mã TC**                | TC-FS-010                                                                                                                                                                                                 |
| **Tiêu đề**              | Free Timer không tự kết thúc và lưu thời gian khi Student chủ động dừng                                                                                                                                   |
| **Mô tả**                | Kiểm tra phương pháp “Không giới hạn thời gian”.                                                                                                                                                          |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                      |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                       |
| **Độ ưu tiên**           | High                                                                                                                                                                                                      |
| **Điều kiện tiên quyết** | Ở màn hình thiết lập, C1 đã được chọn.                                                                                                                                                                    |
| **Các bước thực hiện**   | 1. Chọn **Không giới hạn thời gian** / Free Timer.<br>2. Bắt đầu, để chạy qua thời lượng Pomodoro mặc định (dùng ngưỡng test ngắn).<br>3. Xác nhận phiên vẫn đang chạy, sau đó nhấn Kết thúc phiên.       |
| **Dữ liệu đầu vào**      | C1; mode Free Timer; thời lượng thực tế T.                                                                                                                                                                |
| **Kết quả mong đợi**     | Timer thể hiện thời gian đã học hoặc cơ chế phù hợp cho Free Timer; không phát sự kiện hoàn tất tại mốc Pomodoro; chỉ kết thúc khi Student nhấn Kết thúc; record lưu thời gian thực tế T và concept đúng. |
| **Kết quả thực tế**      |                                                                                                                                                                                                           |
| **Trạng thái**           | Not Run                                                                                                                                                                                                   |
| **Ghi chú**              | Free Timer vẫn phải xử lý được pause/resume theo hành vi chung của phiên.                                                                                                                                 |
| **Nhận xét**             |                                                                                                                                                                                                           |

---

### TC-FS-011: Xem gợi ý concept từ SRE và chọn để học

| Trường                   | Nội dung                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative flow 1 — include FS-06                                                                                                                                                                                               |
| **Mã TC**                | TC-FS-011                                                                                                                                                                                                                              |
| **Tiêu đề**              | SRE trả danh sách concept ưu tiên và Student chọn được concept gợi ý                                                                                                                                                                   |
| **Mô tả**                | Kiểm tra tích hợp yêu cầu gợi ý trước khi bắt đầu phiên.                                                                                                                                                                               |
| **Loại kiểm thử**        | Integration / UI-E2E                                                                                                                                                                                                                   |
| **Phương thức thực thi** | Manual + SRE test double                                                                                                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                   |
| **Điều kiện tiên quyết** | Student A ở bước thiết lập; SRE test double trả C2, C3 theo mastery/deadline.                                                                                                                                                          |
| **Các bước thực hiện**   | 1. Nhấn **Xem gợi ý**.<br>2. Kiểm tra danh sách SRE trả về.<br>3. Chọn C2 từ danh sách rồi xác nhận bắt đầu phiên.<br>4. Hoàn tất phiên và kiểm tra record.                                                                            |
| **Dữ liệu đầu vào**      | SRE response: `[C2, C3]`, lý do ưu tiên hợp lệ.                                                                                                                                                                                        |
| **Kết quả mong đợi**     | Hệ thống gửi yêu cầu SRE và hiển thị danh sách concept ưu tiên; Student chọn được C2; luồng quay về bước chọn/xác nhận bình thường; record phiên liên kết C2. Không tự bắt đầu phiên hoặc ép chọn một gợi ý khi Student chưa xác nhận. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                        |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                |
| **Ghi chú**              | Đặc tả không nêu hành vi khi SRE không phản hồi/lỗi; cần bổ sung yêu cầu phục hồi để có expected result có thể nghiệm thu.                                                                                                             |
| **Nhận xét**             |                                                                                                                                                                                                                                        |

---

### TC-FS-012: Strict Mode tạm dừng khi rời tab và ghi nhận lần rời tab

| Trường                   | Nội dung                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative flow 2                                                                                                                                                                                                                                             |
| **Mã TC**                | TC-FS-012                                                                                                                                                                                                                                                            |
| **Tiêu đề**              | Strict Mode theo dõi Page Visibility, không khóa tab/browser                                                                                                                                                                                                         |
| **Mô tả**                | Kiểm tra giới hạn kỹ thuật được nêu trong đặc tả: hệ thống dừng tính thời gian khi tab không còn hiển thị nhưng không thể chặn Student chuyển tab.                                                                                                                   |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                                                                                                                               |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                                                                                                     |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                 |
| **Điều kiện tiên quyết** | Phiên C1 đang chạy, Strict Mode bật.                                                                                                                                                                                                                                 |
| **Các bước thực hiện**   | 1. Chạy timer T1.<br>2. Chuyển sang tab/app khác trong P1 rồi quay lại.<br>3. Xác nhận timer bị tạm dừng/không tính P1, kiểm tra số lần rời tab.<br>4. Tiếp tục học T2, lặp lại một lần rồi hoàn tất.                                                                |
| **Dữ liệu đầu vào**      | Hai lần `visibilitychange: hidden → visible`; T1/T2 > 0; P1/P2 > 0.                                                                                                                                                                                                  |
| **Kết quả mong đợi**     | Student vẫn có thể rời tab/app (không có hành vi khóa/chặn); mỗi lần rời tab được ghi nhận trong phiên; timer dừng hoặc thời lượng tập trung không tăng trong P1/P2; sau quay lại có thể tiếp tục theo UI; thời lượng cuối chỉ tính T1 + T2 và các đoạn chạy hợp lệ. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                      |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                              |
| **Ghi chú**              | Không bật Strict Mode thì việc rời tab không thuộc hành vi thay thế này; có thể chạy smoke test đối chứng nếu product cho phép.                                                                                                                                      |
| **Nhận xét**             |                                                                                                                                                                                                                                                                      |

---

### TC-FS-013: Hủy phiên học giữa chừng

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative flow 4                                                                                                                                                                                                                                                                                    |
| **Mã TC**                | TC-FS-013                                                                                                                                                                                                                                                                                                   |
| **Tiêu đề**              | Hộp thoại hủy xử lý đúng cả xác nhận và từ chối hủy                                                                                                                                                                                                                                                         |
| **Mô tả**                | Kiểm tra cancellation từ giai đoạn phiên đang diễn ra.                                                                                                                                                                                                                                                      |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                                                                                                                        |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                                                                                                         |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Một phiên C1 đang chạy, có thời gian và ghi chú chưa hoàn tất.                                                                                                                                                                                                                                              |
| **Các bước thực hiện**   | 1. Nhấn **Hủy phiên học**.<br>2. Ở hộp thoại xác nhận, chọn Không / Đóng hộp thoại; kiểm tra phiên tiếp tục.<br>3. Nhấn Hủy lần nữa và chọn Đồng ý.<br>4. Kiểm tra màn hình trước đó, record và dữ liệu tiến độ.                                                                                            |
| **Dữ liệu đầu vào**      | a) Quyết định `Không`.<br>b) Quyết định `Đồng ý`.                                                                                                                                                                                                                                                           |
| **Kết quả mong đợi**     | a) Hộp thoại đóng, phiên và timer tiếp tục, không mất trạng thái.<br>b) Phiên đóng và quay về giao diện trước đó; không ghi nhận thời gian học như phiên hoàn thành **hoặc** có record trạng thái `Đã hủy` theo cấu hình sản phẩm; không gửi dữ liệu hoàn thành cho SRE và không cập nhật thống kê học tập. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                             |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                     |
| **Ghi chú**              | Đặc tả cho phép hai chiến lược lưu dữ liệu hủy; đội BA/dev phải chốt một chiến lược để pass/fail hoàn toàn xác định.                                                                                                                                                                                        |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                             |

---

### TC-FS-014: Lưu hoàn chỉnh record và thông báo SRE khi phiên hoàn tất

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Main Flow — bước 6–7; FS-01 Basic Flow — bước 10–12                                                                                                                                                                                                                                                                                                                                |
| **Mã TC**                | TC-FS-014                                                                                                                                                                                                                                                                                                                                                                                |
| **Tiêu đề**              | Hoàn tất phiên lưu dữ liệu đầy đủ, cập nhật thống kê nhưng không đổi mastery score                                                                                                                                                                                                                                                                                                       |
| **Mô tả**                | Kiểm tra transaction/tích hợp cuối luồng bằng SRE test double thành công.                                                                                                                                                                                                                                                                                                                |
| **Loại kiểm thử**        | Integration / Database                                                                                                                                                                                                                                                                                                                                                                   |
| **Phương thức thực thi** | Playwright / Manual + DB verify                                                                                                                                                                                                                                                                                                                                                          |
| **Độ ưu tiên**           | Critical                                                                                                                                                                                                                                                                                                                                                                                 |
| **Điều kiện tiên quyết** | Biết giá trị trước phiên của C1/C2: `totalStudyTime`, `sessionCount`, `mastery_score`, `lastTestedAt`; SRE trả success. Phiên C1,C2 có ghi chú đã chạy thời lượng T.                                                                                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Kết thúc phiên hoàn chỉnh.<br>2. Kiểm tra response/tổng kết và record phiên.<br>3. Kiểm tra message/request gửi SRE.<br>4. Đọc lại thống kê của C1/C2 sau khi SRE xử lý.                                                                                                                                                                                                              |
| **Dữ liệu đầu vào**      | `user_id = Student A`, `concept_ids = [C1,C2]`, `started_at`, `ended_at`, T, ghi chú N1/N2.                                                                                                                                                                                                                                                                                              |
| **Kết quả mong đợi**     | Record chứa đúng `user_id`, các `concept_ids`, `started_at`, `ended_at`, thời lượng T và ghi chú liên quan; thông tin hoàn thành được gửi cho SRE; `totalStudyTime` tăng T và `sessionCount` tăng 1 cho các concept liên quan. `mastery_score` và `lastTestedAt` **không thay đổi** vì chỉ AI Examiner (AE-02) được ghi hai trường này. UI hiển thị tổng kết và lựa chọn bước tiếp theo. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                                                                                                  |
| **Ghi chú**              | Đây là assertion quan trọng vì phần mô tả cũ có thể gây hiểu nhầm rằng Focus Session cập nhật mastery.                                                                                                                                                                                                                                                                                   |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                                                          |

---

### TC-FS-015: Timer hoạt động khi mất mạng và đồng bộ khi có lại kết nối

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Exception E1                                                                                                                                                                                                                                                                                        |
| **Mã TC**                | TC-FS-015                                                                                                                                                                                                                                                                                                 |
| **Tiêu đề**              | Phiên offline vẫn đo thời gian ở client và được sync sau khi online                                                                                                                                                                                                                                       |
| **Mô tả**                | Mô phỏng mất Internet trong lúc timer đang chạy, sau đó khôi phục mạng.                                                                                                                                                                                                                                   |
| **Loại kiểm thử**        | UI-E2E / Resilience / Integration                                                                                                                                                                                                                                                                         |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                                                                                                                                          |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                      |
| **Điều kiện tiên quyết** | Phiên C1 đã bắt đầu khi online; có thể bật/tắt network trong browser test.                                                                                                                                                                                                                                |
| **Các bước thực hiện**   | 1. Để timer chạy T1 khi online.<br>2. Ngắt Internet, để timer chạy T2; có thể nhập ghi chú nếu UI cho phép.<br>3. Kết thúc khi vẫn offline hoặc chờ hết giờ.<br>4. Khôi phục Internet và chờ cơ chế sync; kiểm tra server/history.                                                                        |
| **Dữ liệu đầu vào**      | Offline trong khoảng T2 > 0; `T = T1 + T2` (trừ pause nếu có).                                                                                                                                                                                                                                            |
| **Kết quả mong đợi**     | Trong offline, timer trên client tiếp tục chạy đúng, UI không reset/mất tiến trình; không tạo record server bị thiếu hoặc trùng khi request thất bại. Khi online lại, một record hoàn thành duy nhất được đồng bộ với đúng concept, ghi chú và thời lượng thực tế T; SRE chỉ nhận một thông báo hoàn tất. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                           |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                   |
| **Ghi chú**              | Cần kiểm tra cả trường hợp sync được kích hoạt sau khi phiên đã kết thúc offline.                                                                                                                                                                                                                         |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                           |

---

### TC-FS-016: Khôi phục phiên bị gián đoạn do đóng tab/browser

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 Exception E2                                                                                                                                                                                                                                                                                                                                   |
| **Mã TC**                | TC-FS-016                                                                                                                                                                                                                                                                                                                                            |
| **Tiêu đề**              | Lưu `started_at` cục bộ và hỏi ghi nhận phiên khi Student mở lại                                                                                                                                                                                                                                                                                     |
| **Mô tả**                | Kiểm tra recovery dựa trên localStorage theo đặc tả.                                                                                                                                                                                                                                                                                                 |
| **Loại kiểm thử**        | UI-E2E / Resilience                                                                                                                                                                                                                                                                                                                                  |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                                                                                                                                                                                     |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                                                                 |
| **Điều kiện tiên quyết** | Phiên C1 đang chạy; có thể kiểm tra localStorage trong browser test.                                                                                                                                                                                                                                                                                 |
| **Các bước thực hiện**   | 1. Bắt đầu phiên và xác nhận `started_at`/thông tin phục hồi được lưu cục bộ.<br>2. Đóng tab hoặc browser không thực hiện Kết thúc/Hủy.<br>3. Mở lại ứng dụng bằng cùng trình duyệt và đăng nhập nếu cần.<br>4. Tại câu hỏi phiên bị gián đoạn, thực hiện lần lượt a) chọn ghi nhận, b) trong lần chạy độc lập chọn không ghi nhận.                  |
| **Dữ liệu đầu vào**      | a) Quyết định `Ghi nhận`.<br>b) Quyết định `Không ghi nhận`.                                                                                                                                                                                                                                                                                         |
| **Kết quả mong đợi**     | Khi mở lại, hệ thống nhận diện phiên gián đoạn và hỏi đúng như đặc tả.<br>a) Tạo/lưu một record phù hợp với thời gian có thể xác định từ dữ liệu khôi phục, sau đó xóa/đánh dấu đã xử lý dữ liệu local để không hỏi/lưu trùng ở lần sau.<br>b) Không tạo record hoàn thành; dữ liệu khôi phục được xóa/đánh dấu đã xử lý để không lặp prompt vô hạn. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                                                                      |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                                                              |
| **Ghi chú**              | Quy tắc tính `ended_at`/duration chính xác cho tab đóng cần được đặc tả thêm nếu hệ thống không thể biết thời điểm đóng một cách tin cậy.                                                                                                                                                                                                            |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                      |

---

## UC-10 — Xem lịch sử phiên học

### TC-FS-017: Xem lịch sử theo ngày/tuần và thống kê tổng hợp

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-10 Main Flow — bước 1–3                                                                                                                                                                                                                                                                   |
| **Mã TC**                | TC-FS-017                                                                                                                                                                                                                                                                                    |
| **Tiêu đề**              | Lịch sử hiển thị đúng phiên và tổng hợp thời gian, Pomodoro, concept                                                                                                                                                                                                                         |
| **Mô tả**                | Kiểm tra toàn bộ dữ liệu hoàn thành được trình bày cho đúng người dùng theo phạm vi ngày/tuần.                                                                                                                                                                                               |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                                                                                                         |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                                                                                                                                          |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                         |
| **Điều kiện tiên quyết** | Student A có: S1 Pomodoro hôm nay C1 (25 phút), S2 Free Timer hôm nay C2 (10 phút), S3 Pomodoro trong 7 ngày C1,C3 (25 phút), S4 ngoài 7 ngày; Student B có một phiên riêng.                                                                                                                 |
| **Các bước thực hiện**   | 1. Đăng nhập Student A, vào **Lịch sử & Tiến độ**.<br>2. Xem danh sách theo ngày và theo tuần/7 ngày.<br>3. Đối chiếu tổng thời gian hôm nay, 7 ngày, số Pomodoro hoàn thành và concept đã ôn với test data.<br>4. Kiểm tra Student B không xuất hiện.                                       |
| **Dữ liệu đầu vào**      | S1–S4 như điều kiện tiên quyết; tất cả session đều completed.                                                                                                                                                                                                                                |
| **Kết quả mong đợi**     | Danh sách hiển thị session của Student A đúng ngày/tuần, có thời gian và concept liên quan; hôm nay = 35 phút (S1+S2), 7 ngày = 60 phút (S1+S2+S3), số Pomodoro hoàn thành = 2, concept tổng hợp gồm C1/C2/C3. S4 và session của Student B không được tính/hiển thị trong phạm vi tương ứng. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                              |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                      |
| **Ghi chú**              | Nếu sản phẩm hiển thị theo timezone người dùng, tạo test data sát mốc ngày để kiểm thêm biên timezone.                                                                                                                                                                                       |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                              |

---

### TC-FS-018: Hiển thị trạng thái rỗng khi chưa có phiên học

| Trường                   | Nội dung                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | UC-10 Exception E1                                                                                                                                                       |
| **Mã TC**                | TC-FS-018                                                                                                                                                                |
| **Tiêu đề**              | Lịch sử trống hiển thị CTA bắt đầu phiên đầu tiên                                                                                                                        |
| **Mô tả**                | Xác minh trải nghiệm của Student chưa hoàn thành Focus Session nào.                                                                                                      |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                                   |
| **Phương thức thực thi** | Playwright / Manual                                                                                                                                                      |
| **Độ ưu tiên**           | Medium                                                                                                                                                                   |
| **Điều kiện tiên quyết** | Student C đăng nhập, có plan/concept nhưng không có session hoàn thành.                                                                                                  |
| **Các bước thực hiện**   | 1. Vào màn hình **Lịch sử & Tiến độ**.<br>2. Quan sát danh sách, thống kê và CTA.<br>3. Nhấn CTA.                                                                        |
| **Dữ liệu đầu vào**      | Không có completed Focus Session.                                                                                                                                        |
| **Kết quả mong đợi**     | Không hiển thị danh sách/zero-state gây nhầm lẫn là lỗi; hiển thị trạng thái rỗng rõ ràng kèm CTA **Bắt đầu phiên đầu tiên**; CTA dẫn tới luồng thiết lập Focus Session. |
| **Kết quả thực tế**      |                                                                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                                                  |
| **Ghi chú**              | Phiên đã hủy không được xem là phiên hoàn thành cho điều kiện này.                                                                                                       |
| **Nhận xét**             |                                                                                                                                                                          |

---

### TC-FS-019: SRE không phản hồi hoặc lỗi khi yêu cầu gợi ý concept

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative flow 1 — include FS-06 (error path)                                                                                                                                                                                                                                     |
| **Mã TC**                | TC-FS-019                                                                                                                                                                                                                                                                                 |
| **Tiêu đề**              | UI hiển thị fallback phù hợp khi SRE không trả danh sách gợi ý                                                                                                                                                                                                                            |
| **Mô tả**                | Kiểm tra hành vi của hệ thống khi request gợi ý SRE timeout hoặc trả lỗi; Student vẫn có thể tự chọn concept để bắt đầu phiên.                                                                                                                                                            |
| **Loại kiểm thử**        | Integration / UI-E2E / Resilience                                                                                                                                                                                                                                                         |
| **Phương thức thực thi** | Manual + SRE test double                                                                                                                                                                                                                                                                  |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                                                                                                                    |
| **Điều kiện tiên quyết** | Student A ở màn hình thiết lập; SRE test double được cấu hình lần lượt để trả timeout, HTTP 5xx và danh sách rỗng.                                                                                                                                                                        |
| **Các bước thực hiện**   | 1. Nhấn **Xem gợi ý** khi SRE test double trả timeout.<br>2. Quan sát thông báo/UI; xác nhận Student vẫn có thể chọn concept thủ công và bắt đầu phiên bình thường.<br>3. Lặp lại với SRE trả HTTP 5xx.<br>4. Lặp lại với SRE trả `200` nhưng `data: []`.                                 |
| **Dữ liệu đầu vào**      | a) SRE timeout (không nhận response sau ngưỡng chờ).<br>b) SRE trả `500 Internal Server Error`.<br>c) SRE trả `200` với `data: []` (không có concept ưu tiên nào).                                                                                                                        |
| **Kết quả mong đợi**     | a/b) Thông báo không thể tải gợi ý; giao diện không crash; luồng chọn concept thủ công từ danh sách P1 vẫn hoạt động và phiên có thể bắt đầu bình thường.<br>c) Thông báo không có gợi ý hoặc fallback rõ ràng; Student vẫn chọn được concept. Không spinner vô hạn, không block Student. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                           |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                   |
| **Ghi chú**              | Cần product chốt UX cụ thể khi SRE lỗi (toast, inline message hay ẩn nút gợi ý?). Không chấp nhận fail-silent dẫn tới spinner vô hạn.                                                                                                                                                     |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                           |

---

### TC-FS-020: Auto-save ghi chú thất bại khi mất kết nối mạng

| Trường                   | Nội dung                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 7–8 (offline path)                                                                                                                                                                                                                                  |
| **Mã TC**                | TC-FS-020                                                                                                                                                                                                                                                                   |
| **Tiêu đề**              | Ghi chú không bị mất khi auto-save gặp lỗi mạng và được đồng bộ khi online trở lại                                                                                                                                                                                          |
| **Mô tả**                | Kiểm tra hành vi auto-save khi request lưu ghi chú thất bại do mất kết nối — dữ liệu phải được giữ cục bộ và sync lại, không bị mất hoặc overwrite bởi bản cũ.                                                                                                              |
| **Loại kiểm thử**        | UI-E2E / Resilience / Integration                                                                                                                                                                                                                                           |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                                                                                                            |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Phiên đang chạy với C1; có thể bật/tắt network trong browser test; ghi chú N1 đã được auto-save thành công khi online.                                                                                                                                                      |
| **Các bước thực hiện**   | 1. Ngắt Internet.<br>2. Nhập ghi chú N2 (nội dung khác N1) liên kết C1; chờ chu kỳ auto-save.<br>3. Quan sát save indicator trên UI (pending/error vs. success giả).<br>4. Khôi phục Internet, chờ sync hoàn tất.<br>5. Kết thúc phiên; mở lại record và đối chiếu ghi chú. |
| **Dữ liệu đầu vào**      | N1 (online, đã lưu): `"Định nghĩa ban đầu"`.<br>N2 (offline): `"Ghi chú bổ sung khi mất mạng"` → C1.                                                                                                                                                                        |
| **Kết quả mong đợi**     | Khi offline, UI thể hiện trạng thái chưa đồng bộ (pending/warning) thay vì báo lưu thành công giả; N2 không bị mất ở client. Khi online, N2 được sync lên server; record sau cùng chứa N2 (bản mới nhất), không bị revert về N1. Không tạo bản ghi ghi chú trùng lặp.       |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                             |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                     |
| **Ghi chú**              | Cần product chốt chiến lược conflict resolution nếu có cập nhật từ device khác khi offline. Hành vi offline của ghi chú phải nhất quán với TC-FS-015 (timer offline).                                                                                                       |
| **Nhận xét**             |                                                                                                                                                                                                                                                                             |

---

### TC-FS-021: Tài liệu PDF không tải được trong phiên học

| Trường                   | Nội dung                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Basic Flow — bước 4 (error path)                                                                                                                                                                                                                                            |
| **Mã TC**                | TC-FS-021                                                                                                                                                                                                                                                                         |
| **Tiêu đề**              | Phiên học tiếp tục bình thường khi PDF không tải được                                                                                                                                                                                                                             |
| **Mô tả**                | Xác minh graceful degradation khi file PDF của plan không thể load — timer và ghi chú vẫn hoạt động, phiên không bị crash.                                                                                                                                                        |
| **Loại kiểm thử**        | UI-E2E / Resilience                                                                                                                                                                                                                                                               |
| **Phương thức thực thi** | Manual (browser)                                                                                                                                                                                                                                                                  |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                                                                                                            |
| **Điều kiện tiên quyết** | Có P1 với các biến thể tài liệu lỗi (URL broken/404, mạng block request PDF, file không phải PDF); Student A đã bắt đầu phiên học.                                                                                                                                                |
| **Các bước thực hiện**   | 1. Mở phiên học với P1 có URL tài liệu trả `404`.<br>2. Quan sát khung PDF và thông báo lỗi.<br>3. Xác nhận timer, ghi chú và điều khiển phiên vẫn hoạt động.<br>4. Lặp lại với URL bị block/timeout và URL trỏ tới file không phải PDF.<br>5. Hoàn tất phiên và kiểm tra record. |
| **Dữ liệu đầu vào**      | a) URL tài liệu trả `404 Not Found`.<br>b) Request PDF bị block/timeout (mạng).<br>c) URL trỏ tới file không phải PDF (ví dụ `.docx`).                                                                                                                                            |
| **Kết quả mong đợi**     | Khung PDF hiển thị thông báo lỗi rõ ràng thay vì để trắng hoặc spinner vô hạn; phiên học không crash và timer tiếp tục chạy; Student vẫn ghi chú và kết thúc phiên; record được lưu đầy đủ, không bị ảnh hưởng bởi lỗi PDF.                                                       |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                   |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                           |
| **Ghi chú**              | Cần product chốt UX lỗi PDF (thông điệp cụ thể, có nút Thử lại không?). Lỗi PDF không được ảnh hưởng đến record hoặc cách tính thời gian học.                                                                                                                                     |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                   |

---

### TC-FS-022: Cô lập dữ liệu phiên học giữa các Student

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | UC-09 / UC-10 — Security / Data ownership                                                                                                                                                                                                                                                                      |
| **Mã TC**                | TC-FS-022                                                                                                                                                                                                                                                                                                      |
| **Tiêu đề**              | Student B không thể đọc hoặc tạo phiên học dùng tài nguyên của Student A                                                                                                                                                                                                                                       |
| **Mô tả**                | Kiểm tra ngăn chặn truy cập chéo ở cả UI route và API endpoint của Focus Session và Lịch sử phiên học.                                                                                                                                                                                                         |
| **Loại kiểm thử**        | Security / API / UI-E2E                                                                                                                                                                                                                                                                                        |
| **Phương thức thực thi** | Postman + Manual (browser)                                                                                                                                                                                                                                                                                     |
| **Độ ưu tiên**           | Critical                                                                                                                                                                                                                                                                                                       |
| **Điều kiện tiên quyết** | Student A có plan P1, concept C1, phiên S1 hoàn thành và ghi chú N1; Student B có token hợp lệ của mình với dữ liệu riêng.                                                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Đăng nhập Student B; thử truy cập route chi tiết phiên S1 của A bằng cách thay ID trực tiếp trên URL.<br>2. Gọi endpoint tạo phiên mới với `plan_id = P1` (của A) bằng token của B.<br>3. Gọi endpoint lịch sử phiên bằng token B.<br>4. Đăng nhập lại A và xác minh S1/N1 không bị thay đổi hoặc xóa.      |
| **Dữ liệu đầu vào**      | a) URL/ID phiên S1 thuộc Student A, truy cập bằng token Student B.<br>b) `plan_id = P1` (của A) trong request tạo phiên mới của B.<br>c) Endpoint lịch sử phiên được gọi bằng token B.                                                                                                                         |
| **Kết quả mong đợi**     | a) API trả `403 Forbidden` hoặc `404 Not Found`; không lộ nội dung phiên, ghi chú hay metadata của A.<br>b) Phiên không được tạo với P1; endpoint từ chối với mã lỗi thích hợp và không cập nhật dữ liệu P1.<br>c) Chỉ trả phiên của B; không rò rỉ record của A. Sau kiểm thử, S1 và N1 của A vẫn nguyên vẹn. |
| **Kết quả thực tế**      |                                                                                                                                                                                                                                                                                                                |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                                                        |
| **Ghi chú**              | Kiểm tra tất cả endpoint mà Focus Session và History thực tế gọi, không chỉ UI route. Đối chiếu với TC-DB-018 để phân biệt scope: TC-FS-022 tập trung session record và ghi chú; TC-DB-018 tập trung Dashboard data (graph, stats, queue).                                                                     |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                |

---

## Các điểm cần làm rõ trước khi chốt nghiệm thu

1. Quy tắc làm tròn `duration_minutes` và cách xác định `ended_at` khi tab/browser bị đóng.
2. Chính sách khi SRE không phản hồi/lỗi sau khi record phiên đã lưu (retry, trạng thái chờ, thông báo người dùng).
3. Với hủy phiên, chọn một hành vi duy nhất: không lưu record hoặc lưu record `cancelled`.
4. Hành vi khi tài liệu PDF không tải được và khi auto-save ghi chú lỗi/mất mạng.

---

## Bảng tóm tắt — Focus Session

| Mã TC     | Tiêu đề                                | Loại                     | Độ ưu tiên | Trạng thái |
| --------- | -------------------------------------- | ------------------------ | ---------- | ---------- |
| TC-FS-001 | Kiểm tra điều kiện tiên quyết truy cập | UI-E2E / Security        | High       | Not Run    |
| TC-FS-002 | Thiết lập và Pomodoro mặc định         | UI-E2E                   | High       | Not Run    |
| TC-FS-003 | Chọn concept hợp lệ                    | UI-E2E / Validation      | High       | Not Run    |
| TC-FS-004 | Bắt đầu và timer đếm ngược             | UI-E2E                   | Critical   | Not Run    |
| TC-FS-005 | PDF side-by-side                       | UI-E2E                   | Medium     | Not Run    |
| TC-FS-006 | Ghi chú và auto-save                   | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-007 | Tự hoàn tất Pomodoro                   | UI-E2E / Integration     | Critical   | Not Run    |
| TC-FS-008 | Kết thúc sớm                           | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-009 | Pause / Resume                         | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-010 | Free Timer                             | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-011 | Gợi ý concept SRE                      | Integration / UI-E2E     | High       | Not Run    |
| TC-FS-012 | Strict Mode                            | UI-E2E                   | High       | Not Run    |
| TC-FS-013 | Hủy phiên                              | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-014 | Record và cập nhật SRE                 | Integration / Database   | Critical   | Not Run    |
| TC-FS-015 | Offline và sync                        | Resilience / Integration | High       | Not Run    |
| TC-FS-016 | Khôi phục khi đóng tab                 | Resilience / UI-E2E      | High       | Not Run    |
| TC-FS-017 | Lịch sử và thống kê                    | UI-E2E / Integration     | High       | Not Run    |
| TC-FS-018 | Lịch sử rỗng                           | UI-E2E                   | Medium     | Not Run    |
| TC-FS-019 | SRE lỗi khi gợi ý concept              | Integration / Resilience | Medium     | Not Run    |
| TC-FS-020 | Auto-save ghi chú offline              | Resilience / Integration | High       | Not Run    |
| TC-FS-021 | PDF không tải được                     | UI-E2E / Resilience      | Medium     | Not Run    |
| TC-FS-022 | Cô lập dữ liệu phiên học               | Security / API           | Critical   | Not Run    |
