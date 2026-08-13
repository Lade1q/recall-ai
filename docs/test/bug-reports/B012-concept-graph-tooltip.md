# Báo cáo lỗi — Concept Graph

> **Module:** Concept Graph — Tooltip  
> **Người viết:** Nguyễn Minh Phát  
> **Ngày tạo:** 2026-08-07  
> **Phiên bản:** 1.0

---

## B012: Tooltip đồ thị khái niệm bị tràn chữ và bị node che khuất

| Trường                    | Nội dung                                         |
| ------------------------- | ------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B012                                             |
| **Tiêu đề (Title)**       | Lỗi hiển thị Tooltip trong Đồ thị khái niệm      |
| **Module / Function ID**  | Concept Graph — Tooltip chi tiết khái niệm       |
| **Mức độ (Severity)**     | Low                                              |
| **Độ ưu tiên (Priority)** | Low                                              |
| **Trạng thái (Status)**   | Closed                                           |
| **Ngày báo cáo (Date)**   | 2026-08-07                                       |
| **Phát hiện ở**           | Sprint 4                                         |
| **Người báo cáo**         | Nguyễn Minh Phát                                 |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64) |

### Mô tả

Tooltip hiển thị chi tiết khái niệm trên đồ thị bị tràn nội dung và bị các node lân cận đè lên, khiến người dùng không đọc được đầy đủ thông tin.

### Điều kiện tiên quyết

- Có đồ thị khái niệm với nhiều node nằm gần nhau.

### Các bước tái hiện

1. Truy cập màn hình **Đồ thị khái niệm**.
2. Di chuột lên một node có nhiều node lân cận.
3. Chờ tooltip xuất hiện và quan sát nội dung cùng thứ tự lớp hiển thị.

### Kết quả mong đợi

Nội dung tooltip tự ngắt dòng, có kích thước và padding phù hợp; tooltip luôn nằm trên cùng và không bị canvas hoặc node khác che phủ.

### Kết quả thực tế

Chữ tràn ra ngoài khung tooltip. Tooltip có z-index thấp nên nội dung bị các node lân cận đè lên.

### Tài liệu đính kèm

- [GitHub issue #283](https://github.com/Lade1q/planning-ai/issues/283)
- [Ảnh chụp màn hình](https://github.com/user-attachments/assets/dcb85a03-99aa-4835-84fc-9432a04fefe6)

### Ghi chú

Cần kiểm tra quy tắc ngắt từ/kích thước tooltip và thứ tự xếp chồng (`z-index` hoặc stacking context) trong khu vực đồ thị.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                        | Defect Description                             | Function ID             | Severity | Reported By      | Date Reported | Status | Comment                                                        |
| --------- | ----------------------------------- | ---------------------------------------------- | ----------------------- | -------- | ---------------- | ------------- | ------ | -------------------------------------------------------------- |
| B012      | Tooltip đồ thị bị tràn và che khuất | Tooltip tràn chữ và bị node khác che nội dung. | Concept Graph — Tooltip | Low      | Nguyễn Minh Phát | 2026-08-07    | Closed | [Issue #283](https://github.com/Lade1q/planning-ai/issues/283) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
