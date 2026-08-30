# Use-case Specification: DB-03 Xem lịch sử phiên Interview

## 1. Use case Name

**DB-03:** Xem lịch sử phiên Interview (Lịch sử & Tiến độ)

## 2. Brief description

Use case này cho phép Sinh viên xem lại các phiên kiểm tra vấn đáp (Interview) đã thực hiện để theo dõi tiến độ theo thời gian và kiểm chứng từng kết quả chấm điểm. Với mỗi phiên, Sinh viên xem được biến động `mastery_score` trước và sau phiên của từng khái niệm, toàn bộ lượt hỏi-đáp kèm điểm và nhận xét của AI, cách điểm được tính ra từ các lượt, và những gì hệ thống đã tự động làm sau phiên (ví dụ chèn khái niệm tiên quyết vào lịch ôn qua AE-07). Trang này dùng chung khung "Lịch sử & Tiến độ" với DB-08 (lịch sử phiên Focus Session) dưới dạng hai tab. Đây là tác vụ read-only; nó không sinh ra `mastery_score` mới, chỉ trình bày lại dữ liệu đã có.

## 3. Actors

- **Sinh viên (Student):** Người xem lại lịch sử và tiến độ học tập của chính mình.

## 4. Pre-conditions

- Sinh viên đã đăng nhập vào hệ thống Recall AI thành công.
- Sinh viên đã có ít nhất một kế hoạch ôn tập. (Danh sách phiên có thể rỗng — xem Alternative flow 1.)

## 5. Basic Flow

1. **Khởi tạo trang:** Sinh viên vào trang "Lịch sử & Tiến độ" từ menu chính. Hệ thống mặc định mở tab **Phiên kiểm tra** (DB-03); tab **Phiên học** (DB-08) nằm ngay cạnh.
2. **Hiển thị danh sách phiên:** Hệ thống tải các bản ghi `interview_sessions` của Sinh viên, nhóm theo mốc thời gian (hôm nay / tuần này / tuần trước…) và sắp xếp giảm dần theo `started_at`. Mỗi mục trong danh sách hiển thị:
   - Ngày và giờ bắt đầu phiên.
   - Kế hoạch và số khái niệm tham gia phiên.
   - Biến động `mastery_score` của từng khái niệm trong phiên (ví dụ: `+0.14`, `−0.04`, hoặc "lần đầu" nếu khái niệm chưa từng được kiểm tra).
   - Trạng thái phiên (`status`) nếu khác `completed`: đang tạm dừng, đã bỏ dở, hoặc đang chạy ở chế độ tự chấm (`fallback_mode`).
3. **Chọn một phiên:** Sinh viên click vào một phiên trong danh sách. Hệ thống hiển thị panel chi tiết bên cạnh (không rời danh sách), gồm các phần ở các bước 4–7.
4. **Biến động mastery_score:** Với mỗi khái niệm của phiên, hệ thống hiển thị điểm **trước** và điểm **sau** phiên kèm mốc ngưỡng `0.60` — ranh giới quyết định của vòng lặp học tập (đạt ngưỡng → xếp lịch ôn giãn cách; dưới ngưỡng → kích hoạt truy ngược). Khái niệm được kiểm tra lần đầu hiển thị giá trị tuyệt đối kèm nhãn "lần đầu", **không** hiển thị dưới dạng mức tăng, vì `mastery_score` trước đó là `NULL` (chưa đo) chứ không phải `0.0` (đo và sai hoàn toàn) — xem UC-Overview §5.3.
5. **Nhận xét cuối phiên:** Nếu phiên đã `completed`, hệ thống hiển thị `summary_text` do AI Service sinh ra ở cuối phiên (`summarize_session`, xem UC-14), kèm danh sách phần đã vững và phần còn yếu. Phần chữ này do AI viết; điểm số và việc xếp lịch **không** do AI quyết (ràng buộc C4).
6. **Hành động của hệ thống sau phiên:** Nếu phiên đã kích hoạt truy ngược lỗ hổng (AE-07), hệ thống hiển thị bản ghi tương ứng trong `review_queue_items` với `reason = traceback`: khái niệm tiên quyết nào đã được tìm thấy, ở độ sâu (`depth`) nào, và đã được chèn vào lịch ôn ngày nào. Khối này được trình bày tách bạch với phần nhận xét ở bước 5 để phản ánh đúng ranh giới: đây là kết quả của thuật toán tất định trong Scheduling & Remediation Engine, không phải văn bản do AI sinh.
7. **Bản ghi hỏi-đáp và cách tính điểm:** Với mỗi khái niệm, hệ thống hiển thị được từng lượt (`interview_turns`): câu hỏi, câu trả lời của Sinh viên, điểm (`score`), phân loại (`verdict`) và nhận xét (`feedback`) của từng lượt, cùng phép tính trung bình có trọng số ra `mastery_score` cuối cùng của khái niệm. Trọng số mặc định là `[0.2, 0.3, 0.5]` cho ba lượt vì lượt sau sâu hơn lượt trước (UC-Overview §5.4). Lượt gợi ý (`mode = hint`) vẫn hiện đủ trong bản ghi nhưng **không** vào phép tính (#392 hướng (c)) — màn hình nói rõ điều đó tại chỗ lẽ ra là trọng số của lượt.
8. **Biểu đồ tiến độ theo thời gian:** Sinh viên xem biểu đồ đường thể hiện `mastery_score` của các khái niệm qua các phiên kiểm tra. Điểm chỉ thay đổi tại thời điểm có phiên, nên các mốc đo được đánh dấu rõ; khái niệm mới có một mốc đo thì hiển thị một điểm, không vẽ thành đường xu hướng.

## 6. Alternative Flows

**Alternative flow 1: Chưa có phiên kiểm tra nào**

1. Từ bước #2 của basic flow, nếu Sinh viên chưa thực hiện phiên kiểm tra nào (`interview_sessions` rỗng cho tab hiện tại).
2. Hệ thống hiển thị trạng thái rỗng, nêu rõ hệ quả (đồ thị khái niệm còn toàn màu xám vì chưa có dữ liệu `mastery_score`) và cung cấp CTA "Bắt đầu phiên kiểm tra đầu tiên" (dẫn tới AE-01).
3. The use case terminates.

**Alternative flow 2: Phiên đang tạm dừng (status = paused)**

1. Từ bước #3 của basic flow, nếu phiên được chọn có `status = paused`.
2. Hệ thống hiển thị phần đã hoàn thành của phiên (các khái niệm đã chấm) và chỉ rõ vị trí đang dừng: khái niệm đang dở và số lượt đã trả lời. Vì đây là màn hình duy nhất liệt kê mọi phiên kể cả phiên chưa kết thúc, nó cũng là nơi phát hiện trạng thái PAUSED để **extend AE-01 → AE-03 (Tiếp tục phiên)**.
3. Sinh viên chọn một trong hai:
   - "Tiếp tục phiên" → chuyển sang AE-02, phiên chạy tiếp từ lượt còn dở, `status` trở lại `active`. Use case này kết thúc.
   - "Kết thúc và chấm phần đã làm" → phiên chuyển sang `abandoned`; khái niệm đang dở được chấm trên số lượt đã có (xem Alternative flow 3 về chuẩn hóa trọng số).
4. Continue step #3 (nếu chọn kết thúc, phiên được hiển thị lại như một phiên đã đóng).

**Alternative flow 3: Phiên bỏ dở — dữ liệu một phần (status = abandoned)**

1. Từ bước #4 hoặc #7 của basic flow, nếu phiên được chọn có `status = abandoned` và có khái niệm được chấm với số lượt ít hơn `max_turns_per_concept`.
2. Hệ thống tính và hiển thị `mastery_score` của khái niệm đó bằng trọng số **đã chuẩn hóa lại** trên các lượt thực có, thay vì trọng số gốc `[0.2, 0.3, 0.5]`. Ví dụ với hai lượt: trọng số trở thành `[0.4, 0.6]` (chia lại `0.2 : 0.3` cho tổng của chúng). Điều này bắt buộc để phép tính hiển thị khớp với `score` đã lưu trong cơ sở dữ liệu.
3. Vì phiên chưa chạy hết hàng đợi, `summary_text` là `NULL` (`summarize_session` không được gọi — xem UC-14 [E1]). Hệ thống bỏ hẳn khối nhận xét ở bước #5 thay vì hiển thị một khung trống.
4. Continue step #7.

**Alternative flow 4: Phiên chạy ở chế độ tự chấm (fallback_mode)**

1. Từ bước #3 của basic flow, nếu phiên được chọn có `fallback_mode = true` (đã chạy AE-05 do AI Service không phản hồi).
2. Hệ thống hiển thị nhãn rõ ràng ở cả mục danh sách lẫn đầu panel chi tiết, nêu rằng điểm là do Sinh viên tự chấm trên flashcard đã cache (`interview_turns.source = cache_fallback`), không phải do `grade_answer` chấm độc lập — hai loại điểm này không cùng độ tin cậy.
3. Vì không có AI chấm, phiên không có `feedback` do AI viết cho từng lượt và không có `summary_text`. Hệ thống có thể gợi ý kiểm tra lại khái niệm bằng phiên vấn đáp thật.
4. Continue step #7.

**Alternative flow 5: Sinh viên khiếu nại một điểm số (extend AE-10 / UC-15)**

1. Từ bước #7 của basic flow, nếu Sinh viên không đồng ý với điểm của một lượt và chọn "Không đồng ý với điểm này".
2. Hệ thống hiển thị form nhập lý do (không bắt buộc) kèm vài lựa chọn có sẵn, và lưu phản hồi vào log (`grading_feedback`).
3. Hệ thống thông báo rõ phạm vi MVP: phản hồi được ghi nhận để cải thiện rubric chấm, **`mastery_score` giữ nguyên, không tự động điều chỉnh** (UC-15).
4. Continue step #7.

**Alternative flow 6: Chuyển sang tab Lịch sử phiên học (DB-08)**

1. Từ bất kỳ bước nào, nếu Sinh viên chọn tab "Phiên học".
2. Hệ thống chuyển sang khung nhìn của DB-08 (UC-10): nhóm phiên Focus theo ngày, tổng thời gian ôn và số chu kỳ Pomodoro. Phiên học **không** sinh `mastery_score`, nên khung nhìn này không có cột điểm; các thống kê FS-07 (chuỗi ngày, tổng giờ) hiển thị ở đầu tab.
3. The use case continues within DB-08.

## 7. Post-conditions

- Ở luồng chính, hệ thống không có thay đổi nào về dữ liệu — đây là tác vụ read-only. Sinh viên nắm được tiến độ theo thời gian và kiểm chứng được cách từng điểm số được tính.
- Nếu Sinh viên tiếp tục một phiên tạm dừng (Alternative flow 2), phiên được bàn giao cho AE-02 và trạng thái chuyển từ `paused` sang `active`.
- Nếu Sinh viên gửi khiếu nại (Alternative flow 5), một bản ghi phản hồi được thêm vào log; `mastery_score` không đổi.

---

> **Ghi chú triển khai — các trạng thái phiên.** `interview_session_status` trong `recall-ai.dbml` có bốn giá trị: `active`, `paused`, `completed`, `abandoned`. Bản mô tả gốc ở UC-18 (`UC-05_Dashboard.md`) chỉ đề cập phiên đã hoàn thành ("ngày, số khái niệm, điểm trung bình"). Spec này bổ sung cách hiển thị cho `paused` và `abandoned`, cờ `fallback_mode`, và quy tắc chuẩn hóa lại trọng số khi số lượt ít hơn `max_turns_per_concept`.
>
> **Ghi chú về "điểm trung bình phiên".** UC-18 liệt kê "điểm trung bình" như một cột của danh sách. Con số này được giữ lại nhưng ở vai trò phụ: trung bình cộng `mastery_score` của các khái niệm khác nhau trong cùng một phiên trộn lẫn khái niệm mới học lần đầu với khái niệm đã ôn nhiều lần, nên ít phản ánh được giá trị của phiên. Tín hiệu chính là biến động `mastery_score` của **từng** khái niệm (bước #4).
