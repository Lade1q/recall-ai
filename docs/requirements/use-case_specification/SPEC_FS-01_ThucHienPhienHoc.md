# Use-case Specification: Thực hiện Phiên học (FS-01)

## 1. Use case Name

Thực hiện Phiên học (FS-01)

## 2. Brief description

Use case này mô tả quá trình Sinh viên thực hiện một phiên học tập có quản lý thời gian (ví dụ: Pomodoro). Trong quá trình học, Sinh viên có thể xem tài liệu gốc (PDF) theo dạng màn hình song song (side-by-side) và ghi chú nhanh theo các khái niệm (concept) đang học. Khi kết thúc, hệ thống sẽ lưu lại dữ liệu (record) thời gian học và tương tác với Scheduling & Remediation Engine (SRE) để cập nhật tiến độ (mastery score) chuẩn bị cho bước kiểm tra kiến thức tiếp theo.

## 3. Actors

- **Student (Sinh viên):** Người dùng chính thực hiện tương tác với phiên học, xem tài liệu, ghi chú và quản lý thời gian học.
- **Scheduling & Remediation Engine (SRE):** Hệ thống điều phối nền tảng của Recall AI, cung cấp các gợi ý bài học và cập nhật tiến độ (mastery score) của sinh viên sau khi phiên học kết thúc.

## 4. Pre-conditions

- Sinh viên đã đăng nhập vào hệ thống Recall AI thành công.
- Sinh viên đã tạo Kế hoạch ôn tập và hệ thống đã có sẵn danh sách các khái niệm (concept) cùng đồ thị quan hệ tiên quyết tương ứng.

## 5. Post-conditions

- Thời gian học tập và trạng thái phiên học được lưu thành công vào lịch sử hệ thống.
- Các ghi chú nhanh của Sinh viên được lưu trữ và liên kết đúng với các concept đã chọn.
- SRE ghi nhận dữ liệu hoàn thành phiên học để cập nhật thông số mastery (thống kê học tập).

## 6. Basic Flow

1. **Sinh viên** yêu cầu bắt đầu một phiên học mới từ giao diện ứng dụng (Dashboard hoặc màn hình chi tiết môn học).
2. **Hệ thống** hiển thị màn hình thiết lập, yêu cầu Sinh viên chọn khái niệm (concept) cần ôn và cấu hình thời gian học (mặc định theo Pomodoro).
3. **Sinh viên** chọn concept muốn học và xác nhận bắt đầu.
4. **Hệ thống** hiển thị giao diện phiên học chính, bao gồm bộ đếm ngược thời gian (timer), khung hiển thị tài liệu gốc PDF (side-by-side) và công cụ ghi chú.
5. **Sinh viên** nhấn nút "Bắt đầu" (Start).
6. **Hệ thống** bắt đầu đếm ngược thời gian.
7. **Sinh viên** xem tài liệu, học bài và nhập các ghi chú nhanh có liên kết với concept.
8. **Hệ thống** tự động lưu tạm (auto-save) các ghi chú của Sinh viên.
9. Khi timer kết thúc đếm ngược (hoặc Sinh viên chủ động nhấn nút kết thúc), **Sinh viên** chọn "Kết thúc phiên học".
10. **Hệ thống** lưu lại toàn bộ record (tổng thời gian, concept, ghi chú) và gửi thông tin cho SRE.
11. **SRE (Actor)** tiếp nhận thông tin và cập nhật **thống kê học tập** của concept (tổng thời gian học, số phiên). Phiên học **không** sửa `mastery_score` — chỉ AI Examiner (AE-02) mới ghi `mastery_score` và `lastTestedAt`.
12. **Hệ thống** hiển thị màn hình thông báo hoàn thành phiên học kèm theo kết quả tổng kết, và đưa ra các tùy chọn tiếp theo (ví dụ: nghỉ giải lao hoặc chuyển sang AI Examiner).

## 7. Alternative Flows

**Alternative flow 1: Xem và chọn Gợi ý Concept (<<include>> FS-06)**

_(Sửa số use case: bản trước ghi `<<extend>> FS-07`, nhưng FS-07 là "Xem thống kê học tập" — không liên quan. Theo `UC-Overview.md` §3/§4 (module Focus Session, dòng include FS-06), gợi ý concept đúng là **FS-06** — "Xem gợi ý khái niệm từ Scheduling & Remediation Engine", quan hệ `<<include>>` chứ không phải `<<extend>>`.)_

1. Từ bước #2 của basic flow, nếu Sinh viên chọn tính năng "Xem Gợi ý".
2. Hệ thống gửi yêu cầu đến SRE. SRE tính toán và cung cấp danh sách các concept cần ưu tiên (dựa trên sự yếu kém của mastery hoặc deadline sắp tới). Hệ thống hiển thị danh sách gợi ý cho Sinh viên và Sinh viên chọn concept từ danh sách gợi ý.
3. Continue step #3.

**Alternative flow 2: Bật Strict Mode**

_(Sửa số use case: bản trước ghi `<<extend>> FS-06`, nhưng FS-06 là "Xem gợi ý khái niệm" — một tính năng khác. Strict Mode **chưa có mã UC riêng** trong bảng module Focus Session của `UC-Overview.md` §3, nên không gán số cho tới khi được lập UC chính thức, thay vì trỏ nhầm sang FS-06.)_

1. Từ bước #4 hoặc #6 của basic flow, nếu Sinh viên chọn bật "Strict Mode".
2. Hệ thống bật theo dõi rời tab bằng Page Visibility API: mỗi lần Sinh viên chuyển sang tab hoặc ứng dụng khác, đồng hồ đếm thời gian tập trung tạm dừng và lần rời tab được ghi lại vào phiên. Hệ thống **không** khóa hoặc chặn được trang web/tab khác — một ứng dụng web chạy trong sandbox trình duyệt không có quyền đó, đây là giới hạn kỹ thuật chứ không phải phạm vi tính năng chưa làm.
3. Continue step #4 (hoặc #6).

**Alternative flow 3: Tạm dừng và tiếp tục (Pause / Resume)**

1. Từ bước #6 của basic flow, nếu Sinh viên nhấn nút "Tạm dừng" (Pause) timer.
2. Hệ thống ngừng đồng hồ đếm ngược và lưu trạng thái hiện hành. Sau đó Sinh viên nhấn "Tiếp tục" (Resume), hệ thống đếm ngược thời gian trở lại.
3. Continue step #6.

**Alternative flow 4: Hủy phiên học giữa chừng**

1. Từ bước #5 đến bước #8 của basic flow, nếu Sinh viên chọn "Hủy phiên học".
2. Hệ thống hiển thị hộp thoại yêu cầu xác nhận hủy bỏ. Sinh viên xác nhận đồng ý hủy. Hệ thống đóng phiên học, không ghi nhận thời gian học (hoặc lưu dưới dạng trạng thái "Đã hủy") và đưa người dùng về giao diện trước đó.
3. The use case terminates.
