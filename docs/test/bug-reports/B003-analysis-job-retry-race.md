# Báo cáo lỗi — AI Planning

> **Module:** AI Planning  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 31/07/2026  
> **Phiên bản:** 1.0

---

## B003: Retry AnalysisJob có race condition và job kẹt

| Trường                    | Nội dung                                                       |
| ------------------------- | -------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B003                                                           |
| **Tiêu đề (Title)**       | Retry đồng thời có thể tạo job trùng hoặc khóa retry vĩnh viễn |
| **Module / Function ID**  | AI Planning — `AnalysisJob` lifecycle / `processAnalysisJob`   |
| **Mức độ (Severity)**     | High                                                           |
| **Độ ưu tiên (Priority)** | Medium                                                         |
| **Trạng thái (Status)**   | Closed                                                         |
| **Ngày báo cáo (Date)**   | 31/07/2026                                                     |
| **Phát hiện ở**           | Sprint 4                                                       |
| **Người báo cáo**         | Nguyễn Thế Quân                                                |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)               |

### Mô tả

Các chuyển trạng thái của `AnalysisJob` là thao tác đọc-rồi-ghi không nguyên tử. Hai yêu cầu retry đồng thời có thể tạo hoặc xử lý job trùng; job `processing` bị treo cũng có thể khiến mọi lần retry sau trả 409 vĩnh viễn.

### Điều kiện tiên quyết

- Có một Study Plan có `AnalysisJob` mới nhất ở trạng thái `failed`.
- Luồng phân tích nền và endpoint retry đều hoạt động; hoặc có một job `processing` bị treo do Gemini không phản hồi/server khởi động lại.

### Các bước tái hiện

1. Chuẩn bị một plan có `AnalysisJob` thất bại.
2. Gửi đồng thời hai yêu cầu retry cho cùng plan.
3. Theo dõi các `AnalysisJob`, lần gọi `processAnalysisJob` và concepts được tạo.
4. Với job treo ở `processing`, thực hiện retry sau thời gian chờ và kiểm tra phản hồi.

### Kết quả mong đợi

Mỗi đợt retry đồng thời chỉ tạo một job, mỗi `jobId` chỉ được claim/xử lý một lần, và job stale có thể được retry lại.

### Kết quả thực tế

Luồng hiện tại có thể tạo hai job pending hoặc chạy hai lần trên cùng job, sinh concepts trùng; job còn lại có thể kẹt `pending`. Job kẹt `processing` không có timeout có thể làm retry luôn nhận 409 `An analysis is already in progress`.

### Tài liệu đính kèm

- [GitHub issue #164](https://github.com/Lade1q/planning-ai/issues/164).

### Ghi chú

- Phát hiện khi review PR #160; kịch bản retry đồng thời được phân tích tĩnh và chưa có tái hiện runtime trong issue.
- Hướng xử lý được đề xuất: transaction/lock cho retry, `updateMany` claim nguyên tử, ngưỡng stale khoảng 10 phút và timeout Gemini. Liên quan #106.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                         | Defect Description                                    | Function ID             | Severity | Reported By     | Date Reported | Status | Comment                                |
| --------- | ------------------------------------ | ----------------------------------------------------- | ----------------------- | -------- | --------------- | ------------- | ------ | -------------------------------------- |
| B003      | Race condition khi retry AnalysisJob | Có thể tạo/xử lý job trùng và khóa retry bởi job treo | `AnalysisJob` lifecycle | High     | Nguyễn Thế Quân | 2026-07-31    | Closed | Phân tích từ PR #160; nguồn issue #164 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
