# Bug Report

| Trường                    | Nội dung                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B001                                                                                                                                 |
| **Tiêu đề (Title)**       | API đăng ký cho phép mật khẩu chỉ gồm dấu cách                                                                                       |
| **Mô tả**                 | API đăng ký chấp nhận mật khẩu gồm tám ký tự khoảng trắng và vẫn tạo tài khoản thành công, làm suy giảm yêu cầu về độ mạnh mật khẩu. |
| **Module / Function ID**  | UC-01 — Đăng ký tài khoản / Authentication — `POST /api/v1/auth/register`                                                            |
| **Mức độ (Severity)**     | High                                                                                                                                 |
| **Độ ưu tiên (Priority)** | High                                                                                                                                 |
| **Trạng thái (Status)**   | Closed                                                                                                                               |
| **Ngày báo cáo (Date)**   | 25/07/2026                                                                                                                           |
| **Phát hiện ở**           | Sprint 3                                                                                                                             |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                     |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                     |
| **Comment**               | Cần bổ sung quy tắc validation để chặn mật khẩu chỉ gồm khoảng trắng.                                                                |

---

| Trường                    | Nội dung                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B002                                                                                                                                                             |
| **Tiêu đề (Title)**       | Màn hình đăng nhập treo khi API trả sai mật khẩu                                                                                                                 |
| **Mô tả**                 | Trong lần kiểm thử ban đầu, trạng thái tải ở biểu mẫu đăng nhập không kết thúc sau khi nhập sai mật khẩu, khiến người dùng không nhận được phản hồi lỗi rõ ràng. |
| **Module / Function ID**  | UC-02 — Đăng nhập / Authentication — `LoginPage` / Sign In                                                                                                       |
| **Mức độ (Severity)**     | Medium                                                                                                                                                           |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                           |
| **Trạng thái (Status)**   | Closed                                                                                                                                                           |
| **Ngày báo cáo (Date)**   | 25/07/2026                                                                                                                                                       |
| **Phát hiện ở**           | Sprint 3                                                                                                                                                         |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                                                 |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                 |
| **Comment**               | Không tái hiện khi kiểm thử lại; cần tiếp tục theo dõi nhánh xử lý lỗi 401.                                                                                      |

---

| Trường                    | Nội dung                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B003                                                                                                                                                                                                                          |
| **Tiêu đề (Title)**       | Retry đồng thời có thể tạo job trùng hoặc khóa retry vĩnh viễn                                                                                                                                                                |
| **Mô tả**                 | Các chuyển trạng thái của `AnalysisJob` là thao tác đọc-rồi-ghi không nguyên tử. Hai yêu cầu retry đồng thời có thể tạo hoặc xử lý job trùng; job `processing` bị treo cũng có thể khiến mọi lần retry sau trả 409 vĩnh viễn. |
| **Module / Function ID**  | UC-05 — Tạo kế hoạch ôn tập mới / AI Planning — `AnalysisJob` lifecycle / `processAnalysisJob`                                                                                                                                |
| **Mức độ (Severity)**     | High                                                                                                                                                                                                                          |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                                                        |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                                        |
| **Ngày báo cáo (Date)**   | 31/07/2026                                                                                                                                                                                                                    |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                                      |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                               |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                              |
| **Comment**               | Có rủi ro tạo dữ liệu trùng và khóa retry; cần thao tác claim/retry nguyên tử.                                                                                                                                                |

---

| Trường                    | Nội dung                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B004                                                                                                                                                                                                                         |
| **Tiêu đề (Title)**       | Upload chấp nhận PDF mã hóa nhưng Gemini không thể phân tích                                                                                                                                                                 |
| **Mô tả**                 | Upload middleware chỉ kiểm tra MIME type và dung lượng, nên cho qua PDF có `/Encrypt`. Tệp vẫn mở được bằng trình đọc PDF nhưng Gemini File API không đọc được trang nào, làm job phân tích retry vô ích trước khi thất bại. |
| **Module / Function ID**  | UC-05 — Tạo kế hoạch ôn tập mới / AI Planning — `upload.middleware.ts` / tạo Plan                                                                                                                                            |
| **Mức độ (Severity)**     | Medium                                                                                                                                                                                                                       |
| **Độ ưu tiên (Priority)** | Low                                                                                                                                                                                                                          |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                                       |
| **Ngày báo cáo (Date)**   | 01/08/2026                                                                                                                                                                                                                   |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                                     |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                              |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                             |
| **Comment**               | Nên từ chối PDF mã hóa ngay khi upload để tránh retry phân tích vô ích.                                                                                                                                                      |

---

| Trường                    | Nội dung                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B005                                                                                                                                          |
| **Tiêu đề (Title)**       | PlanDetailPage hiển thị deadline muộn hơn một ngày                                                                                            |
| **Mô tả**                 | Deadline hiển thị nhất quán ở danh sách Plan nhưng bị tăng một ngày ở màn hình chi tiết, dẫn đến thông tin hạn hoàn thành sai cho người dùng. |
| **Module / Function ID**  | UC-07 — Xem danh sách kế hoạch ôn tập / Plan Management — `PlanDetailPage` / deadline                                                         |
| **Mức độ (Severity)**     | Medium                                                                                                                                        |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                        |
| **Trạng thái (Status)**   | Closed                                                                                                                                        |
| **Ngày báo cáo (Date)**   | 02/08/2026                                                                                                                                    |
| **Phát hiện ở**           | Sprint 4                                                                                                                                      |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                              |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                              |
| **Comment**               | Cần thống nhất cách xử lý múi giờ để ngày deadline không bị lệch.                                                                             |

---

| Trường                    | Nội dung                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B006                                                                                                                                                   |
| **Tiêu đề (Title)**       | API tạo Plan từ chối file có kích thước đúng 10 MB                                                                                                     |
| **Mô tả**                 | Ràng buộc dung lượng upload xử lý sai giá trị biên: file có kích thước chính xác 10 MiB bị từ chối, dù giới hạn 10 MB phải bao gồm giá trị `<= 10 MB`. |
| **Module / Function ID**  | UC-05 — Tạo kế hoạch ôn tập mới / AI Planning — `POST /api/v1/plans` / upload file                                                                     |
| **Mức độ (Severity)**     | Medium                                                                                                                                                 |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                 |
| **Trạng thái (Status)**   | Closed                                                                                                                                                 |
| **Ngày báo cáo (Date)**   | 02/08/2026                                                                                                                                             |
| **Phát hiện ở**           | Sprint 4                                                                                                                                               |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                                       |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                       |
| **Comment**               | Điều kiện giới hạn dung lượng phải bao gồm đúng giá trị 10 MiB.                                                                                        |

---

| Trường                    | Nội dung                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B007                                                                                                                             |
| **Tiêu đề (Title)**       | Tìm khái niệm theo tên không hoạt động khi mọi khái niệm chưa được kiểm tra                                                      |
| **Mô tả**                 | Chức năng tìm kiếm theo tên trên đồ thị khái niệm không có tác dụng khi tất cả khái niệm của kế hoạch có `mastery_score = null`. |
| **Module / Function ID**  | UC-17 — Xem và tương tác Concept Graph / DB-05 — Concept Graph, chế độ xem                                                       |
| **Mức độ (Severity)**     | High                                                                                                                             |
| **Độ ưu tiên (Priority)** | High                                                                                                                             |
| **Trạng thái (Status)**   | Closed                                                                                                                           |
| **Ngày báo cáo (Date)**   | 02/08/2026                                                                                                                       |
| **Phát hiện ở**           | Sprint 4                                                                                                                         |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                  |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                 |
| **Comment**               | Cần tách điều kiện tìm kiếm tên khỏi điều kiện lọc theo mastery score.                                                           |

---

| Trường                    | Nội dung                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B008                                                                                                                                                                      |
| **Tiêu đề (Title)**       | Điểm sau phiên phải suy từ lượt của chính phiên đó, không đọc Concept.masteryScore                                                                                        |
| **Mô tả**                 | Tổng hợp của một phiên cũ lấy `Concept.masteryScore` tại thời điểm mở lại thay vì điểm do chính các lượt trả lời của phiên đó tạo ra, khiến lịch sử hiển thị sai dữ liệu. |
| **Module / Function ID**  | UC-18 — Xem lịch sử phiên Interview / DB-03 — Tổng hợp/lịch sử phiên AI Examiner                                                                                          |
| **Mức độ (Severity)**     | Medium                                                                                                                                                                    |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                    |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                    |
| **Ngày báo cáo (Date)**   | 05/08/2026                                                                                                                                                                |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                  |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                           |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                          |
| **Comment**               | Điểm lịch sử phải được tính từ các lượt trả lời của chính phiên đó.                                                                                                       |

---

| Trường                    | Nội dung                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B009                                                                                                                                                                  |
| **Tiêu đề (Title)**       | Plan chuyển active ngay khi phân tích xong, bỏ qua bước kiểm chứng đồ thị                                                                                             |
| **Mô tả**                 | Sau khi job phân tích hoàn tất, kế hoạch bị chuyển sang `active` ngay lập tức. Vì vậy màn kiểm chứng đồ thị chỉ hiển thị khi plan là `draft` không bao giờ xuất hiện. |
| **Module / Function ID**  | UC-06 — Xem và chỉnh sửa đồ thị khái niệm / SP-01 — Tạo và xác nhận đồ thị khái niệm                                                                                  |
| **Mức độ (Severity)**     | High                                                                                                                                                                  |
| **Độ ưu tiên (Priority)** | High                                                                                                                                                                  |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                |
| **Ngày báo cáo (Date)**   | 06/08/2026                                                                                                                                                            |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                              |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                       |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                      |
| **Comment**               | Chỉ kích hoạt kế hoạch sau khi người dùng xác nhận đồ thị khái niệm.                                                                                                  |

---

| Trường                    | Nội dung                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B010                                                                                                                                                                              |
| **Tiêu đề (Title)**       | State Machine không Traceback / Spaced Repetition khi trả lời sai                                                                                                                 |
| **Mô tả**                 | Khi sinh viên trả lời sai hoàn toàn (`0.00`, verdict `wrong`), State Machine vẫn hỏi câu tiếp theo của cùng khái niệm thay vì chuyển theo luồng Traceback hoặc Spaced Repetition. |
| **Module / Function ID**  | UC-13 — Truy ngược khái niệm tiên quyết / AI Examiner — CF-03 và CF-04                                                                                                            |
| **Mức độ (Severity)**     | High                                                                                                                                                                              |
| **Độ ưu tiên (Priority)** | High                                                                                                                                                                              |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                            |
| **Ngày báo cáo (Date)**   | 06/08/2026                                                                                                                                                                        |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                          |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                                                                  |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                  |
| **Comment**               | Cần kích hoạt đúng Traceback hoặc Spaced Repetition khi trả lời sai hoàn toàn.                                                                                                    |

---

| Trường                    | Nội dung                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B011                                                                                                                                                 |
| **Tiêu đề (Title)**       | API Idempotency chặn cả hai request thay vì chỉ request trùng lặp                                                                                    |
| **Mô tả**                 | Cơ chế idempotency xử lý sai hai request trả lời giống nhau gửi đồng thời: cả hai đều bị từ chối `409 Conflict`, không có lượt trả lời nào được lưu. |
| **Module / Function ID**  | UC-11 — Phiên Interview vấn đáp nhiều lượt / AI Examiner — `POST /api/v1/interviews/:id/answers`                                                     |
| **Mức độ (Severity)**     | High                                                                                                                                                 |
| **Độ ưu tiên (Priority)** | High                                                                                                                                                 |
| **Trạng thái (Status)**   | Closed                                                                                                                                               |
| **Ngày báo cáo (Date)**   | 06/08/2026                                                                                                                                           |
| **Phát hiện ở**           | Sprint 4                                                                                                                                             |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                                     |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                     |
| **Comment**               | Request đầu tiên phải được xử lý; chỉ request trùng mới bị chặn hoặc trả kết quả đã lưu.                                                             |

---

| Trường                    | Nội dung                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B012                                                                                                                                              |
| **Tiêu đề (Title)**       | Lỗi hiển thị Tooltip trong Đồ thị khái niệm                                                                                                       |
| **Mô tả**                 | Tooltip hiển thị chi tiết khái niệm trên đồ thị bị tràn nội dung và bị các node lân cận đè lên, khiến người dùng không đọc được đầy đủ thông tin. |
| **Module / Function ID**  | UC-17 — Xem và tương tác Concept Graph / Tooltip chi tiết khái niệm                                                                               |
| **Mức độ (Severity)**     | Low                                                                                                                                               |
| **Độ ưu tiên (Priority)** | Low                                                                                                                                               |
| **Trạng thái (Status)**   | Closed                                                                                                                                            |
| **Ngày báo cáo (Date)**   | 07/08/2026                                                                                                                                        |
| **Phát hiện ở**           | Sprint 4                                                                                                                                          |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                                  |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                  |
| **Comment**               | Cần giới hạn nội dung và tăng lớp hiển thị để tooltip không bị che khuất.                                                                         |

---

| Trường                    | Nội dung                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B013                                                                                                                                         |
| **Tiêu đề (Title)**       | Sidebar chi tiết khái niệm hiển thị tên biến thô thay vì nhãn thân thiện                                                                     |
| **Mô tả**                 | Thanh bên chi tiết Khái niệm hiển thị tên biến nội bộ thay vì nhãn dành cho người dùng, làm giao diện không nhất quán với node trên biểu đồ. |
| **Module / Function ID**  | UC-17 — Xem và tương tác Concept Graph / Concept Detail Sidebar                                                                              |
| **Mức độ (Severity)**     | Low                                                                                                                                          |
| **Độ ưu tiên (Priority)** | Low                                                                                                                                          |
| **Trạng thái (Status)**   | Closed                                                                                                                                       |
| **Ngày báo cáo (Date)**   | 08/08/2026                                                                                                                                   |
| **Phát hiện ở**           | Sprint 4                                                                                                                                     |
| **Người báo cáo**         | Nguyễn Minh Phát                                                                                                                             |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                             |
| **Comment**               | Cần thay tên biến nội bộ bằng nhãn thân thiện, nhất quán với giao diện.                                                                      |

---

| Trường                    | Nội dung                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B014                                                                                                                                                                                                              |
| **Tiêu đề (Title)**       | Request đã mất quyền claim vẫn ghi kết quả và đẩy state machine                                                                                                                                                   |
| **Mô tả**                 | Lệnh claim lượt trả lời kiểm tra lượt còn hợp lệ, nhưng các lệnh ghi `score`, `feedback` và `verdict` chỉ khóa theo `id`. Vì vậy request đã mất claim vẫn có thể ghi đè kết quả và gọi chuyển sang câu tiếp theo. |
| **Module / Function ID**  | UC-11 — Phiên Interview vấn đáp nhiều lượt / AI Examiner — `submitAnswer`                                                                                                                                         |
| **Mức độ (Severity)**     | High                                                                                                                                                                                                              |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                                            |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                            |
| **Ngày báo cáo (Date)**   | 08/08/2026                                                                                                                                                                                                        |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                          |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                   |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                  |
| **Comment**               | Chỉ request giữ quyền claim hợp lệ mới được ghi điểm và chuyển trạng thái phiên.                                                                                                                                  |

---

| Trường                    | Nội dung                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B015                                                                                                                                                                                                                      |
| **Tiêu đề (Title)**       | Lời gọi Gemini không có timeout/AbortSignal nên có thể treo vô hạn                                                                                                                                                        |
| **Mô tả**                 | `GoogleGenAI` được khởi tạo không có `httpOptions` timeout và các lời gọi SDK không truyền `AbortSignal`. Một request Gemini không phản hồi sẽ treo vô hạn, khiến retry AE-02 và fallback Flashcard AE-05 không thể chạy. |
| **Module / Function ID**  | UC-11 / UC-12 — Interview và Fallback Flashcard / Gemini Service                                                                                                                                                          |
| **Mức độ (Severity)**     | High                                                                                                                                                                                                                      |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                                                    |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                                    |
| **Ngày báo cáo (Date)**   | 09/08/2026                                                                                                                                                                                                                |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                                  |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                           |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                          |
| **Comment**               | Cần thêm timeout và cơ chế hủy để retry/fallback luôn có thể được kích hoạt.                                                                                                                                              |

---

| Trường                    | Nội dung                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B016                                                                                                                                                                                            |
| **Tiêu đề (Title)**       | Tên tệp upload tiếng Việt bị mojibake ngay khi lưu vào cơ sở dữ liệu                                                                                                                            |
| **Mô tả**                 | Multer/busboy giải mã `file.originalname` theo latin1 thay vì UTF-8. Tên tệp hỏng được lưu trực tiếp vào `Document.filename`, nên đây là lỗi dữ liệu từ tầng upload, không chỉ là lỗi hiển thị. |
| **Module / Function ID**  | UC-05 — Tạo kế hoạch ôn tập mới / Document Upload — `upload.middleware.ts`                                                                                                                      |
| **Mức độ (Severity)**     | Medium                                                                                                                                                                                          |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                          |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                          |
| **Ngày báo cáo (Date)**   | 09/08/2026                                                                                                                                                                                      |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                        |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                 |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                |
| **Comment**               | Cần cấu hình mã hóa UTF-8 khi nhận tên tệp và xử lý riêng dữ liệu đã hỏng.                                                                                                                      |

---

| Trường                    | Nội dung                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B017                                                                                                                                                                                                                                                                      |
| **Tiêu đề (Title)**       | Hàng đợi ôn và auto-pick không loại khái niệm deprecated                                                                                                                                                                                                                  |
| **Mô tả**                 | Đường đọc `resolvePlanQueue` chỉ lọc trạng thái `ReviewQueueItem`, không lọc trạng thái concept liên quan. Review item của concept đã `deprecated` vẫn xuất hiện trong hàng đợi và có thể được auto-pick để tạo phiên vấn đáp trên khái niệm đã bị gỡ khỏi plan và graph. |
| **Module / Function ID**  | UC-19 — Nhận nhắc nhở ôn tập chủ động / Review Queue — `resolvePlanQueue`                                                                                                                                                                                                 |
| **Mức độ (Severity)**     | High                                                                                                                                                                                                                                                                      |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                                                                                                    |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                                                                                    |
| **Ngày báo cáo (Date)**   | 13/08/2026                                                                                                                                                                                                                                                                |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                                                                                  |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                                                                           |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                                          |
| **Comment**               | Cần lọc concept deprecated tại các luồng đọc của hàng đợi ôn tập.                                                                                                                                                                                                         |

---

| Trường                    | Nội dung                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B018                                                                                                                                                                                                                                                                                                                                        |
| **Tiêu đề (Title)**       | Empty-state hàng đợi ôn hiển thị thông điệp và CTA sai trạng thái                                                                                                                                                                                                                                                                           |
| **Mô tả**                 | Sau khi hàng đợi được lọc bỏ concept deprecated, một kế hoạch đã có kết quả vấn đáp nhưng mọi concept từng lên lịch đã bị gỡ có thể rơi vào fallback. UI lại nói kế hoạch chưa có phiên/kết quả vấn đáp. Với kế hoạch không còn concept active, UI còn hiển thị lời chúc mừng và CTA bắt đầu phiên dẫn đến lỗi `409 NO_CONCEPTS_TO_REVIEW`. |
| **Module / Function ID**  | UC-19 — Nhận nhắc nhở ôn tập chủ động / Review Queue — Today Nudge                                                                                                                                                                                                                                                                          |
| **Mức độ (Severity)**     | Medium                                                                                                                                                                                                                                                                                                                                      |
| **Độ ưu tiên (Priority)** | Medium                                                                                                                                                                                                                                                                                                                                      |
| **Trạng thái (Status)**   | Closed                                                                                                                                                                                                                                                                                                                                      |
| **Ngày báo cáo (Date)**   | 13/08/2026                                                                                                                                                                                                                                                                                                                                  |
| **Phát hiện ở**           | Sprint 4                                                                                                                                                                                                                                                                                                                                    |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                                                                                                                                                                                                                                                                             |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                                                                                                            |
| **Comment**               | Cần hiển thị thông điệp và CTA phù hợp với lịch sử ôn và trạng thái đồ thị.                                                                                                                                                                                                                                                                 |
