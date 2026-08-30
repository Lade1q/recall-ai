# Kịch bản Demo PA4 - Beta Release 0.5

**Thời lượng dự kiến:** 5 - 7 phút

**Mục tiêu:** Thể hiện "AI Examiner + trace-back connected to real grading data, demo-ready" (Theo SDP 4.2.2 & 4.2.3).

**Lưu ý:** Tập trung show logic cốt lõi của tính năng Trace-back và Concept Graph Engine, giao diện không cần quá trau chuốt (Release 0.5 Beta).

## Chuẩn bị trước Demo

- **Môi trường:** Staging (Frontend trên Vercel, Backend trên Render, DB trên Neon/Supabase). Đảm bảo đã warm-up Render 5 phút trước demo.
- **Tài khoản:** Dùng tài khoản demo đã được chuẩn bị sẵn dữ liệu.
- **Dữ liệu:** 1 Plan đã phân tích sẵn đồ thị khái niệm (có quan hệ tiên quyết rõ ràng) và `question_cache` đã sinh sẵn. Tránh việc upload PDF chờ 60s lúc demo.
- **Dự phòng (Plan B):** Mở sẵn local server (chạy qua docker compose / npm run dev) và video quay sẵn đề phòng mạng/Gemini API sập.

---

## Các bước Demo chi tiết

### 1. Đăng nhập (0:00 - 0:30)

- **Thao tác:** Mở trình duyệt, truy cập URL staging. Đăng nhập với tài khoản demo.
- **Lời dẫn:** _"Chào thầy. Nhóm 7 xin phép demo tính năng cốt lõi nhất của Recall AI trong bản Release 0.5 Beta."_

### 2. Xem plan có sẵn & Đồ thị khái niệm (0:30 - 1:30)

- **Thao tác:** Chuyển sang màn hình Dashboard / Plan, show ra đồ thị khái niệm.
- **Lời dẫn:** _"Đây là đồ thị khái niệm mà AI Study Planner đã trích xuất tự động từ tài liệu. Các mũi tên thể hiện quan hệ tiên quyết. Chẳng hạn, để hiểu được 'Applicability and Trades-off of Agile method', đồ thị chỉ ra rằng người học bắt buộc phải nắm vững khái niệm 'Extreme Programming', 'Scrum' và 'Kanban' trước."_

### 3. Bắt đầu Focus Session (1:30 - 2:00)

- **Thao tác:** Nhấn nút bắt đầu học (Focus Session) cho một khái niệm. Giao diện đồng hồ đếm ngược Pomodoro xuất hiện.
- **Lời dẫn:** _"Trước khi làm bài kiểm tra, người dùng có thể bắt đầu một Focus Session để ôn lại kiến thức. Ứng dụng có tích hợp đồng hồ Pomodoro giúp người học duy trì sự tập trung. Sau khi hết thời gian học lý thuyết, sinh viên có thể chuyển thẳng sang phần Verify để làm bài test."_

### 4. Bắt đầu phiên Interview (2:00 - 2:30)

- **Thao tác:** Nhấn nút bắt đầu Interview / Verify cho khái niệm vừa học.
- **Lời dẫn:** _"Tiếp theo, nhóm sẽ demo AI Examiner. Khác với trắc nghiệm thông thường, AI của nhóm sẽ phỏng vấn người dùng dưới dạng tự luận ngắn để đánh giá mức độ hiểu sâu."_

### 5. Tình huống 1 - Trả lời tốt (2:30 - 4:00)

- **Thao tác:** AI Examiner đưa ra câu hỏi đầu tiên: _"According to the slides, what is Scrum and who developed it?"_. Nhập câu trả lời mẫu dưới đây.
- **Câu trả lời mẫu [ĐÚNG]:** _"Scrum is an Agile framework for managing and developing complex products, especially software. Scrum was not created by one person. The framework was developed primarily by Jeft Sutherland and Ken Schwaber."_
- **Lời dẫn:** _"Ở câu hỏi đầu tiên, nhóm sẽ trả lời chính xác. Có thể thấy AI Examiner không chấm xong rồi bỏ qua, mà nó tiếp tục đào sâu hơn hoặc đưa ra câu hỏi tình huống thực tế để kiểm tra xem người dùng có thực sự hiểu để áp dụng hay chỉ đang học thuộc lòng định nghĩa."_

### 6. Tình huống 2 - Trả lời sai khái niệm tiên quyết [CAO TRÀO] (4:00 - 5:30)

- **Thao tác:** Tiếp tục đào sâu khái niệm. AI đưa ra câu hỏi: _"Based on the Scrum roles and activities outlined in the material, what are the distinct responsibilities of the Product Owner compared to the Scrum Master during the development process?"_. Nhập câu trả lời mẫu thể hiện sự hổng kiến thức gốc.
- **Câu trả lời mẫu [SAI CƠ BẢN]:** _"Product Owner write code, Scrum Master manage scrum and plan."_
- **Lời dẫn:** _"Bây giờ đến phần quan trọng nhất. Nhóm cố tình trả lời chưa chính xác. Theo thiết kế giới hạn turn của nhóm, AI sẽ sớm kết thúc phiên phỏng vấn để tối ưu API cost và chuyển sang bước đánh giá."_

### 7. Màn kết quả & Traceback (5:30 - 6:30)

- **Thao tác:** Hoàn tất Interview, show màn hình Kết quả (Điểm số, Nhận xét của AI). Nhấn mạnh vào **Khối Traceback**.
- **Lời dẫn:** _"Đây là màn hình kết quả. Điểm tốt nhất của hệ thống nằm ở khối Traceback này. Hệ thống đã tự động duyệt ngược đồ thị và phát hiện ra rằng: Lý do người dùng không hiểu 'A' là do người dùng đang nhầm lẫn nó với 'B', tức là người dùng đang hổng khái niệm gốc rễ về 'A' và 'B'. Thay vì bắt người dùng học lại 'B' một cách mù quáng, hệ thống tự động chèn lịch yêu cầu người dùng phải ôn lại 'A' trước."_

### 8. Chốt Sale (6:30 - 7:30)

- **Thao tác:** Giữ nguyên màn hình Traceback.
- **Lời dẫn:** _"Để kết luận, nhóm đã khảo sát rất kỹ các công cụ hiện có. **Google NotebookLM** chỉ tạo flashcard nhưng thuật toán Spaced Repetition không hoàn chỉnh. **Quizlet** và **RemNote** thì chỉ tập trung học thuộc từ khóa đơn lẻ, không có quizzing hội thoại đa lượt._
  _Điểm khác biệt của Recall AI là **Concept Graph Engine**. Không có đối thủ nào trên thị trường hiện nay có khả năng tự động truy vết ngược lỗ hổng kiến thức về tận khái niệm gốc rễ. Đây chính là cách học chủ động và giải quyết được vấn đề học vẹt."_

---

## Các phương án dự phòng (Fallback)

1. **Mạng tại phòng demo yếu:**
   - Dùng lệnh `docker compose up` hoặc `npm run dev` để chạy local toàn bộ ứng dụng (có sẵn file `.env.example`). Bật file video quay sẵn để thuyết minh thay vì click trực tiếp.
   - **Link video demo:** [Google Drive](https://drive.google.com/file/d/1J3RqYfyeqjjzvoTVxGUnjqQIm3XdGcxq/view?usp=sharing)
