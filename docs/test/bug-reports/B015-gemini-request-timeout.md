# Báo cáo lỗi — Gemini Service

> **Module:** AI Examiner / Gemini Service  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 2026-08-09  
> **Phiên bản:** 1.0

---

## B015: Lời gọi Gemini không giới hạn thời gian chờ

| Trường                    | Nội dung                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| **Mã Bug (Defect ID)**    | B015                                                               |
| **Tiêu đề (Title)**       | Lời gọi Gemini không có timeout/AbortSignal nên có thể treo vô hạn |
| **Module / Function ID**  | Gemini Service / AI Examiner                                       |
| **Mức độ (Severity)**     | High                                                               |
| **Độ ưu tiên (Priority)** | Medium                                                             |
| **Trạng thái (Status)**   | Closed                                                             |
| **Ngày báo cáo (Date)**   | 2026-08-09                                                         |
| **Phát hiện ở**           | Sprint 4                                                           |
| **Người báo cáo**         | Nguyễn Thế Quân                                                    |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                   |

### Mô tả

`GoogleGenAI` được khởi tạo không có `httpOptions` timeout và các lời gọi SDK không truyền `AbortSignal`. Một request Gemini không phản hồi sẽ treo vô hạn, khiến retry AE-02 và fallback Flashcard AE-05 không thể chạy.

### Điều kiện tiên quyết

Có cấu hình Gemini và thực hiện luồng cần gọi AI, trong khi lời gọi Gemini không resolve hoặc không trả lỗi trong thời gian dài.

### Các bước tái hiện

1. Khởi động luồng upload, trích xuất khái niệm hoặc tạo/chấm câu hỏi sử dụng Gemini.
2. Giả lập lời gọi Gemini không phản hồi.
3. Theo dõi HTTP request và trạng thái phiên sau thời gian chờ hợp lý.

### Kết quả mong đợi

Mỗi lời gọi Gemini hết thời gian phải phát sinh lỗi mà hệ thống nhận diện được, thực hiện retry rồi suy thoái sang Flashcard khi cần thiết.

### Kết quả thực tế

Request không kết thúc, retry không được kích hoạt và fallback Flashcard không chạy; kết nối server có thể bị giữ vô thời hạn.

### Tài liệu đính kèm

- [GitHub issue #292](https://github.com/Lade1q/planning-ai/issues/292)

### Ghi chú

Phạm vi gồm `ai.files.get`, `ai.files.upload` và các lời gọi `ai.interactions.create`. Issue đề xuất timeout cấu hình được qua biến môi trường, hỗ trợ hủy request và test lời gọi không bao giờ resolve; trạng thái GitHub hiện là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title               | Defect Description                                         | Function ID                  | Severity | Reported By     | Date Reported | Status | Comment                                       |
| --------- | -------------------------- | ---------------------------------------------------------- | ---------------------------- | -------- | --------------- | ------------- | ------ | --------------------------------------------- |
| B015      | Gemini request treo vô hạn | Không có timeout/AbortSignal làm vô hiệu retry và fallback | Gemini Service / AI Examiner | High     | Nguyễn Thế Quân | 2026-08-09    | Closed | Nguyên nhân gốc liên quan cửa sổ claim ở B014 |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
