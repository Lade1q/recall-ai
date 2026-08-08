# Mẫu Test Case — AI Examiner

> **Module:** AI Examiner
> **Use Case tham chiếu:** Epic #108, Use-case_Specification mục 2.3
> **Người viết:** Nguyễn Minh Phát
> **Ngày tạo:** 2026-08-04
> **Ngày cập nhật:** 2026-08-04
> **Phiên bản:** 1.0
> **Loại kiểm thử chung:** Functionality / Security / Integration

---

## TC-AE-001: Trả lời tốt cả 3 lượt (Basic Flow - Happy Path)

| Trường                   | Nội dung                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Luồng hội thoại cơ bản (CF-01)                                                                                                                                                               |
| **Mã TC**                | TC-AE-001                                                                                                                                                                                    |
| **Tiêu đề**              | Trả lời tốt cả 3 lượt, hệ thống hỏi sâu hơn và không kích hoạt traceback                                                                                                                     |
| **Mô tả**                | Kiểm tra luồng người dùng trả lời tốt qua 3 lượt liên tiếp                                                                                                                                   |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                |
| **Độ ưu tiên**           | High                                                                                                                                                                                         |
| **Điều kiện tiên quyết** | Đã load tài liệu PDF tiên quyết. Bắt đầu phiên kiểm tra khái niệm.                                                                                                                           |
| **Các bước thực hiện**   | 1. Bắt đầu phiên kiểm tra với khái niệm đầu tiên.<br>2. Nhập câu trả lời chi tiết, chính xác.<br>3. Chờ AI chấm điểm và đưa ra câu hỏi tiếp theo.<br>4. Lặp lại bước 2-3 cho đến hết 3 lượt. |
| **Dữ liệu đầu vào**      | Câu trả lời chính xác và đầy đủ ý nghĩa cho từng câu hỏi.                                                                                                                                    |
| **Kết quả mong đợi**     | - Hệ thống đánh giá `mastery_score` cao.<br>- Mỗi lượt câu hỏi sâu hơn lượt trước.<br>- Không kích hoạt cơ chế traceback.                                                                    |
| **Kết quả thực tế**      | Verdict: `deep` (Score: 1.00). State Machine dừng đúng ở Lượt 3.                                                                                                                             |
| **Trạng thái**           | PASS                                                                                                                                                                                         |
| **Ghi chú**              |                                                                                                                                                                                              |
| **Nhận xét**             |                                                                                                                                                                                              |

---

## TC-AE-002: Trả lời hời hợt (Verdict shallow)

| Trường                   | Nội dung                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Luồng hội thoại cơ bản (CF-02)                                                                                                   |
| **Mã TC**                | TC-AE-002                                                                                                                        |
| **Tiêu đề**              | Trả lời hời hợt, hệ thống yêu cầu giải thích sâu hơn                                                                             |
| **Mô tả**                | Kiểm tra phản ứng của hệ thống khi người dùng chỉ trả lời định nghĩa cơ bản, thiếu chiều sâu.                                    |
| **Loại kiểm thử**        | Functionality                                                                                                                    |
| **Độ ưu tiên**           | High                                                                                                                             |
| **Điều kiện tiên quyết** | Bắt đầu phiên kiểm tra khái niệm.                                                                                                |
| **Các bước thực hiện**   | 1. Nhận câu hỏi từ hệ thống.<br>2. Nhập câu trả lời chỉ chứa định nghĩa ngắn gọn, hời hợt.<br>3. Gửi câu trả lời và xem kết quả. |
| **Dữ liệu đầu vào**      | Câu trả lời mang tính chất chép định nghĩa, hời hợt.                                                                             |
| **Kết quả mong đợi**     | - Verdict trả về là `shallow`.<br>- Câu hỏi kế tiếp là câu truy vấn buộc giải thích rõ hơn.                                      |
| **Kết quả thực tế**      | Verdict: `shallow` (Score: 0.50). State Machine bẻ lái hỏi VÌ SAO.                                                               |
| **Trạng thái**           | PASS                                                                                                                             |
| **Ghi chú**              |                                                                                                                                  |
| **Nhận xét**             |                                                                                                                                  |

---

## TC-AE-003: Trả lời sai khái niệm CÓ tiên quyết (Traceback)

| Trường                   | Nội dung                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Traceback (CF-03)                                                                                                                                                                                                       |
| **Mã TC**                | TC-AE-003                                                                                                                                                                                                               |
| **Tiêu đề**              | Trả lời sai ở khái niệm có tiên quyết, hệ thống chạy traceback                                                                                                                                                          |
| **Mô tả**                | Đảm bảo hệ thống phát hiện lỗi hổng kiến thức cốt lõi và chuyển sang khái niệm tiên quyết.                                                                                                                              |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                           |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                    |
| **Điều kiện tiên quyết** | Đang kiểm tra một khái niệm có khái niệm tiên quyết trong cấu trúc.                                                                                                                                                     |
| **Các bước thực hiện**   | 1. Nhận câu hỏi về khái niệm hiện tại.<br>2. Nhập câu trả lời sai hoàn toàn.<br>3. Gửi câu trả lời và kiểm tra kết quả.                                                                                                 |
| **Dữ liệu đầu vào**      | Câu trả lời sai.                                                                                                                                                                                                        |
| **Kết quả mong đợi**     | - Kết thúc khái niệm hiện tại ngay lập tức.<br>- Cơ chế traceback chạy và tìm thấy khái niệm tiên quyết.<br>- Khái niệm tiên quyết được xếp lịch học ngay (`scheduledFor: now`) ở đầu hàng đợi cho phiên học tiếp theo. |
| **Kết quả thực tế**      | Verdict: `wrong` (0.00). Hệ thống kết thúc khái niệm, chạy Traceback ngầm và xếp lịch học tiên quyết vào đầu hàng đợi của phiên kế tiếp đúng như thiết kế AE-07.                                                        |
| **Trạng thái**           | PASS                                                                                                                                                                                                                    |
| **Ghi chú**              | Kịch bản này bắt buộc phải ĐẠT để được demo.                                                                                                                                                                            |
| **Nhận xét**             |                                                                                                                                                                                                                         |

---

## TC-AE-004: Trả lời sai khái niệm KHÔNG CÓ tiên quyết (Spaced Repetition)

| Trường                   | Nội dung                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Spaced Repetition (CF-04)                                                                                                                                                 |
| **Mã TC**                | TC-AE-004                                                                                                                                                                 |
| **Tiêu đề**              | Trả lời sai ở khái niệm không có tiên quyết, hệ thống rơi về spaced repetition                                                                                            |
| **Mô tả**                | Đảm bảo hệ thống không chạy traceback khi khái niệm không có tiên quyết phụ thuộc.                                                                                        |
| **Loại kiểm thử**        | Functionality                                                                                                                                                             |
| **Độ ưu tiên**           | Medium                                                                                                                                                                    |
| **Điều kiện tiên quyết** | Đang kiểm tra một khái niệm cơ sở (không có tiên quyết).                                                                                                                  |
| **Các bước thực hiện**   | 1. Nhận câu hỏi về khái niệm cơ sở.<br>2. Nhập câu trả lời sai hoàn toàn.<br>3. Gửi câu trả lời và kiểm tra hành vi hệ thống.                                             |
| **Dữ liệu đầu vào**      | Câu trả lời sai.                                                                                                                                                          |
| **Kết quả mong đợi**     | - Kết thúc khái niệm hiện tại ngay lập tức.<br>- Không kích hoạt traceback (vì không có tiên quyết).<br>- Hệ thống rơi vào chế độ lặp lại ngắt quãng (spaced repetition). |
| **Kết quả thực tế**      | Verdict: `wrong` (0.00). Hệ thống kết thúc ngay khái niệm hiện tại, không Traceback, kết thúc phiên và đưa vào Spaced Repetition.                                         |
| **Trạng thái**           | PASS                                                                                                                                                                      |
| **Ghi chú**              |                                                                                                                                                                           |
| **Nhận xét**             |                                                                                                                                                                           |

---

## TC-AE-005: AF1 - AI timeout / hết quota (Fallback Flashcard)

| Trường                   | Nội dung                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Fallback Mechanism (CF-05)                                                                                                                                                  |
| **Mã TC**                | TC-AE-005                                                                                                                                                                   |
| **Tiêu đề**              | Xử lý khi AI timeout hoặc hết API quota                                                                                                                                     |
| **Mô tả**                | Xác nhận hệ thống chuyển sang chế độ Flashcard an toàn mà không làm sập web khi API lỗi.                                                                                    |
| **Loại kiểm thử**        | Functionality                                                                                                                                                               |
| **Độ ưu tiên**           | High                                                                                                                                                                        |
| **Điều kiện tiên quyết** | Bắt đầu phiên kiểm tra. Cố tình thay đổi `GEMINI_API_KEY` thành key sai để giả lập lỗi API.                                                                                 |
| **Các bước thực hiện**   | 1. Trả lời một câu hỏi bất kỳ và gửi đi.<br>2. API trả về lỗi do sai key/hết quota.<br>3. Kiểm tra giao diện và DB.                                                         |
| **Dữ liệu đầu vào**      | Câu trả lời bất kỳ. `GEMINI_API_KEY` sai.                                                                                                                                   |
| **Kết quả mong đợi**     | - Hệ thống chuyển sang màn Flashcard fallback (chấm điểm thủ công).<br>- Phiên không bị sập.<br>- Điểm tự chấm vẫn được ghi nhận vào DB với `InterviewTurn.source` phù hợp. |
| **Kết quả thực tế**      | Đứt API -> Chuyển mượt mà sang UI Flashcard tự chấm.                                                                                                                        |
| **Trạng thái**           | PASS                                                                                                                                                                        |
| **Ghi chú**              | Kịch bản này bắt buộc phải ĐẠT để được demo.                                                                                                                                |
| **Nhận xét**             |                                                                                                                                                                             |

---

## TC-AE-006: AF2 - Sinh viên tạm dừng

| Trường                   | Nội dung                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Pause/Resume (CF-06)                                                                                          |
| **Mã TC**                | TC-AE-006                                                                                                     |
| **Tiêu đề**              | Tạm dừng phiên, đóng tab và quay lại tiếp tục đúng tiến độ                                                    |
| **Mô tả**                | Đảm bảo hệ thống lưu trạng thái phiên học (state machine) khi người dùng rời đi giữa chừng.                   |
| **Loại kiểm thử**        | Functionality                                                                                                 |
| **Độ ưu tiên**           | High                                                                                                          |
| **Điều kiện tiên quyết** | Đang ở giữa một phiên kiểm tra.                                                                               |
| **Các bước thực hiện**   | 1. Nhấn F5 hoặc đóng trình duyệt hoàn toàn.<br>2. Mở lại trình duyệt và truy cập lại vào phiên học hiện tại.  |
| **Dữ liệu đầu vào**      | Tương tác trình duyệt (F5/đóng tab).                                                                          |
| **Kết quả mong đợi**     | - Phiên học được khôi phục chính xác khái niệm đang học.<br>- Khôi phục đúng số lượt hỏi còn lại trong phiên. |
| **Kết quả thực tế**      | F5 trang web -> Giao diện nhớ nguyên vị trí kẹt ở Flashcard.                                                  |
| **Trạng thái**           | PASS                                                                                                          |
| **Ghi chú**              |                                                                                                               |
| **Nhận xét**             |                                                                                                               |

---

## TC-AE-007: AF3 - Bỏ qua khái niệm (Deferred)

| Trường                   | Nội dung                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| **Function / Feature**   | Bỏ qua khái niệm                                                         |
| **Mã TC**                | TC-AE-007                                                                |
| **Tiêu đề**              | Bỏ qua khái niệm đang học (AE-04)                                        |
| **Mô tả**                | Placeholder cho chức năng bỏ qua khái niệm sẽ phát triển trong Sprint 5. |
| **Loại kiểm thử**        | Functionality                                                            |
| **Độ ưu tiên**           | Low                                                                      |
| **Điều kiện tiên quyết** | TBD                                                                      |
| **Các bước thực hiện**   | TBD                                                                      |
| **Dữ liệu đầu vào**      | TBD                                                                      |
| **Kết quả mong đợi**     | TBD                                                                      |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                    |
| **Trạng thái**           | Deferred                                                                 |
| **Ghi chú**              | Thuộc Sprint 5 (AE-04)                                                   |
| **Nhận xét**             |                                                                          |

---

## TC-AE-008: AF4 - Khiếu nại kết quả chấm (Deferred)

| Trường                   | Nội dung                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ |
| **Function / Feature**   | Khiếu nại kết quả                                                              |
| **Mã TC**                | TC-AE-008                                                                      |
| **Tiêu đề**              | Khiếu nại kết quả chấm của AI (AE-10)                                          |
| **Mô tả**                | Placeholder cho chức năng khiếu nại kết quả chấm sẽ phát triển trong Sprint 5. |
| **Loại kiểm thử**        | Functionality                                                                  |
| **Độ ưu tiên**           | Low                                                                            |
| **Điều kiện tiên quyết** | TBD                                                                            |
| **Các bước thực hiện**   | TBD                                                                            |
| **Dữ liệu đầu vào**      | TBD                                                                            |
| **Kết quả mong đợi**     | TBD                                                                            |
| **Kết quả thực tế**      | _(điền sau khi test)_                                                          |
| **Trạng thái**           | Deferred                                                                       |
| **Ghi chú**              | Thuộc Sprint 5 (AE-10)                                                         |
| **Nhận xét**             |                                                                                |

---

## TC-AE-009: Ràng buộc C6 - Max 3 lượt hỏi

| Trường                   | Nội dung                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | Giới hạn lượt hỏi                                                                                                                                |
| **Mã TC**                | TC-AE-009                                                                                                                                        |
| **Tiêu đề**              | Hệ thống dừng ở tối đa 3 lượt hỏi sâu liên tục                                                                                                   |
| **Mô tả**                | Kiểm tra giới hạn số lượt hỏi (C6) để tránh AI hỏi vô tận.                                                                                       |
| **Loại kiểm thử**        | Functionality                                                                                                                                    |
| **Độ ưu tiên**           | High                                                                                                                                             |
| **Điều kiện tiên quyết** | Phiên kiểm tra mới.                                                                                                                              |
| **Các bước thực hiện**   | 1. Trả lời câu hỏi thứ 1 (verdict deep/shallow).<br>2. Trả lời câu hỏi thứ 2.<br>3. Trả lời câu hỏi thứ 3.<br>4. Gửi câu trả lời và xem kết quả. |
| **Dữ liệu đầu vào**      | Câu trả lời kích hoạt verdict cần hỏi thêm (deep liên tục).                                                                                      |
| **Kết quả mong đợi**     | - Hệ thống bắt buộc phải dừng lại sau lượt thứ 3.<br>- Không được sinh ra câu hỏi thứ 4.                                                         |
| **Kết quả thực tế**      | Hệ thống tự động dừng ở lượt 3 (CF-01) theo đúng ràng buộc C6.                                                                                   |
| **Trạng thái**           | PASS                                                                                                                                             |
| **Ghi chú**              |                                                                                                                                                  |
| **Nhận xét**             |                                                                                                                                                  |

---

## TC-AE-010: Bảo mật - Phân quyền truy cập

| Trường                   | Nội dung                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Security                                                                                                              |
| **Mã TC**                | TC-AE-010                                                                                                             |
| **Tiêu đề**              | User A truy cập API phiên của User B bị từ chối với mã 404                                                            |
| **Mô tả**                | Đảm bảo dữ liệu phiên học của người dùng được bảo mật, không thể bị truy cập ngang quyền.                             |
| **Loại kiểm thử**        | Security                                                                                                              |
| **Độ ưu tiên**           | High                                                                                                                  |
| **Điều kiện tiên quyết** | Có tài khoản User A và User B. User B đã tạo một phiên kiểm tra (có session ID).                                      |
| **Các bước thực hiện**   | 1. Đăng nhập với User A và lấy JWT Token.<br>2. Gọi API truy cập vào phiên kiểm tra của User B bằng Token của User A. |
| **Dữ liệu đầu vào**      | Token của User A, API URL chứa session ID của User B.                                                                 |
| **Kết quả mong đợi**     | - API trả về mã lỗi `404 Not Found` (không phải 403 để tránh lộ thông tin ID có tồn tại).                             |
| **Kết quả thực tế**      | API trả về `404 Not Found` đúng thiết kế.                                                                             |
| **Trạng thái**           | PASS                                                                                                                  |
| **Ghi chú**              | Test ngày 2026-08-08 bằng script `test-api.ts`.                                                                       |
| **Nhận xét**             | Hệ thống trả về 404 (không phải 403) đúng như thiết kế — ẩn thông tin sự tồn tại của session ID.                      |

---

## TC-AE-011: Idempotency (Tính luỹ đẳng)

| Trường                   | Nội dung                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Idempotency API                                                                                                                                                                                                                              |
| **Mã TC**                | TC-AE-011                                                                                                                                                                                                                                    |
| **Tiêu đề**              | Gửi 2 request POST /answers liên tiếp chỉ tạo ra 1 turn                                                                                                                                                                                      |
| **Mô tả**                | Đảm bảo hệ thống không tạo dữ liệu rác hoặc turn trùng lặp khi người dùng double click.                                                                                                                                                      |
| **Loại kiểm thử**        | Interface / Database                                                                                                                                                                                                                         |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                         |
| **Điều kiện tiên quyết** | Đang ở màn hình trả lời câu hỏi của một phiên kiểm tra.                                                                                                                                                                                      |
| **Các bước thực hiện**   | 1. Tạo phiên học qua API, để câu hỏi xuất hiện trên UI (không trả lời).<br>2. Chạy script `test-idempotency.ts` với `SESSION_ID` và `TOKEN` thực tế, bắn 2 request `POST /answers` đồng thời qua `Promise.all`.                              |
| **Dữ liệu đầu vào**      | Phiên học đang có câu hỏi chờ; cùng một payload câu trả lời được gửi 2 lần cùng lúc.                                                                                                                                                         |
| **Kết quả mong đợi**     | - Chỉ có 1 turn trả lời được tạo trong Database.<br>- Request đầu tiên trả về `200`, request thứ hai trả về `409 Conflict`.                                                                                                                  |
| **Kết quả thực tế**      | Cả 2 request đều trả về `200 OK`. Lỗi này không phải bug! Hệ thống xử lý đúng: request thứ hai bị claim chặn lại, vào hàm `replayAnswer`, chờ request đầu chấm điểm xong và trả về kết quả kèm cờ `replayed: true`. Database chỉ ghi 1 turn. |
| **Trạng thái**           | PASS                                                                                                                                                                                                                                         |
| **Ghi chú**              | Test ngày 2026-08-08 bằng script `test-idempotency.ts`. Đã loại bỏ bug report do phân tích lại hệ thống.                                                                                                                                     |
| **Nhận xét**             | Hệ thống thiết kế rất thông minh! Trả về 200 kèm `replayed: true` thay vì `409` giúp client không cần phải viết code tự động retry.                                                                                                          |

---

## Bảng tóm tắt — AI Examiner

| Mã TC     | Tiêu đề                                                                        | Loại                 | Độ ưu tiên | Trạng thái |
| --------- | ------------------------------------------------------------------------------ | -------------------- | ---------- | ---------- |
| TC-AE-001 | Trả lời tốt cả 3 lượt, hệ thống hỏi sâu hơn và không kích hoạt traceback       | Functionality        | High       | `PASS`     |
| TC-AE-002 | Trả lời hời hợt, hệ thống yêu cầu giải thích sâu hơn                           | Functionality        | High       | `PASS`     |
| TC-AE-003 | Trả lời sai ở khái niệm có tiên quyết, hệ thống chạy traceback                 | Functionality        | High       | `PASS`     |
| TC-AE-004 | Trả lời sai ở khái niệm không có tiên quyết, hệ thống rơi về spaced repetition | Functionality        | Medium     | `PASS`     |
| TC-AE-005 | Xử lý khi AI timeout hoặc hết API quota                                        | Functionality        | High       | `PASS`     |
| TC-AE-006 | Tạm dừng phiên, đóng tab và quay lại tiếp tục đúng tiến độ                     | Functionality        | High       | `PASS`     |
| TC-AE-007 | Bỏ qua khái niệm (AE-04)                                                       | Functionality        | Low        | Deferred   |
| TC-AE-008 | Khiếu nại kết quả chấm của AI (AE-10)                                          | Functionality        | Low        | Deferred   |
| TC-AE-009 | Hệ thống dừng ở tối đa 3 lượt hỏi sâu liên tục                                 | Functionality        | High       | `PASS`     |
| TC-AE-010 | User A truy cập API phiên của User B bị từ chối với mã 404                     | Security             | High       | `PASS`     |
| TC-AE-011 | Gửi 2 request POST /answers liên tiếp chỉ tạo ra 1 turn                        | Interface / Database | High       | `PASS`     |
