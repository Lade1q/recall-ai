# Báo cáo lỗi — AI Examiner

> **Module:** AI Examiner / Chấm câu trả lời  
> **Người viết:** Nguyễn Thế Quân  
> **Ngày tạo:** 08/08/2026  
> **Phiên bản:** 1.0

---

## B014: Request mất quyền claim vẫn ghi điểm và chuyển câu

| Trường                    | Nội dung                                                        |
| ------------------------- | --------------------------------------------------------------- |
| **Mã Bug (Defect ID)**    | B014                                                            |
| **Tiêu đề (Title)**       | Request đã mất quyền claim vẫn ghi kết quả và đẩy state machine |
| **Module / Function ID**  | AI Examiner / `submitAnswer`                                    |
| **Mức độ (Severity)**     | High                                                            |
| **Độ ưu tiên (Priority)** | Medium                                                          |
| **Trạng thái (Status)**   | Closed                                                          |
| **Ngày báo cáo (Date)**   | 08/08/2026                                                      |
| **Phát hiện ở**           | Sprint 4                                                        |
| **Người báo cáo**         | Nguyễn Thế Quân                                                 |
| **Môi trường**            | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                |

### Mô tả

Lệnh claim lượt trả lời kiểm tra lượt còn hợp lệ, nhưng các lệnh ghi `score`, `feedback` và `verdict` chỉ khóa theo `id`. Vì vậy request đã mất claim vẫn có thể ghi đè kết quả và gọi chuyển sang câu tiếp theo.

### Điều kiện tiên quyết

Có phiên AI Examiner với lượt trả lời đang chờ chấm; request A chấm chậm quá cửa sổ stale và request B gửi câu trả lời khác có thể claim lại lượt đó.

### Các bước tái hiện

1. Gửi request A đến `submitAnswer` để claim lượt trả lời.
2. Chờ request A vượt thời gian stale của claim.
3. Gửi request B với câu trả lời khác để claim lại cùng lượt.
4. Chờ cả hai request hoàn tất và kiểm tra lượt trả lời cùng trạng thái phiên.

### Kết quả mong đợi

Khi đã mất claim, request A không được ghi kết quả và không được gọi `advanceToNextQuestion`; chỉ request đang giữ claim được hoàn tất lượt.

### Kết quả thực tế

Cả A và B đều trả về `200`, ghi kết quả và đẩy state machine. Verdict của A có thể bị gắn vào `answerText` của B, đồng thời double-advance có thể bỏ qua một khái niệm trong phiên nhiều khái niệm.

### Tài liệu đính kèm

- [GitHub issue #288](https://github.com/Lade1q/planning-ai/issues/288)

### Ghi chú

Issue ghi nhận tái hiện live 2/2 lần khi hạ `ANSWER_CLAIM_STALE_MS` xuống 1.5 giây. Hướng sửa là ràng lệnh ghi vào mốc claim/token của chính request, ví dụ `updateMany` với `answeredAt: now`; trạng thái GitHub hiện là `Closed`.

---

## Bảng tóm tắt Bug

| Defect ID | Defect Title           | Defect Description                                     | Function ID                  | Severity | Reported By     | Date Reported | Status | Comment                                |
| --------- | ---------------------- | ------------------------------------------------------ | ---------------------------- | -------- | --------------- | ------------- | ------ | -------------------------------------- |
| B014      | Mất claim vẫn ghi điểm | Hai request có thể cùng ghi verdict và cùng chuyển câu | AI Examiner / `submitAnswer` | High     | Nguyễn Thế Quân | 2026-08-08    | Closed | Có thể sai dữ liệu và bỏ qua khái niệm |

---

## Chú thích mức độ nghiêm trọng

| Mức độ   | Ý nghĩa                                  | Ví dụ                         |
| -------- | ---------------------------------------- | ----------------------------- |
| Critical | App bị crash hoặc mất dữ liệu            | App crash khi submit form     |
| High     | Tính năng chính không hoạt động          | AI không tạo được kế hoạch    |
| Medium   | Tính năng hoạt động nhưng ra kết quả sai | Timer đếm sai giây            |
| Low      | Vấn đề nhỏ, chỉ về giao diện             | Văn bản bị lệch, lỗi chính tả |
