# Test Cases — Focus Session

> **Module:** Focus Session
> **Use Case tham chiếu:** FS-01, FS-02, FS-04, FS-05, FS-06; UC-09 chỉ dùng khi không mâu thuẫn với thiết kế MVP
> **Người viết:** Nguyễn Minh Phát
> **Ngày tạo:** 2026-08-07
> **Ngày cập nhật:** 2026-08-10
> **Phiên bản:** 1.1
> **Loại kiểm thử chung:** Functionality / UI-E2E / Integration

## Nguồn và thứ tự ưu tiên

1. Nguồn chốt cho phạm vi và hành vi UI là mockup [screen-focus-session.html](../../analysis%20and%20design/claude-design/screen-focus-session.html), đặc biệt các state “Vào phiên học khi chưa chọn khái niệm”, “Chưa bắt đầu”, “Hoàn thành phiên · bàn giao AI Examiner” và “Phiên bị gián đoạn”.
2. [focus-sessions.md](../../api/focus-sessions.md) là nguồn chốt cho contract API, xác thực, ownership và dữ liệu session.
3. UC-03 và SPEC_FS-01 chỉ được dùng cho phần không mâu thuẫn với hai nguồn trên. Các mô tả Sprint 3 đã bị de-scope không tạo test đỏ cho Focus Session.
4. Quyết định đối chiếu từ [PR #309](https://github.com/Lade1q/planning-ai/pull/309#issuecomment-5232907616) được ghi vào bảng loại trừ bên dưới.

## Quy ước dữ liệu và môi trường

- Student A đã đăng nhập; có plan P1, concept C1 và một review-queue item R1 trỏ tới C1. Student B là người dùng khác.
- Môi trường test cho phép rút ngắn một lượt Pomodoro; ý nghĩa phải tương đương cấu hình mặc định 25 phút.
- Không mock request thành công. Có thể kiểm tra request, response và DB để xác minh contract.
- Các case đang ở trạng thái Not Run là kế hoạch v1.1, chưa được chạy lại trong lần cập nhật tài liệu này.
- Các case N/A ở bảng loại trừ là quyết định phạm vi, không phải kết quả chạy test và không được tính vào chỉ số PASS/FAIL.

## Ma trận bao phủ yêu cầu

| Yêu cầu / luồng nguồn                                                            | Test case bao phủ                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Truy cập, review queue, concept được chọn sẵn và không tạo session trước Bắt đầu | TC-FS-001, TC-FS-011                                             |
| Thiết lập Pomodoro theo phiên và bắt đầu timer                                   | TC-FS-002, TC-FS-004                                             |
| Xem tài liệu gốc, ghi chú và lỗi auto-save                                       | TC-FS-005, TC-FS-006, TC-FS-020                                  |
| Hoàn tất, kết thúc sớm, pause/resume, Strict Mode, hủy và bàn giao Interview     | TC-FS-007, TC-FS-008, TC-FS-009, TC-FS-012, TC-FS-013, TC-FS-026 |
| Khôi phục phiên gián đoạn và regression phiên dưới 60 giây                       | TC-FS-016, TC-FS-024                                             |
| Authorization, idempotency khi thao tác người dùng                               | TC-FS-022, TC-FS-023                                             |

## Các ID được loại khỏi execution scope

| ID cũ     | Quyết định                                                                                                                                 | Nguồn và nơi theo dõi                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| TC-FS-003 | N/A — by design. Focus không có picker concept tại chỗ; concept đến từ review queue, deep-link hoặc Dashboard/đồ thị.                      | Mockup state “Vào phiên học khi chưa chọn khái niệm”, dòng 1704–1707 và 1768–1777; PR #309. |
| TC-FS-010 | N/A — de-scoped. MVP chỉ có Pomodoro, không có Free Timer.                                                                                 | Mockup state “Chưa bắt đầu”, dòng 1866–1910; PR #309.                                       |
| TC-FS-014 | N/A — chuyển assertion mastery/SRE sang AI Examiner. Focus chỉ lưu thời gian học và bàn giao CTA.                                          | Mockup dòng 2443–2475; API Focus dòng 5–9; PR #309.                                         |
| TC-FS-015 | N/A — de-scoped. Không có offline queue hoặc auto-sync completion trong MVP; chỉ có recovery localStorage.                                 | Mockup state “Phiên bị gián đoạn”, dòng 2482–2505; PR #309.                                 |
| TC-FS-017 | N/A — chuyển sang DB-03/DB-08, Sprint 5.                                                                                                   | PR #309; theo dõi #245/#246.                                                                |
| TC-FS-018 | N/A — chuyển sang DB-03/DB-08, Sprint 5.                                                                                                   | PR #309; theo dõi #245/#246.                                                                |
| TC-FS-019 | N/A — fallback khi chấm mastery thuộc Interview, không thuộc Focus.                                                                        | Mockup dòng 2466–2475; PR #309.                                                             |
| TC-FS-021 | N/A — PDF không đọc được thuộc validation của module Upload.                                                                               | PR #309.                                                                                    |
| TC-FS-025 | N/A — chưa có yêu cầu MVP quy định chỉ một session chạy trên toàn bộ tab/origin; không tự suy diễn mutual exclusion thành expected result. | UC-03 E2 chỉ nói recovery; PR #309. Cần requirement mới trước khi lập TC.                   |

## FS-01 — Vào và thực hiện phiên học

### TC-FS-001: Điều kiện truy cập và state vào Focus Session

| Trường                   | Nội dung                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 pre-start. Nguồn: mockup “Vào phiên học khi chưa chọn khái niệm” dòng 1691–1756; API Focus dòng 3, 15–20.                                                                                                                                             |
| **Mã TC**                | TC-FS-001                                                                                                                                                                                                                                                   |
| **Tiêu đề**              | Chỉ hiển thị state vào hợp lệ và chưa tạo session trước Bắt đầu                                                                                                                                                                                             |
| **Mô tả**                | Gộp các nhánh xác thực, chưa có plan và review queue có item để kiểm tra đúng ranh giới trước khi phiên tồn tại.                                                                                                                                            |
| **Loại kiểm thử**        | UI-E2E / Security / API                                                                                                                                                                                                                                     |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                                                                                                                                  |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Có Student A với P1/R1-C1; một client chưa đăng nhập; Student C không có active plan.                                                                                                                                                                       |
| **Các bước thực hiện**   | 1. Mở Focus khi chưa đăng nhập.<br>2. Mở Focus bằng Student C không có active plan.<br>3. Mở Focus bằng Student A khi review queue trả R1-C1.                                                                                                               |
| **Dữ liệu đầu vào**      | a) Không có Bearer token.<br>b) Queue không có active plan.<br>c) Queue có item đầu tiên là C1.                                                                                                                                                             |
| **Kết quả mong đợi**     | a) Bị yêu cầu đăng nhập; không có POST tạo session.<br>b) Hiện đúng message backend, không tự dựng picker và không có session.<br>c) Hiện C1 cùng lý do gợi ý, Pomodoro mặc định và lối “Chọn khái niệm khác”; chưa có timer, nút Hủy hay POST tạo session. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                                                                                                    |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                     |
| **Ghi chú**              | Không kiểm một màn chọn concept mới: đó là hành vi bị loại ở TC-FS-003.                                                                                                                                                                                     |
| **Nhận xét**             | Các nhánh dùng cùng một response review queue; client không được tự viết lại message rỗng.                                                                                                                                                                  |

### TC-FS-002: Cấu hình Pomodoro theo phiên trước và trong khi chạy

| Trường                   | Nội dung                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-02. Nguồn: mockup “Chưa bắt đầu” dòng 1866–1910 và “Panel cấu hình Pomodoro tại chỗ” dòng 1915–1988, 2076–2127; API Focus dòng 169–190.                                                                                                                                            |
| **Mã TC**                | TC-FS-002                                                                                                                                                                                                                                                                             |
| **Tiêu đề**              | Hiển thị cấu hình mặc định và áp dụng cấu hình đúng phạm vi phiên                                                                                                                                                                                                                     |
| **Mô tả**                | Kiểm tra cấu hình 25/5/15/4, Strict Mode trước khi bắt đầu và quy tắc thay đổi chỉ có hiệu lực từ lượt kế tiếp.                                                                                                                                                                       |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                                                                                                                  |
| **Phương thức thực thi** | Playwright + network inspection                                                                                                                                                                                                                                                       |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                  |
| **Điều kiện tiên quyết** | Student A đang ở state Chưa bắt đầu của C1.                                                                                                                                                                                                                                           |
| **Các bước thực hiện**   | 1. Quan sát cấu hình mặc định.<br>2. Mở panel từ “Đổi độ dài lượt”, chỉnh work/short break/long break/cycles/sound và Strict Mode rồi bắt đầu.<br>3. Khi một lượt đang chạy, mở panel từ biểu tượng cấu hình và thay đổi dữ liệu.                                                     |
| **Dữ liệu đầu vào**      | a) Mặc định 25/5/15/4, sound bật.<br>b) Một bộ giá trị hợp lệ khác.<br>c) Thay đổi giữa lượt đang chạy.                                                                                                                                                                               |
| **Kết quả mong đợi**     | a) Hiện đúng năm field và Strict Mode có thể đổi trước Start.<br>b) Thay đổi chỉ áp dụng cho session hiện tại, không PATCH cấu hình mặc định của user.<br>c) Lượt hiện tại không đổi độ dài; các giá trị mới áp dụng tại ranh giới lượt sau và Strict Mode bị khóa cho đến hết phiên. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                                                                                                                              |
| **Trạng thái**           | Not Run                                                                                                                                                                                                                                                                               |
| **Ghi chú**              | Không có Free Timer; xem quyết định TC-FS-010.                                                                                                                                                                                                                                        |
| **Nhận xét**             | Nhóm a/b/c chung một context cấu hình Pomodoro, tránh tách case vụn theo từng field.                                                                                                                                                                                                  |

### TC-FS-004: Bắt đầu phiên Pomodoro và timer đếm ngược

| Trường                   | Nội dung                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 start. Nguồn: mockup dòng 1744–1750, 1794–1799 và state “Chưa bắt đầu”; API Focus dòng 15–37.                                                             |
| **Mã TC**                | TC-FS-004                                                                                                                                                       |
| **Tiêu đề**              | Chỉ tạo một session khi Student nhấn Bắt đầu và timer chạy đúng                                                                                                 |
| **Mô tả**                | Xác minh ranh giới giữa state setup và running session.                                                                                                         |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                            |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                                      |
| **Độ ưu tiên**           | Critical                                                                                                                                                        |
| **Điều kiện tiên quyết** | Student A đang ở state Chưa bắt đầu với C1 và cấu hình Pomodoro hợp lệ.                                                                                         |
| **Các bước thực hiện**   | 1. Chờ ở setup và kiểm tra request/DB.<br>2. Nhấn Bắt đầu một lần.<br>3. Quan sát timer, response và record vừa tạo.                                            |
| **Dữ liệu đầu vào**      | C1, P1, strictMode bật hoặc tắt.                                                                                                                                |
| **Kết quả mong đợi**     | Trước Start không có record. Sau Start có đúng một POST thành công, session running liên kết C1/P1 và strictMode đúng input; timer đếm giảm theo cấu hình test. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                        |
| **Trạng thái**           | Not Run                                                                                                                                                         |
| **Ghi chú**              | Case spam click được kiểm riêng ở TC-FS-023.                                                                                                                    |
| **Nhận xét**             | Không khẳng định rằng UI phải cho chọn nhiều concept; nguồn UI chỉ xác định C1 đã có sẵn.                                                                       |

### TC-FS-005: Xem tài liệu gốc trong phiên học

| Trường                   | Nội dung                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-04. Nguồn: mockup state tài liệu gốc, phần “Trích đoạn” và “Toàn văn”, dòng 2289–2400.                                                                           |
| **Mã TC**                | TC-FS-005                                                                                                                                                           |
| **Tiêu đề**              | Chuyển đúng các chế độ tài liệu mà không làm gián đoạn phiên                                                                                                        |
| **Mô tả**                | Kiểm tra các lựa chọn Ẩn, Trích đoạn và Toàn văn của tài liệu gắn với concept hiện tại.                                                                             |
| **Loại kiểm thử**        | UI-E2E                                                                                                                                                              |
| **Phương thức thực thi** | Playwright                                                                                                                                                          |
| **Độ ưu tiên**           | Medium                                                                                                                                                              |
| **Điều kiện tiên quyết** | Session C1 đang chạy; C1 có concept source và PDF hợp lệ.                                                                                                           |
| **Các bước thực hiện**   | 1. Chọn lần lượt Ẩn, Trích đoạn, Toàn văn.<br>2. Quan sát nội dung, trang neo và timer ở mỗi chế độ.                                                                |
| **Dữ liệu đầu vào**      | C1 có source page/excerpt; một PDF đọc được.                                                                                                                        |
| **Kết quả mong đợi**     | Mỗi lựa chọn biểu thị trạng thái được chọn chính xác; Trích đoạn neo theo source của C1, Toàn văn mở PDF đúng trang; timer/session vẫn chạy, không tạo session mới. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                            |
| **Trạng thái**           | Not Run                                                                                                                                                             |
| **Ghi chú**              | PDF lỗi/bytes không hợp lệ không thuộc module này; xem TC-FS-021 bị loại.                                                                                           |
| **Nhận xét**             | Chỉ dùng tài liệu đã qua validation Upload.                                                                                                                         |

### TC-FS-006: Ghi chú nhanh được liên kết concept và auto-save

| Trường                   | Nội dung                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-05. Nguồn: mockup state “Ghi chú nhanh” dòng 2182–2196, 2210–2248.                                                                    |
| **Mã TC**                | TC-FS-006                                                                                                                                |
| **Tiêu đề**              | Lưu ghi chú cho đúng concept mà không làm lệch timer                                                                                     |
| **Mô tả**                | Kiểm tra thao tác mở rail ghi chú, nhập/sửa và persistence theo concept của session.                                                     |
| **Loại kiểm thử**        | UI-E2E / Integration / Database                                                                                                          |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                     |
| **Điều kiện tiên quyết** | Session C1 đang chạy và hỗ trợ session_notes đã sẵn sàng.                                                                                |
| **Các bước thực hiện**   | 1. Mở ghi chú bằng nút và phím N.<br>2. Tạo N1, sửa N1, đóng/mở lại rail.<br>3. Đối chiếu dữ liệu đã lưu.                                |
| **Dữ liệu đầu vào**      | N1 có nội dung hợp lệ cho C1.                                                                                                            |
| **Kết quả mong đợi**     | Rail xuất hiện tức thì dạng overlay, timer không đổi vị trí/không pause; N1 được auto-save và đọc lại đúng session/C1/nội dung mới nhất. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                 |
| **Trạng thái**           | Not Run                                                                                                                                  |
| **Ghi chú**              | Khi request save thất bại dùng TC-FS-020; không suy diễn offline-sync.                                                                   |
| **Nhận xét**             | Không tạo case riêng cho từng lần sửa vì đều là biến thể dữ liệu cùng ngữ cảnh.                                                          |

### TC-FS-007: Hoàn tất tự động và tổng kết phiên

| Trường                   | Nội dung                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 completion. Nguồn: mockup “Hoàn thành phiên · bàn giao AI Examiner” dòng 2435–2477; API Focus dòng 60–98.                                                        |
| **Mã TC**                | TC-FS-007                                                                                                                                                              |
| **Tiêu đề**              | Hết chu kỳ Pomodoro tạo tổng kết đúng dữ liệu thời gian                                                                                                                |
| **Mô tả**                | Kiểm tra kết thúc tự nhiên bằng timer test ngắn và màn tổng kết.                                                                                                       |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                   |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                                             |
| **Độ ưu tiên**           | Critical                                                                                                                                                               |
| **Điều kiện tiên quyết** | Session C1 running với cấu hình test ngắn.                                                                                                                             |
| **Các bước thực hiện**   | 1. Bắt đầu session.<br>2. Chờ lượt/chu kỳ hoàn thành không thao tác Kết thúc sớm.<br>3. Đối chiếu summary và PATCH completion.                                         |
| **Dữ liệu đầu vào**      | C1, một cấu hình Pomodoro test ngắn.                                                                                                                                   |
| **Kết quả mong đợi**     | Session chuyển completed một lần; summary hiển thị focused time, số Pomodoro và away count đúng; durationMinutes được tính từ focusedSeconds. Không ghi mastery_score. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                               |
| **Trạng thái**           | Not Run                                                                                                                                                                |
| **Ghi chú**              | Assertion không đổi mastery là boundary của Focus, không phải call SRE/mastery cũ của TC-FS-014.                                                                       |
| **Nhận xét**             | Handoff sang Interview được kiểm sâu hơn ở TC-FS-026.                                                                                                                  |

### TC-FS-008: Kết thúc sớm và tính đúng thời gian tập trung

| Trường                   | Nội dung                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 kết thúc chủ động. Nguồn: SPEC_FS-01 dòng 37–40; API Focus dòng 60–98.                                                                      |
| **Mã TC**                | TC-FS-008                                                                                                                                         |
| **Tiêu đề**              | Kết thúc sớm chỉ lưu thời gian tập trung thực tế                                                                                                  |
| **Mô tả**                | Kiểm tra completion chủ động ở các thời điểm khác nhau của một lượt.                                                                              |
| **Loại kiểm thử**        | UI-E2E / API / Database                                                                                                                           |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                        |
| **Độ ưu tiên**           | High                                                                                                                                              |
| **Điều kiện tiên quyết** | Session C1 đang chạy.                                                                                                                             |
| **Các bước thực hiện**   | 1. Kết thúc sau một khoảng focused time xác định.<br>2. Lặp lại sau khi đã pause/resume hoặc rời tab Strict Mode.<br>3. Đối chiếu PATCH và DB.    |
| **Dữ liệu đầu vào**      | a) 65 giây tập trung.<br>b) 65 giây tập trung có thời gian pause/away.                                                                            |
| **Kết quả mong đợi**     | Mỗi session chuyển completed đúng một lần; focusedSeconds không gồm pause/away; durationMinutes bằng floor(focusedSeconds/60) và summary khớp DB. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                           |
| **Ghi chú**              | Không dùng full offline để tạo completion failure.                                                                                                |
| **Nhận xét**             | a/b là data-driven sub-tests cho cùng hành vi kết thúc sớm.                                                                                       |

### TC-FS-009: Pause và Resume

| Trường                   | Nội dung                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative Flow 3. Nguồn: SPEC_FS-01 dòng 60–64; API Focus dòng 72–75.                                                                  |
| **Mã TC**                | TC-FS-009                                                                                                                                      |
| **Tiêu đề**              | Pause không cộng thời gian và Resume tiếp tục đúng lượt                                                                                        |
| **Mô tả**                | Xác minh số đo focused time qua nhiều lần pause/resume.                                                                                        |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                           |
| **Phương thức thực thi** | Playwright + API verify                                                                                                                        |
| **Độ ưu tiên**           | High                                                                                                                                           |
| **Điều kiện tiên quyết** | Session C1 đang chạy.                                                                                                                          |
| **Các bước thực hiện**   | 1. Pause ở giữa lượt và đo timer/focused time.<br>2. Giữ pause trong một khoảng xác định.<br>3. Resume, hoàn tất session và đối chiếu dữ liệu. |
| **Dữ liệu đầu vào**      | a) Một lần pause.<br>b) Hai lần pause/resume liên tiếp.                                                                                        |
| **Kết quả mong đợi**     | Timer focused không giảm trong pause; sau Resume chạy tiếp đúng lượt; payload completion loại trừ toàn bộ thời gian pause.                     |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                       |
| **Trạng thái**           | Not Run                                                                                                                                        |
| **Ghi chú**              | Rời tab Strict Mode là cơ chế riêng ở TC-FS-012.                                                                                               |
| **Nhận xét**             | Không dùng thời gian wall-clock làm expected result.                                                                                           |

### TC-FS-011: Gợi ý concept từ review queue

| Trường                   | Nội dung                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-06. Nguồn: mockup dòng 1704–1707, 1761–1799 và 1804–1818.                                                                                                                                |
| **Mã TC**                | TC-FS-011                                                                                                                                                                                   |
| **Tiêu đề**              | Focus dùng đúng concept ưu tiên và lý do từ review queue                                                                                                                                    |
| **Mô tả**                | Kiểm tra Focus đọc item đầu tiên thay vì tái tạo hoặc sắp xếp một danh sách gợi ý ở client.                                                                                                 |
| **Loại kiểm thử**        | Integration / UI-E2E                                                                                                                                                                        |
| **Phương thức thực thi** | Playwright + API inspection                                                                                                                                                                 |
| **Độ ưu tiên**           | High                                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Review queue có R1-C1, hoặc trả items rỗng cùng message.                                                                                                                                    |
| **Các bước thực hiện**   | 1. Mở Focus bằng sidebar với R1-C1.<br>2. Mở Focus khi items rỗng.<br>3. Đi theo link “Chọn khái niệm khác”.                                                                                |
| **Dữ liệu đầu vào**      | a) items[0] = R1-C1 có reason.<br>b) items = [].                                                                                                                                            |
| **Kết quả mong đợi**     | a) Hiện C1/reason đúng response và không có picker/danh sách mới.<br>b) Hiện message server cùng CTA Dashboard, không tạo session.<br>c) Link điều hướng về Dashboard trước khi có session. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                                    |
| **Trạng thái**           | Not Run                                                                                                                                                                                     |
| **Ghi chú**              | Không gọi hay mô phỏng SRE tính mastery trong Focus.                                                                                                                                        |
| **Nhận xét**             | Đây là coverage thay thế cho phần UI cũ của TC-FS-003.                                                                                                                                      |

### TC-FS-012: Strict Mode khi rời tab

| Trường                   | Nội dung                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Strict Mode của FS-01. Nguồn: mockup dòng 1891–1907 và state “Quay lại sau khi rời tab” dòng 2133–2177.                                                                           |
| **Mã TC**                | TC-FS-012                                                                                                                                                                         |
| **Tiêu đề**              | Strict Mode đo thời gian rời tab, không giả lập khóa trình duyệt                                                                                                                  |
| **Mô tả**                | Kiểm tra Page Visibility, away count và thao tác tiếp tục sau khi quay lại.                                                                                                       |
| **Loại kiểm thử**        | UI-E2E / Compatibility                                                                                                                                                            |
| **Phương thức thực thi** | Playwright trên Chromium và Firefox                                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                              |
| **Điều kiện tiên quyết** | Strict Mode được bật trước Start; session C1 đang chạy.                                                                                                                           |
| **Các bước thực hiện**   | 1. Chuyển sang tab/app khác trong một khoảng xác định.<br>2. Quay lại Focus.<br>3. Tiếp tục session và hoàn tất.                                                                  |
| **Dữ liệu đầu vào**      | a) Rời một lần.<br>b) Rời nhiều lần.                                                                                                                                              |
| **Kết quả mong đợi**     | Focused timer dừng trong thời gian away; UI giải thích thời gian/lần rời; awayCount và focusedSeconds trong completion khớp quan sát. Ứng dụng không tuyên bố khóa/chặn tab khác. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                                                           |
| **Ghi chú**              | Strict Mode chỉ được bật/tắt trước Start; panel đang chạy hiển thị trạng thái khóa.                                                                                               |
| **Nhận xét**             | Browser sandbox không cho phép expected result là chặn website/tab khác.                                                                                                          |

### TC-FS-013: Hủy phiên giữa chừng

| Trường                   | Nội dung                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 Alternative Flow 4. Nguồn: mockup dòng 2511–2535; API Focus dòng 60–98.                                                                                        |
| **Mã TC**                | TC-FS-013                                                                                                                                                            |
| **Tiêu đề**              | Hủy phiên có xác nhận và không tính thời gian vào lịch sử                                                                                                            |
| **Mô tả**                | Kiểm tra hộp thoại hủy, nhánh quay lại và nhánh xác nhận hủy.                                                                                                        |
| **Loại kiểm thử**        | UI-E2E / Integration / Database                                                                                                                                      |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                 |
| **Điều kiện tiên quyết** | Session C1 đang chạy và đã có focused time.                                                                                                                          |
| **Các bước thực hiện**   | 1. Chọn Hủy phiên.<br>2. Thử “Quay lại phiên”.<br>3. Mở lại dialog và xác nhận Hủy phiên.                                                                            |
| **Dữ liệu đầu vào**      | C1 có focusedSeconds > 0.                                                                                                                                            |
| **Kết quả mong đợi**     | Dialog nêu rõ thời gian sẽ không được ghi; quay lại không thay đổi session; xác nhận gửi cancelled, durationMinutes bằng 0 và session không được tính như completed. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                             |
| **Trạng thái**           | Not Run                                                                                                                                                              |
| **Ghi chú**              | Hủy khác với Kết thúc sớm ở TC-FS-008.                                                                                                                               |
| **Nhận xét**             | Không kiểm một link hủy ở state pre-start vì khi đó chưa có session để hủy.                                                                                          |

### TC-FS-016: Khôi phục phiên bị gián đoạn từ localStorage

| Trường                   | Nội dung                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-01 exception interrupted session. Nguồn: mockup dòng 2482–2505; PR #309 về ngưỡng recovery từ 60 giây.                                                                         |
| **Mã TC**                | TC-FS-016                                                                                                                                                                         |
| **Tiêu đề**              | Phiên từ 60 giây trở lên cho phép ghi nhận hoặc bỏ qua sau khi mở lại                                                                                                             |
| **Mô tả**                | Kiểm tra recovery là phạm vi MVP thay cho offline-sync toàn phần.                                                                                                                 |
| **Loại kiểm thử**        | Resilience / UI-E2E / Integration                                                                                                                                                 |
| **Phương thức thực thi** | Playwright đóng/mở tab + localStorage/API/DB verify                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                              |
| **Điều kiện tiên quyết** | Session C1 đang chạy, snapshot localStorage chứa focused time từ 60 giây trở lên.                                                                                                 |
| **Các bước thực hiện**   | 1. Đóng tab/browser không Kết thúc/Hủy.<br>2. Mở lại cùng browser context.<br>3. Chọn lần lượt a) Ghi nhận, b) Bỏ qua ở các lần chạy độc lập.                                     |
| **Dữ liệu đầu vào**      | a) Ghi nhận N phút.<br>b) Bỏ qua.                                                                                                                                                 |
| **Kết quả mong đợi**     | Hiện dialog recovery với focused time đã đo.<br>a) Hoàn tất đúng session cũ một lần và xóa snapshot sau ACK.<br>b) Không tạo completed session, xóa snapshot và không lặp dialog. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                          |
| **Trạng thái**           | Not Run                                                                                                                                                                           |
| **Ghi chú**              | Recovery dưới 60 giây có UX không mời dialog theo thiết kế; cleanup DB tương ứng nằm ở TC-FS-024.                                                                                 |
| **Nhận xét**             | Không suy ra duration từ khoảng thời gian tab đóng qua đêm.                                                                                                                       |

### TC-FS-020: Auto-save ghi chú thất bại

| Trường                   | Nội dung                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | FS-05 negative path. Nguồn: mockup dòng 2192–2196 yêu cầu auto-save; Rule Planning §3 yêu cầu failure handling theo góc nhìn người dùng.                        |
| **Mã TC**                | TC-FS-020                                                                                                                                                       |
| **Tiêu đề**              | Không báo lưu thành công khi auto-save ghi chú thất bại                                                                                                         |
| **Mô tả**                | Kiểm tra khả năng chịu lỗi của feature auto-save, không kiểm hàng đợi offline hoặc auto-sync.                                                                   |
| **Loại kiểm thử**        | Resilience / Integration                                                                                                                                        |
| **Phương thức thực thi** | Playwright + controlled failed save response                                                                                                                    |
| **Độ ưu tiên**           | High                                                                                                                                                            |
| **Điều kiện tiên quyết** | Session C1 đang chạy, rail ghi chú đang mở.                                                                                                                     |
| **Các bước thực hiện**   | 1. Nhập N1.<br>2. Làm request auto-save thất bại có kiểm soát.<br>3. Quan sát phản hồi UI và dữ liệu bền vững sau reload.                                       |
| **Dữ liệu đầu vào**      | N1; lỗi timeout hoặc 5xx của request save.                                                                                                                      |
| **Kết quả mong đợi**     | UI không khẳng định N1 đã lưu; báo trạng thái lỗi/retry phù hợp, giữ nội dung người dùng đang nhập và không làm hỏng timer. DB không có bản ghi giả thành công. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                        |
| **Trạng thái**           | Not Run                                                                                                                                                         |
| **Ghi chú**              | Không đặt expected result là tự đồng bộ sau khi online; hành vi đó bị de-scope ở TC-FS-015.                                                                     |
| **Nhận xét**             | Đây là negative test của một feature có thật, không tạo thêm offline feature.                                                                                   |

### TC-FS-022: Cô lập dữ liệu session giữa các Student

| Trường                   | Nội dung                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Ownership API. Nguồn: API Focus dòng 3, 62–64, 137–142.                                            |
| **Mã TC**                | TC-FS-022                                                                                          |
| **Tiêu đề**              | Student B không đọc hoặc thay đổi được session của Student A                                       |
| **Mô tả**                | Kiểm tra authorization cho thao tác kết thúc/hủy và danh sách lịch sử thô.                         |
| **Loại kiểm thử**        | Security / API / Database                                                                          |
| **Phương thức thực thi** | API test + DB verify                                                                               |
| **Độ ưu tiên**           | Critical                                                                                           |
| **Điều kiện tiên quyết** | Student A có session S1; Student B có token hợp lệ khác.                                           |
| **Các bước thực hiện**   | 1. Student B PATCH S1.<br>2. Student B GET lịch sử.<br>3. Đối chiếu response và DB.                |
| **Dữ liệu đầu vào**      | Token B; ID S1 thuộc A.                                                                            |
| **Kết quả mong đợi**     | PATCH trả 404, không làm lộ session và không đổi S1; lịch sử của B không có dữ liệu/concept của A. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                           |
| **Trạng thái**           | Not Run                                                                                            |
| **Ghi chú**              | 404 là yêu cầu contract, không thay bằng 403.                                                      |
| **Nhận xét**             | Đối chiếu cả response lẫn persistence để tránh chỉ chặn ở UI.                                      |

### TC-FS-023: Spam click Bắt đầu

| Trường                   | Nội dung                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | Start resilience. Nguồn: mockup dòng 1744–1750 quy định POST chỉ sau Bắt đầu; Rule Planning §3 về spam click.                  |
| **Mã TC**                | TC-FS-023                                                                                                                      |
| **Tiêu đề**              | Spam click Bắt đầu không tạo session trùng                                                                                     |
| **Mô tả**                | Kiểm tra thao tác người dùng lặp nhanh tại ranh giới tạo session.                                                              |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                           |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                     |
| **Độ ưu tiên**           | High                                                                                                                           |
| **Điều kiện tiên quyết** | Student A đang ở state Chưa bắt đầu với C1.                                                                                    |
| **Các bước thực hiện**   | 1. Click Bắt đầu nhiều lần liên tiếp khi request đầu còn pending.<br>2. Chờ request ổn định.<br>3. Kiểm tra UI, network và DB. |
| **Dữ liệu đầu vào**      | 3–5 click liên tiếp cho cùng C1.                                                                                               |
| **Kết quả mong đợi**     | UI vô hiệu hóa/khử lặp thao tác đủ sớm; chỉ có một session running cho lượt click này và timer dùng đúng ID response.          |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                       |
| **Trạng thái**           | Not Run                                                                                                                        |
| **Ghi chú**              | Không mở rộng thành policy cấm hai tab toàn origin; đó là TC-FS-025 bị loại do thiếu requirement.                              |
| **Nhận xét**             | Expected result chỉ áp dụng cho cùng một hành động Start đang pending.                                                         |

### TC-FS-024: Reload phiên dưới 60 giây — regression #311

| Trường                   | Nội dung                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Cleanup khi abandon session ngắn. Nguồn: [issue #311](https://github.com/Lade1q/planning-ai/issues/311); PR #309; API Focus dòng 65–69.                 |
| **Mã TC**                | TC-FS-024                                                                                                                                               |
| **Tiêu đề**              | Reload dưới 60 giây không mời recovery nhưng phải đóng sạch record running                                                                              |
| **Mô tả**                | Regression cho phần DB còn lỗi, đồng thời bảo vệ UX by-design không hiện dialog với phiên quá ngắn.                                                     |
| **Loại kiểm thử**        | Resilience / Integration / Database                                                                                                                     |
| **Phương thức thực thi** | Playwright reload + API/DB verify                                                                                                                       |
| **Độ ưu tiên**           | Low                                                                                                                                                     |
| **Điều kiện tiên quyết** | Session S1-C1 đang running; focused time nhỏ hơn 60 giây.                                                                                               |
| **Các bước thực hiện**   | 1. Bắt đầu S1, chạy dưới 60 giây.<br>2. Reload trang.<br>3. Kiểm tra UI và DB ngay sau reload.                                                          |
| **Dữ liệu đầu vào**      | focusedSeconds = 10–59; page.reload().                                                                                                                  |
| **Kết quả mong đợi**     | UI quay về setup, không hiện dialog recovery và không tạo S2. S1 được đóng cancelled với durationMinutes = 0 ngay khi bị bỏ, không chờ lazy-reap 8 giờ. |
| **Kết quả thực tế**      | Đã verify LIVE theo PR #309: UX không mời recovery đúng thiết kế, nhưng S1 còn running/endedAt null tối đa 8 giờ.                                       |
| **Trạng thái**           | Fail — known bug #311                                                                                                                                   |
| **Ghi chú**              | Không còn đánh dấu Critical hoặc yêu cầu resume/prompt cho phiên dưới 60 giây.                                                                          |
| **Nhận xét**             | Khi #311 được sửa, chạy lại case này để xác minh cleanup mà không đổi UX.                                                                               |

### TC-FS-026: Điều hướng sau khi hoàn tất phiên

| Trường                   | Nội dung                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Completion handoff. Nguồn: mockup dòng 2435–2477; API Focus dòng 5–9.                                                                                                                    |
| **Mã TC**                | TC-FS-026                                                                                                                                                                                |
| **Tiêu đề**              | Màn tổng kết bàn giao đúng context sang AI Examiner hoặc Dashboard                                                                                                                       |
| **Mô tả**                | Kiểm tra CTA sau completion và boundary: Focus không tự chấm mastery.                                                                                                                    |
| **Loại kiểm thử**        | UI-E2E / Integration                                                                                                                                                                     |
| **Phương thức thực thi** | Playwright + API/DB verify                                                                                                                                                               |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                   |
| **Điều kiện tiên quyết** | Session C1 đã completed và summary đang hiển thị.                                                                                                                                        |
| **Các bước thực hiện**   | 1. Chọn “Bắt đầu kiểm tra”.<br>2. Ở lần chạy độc lập chọn “Để sau — về Dashboard”.<br>3. Đối chiếu navigation và dữ liệu.                                                                |
| **Dữ liệu đầu vào**      | Completed session C1 thuộc P1.                                                                                                                                                           |
| **Kết quả mong đợi**     | a) CTA tạo/mở Interview với context C1, không yêu cầu chọn lại concept.<br>b) Dashboard không tạo Focus/Interview mới.<br>c) Focus chỉ giữ thống kê thời gian, không thay mastery_score. |
| **Kết quả thực tế**      | Not Run trong plan v1.1.                                                                                                                                                                 |
| **Trạng thái**           | Not Run                                                                                                                                                                                  |
| **Ghi chú**              | Cơ chế chấm mastery hoặc fallback nằm trong plan test AI Examiner, không quay lại TC-FS-014/019.                                                                                         |
| **Nhận xét**             | “Để sau — về Dashboard” là CTA hợp lệ theo mockup; không bắt buộc một nút riêng nhãn “Nghỉ giải lao”.                                                                                    |

## Bảng tóm tắt — Focus Session

| Mã TC     | Tiêu đề                               | Loại                                | Độ ưu tiên | Trạng thái  |
| --------- | ------------------------------------- | ----------------------------------- | ---------- | ----------- |
| TC-FS-001 | Điều kiện truy cập và state vào Focus | UI-E2E / Security / API             | High       | Not Run     |
| TC-FS-002 | Cấu hình Pomodoro theo phiên          | UI-E2E / Integration                | High       | Not Run     |
| TC-FS-004 | Bắt đầu session và timer              | UI-E2E / Integration                | Critical   | Not Run     |
| TC-FS-005 | Tài liệu gốc trong phiên              | UI-E2E                              | Medium     | Not Run     |
| TC-FS-006 | Ghi chú và auto-save                  | UI-E2E / Integration / Database     | High       | Not Run     |
| TC-FS-007 | Hoàn tất tự động và summary           | UI-E2E / Integration                | Critical   | Not Run     |
| TC-FS-008 | Kết thúc sớm                          | UI-E2E / API / Database             | High       | Not Run     |
| TC-FS-009 | Pause / Resume                        | UI-E2E / Integration                | High       | Not Run     |
| TC-FS-011 | Gợi ý từ review queue                 | Integration / UI-E2E                | High       | Not Run     |
| TC-FS-012 | Strict Mode                           | UI-E2E / Compatibility              | High       | Not Run     |
| TC-FS-013 | Hủy phiên                             | UI-E2E / Integration / Database     | High       | Not Run     |
| TC-FS-016 | Recovery localStorage từ 60 giây      | Resilience / UI-E2E / Integration   | High       | Not Run     |
| TC-FS-020 | Lỗi auto-save ghi chú                 | Resilience / Integration            | High       | Not Run     |
| TC-FS-022 | Cô lập dữ liệu Student                | Security / API / Database           | Critical   | Not Run     |
| TC-FS-023 | Spam click Bắt đầu                    | UI-E2E / Integration                | High       | Not Run     |
| TC-FS-024 | Reload dưới 60 giây                   | Resilience / Integration / Database | Low        | Fail — #311 |
| TC-FS-026 | Điều hướng sau completion             | UI-E2E / Integration                | Medium     | Not Run     |
