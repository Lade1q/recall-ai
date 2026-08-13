# Báo cáo lỗi — Review Queue

> **Module:** Concept Graph Engine / Scheduling  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 2026-08-13  
> **Phiên bản:** 1.0

---

## B017: Hàng đợi ôn vẫn đưa khái niệm đã deprecated

| Trường                    | Nội dung                                                  |
| ------------------------- | --------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B017                                                      |
| **Tiêu đề (Title)**       | Hàng đợi ôn và auto-pick không loại khái niệm deprecated  |
| **Module / Function ID**  | Review Queue / `resolvePlanQueue`                         |
| **Mức độ (Severity)**     | High                                                      |
| **Độ ưu tiên (Priority)** | Medium                                                    |
| **Trạng thái (Status)**   | Closed                                                    |
| **Ngày báo cáo (Date)**   | 2026-08-13                                                |
| **Phát hiện ở**           | Sprint 4                                                  |
| **Người báo cáo**         | Nguyễn Thế Quân                                           |
| **Môi trường**            | Firefox 152.0.6 · Arch Linux (Linux 7.1.4-arch1-1 x86_64) |

### Mô tả

Đường đọc `resolvePlanQueue` chỉ lọc trạng thái `ReviewQueueItem`, không lọc trạng thái concept liên quan. Review item của concept đã `deprecated` vẫn xuất hiện trong hàng đợi và có thể được auto-pick để tạo phiên vấn đáp trên khái niệm đã bị gỡ khỏi plan và graph.

### Điều kiện tiên quyết

Có concept đã từng được lên lịch ôn (đã có review item), sau đó reanalyze kế hoạch làm concept này chuyển sang trạng thái `deprecated`.

### Các bước tái hiện

1. Tạo kế hoạch có concept và thực hiện hoạt động tạo review item.
2. Reanalyze nội dung để concept đó không còn trong lần trích mới và bị đánh dấu `deprecated`.
3. Mở hàng đợi ôn hoặc bắt đầu phiên vấn đáp bằng auto-pick.

### Kết quả mong đợi

Chỉ review item gắn với concept `active` xuất hiện trong hàng đợi, badge và nhóm thao tác; auto-pick không được chọn concept đã deprecated.

### Kết quả thực tế

Concept deprecated vẫn nổi trong hàng đợi. Auto-pick có thể tạo phiên hỏi về concept không còn trong graph, trong khi luồng tự chọn đã lọc active có thể trả về `404`.

### Tài liệu đính kèm

- [GitHub issue #343](https://github.com/Lade1q/planning-ai/issues/343)

### Ghi chú

Issue chốt dùng read-filter `concept.status: 'active'` thay vì sửa dữ liệu, vì tombstone có thể hồi sinh cùng `id` và cần giữ lịch sử/lịch ôn. Các read-site gồm queue chính, `totalCount`, skipped items và badge danh sách plan. Trạng thái GitHub hiện là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                       | Defect Description                                             | Function ID                       | Severity | Reported By     | Date Reported | Status | Comment                                   |
| --------- | ---------------------------------- | -------------------------------------------------------------- | --------------------------------- | -------- | --------------- | ------------- | ------ | ----------------------------------------- |
| B017      | Deprecated concept còn trong queue | Queue không lọc `concept.status`, dẫn đến ôn nội dung đã bị gỡ | Review Queue / `resolvePlanQueue` | High     | Nguyễn Thế Quân | 2026-08-13    | Closed | Sửa bằng read-filter, không patch dữ liệu |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
