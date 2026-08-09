# Use-case Specification: Truy ngược Lỗ hổng (AE-07)

> ⚠️ **Đã sửa §3, §5, §6 (bước 8–9) và §7 (chốt 2026-08-04):** truy ngược lỗ hổng **tự động áp** khái niệm nền vào lịch ôn **ngay khi chấm xong** khái niệm `C` — không còn cổng "xác nhận / bỏ qua" trước khi áp. Sinh viên chỉ **gỡ bớt** (và đưa lại được) sau khi lịch đã áp, ở trạng thái tổng hợp cuối phiên hoặc trong Kế hoạch ôn tập. **Vì sao:** đây là mô hình đang chạy trong code (SRE ghi lịch ngay lúc chấm), và một cổng phê duyệt bắt buộc sẽ mâu thuẫn với hành vi thật. C4 giữ nguyên (SRE quyết lịch bằng logic tất định, AI chỉ sinh chữ). Nơi markdown lệch `Use-case_Specification.pdf` mục 2.5 bước 8 thì **markdown đúng** — PDF là ảnh chụp lúc nộp môn, không sửa được.

## 1. Use case Name

Truy ngược Lỗ hổng (Concept Traceback) - AE-07

## 2. Brief description

Use case này mô tả quá trình hệ thống tự động dò tìm các lỗ hổng kiến thức nền tảng của sinh viên khi họ trả lời sai hoặc có điểm số đánh giá dưới ngưỡng đối với một khái niệm. Hệ thống sử dụng thuật toán tìm kiếm theo chiều rộng (BFS) ngược trên đồ thị khái niệm (Concept Graph) để xác định các khái niệm tiên quyết (prerequisites) còn yếu. Quá trình này chạy hoàn toàn bằng logic phần mềm (Agentic thuần túy, không gọi API AI), từ đó đưa ra danh sách các khái niệm cần ôn lại để sinh viên xem xét và chèn vào lịch học tiếp theo.

## 3. Actors

- **Scheduling & Remediation Engine (SRE)**: Hệ thống điều phối và khắc phục, đóng vai trò thực thi thuật toán truy ngược và lập lịch.
- **Student (Sinh viên)**: Xem danh sách lỗ hổng **đã được hệ thống áp** vào lịch ôn, và có quyền **gỡ bớt** (gỡ rồi đưa lại được).

## 4. Pre-conditions

- Đồ thị khái niệm của tài liệu/môn học đã được tạo thành công, bao gồm các khái niệm và quan hệ tiên quyết giữa chúng (`concept_edges`).
- Sinh viên đang trong quá trình hoặc vừa hoàn tất Phiên Kiểm tra (AE-02).
- Hệ thống phát hiện một khái niệm (gọi là khái niệm `C`) bị trả lời sai hoặc có điểm số hiểu bài (`mastery_score`) thấp hơn ngưỡng quy định (ví dụ: < 0.6).

## 5. Post-conditions

- Các khái niệm tiên quyết yếu được hệ thống xác định thành công.
- Lịch ôn tập của sinh viên được cập nhật: Các khái niệm nền tảng cần củng cố được chèn vào đầu hàng đợi ưu tiên của phiên học tiếp theo (học trước khái niệm `C`). Việc cập nhật này xảy ra **ngay khi chấm xong khái niệm `C`**, do SRE thực hiện tự động — **không** phụ thuộc thao tác xác nhận của sinh viên.
- Thông tin về các khái niệm tiên quyết yếu được lưu trữ để có thể hiển thị chi tiết trong Xem Tổng hợp Cuối phiên (AE-09).

## 6. Basic Flow

1. **Kích hoạt:** Sau khi một khái niệm `C` được đánh giá xong trong Phiên Kiểm tra (AE-02) — tức đã hết các lượt hỏi-đáp của `C` — hệ thống tính `mastery_score(C)` bằng trung bình có trọng số (weighted average) điểm các lượt. Nếu `mastery_score(C)` < ngưỡng, SRE tự động kích hoạt tính năng Truy ngược Lỗ hổng cho `C` (per-concept, không chạy sau từng lượt).
2. **Khởi tạo cấu trúc dữ liệu:** SRE khởi tạo một hàng đợi `Q` rỗng.
3. **Thêm tiên quyết trực tiếp:** SRE truy xuất cơ sở dữ liệu (`concept_edges`) để lấy tất cả các khái niệm tiên quyết trực tiếp của `C` và đưa vào hàng đợi `Q`.
4. **Duyệt đồ thị (Thuật toán BFS ngược):** SRE tiến hành duyệt các phần tử trong hàng đợi `Q`. Việc duyệt được giới hạn độ sâu tối đa là 2 tầng (`max_depth = 2`) tính từ `C` nhằm tránh làm phiên học tiếp theo phình quá dài.
5. **Kiểm tra điểm số tiên quyết:** Lần lượt với mỗi khái niệm tiên quyết `P` được lấy ra từ `Q`, SRE kiểm tra lịch sử điểm số của `P`. Hệ thống xác định xem `P` chưa từng được kiểm tra bao giờ HOẶC `mastery_score(P)` < ngưỡng.
6. **Đề xuất ôn tập nền tảng:** Nếu điều kiện ở bước 5 thỏa mãn, SRE chèn khái niệm `P` vào đầu danh sách hàng đợi của phiên học/ôn tập tiếp theo, ưu tiên học `P` trước khi quay lại ôn `C`. Đồng thời, các khái niệm tiên quyết của `P` (nếu chưa vượt qua giới hạn độ sâu 2 tầng) tiếp tục được thêm vào cuối hàng đợi `Q`.
7. **Hiển thị thông tin:** Sau khi vòng lặp duyệt hoàn tất, hệ thống hiển thị danh sách các khái niệm tiên quyết yếu (các prereqs) vừa tìm được lên giao diện.
8. **Sinh viên xem lại (KHÔNG phải cổng xác nhận):** Hệ thống **đã** chèn các khái niệm nền tảng vào lịch ôn ở bước 6. Sinh viên xem danh sách này và **có thể gỡ bớt** một hay nhiều khái niệm — tại trạng thái tổng hợp cuối phiên hoặc sau đó trong Kế hoạch ôn tập. Không có bước "Đồng ý / Đồng ý tất cả" bắt buộc trước khi áp.
9. **Kết thúc Use Case:** Lịch ôn đã được lưu từ bước 6. Bước này chỉ **áp phần gỡ bớt** nếu sinh viên có gỡ, rồi kết thúc luồng.

## 7. Alternative Flows

**Alternative flow 1: Khái niệm tiên quyết đã vững**

1. Từ bước #5 của basic flow, nếu SRE phát hiện khái niệm tiên quyết `P` đã từng được kiểm tra và có `mastery_score(P)` >= ngưỡng.
2. SRE bỏ qua `P` (do kiến thức này đã vững, không cần ôn lại) và tiếp tục lấy phần tử tiếp theo trong `Q`. Hệ thống sẽ không duyệt sâu thêm vào các tiên quyết của `P` này.
3. Continue step #4.

**Alternative flow 2: Không tìm thấy tiên quyết nào cần ôn thêm**

1. Từ bước #4 của basic flow, sau khi kết thúc việc duyệt hàng đợi `Q` (hàng đợi rỗng hoặc đã chạm `max_depth`), nếu SRE không tìm thấy bất kỳ khái niệm tiên quyết nào yếu hoặc chưa học.
2. SRE xử lý khái niệm `C` như cơ chế ôn tập ngắt quãng (spaced repetition) thông thường: hẹn lịch ôn lại `C` sau X ngày thay vì ôn ngay lập tức.
3. Continue step #9.

**Alternative flow 3: Sinh viên gỡ bớt khái niệm nền (override sau khi lịch đã áp)**

1. Từ bước #8 của basic flow — sau khi lịch ôn **đã được áp** ở bước 6 — Sinh viên quyết định **gỡ bớt** tất cả hoặc một vài khái niệm nền tảng khỏi lịch. Đây là **override một lịch đã áp**, không phải từ chối một đề xuất đang treo.
2. SRE loại các khái niệm đã gỡ khỏi hàng đợi ưu tiên của phiên học tiếp theo. Các khái niệm còn lại (nếu có) vẫn được ưu tiên; đối với khái niệm `C`, hệ thống hẹn ngày ôn lại như bình thường nếu tất cả tiên quyết bị gỡ.
3. Continue step #9.

**Alternative flow 4: Sinh viên đưa lại khái niệm nền đã gỡ**

1. Sau khi đã gỡ một khái niệm nền tảng khỏi lịch (Alternative flow 3), Sinh viên đổi ý và **đưa lại** khái niệm đó vào lịch ôn — tại trạng thái tổng hợp cuối phiên hoặc trong Kế hoạch ôn tập.
2. SRE chèn lại khái niệm vào hàng đợi ưu tiên của phiên học tiếp theo.
3. Continue step #9.
