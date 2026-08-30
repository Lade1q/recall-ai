# Use Case Specification: AE-02 Thực hiện Phiên Kiểm tra

## 1. Use case Name

**AE-02:** Thực hiện Phiên Kiểm tra (Vấn đáp nhiều lượt)

## 2. Brief description

Use case này cho phép Sinh viên thực hiện một phiên kiểm tra kiến thức dưới hình thức vấn đáp hội thoại nhiều lượt. Hệ thống sử dụng AI (Google Gemini) để đóng vai trò giám khảo, sinh câu hỏi và chấm điểm trực tiếp dựa trên đúng tài liệu gốc mà Sinh viên đã tải lên. Luồng hoạt động được điều khiển bởi một máy trạng thái (state machine) giới hạn số lượt hỏi-đáp, giúp phân loại mức độ hiểu bài thực sự và tự động kích hoạt truy ngược kiến thức tiên quyết nếu phát hiện Sinh viên bị hổng kiến thức nền.

## 3. Actors

- **Sinh viên (Student):** Người học trực tiếp tham gia tương tác, trả lời các câu hỏi vấn đáp.
- **AI Service (Google Gemini):** Dịch vụ ngoại vi chịu trách nhiệm xử lý ngôn ngữ, bao gồm sinh câu hỏi (`generate_question`) và chấm điểm câu trả lời (`grade_answer`) dựa trên rubric.
- **Scheduling & Remediation Engine (SRE):** Module tất định của hệ thống, tính `mastery_score` và kích hoạt Truy ngược Lỗ hổng (AE-07) sau khi mỗi khái niệm được đánh giá xong.

## 4. Pre-conditions

- Sinh viên đã đăng nhập và đã hoàn thành bước cấu hình phiên kiểm tra (AE-01).
- Danh sách các khái niệm (concepts) cần ôn tập đã được hệ thống nạp vào hàng đợi.
- Hệ thống có kết nối mạng ổn định tới dịch vụ AI (Google Gemini).
- (Tùy chọn) Sinh viên đã cấp quyền sử dụng micro (microphone) — chỉ cần khi bật chế độ trả lời bằng giọng nói (tầng voice, xem I6.9). Luồng mặc định của Sprint 4 là gõ văn bản, không bắt buộc micro.

## 5. Basic Flow

1. **Sinh viên** bắt đầu phiên kiểm tra từ hàng đợi các khái niệm cần ôn tập.
2. **Hệ thống** tải khái niệm ưu tiên cao nhất, thiết lập giới hạn lượt hỏi-đáp (ví dụ: 3 lượt) và gửi yêu cầu (`generate_question`) tới **AI Service**.
3. **AI Service** sinh câu hỏi vấn đáp (`generate_question`) dựa trên rubric và tài liệu gốc mà Sinh viên đã tải lên.
4. **Hệ thống** hiển thị câu hỏi cho Sinh viên dưới **dạng văn bản**. (Tùy chọn) Nếu bật tầng giọng nói, hệ thống đọc câu hỏi bằng Text-to-Speech xử lý phía trình duyệt/client (không phải một lệnh gọi tới **AI Service** — theo `UC-Overview.md` §5.1, AI Service chỉ có đúng 4 schema cố định, không có schema âm thanh) và có thể ẩn văn bản cho tới khi Sinh viên nhấn "Hiện câu hỏi" — xem Alternative flow 5 nếu quyền micro bị từ chối.
5. **Sinh viên** gõ câu trả lời cho câu hỏi. (Tùy chọn) Sinh viên có thể trả lời bằng giọng nói qua micro nếu bật tầng voice.
6. **Hệ thống** tiếp nhận văn bản câu trả lời. Khi dùng giọng nói, câu trả lời được chuyển thành văn bản (Speech-to-Text) để Sinh viên xem và sửa lại trước khi gửi.
7. **Hệ thống** gửi văn bản câu trả lời tới **AI Service** để đối chiếu, chấm điểm (`grade_answer`).
8. **AI Service** phân tích và trả về kết quả điểm số, nhận xét, và phân loại mức độ hiểu bài.
9. **Hệ thống** xử lý phản hồi từ AI:
   - Nếu trả lời **hiểu sâu**, hệ thống yêu cầu AI tạo câu hỏi đào sâu hơn (vòng lại bước 3).
   - Nếu trả lời **hời hợt**, hệ thống yêu cầu AI đặt câu hỏi phụ buộc Sinh viên giải thích rõ hơn (vòng lại bước 3).
   - Nếu trả lời **sai/hổng kiến thức**, hệ thống **KHÔNG kết thúc khái niệm ngay** (đã sửa — xem ⚠️ dưới). Nếu còn lượt trong giới hạn C6: yêu cầu AI **thu hẹp chính câu hỏi vừa hỏi một nấc** (không đưa đáp án), cho Sinh viên trả lời lại câu đã thu hẹp đó (vòng lại bước 3–8, không phải một câu hỏi mới). Tối đa **2 lần gợi ý** cho một câu hỏi gốc — khớp tự nhiên với trần C6 (câu gốc + 2 gợi ý = 3 lượt). Nếu trả lời sau gợi ý đạt mức **hiểu sâu/hời hợt** và còn lượt, quay lại luật thường ở hai gạch đầu dòng trên. Hết thang gợi ý hoặc chạm trần C6 mà vẫn sai: nhận xét chấm điểm (`feedback` từ `grade_answer`) giải thích lỗi sai và khái niệm kết thúc. Việc **có kích hoạt AE-07 (Truy ngược Lỗ hổng) hay không được quyết định sau khi tính `mastery_score` cuối cùng của khái niệm** (per-concept), không phải ngay từng lượt.
10. **Hệ thống** lưu lại kết quả đánh giá của khái niệm hiện tại sau khi hết số lượt tối đa hoặc kết thúc chu trình xử lý ở bước 9. `mastery_score` được tính bằng trung bình có trọng số (weighted average) điểm **các lượt được tính** — xem ⚠️ về lượt gợi ý ngay dưới.
11. **Hệ thống** lặp lại quy trình từ Bước 2 cho khái niệm tiếp theo trong hàng đợi, cho đến khi hoàn tất danh sách.
12. **Hệ thống** thông báo kết thúc phiên kiểm tra và chuyển sang **trạng thái tổng hợp của chính màn đó** — không rời màn, không đổi route. (Khi bật tầng giọng nói, thông báo này được phát kèm giọng đọc, cùng cơ chế Text-to-Speech phía client như bước 4 — không qua AI Service.)

> ⚠️ **Lượt gợi ý KHÔNG vào `mastery_score` (chốt hướng (c) 30/08/2026, #392):** lượt sinh ra ở nấc gợi ý được chấm bình thường và **vẫn hiện đủ** trong bản ghi hỏi–đáp (điểm, verdict, nhận xét) — nó chỉ không có số hạng nào trong công thức. Lý do: gợi ý là chính câu hỏi cũ được **thu hẹp**, tức dễ hơn lượt nó theo sau; để nó vào trung bình có trọng số sẽ đặt câu **dễ nhất** của chuỗi ở trọng số **nặng nhất** (`wrong → hint → hint` đặt câu hẹp nhất ở 0.5). Bộ trọng số `[0.2, 0.3, 0.5]` **giữ nguyên** và được chuẩn hoá lại trên các lượt còn lại, đúng luật đã có cho khái niệm dưới 3 lượt. Trần C6 không đổi: lọc chỉ làm **giảm** số lượt đi vào công thức.
>
> ⚠️ **Đã sửa bước 9 (chốt phương án B 16/08/2026, #392):** luật cũ _"sai ⇒ đóng khái niệm ngay"_ (AE-02 bước 9 bản trước) bị thay bằng _"sai ⇒ thu hẹp chính câu hỏi, cho trả lời lại, tối đa 2 lần"_ — một câu trả lời không còn có quyền định đoạt số phận khái niệm ngay lập tức. Ba nguồn độc lập hội tụ ở quyết định này: spike S0 xếp hạng R-A (`technical-spike-s0-report.md`), lập luận của Quân 16/08 (_"phải tương tác qua lại mới biết đó là sai chứ"_), và bài đối chứng viết không nhìn repo (`interview-examiner-reference.md`, #394) — mô hình tutor Socratic. Phương án bị loại (A — hỏi câu làm-rõ khác): gần luồng cũ hơn nhưng không cứu Sinh viên trên chính câu đang bí.
>
> ⚠️ **Đã sửa bước 12 (chốt 2026-08-04):** "tự động chuyển tới **màn hình** Xem Tổng hợp Cuối phiên" → chuyển sang **trạng thái tổng hợp của chính màn phỏng vấn**, không rời màn/không đổi route. Trạng thái tổng hợp cuối phiên (AE-09) là một trạng thái của màn AE-02, không phải màn/route riêng — khớp mockup `screen-interview.html`.

## 6. Alternative Flows

**Alternative flow 1: AI Service Timeout hoặc Lỗi (AI Fail/Timeout)**

1. Từ bước #3 hoặc #7 của basic flow, nếu AI Service phản hồi chậm, hết quota hoặc báo lỗi.
2. Hệ thống ghi log lỗi và tự động **extend Use Case AE-03 (Sử dụng Fallback)**. Hệ thống dừng gọi AI, chuyển sang giao diện flashcard tĩnh (lấy các câu hỏi đã được pre-generate trước đó). Sinh viên tự đánh giá đúng/sai.
3. Continue step #11.

**Alternative flow 2: Sinh viên Tạm dừng phiên kiểm tra**

1. Từ bước #5 của basic flow, nếu Sinh viên chọn tùy chọn "Tạm dừng".
2. Hệ thống lưu lại trạng thái hiện tại (bao gồm lịch sử hội thoại, số lượt còn lại) và thoát giao diện. (Khi Sinh viên quay lại, hệ thống sẽ phát lại câu hỏi từ Bước #4).
3. The use case terminates.

**Alternative flow 3: Sinh viên Bỏ qua khái niệm (Skip)**

1. Từ bước #4 hoặc #5 của basic flow, nếu Sinh viên chọn tùy chọn "Bỏ qua".
2. Hệ thống hủy các lượt hỏi còn lại của khái niệm này và bỏ qua chấm điểm.
3. Continue step #10.

**Alternative flow 4: Sinh viên Khiếu nại kết quả chấm**

1. Từ bước #9 của basic flow, nếu sau khi nghe nhận xét từ AI, Sinh viên không đồng ý và chọn "Khiếu nại".
2. Hệ thống tạm dừng luồng hội thoại giọng nói, hiển thị form nhập lý do khiếu nại. Kết quả khái niệm được lưu tạm kèm cờ "Đang khiếu nại".
3. Continue step #10.

**Alternative flow 5: Không cấp được quyền micro (chế độ giọng nói)**

1. Từ bước #4 hoặc #5 của basic flow, nếu Sinh viên đã bật tầng giọng nói nhưng trình duyệt từ chối quyền micro, thiết bị không có micro, hoặc quyền bị thu hồi giữa chừng.
2. Hệ thống thông báo ngắn gọn ngay tại chỗ và tự động chuyển về chế độ gõ văn bản. Lượt hỏi-đáp hiện tại, số lượt còn lại và lịch sử hội thoại được giữ nguyên — đây **không** phải một lần gián đoạn phiên (khác Alternative flow 2).
3. Continue step #5 (ở chế độ gõ văn bản).

## 7. Post-conditions

- Điểm số hiểu bài (`mastery_score`) của từng khái niệm tham gia trong phiên được cập nhật đầy đủ vào cơ sở dữ liệu (bảng `concepts`).
- Nếu phát hiện lỗ hổng kiến thức, các khái niệm nền (tiên quyết) đã được tự động chèn vào hàng đợi của phiên học tiếp theo thông qua thuật toán của Concept Graph Engine.
- Toàn bộ lịch sử hội thoại (văn bản được chuyển đổi từ giọng nói và/hoặc âm thanh) được lưu trữ thành công để làm dữ liệu hiển thị cho màn hình tổng hợp và quá trình học tập sau này.
