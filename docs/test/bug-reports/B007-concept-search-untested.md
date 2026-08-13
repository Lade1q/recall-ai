# Báo cáo lỗi — Concept Graph

> **Module:** Concept Graph (DB-05)  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 2026-08-02  
> **Phiên bản:** 1.0

---

## B007: Tìm kiếm khái niệm không hoạt động khi toàn bộ khái niệm chưa được kiểm tra

| Trường                    | Nội dung                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B007                                                                        |
| **Tiêu đề (Title)**       | Tìm khái niệm theo tên không hoạt động khi mọi khái niệm chưa được kiểm tra |
| **Module / Function ID**  | DB-05 — Concept Graph, chế độ xem                                           |
| **Mức độ (Severity)**     | High                                                                        |
| **Độ ưu tiên (Priority)** | High                                                                        |
| **Trạng thái (Status)**   | Closed                                                                      |
| **Ngày báo cáo (Date)**   | 2026-08-02                                                                  |
| **Phát hiện ở**           | Sprint 4                                                                    |
| **Người báo cáo**         | Nguyễn Thế Quân                                                             |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                            |

### Mô tả

Chức năng tìm kiếm theo tên trên đồ thị khái niệm không có tác dụng khi tất cả khái niệm của kế hoạch có `mastery_score = null`.

### Điều kiện tiên quyết

- Có kế hoạch đã xác nhận đồ thị nhưng chưa thực hiện phiên AI Examiner nào, nên mọi khái niệm đều chưa được kiểm tra.
- Mở đồ thị ở chế độ xem của kế hoạch đang hoạt động.

### Các bước tái hiện

1. Tạo kế hoạch mới, xác nhận đồ thị và không thực hiện phiên kiểm tra nào.
2. Mở mục **Đồ thị khái niệm** ở chế độ xem.
3. Nhập tên hoặc một phần tên khái niệm vào ô **Tìm khái niệm theo tên**.

### Kết quả mong đợi

Node khớp từ khóa được làm nổi bật, node không khớp bị làm mờ; nếu không có kết quả thì hiển thị trạng thái rỗng, không phụ thuộc vào điểm mastery.

### Kết quả thực tế

Không có node nào được làm nổi bật hoặc làm mờ, bộ đếm không thay đổi và tìm kiếm không có hiệu lực.

### Tài liệu đính kèm

- [GitHub issue #205](https://github.com/Lade1q/planning-ai/issues/205)

### Ghi chú

Điều kiện `!allUntested` trong `hasActiveFilter` đã vô tình vô hiệu hóa cả tìm kiếm theo tên; điều kiện này chỉ nên áp dụng cho bộ lọc theo mức mastery.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title                                         | Defect Description                                           | Function ID           | Severity | Reported By     | Date Reported | Status | Comment                                                        |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------ | --------------------- | -------- | --------------- | ------------- | ------ | -------------------------------------------------------------- |
| B007      | Tìm kiếm khái niệm không hoạt động khi chưa kiểm tra | Không lọc node theo tên khi toàn bộ mastery score là `null`. | DB-05 — Concept Graph | High     | Nguyễn Thế Quân | 2026-08-02    | Closed | [Issue #205](https://github.com/Lade1q/planning-ai/issues/205) |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
