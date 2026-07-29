# Use-case Specification: SP-01 Tạo Kế hoạch Học tập

## 1. Use case Name

Tạo Kế hoạch Học tập (SP-01)

## 2. Brief description

Use case này cho phép Sinh viên tạo một kế hoạch học tập mới bằng cách tải lên tài liệu ôn tập (văn bản, hình ảnh, hoặc PDF). Hệ thống sẽ tự động gọi AI Service để trích xuất các khái niệm và xây dựng đồ thị quan hệ tiên quyết giữa chúng. Sau khi người dùng xác nhận và tùy chỉnh đồ thị, Scheduling & Remediation Engine sẽ khởi tạo một lịch học ban đầu dựa trên đồ thị khái niệm và thời hạn (deadline) đã đặt.

## 3. Actors

- **Student (Sinh viên):** Người dùng chính tương tác với hệ thống, cung cấp tài liệu đầu vào, thiết lập thời hạn và xác nhận đồ thị.
- **AI Service (Google Gemini):** Hệ thống/Dịch vụ bên ngoài hỗ trợ tự động hóa việc đọc hiểu tài liệu, trích xuất danh sách khái niệm, đánh giá độ khó và xác định các quan hệ tiên quyết.
- **Scheduling & Remediation Engine (SRE):** Động cơ xử lý bên trong của hệ thống chịu trách nhiệm tính toán và tạo lập lịch ôn tập ban đầu dựa trên đồ thị.

## 4. Pre-conditions

- Sinh viên đã đăng nhập thành công vào hệ thống Recall AI.
- AI Service (Google Gemini) đang trong trạng thái hoạt động bình thường và hệ thống còn đủ quota/rate limit để gọi API.

## 5. Basic Flow

1. **Sinh viên** chọn chức năng "Tạo kế hoạch ôn tập" trên giao diện hệ thống (Dashboard).
2. **Hệ thống** hiển thị biểu mẫu yêu cầu nhập thông tin kế hoạch, bao gồm: tên môn học/kế hoạch, thời hạn (deadline), và khu vực tải lên tài liệu.
3. **Sinh viên** điền các thông tin cần thiết, tải lên tài liệu ôn tập (hỗ trợ định dạng Text, Ảnh, PDF), và nhấn nút "Tạo".
4. **Hệ thống** tiếp nhận dữ liệu và gửi tài liệu tới **AI Service** với yêu cầu trích xuất danh sách khái niệm (kèm độ khó) và quan hệ tiên quyết.
5. **AI Service** phân tích tài liệu và trả về kết quả cho hệ thống dưới định dạng JSON có cấu trúc cố định.
6. **Hệ thống** nhận dữ liệu JSON và tiến hành kiểm tra tính hợp lệ của đồ thị (Validate DAG - Directed Acyclic Graph) để đảm bảo không tồn tại chu trình (cycle) nào giữa các khái niệm.
7. **Hệ thống** hiển thị đồ thị trực quan (sơ đồ khái niệm) vừa trích xuất lên màn hình và yêu cầu Sinh viên xem xét (Bước này bao hàm Use case _SP-02 Tương tác Đồ thị Kế hoạch_).
8. **Sinh viên** xem xét, có thể chỉnh sửa thêm/xóa node/cạnh nếu cần. Mỗi khi một cạnh mới được thêm, **Hệ thống** thực hiện kiểm tra chu trình theo thời gian thực (DAG validation). Nếu phát hiện chu trình, thao tác chỉnh sửa bị từ chối kèm cảnh báo. Sau khi chỉnh sửa xong, Sinh viên nhấn xác nhận hoàn tất đồ thị.
9. **Hệ thống** lưu trữ thông tin kế hoạch, các khái niệm (`concepts`) và quan hệ đồ thị (`concept_edges`) vào cơ sở dữ liệu.
10. **Hệ thống** gọi **Scheduling & Remediation Engine (SRE)** để tạo lịch học ban đầu dựa trên đồ thị khái niệm đã chốt và deadline của Sinh viên.
11. **Hệ thống** hiển thị thông báo tạo kế hoạch thành công và chuyển hướng Sinh viên về trang Dashboard để xem tiến độ.

## 6. Alternative Flows

**Alternative flow 1: Tài liệu đầu vào không hợp lệ**

1. Từ bước #3 của basic flow, nếu tài liệu tải lên không đúng định dạng được hỗ trợ, mờ/không thể đọc (đối với ảnh) hoặc vượt quá dung lượng cho phép, hệ thống hiển thị thông báo lỗi ngay trên biểu mẫu và yêu cầu Sinh viên chọn lại tài liệu.
2. Sinh viên chọn lại tài liệu.
3. Continue step #3.

**Alternative flow 2: AI Service trả về sai định dạng JSON**

1. Từ bước #5 của basic flow, nếu AI Service trả về kết quả dạng văn bản tự do hoặc JSON bị lỗi cấu trúc, hệ thống sẽ tự động thử gửi lại yêu cầu (retry) tối đa N lần.
2. Nếu quá số lần thử lại tối đa mà vẫn thất bại, hệ thống báo lỗi quá trình trích xuất tự động và cho phép Sinh viên tự nhập khái niệm thủ công.
3. Continue step #8 (Sinh viên nhập khái niệm thủ công).

**Alternative flow 3: Đồ thị sinh ra chứa chu trình**

1. Từ bước #6 của basic flow, nếu hệ thống phát hiện đồ thị được trích xuất có chứa chu trình (không phải DAG), hệ thống sẽ tự động loại bỏ cạnh gây ra chu trình và ghi log lại cảnh báo.
2. Hệ thống tiếp tục quá trình xem xét đồ thị.
3. Continue step #7.

**Alternative flow 4: Dịch vụ AI bị lỗi hoặc quá tải**

1. Từ bước #5 của basic flow, trong trường hợp AI Service không phản hồi (timeout) hoặc hệ thống hết quota API, hệ thống thông báo lỗi: "Dịch vụ phân tích AI đang bị gián đoạn, vui lòng thử lại sau".
2. Hệ thống hủy bỏ tiến trình tạo kế hoạch hiện tại.
3. The use case terminates.

**Alternative flow 5: Sinh viên hủy bỏ việc tạo kế hoạch**

1. Từ bất kỳ bước nào trước bước #8 của basic flow, nếu Sinh viên nhấn "Hủy" hoặc rời khỏi trang.
2. Hệ thống sẽ xóa các dữ liệu tạm thời chưa lưu.
3. The use case terminates.

## 7. Post-conditions

- Một bản ghi Kế hoạch Học tập mới được lưu thành công trong cơ sở dữ liệu.
- Các khái niệm và quan hệ tiên quyết tương ứng với kế hoạch được lưu trữ đầy đủ dưới dạng đồ thị có hướng không chu trình (DAG).
- Lịch học ban đầu cho kế hoạch đã được tạo và sẵn sàng cho các phiên học (Focus Session/Interview).
