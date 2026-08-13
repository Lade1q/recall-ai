# Báo cáo lỗi — Plan Management

> **Module:** Plan Management  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-08-02  
> **Phiên bản:** 1.0

---

## B005: Chi tiết kế hoạch hiển thị deadline lệch một ngày

| Trường                    | Nội dung                                                  |
| ------------------------- | --------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B005                                                      |
| **Tiêu đề (Title)**       | PlanDetailPage hiển thị deadline muộn hơn một ngày        |
| **Module / Function ID**  | Plan Management — `PlanDetailPage` / deadline             |
| **Mức độ (Severity)**     | Medium                                                    |
| **Độ ưu tiên (Priority)** | Medium                                                    |
| **Trạng thái (Status)**   | Closed                                                    |
| **Ngày báo cáo (Date)**   | 2026-08-02                                                |
| **Phát hiện ở**           | Sprint 4                                                  |
| **Người báo cáo**         | Nguyễn Minh Phát                                          |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64) |

### Mô tả

Deadline hiển thị nhất quán ở danh sách Plan nhưng bị tăng một ngày ở màn hình chi tiết, dẫn đến thông tin hạn hoàn thành sai cho người dùng.

### Điều kiện tiên quyết

- Có thể tạo Plan mới và truy cập danh sách cũng như chi tiết Plan.
- Chọn deadline ngày 03/08/2026 khi tạo Plan.

### Các bước tái hiện

1. Tạo một kế hoạch với hạn hoàn thành là 03/08/2026.
2. Mở danh sách kế hoạch và ghi nhận deadline trên `PlanCard`.
3. Mở màn hình chi tiết của cùng kế hoạch trên `PlanDetailPage`.
4. So sánh ngày deadline ở hai màn hình.

### Kết quả mong đợi

Deadline ở `PlanCard` và `PlanDetailPage` đều hiển thị 03/08/2026, đúng với ngày đã chọn.

### Kết quả thực tế

`PlanCard` hiển thị 03/08 nhưng `PlanDetailPage` hiển thị 04/08, lệch một ngày.

### Tài liệu đính kèm

- [GitHub issue #194](https://github.com/Lade1q/planning-ai/issues/194) — có hai ảnh chụp màn hình.

### Ghi chú

- Phân tích trong issue cho thấy backend lưu ngày 03/08 thành `2026-08-03T23:59:59.999Z`; việc chuyển đổi UTC sang giờ địa phương có thể gây lệch ngày.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                           | Defect Description                                            | Function ID                 | Severity | Reported By      | Date Reported | Status | Comment                                   |
| --------- | -------------------------------------- | ------------------------------------------------------------- | --------------------------- | -------- | ---------------- | ------------- | ------ | ----------------------------------------- |
| B005      | Deadline lệch một ngày ở chi tiết Plan | Danh sách đúng ngày nhưng chi tiết hiển thị sang ngày kế tiếp | `PlanDetailPage` / deadline | Medium   | Nguyễn Minh Phát | 2026-08-02    | Closed | Dấu hiệu chuyển đổi UTC; nguồn issue #194 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
