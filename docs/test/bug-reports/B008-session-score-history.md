# Báo cáo lỗi — AI Examiner

> **Module:** AI Examiner — Tổng hợp phiên (DB-03)  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 05/08/2026  
> **Phiên bản:** 1.0

---

## B008: Điểm của phiên cũ hiển thị theo điểm mastery hiện tại

| Trường                    | Nội dung                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B008                                                                                 |
| **Tiêu đề (Title)**       | Điểm sau phiên phải suy từ lượt của chính phiên đó, không đọc `Concept.masteryScore` |
| **Module / Function ID**  | DB-03 — Tổng hợp/lịch sử phiên AI Examiner                                           |
| **Mức độ (Severity)**     | Medium                                                                               |
| **Độ ưu tiên (Priority)** | Medium                                                                               |
| **Trạng thái (Status)**   | Closed                                                                               |
| **Ngày báo cáo (Date)**   | 05/08/2026                                                                           |
| **Phát hiện ở**           | Sprint 4                                                                             |
| **Người báo cáo**         | Nguyễn Thế Quân                                                                      |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                     |

### Mô tả

Tổng hợp của một phiên cũ lấy `Concept.masteryScore` tại thời điểm mở lại thay vì điểm do chính các lượt trả lời của phiên đó tạo ra, khiến lịch sử hiển thị sai dữ liệu.

### Điều kiện tiên quyết

- Có một khái niệm đã được chấm trong phiên AI Examiner trước đó.
- Khái niệm này được chấm lại ở một phiên sau để điểm mastery hiện tại thay đổi.

### Các bước tái hiện

1. Hoàn thành một phiên kiểm tra có lượt trả lời được chấm cho một khái niệm và ghi nhận điểm tổng kết.
2. Thực hiện phiên sau trên cùng khái niệm để điểm mastery thay đổi.
3. Mở lại phần tổng hợp hoặc lịch sử của phiên đầu tiên.

### Kết quả mong đợi

Điểm trong tổng hợp phiên đầu phải được tính từ các `interview_turns` của phiên đầu. Nếu phiên không có lượt được chấm, điểm của phiên phải là `null`, thể hiện rằng phiên không thay đổi điểm trước đó.

### Kết quả thực tế

Tổng hợp phiên đầu hiển thị điểm mastery hiện tại của khái niệm, bị thay đổi bởi phiên sau. Phiên bị bỏ dở không có lượt chấm cũng có thể hiển thị nhầm điểm cũ như điểm do phiên đó tạo ra.

### Tài liệu đính kèm

- [GitHub issue #244](https://github.com/Lade1q/planning-ai/issues/244)

### Ghi chú

`loadConceptSummaries` đọc `concept.masteryScore` hiện tại. Cần suy điểm từ các lượt không `null` của phiên theo `turnIndex`, dùng logic `calculateMasteryScore` để dữ liệu lịch sử không bị thay đổi về sau.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                     | Defect Description                                                          | Function ID            | Severity | Reported By     | Date Reported | Status | Comment                                                        |
| --------- | -------------------------------- | --------------------------------------------------------------------------- | ---------------------- | -------- | --------------- | ------------- | ------ | -------------------------------------------------------------- |
| B008      | Điểm phiên cũ dùng điểm hiện tại | Lịch sử phiên hiển thị mastery score hiện tại thay vì điểm do phiên tạo ra. | DB-03 — Tổng hợp phiên | Medium   | Nguyễn Thế Quân | 2026-08-05    | Closed | [Issue #244](https://github.com/Lade1q/planning-ai/issues/244) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
