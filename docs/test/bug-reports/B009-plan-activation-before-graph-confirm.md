# Báo cáo lỗi — Study Planner

> **Module:** Xác nhận đồ thị khái niệm (SP-01)  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 2026-08-06  
> **Phiên bản:** 1.0

---

## B009: Kế hoạch được kích hoạt trước khi người dùng xác nhận đồ thị

| Trường                    | Nội dung                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B009                                                                        |
| **Tiêu đề (Title)**       | Plan chuyển `active` ngay khi phân tích xong, bỏ qua bước kiểm chứng đồ thị |
| **Module / Function ID**  | SP-01 — Tạo và xác nhận đồ thị khái niệm                                    |
| **Mức độ (Severity)**     | High                                                                        |
| **Độ ưu tiên (Priority)** | High                                                                        |
| **Trạng thái (Status)**   | Closed                                                                      |
| **Ngày báo cáo (Date)**   | 2026-08-06                                                                  |
| **Phát hiện ở**           | Sprint 4                                                                    |
| **Người báo cáo**         | Nguyễn Thế Quân                                                             |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                            |

### Mô tả

Sau khi job phân tích hoàn tất, kế hoạch bị chuyển sang `active` ngay lập tức. Vì vậy màn kiểm chứng đồ thị chỉ hiển thị khi plan là `draft` không bao giờ xuất hiện.

### Điều kiện tiên quyết

- Người dùng có thể tạo kế hoạch mới từ tài liệu và hệ thống có thể hoàn tất job phân tích.

### Các bước tái hiện

1. Tạo một kế hoạch mới và gửi tài liệu để hệ thống phân tích.
2. Chờ trạng thái phân tích hoàn tất, sau đó để ứng dụng điều hướng đến màn đồ thị.
3. Quan sát trạng thái kế hoạch và các thành phần trên màn đồ thị.

### Kết quả mong đợi

Kế hoạch vẫn là `draft` sau khi phân tích. Màn kiểm chứng hiển thị stepper, tiêu đề kiểm chứng và nút **Xác nhận & Bắt đầu**; chỉ sau khi người dùng xác nhận đồ thị thì kế hoạch mới chuyển sang `active`.

### Kết quả thực tế

Kế hoạch đã là `active` trước khi vào màn đồ thị, nên stepper và khu vực xác nhận không hiện; giao diện luôn ở chế độ chỉnh sửa với nút **Lưu thay đổi**.

### Tài liệu đính kèm

- [GitHub issue #265](https://github.com/Lade1q/planning-ai/issues/265)

### Ghi chú

Nguyên nhân được xác định tại `analysis.service.ts`: job phân tích ghi `status: 'active'` quá sớm, làm nhánh `shouldActivate(..., confirm: true, ...)` dành cho xác nhận đồ thị không thể kích hoạt.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                                 | Defect Description                                                 | Function ID             | Severity | Reported By     | Date Reported | Status | Comment                                                        |
| --------- | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------- | -------- | --------------- | ------------- | ------ | -------------------------------------------------------------- |
| B009      | Kế hoạch kích hoạt trước khi xác nhận đồ thị | Plan thành `active` sau phân tích nên bỏ qua UI kiểm chứng đồ thị. | SP-01 — Xác nhận đồ thị | High     | Nguyễn Thế Quân | 2026-08-06    | Closed | [Issue #265](https://github.com/Lade1q/planning-ai/issues/265) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
