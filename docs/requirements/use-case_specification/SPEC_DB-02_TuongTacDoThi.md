# Use case Name: DB-02 Tương tác Đồ thị Khái niệm

## Brief description

Use case này cho phép Sinh viên tương tác trực quan với Đồ thị Khái niệm (Concept Graph) của các môn học hoặc kế hoạch ôn tập. Thông qua việc tương tác bằng các thao tác cơ bản như phóng to (zoom), kéo thả (pan), xem thông tin nhanh (hover tooltip), cũng như tìm kiếm và lọc khái niệm theo độ hiểu biết (mastery score), sinh viên có thể nắm bắt nhanh chóng bức tranh tổng thể về các lỗ hổng kiến thức và mối quan hệ tiên quyết giữa các khái niệm.

## Actors

- **Sinh viên (Student):** Người sử dụng hệ thống để xem và phân tích tiến độ học tập của bản thân.

## Basic Flow

1. **Khởi tạo đồ thị:** Sinh viên chọn tính năng xem Đồ thị Khái niệm từ Dashboard tổng quan (DB-01) hoặc thông qua menu chính.
2. **Hiển thị đồ thị:** Hệ thống tải và hiển thị sơ đồ mạng lưới các khái niệm. Các node (khái niệm) được tô màu phân loại dựa trên mức độ vững/yếu của sinh viên (theo `mastery_score`).
3. **Thao tác tương tác cơ bản:** Sinh viên thực hiện các thao tác trên đồ thị:
   - **Zoom:** Phóng to hoặc thu nhỏ đồ thị để tập trung vào một cụm khái niệm cụ thể hoặc xem toàn cảnh.
   - **Pan:** Kéo và di chuyển vùng nhìn (viewport) xung quanh không gian đồ thị.
   - **Hover tooltip:** Rê chuột lên một node khái niệm. Hệ thống hiển thị tooltip với thông tin tóm tắt gồm tên khái niệm và điểm số `mastery_score` hiện tại.
4. **Lọc và tìm kiếm:** Sinh viên sử dụng thanh công cụ để tìm kiếm và lọc:
   - Nhập từ khóa vào ô tìm kiếm để lọc khái niệm theo tên.
   - Chọn bộ lọc theo mức độ thành thạo (ví dụ: mức yếu, mức vững - tương ứng với các khoảng `mastery_score`).
5. **Cập nhật hiển thị:** Hệ thống tự động highlight (làm nổi bật) các khái niệm thỏa mãn điều kiện tìm kiếm/lọc và làm mờ các node còn lại.
6. **Xem chi tiết Concept:** Sinh viên click vào một node khái niệm trên đồ thị.
7. **Hiển thị thông tin chi tiết:** Hệ thống hiển thị panel (sidebar/modal) thông tin chi tiết của khái niệm được chọn, bao gồm:
   - Lịch sử học tập (History) của khái niệm đó qua các phiên học trước.
   - Danh sách các khái niệm tiên quyết (Prerequisites) cần nắm vững trước đó.

## Alternative Flows

**Alternative flow 1: Không tìm thấy khái niệm khi lọc/tìm kiếm**

1. Từ bước #5 của basic flow, nếu từ khóa hoặc điều kiện lọc không khớp với bất kỳ khái niệm nào trong đồ thị.
2. Hệ thống hiển thị thông báo "Không tìm thấy khái niệm phù hợp" và làm mờ toàn bộ các node trên đồ thị.
3. Continue step #4.

**Alternative flow 2: Lỗi tải dữ liệu đồ thị**

1. Từ bước #2 của basic flow, nếu có lỗi xảy ra trong quá trình lấy dữ liệu đồ thị từ database (lỗi mạng hoặc lỗi server).
2. Hệ thống hiển thị thông báo lỗi "Không thể tải đồ thị khái niệm. Vui lòng thử lại sau" và cung cấp nút "Thử lại" để sinh viên có thể thử kết nối lại.
3. The use case terminates.

## Pre-conditions

- Sinh viên đã đăng nhập vào hệ thống Recall AI thành công.
- Sinh viên đã có ít nhất một kế hoạch ôn tập được trích xuất thành công và có chứa đồ thị khái niệm.

## Post-conditions

- Hệ thống không có thay đổi nào về mặt dữ liệu (đây là tác vụ read-only). Sinh viên nắm được tổng quan về trạng thái nắm bắt kiến thức và vị trí của điểm yếu trong chuỗi kiến thức dựa trên đồ thị trực quan.
