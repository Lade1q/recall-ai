# Báo cáo lỗi — Review Queue Empty State

> **Module:** Review Queue / Today Nudge  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 13/08/2026  
> **Phiên bản:** 1.0

---

## B018: Empty-state hàng đợi ôn mô tả sai lịch sử và đồ thị

| Trường                    | Nội dung                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B018                                                              |
| **Tiêu đề (Title)**       | Empty-state hàng đợi ôn hiển thị thông điệp và CTA sai trạng thái |
| **Module / Function ID**  | Review Queue / `resolveEmptyMessage` / Today Nudge                |
| **Mức độ (Severity)**     | Medium                                                            |
| **Độ ưu tiên (Priority)** | Medium                                                            |
| **Trạng thái (Status)**   | Closed                                                            |
| **Ngày báo cáo (Date)**   | 13/08/2026                                                        |
| **Phát hiện ở**           | Sprint 4                                                          |
| **Người báo cáo**         | Nguyễn Thế Quân                                                   |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                  |

### Mô tả

Sau khi hàng đợi được lọc bỏ concept deprecated, một kế hoạch đã có kết quả vấn đáp nhưng mọi concept từng lên lịch đã bị gỡ có thể rơi vào fallback. UI lại nói kế hoạch chưa có phiên/kết quả vấn đáp. Với kế hoạch không còn concept active, UI còn hiển thị lời chúc mừng và CTA bắt đầu phiên dẫn đến lỗi `409 NO_CONCEPTS_TO_REVIEW`.

### Điều kiện tiên quyết

Một trong hai trạng thái sau tồn tại: (1) kế hoạch đã có review history, mọi concept từng lên lịch bị deprecated nhưng vẫn có concept active mới; hoặc (2) kế hoạch active không còn concept active.

### Các bước tái hiện

1. Tạo lịch sử ôn cho một kế hoạch, rồi reanalyze để các concept từng lên lịch bị deprecated.
2. Mở `/review-queue?planId=...` và màn hình `/today`.
3. Lặp lại với kế hoạch không còn concept active, sau đó thử bắt đầu phiên vấn đáp.

### Kết quả mong đợi

Trạng thái có lịch sử nhưng nội dung đã đổi phải giải thích lịch cũ không còn hiệu lực và mời tạo lịch mới. Trạng thái đồ thị trống phải hiển thị thông điệp phù hợp, CTA mở graph và dùng cùng thông điệp làm body `409` khi không thể mở phiên.

### Kết quả thực tế

UI hiển thị sai rằng chưa có phiên/kết quả vấn đáp hoặc chỉ hiển thị dấu tích chúc mừng. Trên `/today`, CTA có thể mời bắt đầu phiên dù kế hoạch không có concept active và kết quả là `409`.

### Tài liệu đính kèm

- [GitHub issue #345](https://github.com/Lade1q/planning-ai/issues/345)

### Ghi chú

Issue phân biệt bốn trạng thái: chưa có kết quả, hoàn thành thật, lịch sử có nhưng concept cũ đã bị gỡ, và đồ thị trống. Hướng sửa bổ sung `gradedEver`, `hasActiveConcepts` và `noScheduleNote`, đồng thời giữ nguyên nhánh `isAllRemoved`; trạng thái GitHub hiện là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title             | Defect Description                                               | Function ID                | Severity | Reported By     | Date Reported | Status | Comment                        |
| --------- | ------------------------ | ---------------------------------------------------------------- | -------------------------- | -------- | --------------- | ------------- | ------ | ------------------------------ |
| B018      | Empty-state hàng đợi sai | Copy/CTA không phản ánh lịch sử ôn và trạng thái concept thực tế | Review Queue / Today Nudge | Medium   | Nguyễn Thế Quân | 2026-08-13    | Closed | Liên quan read-filter của B017 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
