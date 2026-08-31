# Mẫu Test Case — AI Examiner

> **Module:** AI Examiner
> **Use Case tham chiếu:** Epic #108, Use-case_Specification mục 2.3
> **Người viết:** Nguyễn Minh Phát
> **Ngày tạo:** 2026-08-04
> **Ngày cập nhật:** 2026-08-31
> **Phiên bản:** 1.2
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

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature**   | Traceback (CF-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Mã TC**                | TC-AE-003                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Tiêu đề**              | Trả lời sai ở khái niệm có tiên quyết, hệ thống chạy traceback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Mô tả**                | Đảm bảo hệ thống phát hiện lỗi hổng kiến thức cốt lõi và chuyển sang khái niệm tiên quyết.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Độ ưu tiên**           | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Điều kiện tiên quyết** | `tracebackEnabled = true`. Đang kiểm tra một khái niệm có khái niệm tiên quyết chưa được kiểm (`mastery_score = null`) hoặc có điểm dưới `0.60`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Các bước thực hiện**   | 1. Nhận câu hỏi về khái niệm hiện tại.<br>2. Nhập và gửi câu trả lời sai hoàn toàn ở lượt 1.<br>3. Xác nhận hệ thống không đóng khái niệm mà chuyển sang câu hỏi chế độ `hint` ở lượt 2; khi chạy Gemini thật, xác nhận câu hỏi thu hẹp câu vừa sai.<br>4. Không dùng hoặc chép nội dung đáp án có thể xuất hiện trong feedback; tiếp tục nhập câu trả lời sai hoàn toàn ở lượt 2.<br>5. Xác nhận hệ thống tiếp tục ở chế độ `hint` tại lượt 3; khi chạy Gemini thật, xác nhận câu hỏi được thu hẹp thêm.<br>6. Tiếp tục trả lời sai hoàn toàn ở lượt 3.<br>7. Kiểm tra kết quả chốt khái niệm, `mastery_score`, `tracebackSkipReason` và hàng đợi ôn. |
| **Dữ liệu đầu vào**      | Ba câu trả lời cố ý sai hoàn toàn cho cùng khái niệm qua một lượt `initial` và hai lượt `hint`; người kiểm phải trả lời sai cả 3 lượt và không dùng đáp án có thể bị lộ trong feedback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Kết quả mong đợi**     | - Sau lượt sai đầu tiên, hệ thống hỏi lại cùng khái niệm ở chế độ `hint`; khi chạy Gemini thật, mỗi câu hint phải thu hẹp câu hỏi trước đó.<br>- Khái niệm đóng khi chạm trần C6 (mặc định 3 lượt).<br>- Cả 2 lượt gợi ý vẫn được chấm và hiển thị nhưng không được tính vào `mastery_score`; chỉ lượt 1 được tính và verdict `wrong` bảo đảm `mastery_score < 0.40`.<br>- Sau lượt 3, `tracebackSkipReason = null`, cơ chế traceback chạy và tìm thấy khái niệm tiên quyết.<br>- Khái niệm tiên quyết được xếp lịch học ngay (`scheduledFor: now`) ở đầu hàng đợi cho phiên học tiếp theo.                                                            |
| **Kết quả thực tế**      | Chạy ngày 31/08/2026 với `USE_MOCK_AI=true`, concept `Linear Search without Sentinel`: trả lời `a` ở cả 3 lượt đều nhận verdict `wrong`; lượt 2 và 3 ở chế độ `hint` và có nội dung giống nhau theo thiết kế mock. Khái niệm đóng ở lượt 3, ghi rõ 2 lượt gợi ý không tính vào mastery; điểm quan sát được là `0.15`, chỉ từ lượt 1 (`0.15 × 1.0`). Điểm dưới `0.60` kích hoạt traceback và hệ thống báo xếp trước 2 khái niệm nền.                                                                                                                                                                                                                    |
| **Trạng thái**           | PASS (MOCK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Ghi chú**              | Kịch bản này bắt buộc phải ĐẠT để được demo. Kết quả mock xác nhận state machine, hai lượt có mode `hint` và luồng traceback. Mock cố định `wrong = 0.15` và chỉ sinh câu hint từ tên khái niệm, nên lượt 2 và 3 trùng nhau; mock không xác nhận điểm số hay mức độ thu hẹp nội dung. Vẫn phải chạy Gemini thật đủ 3 lượt trước khi chuyển trạng thái sang PASS/FAIL.                                                                                                                                                                                                                                                                                  |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## TC-AE-004: Trả lời sai khái niệm KHÔNG CÓ tiên quyết (Spaced Repetition)

| Trường                   | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Spaced Repetition (CF-04)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Mã TC**                | TC-AE-004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Tiêu đề**              | Trả lời sai ở khái niệm không có tiên quyết, hệ thống rơi về spaced repetition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Mô tả**                | Đảm bảo traceback chạy nhưng không tìm thấy tiên quyết nào, nên hệ thống không xếp thêm khái niệm và đưa chính khái niệm đang kiểm tra về spaced repetition.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Độ ưu tiên**           | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Điều kiện tiên quyết** | `tracebackEnabled = true`. Đang kiểm tra một khái niệm cơ sở không có tiên quyết.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Các bước thực hiện**   | 1. Nhận câu hỏi về khái niệm cơ sở.<br>2. Nhập và gửi câu trả lời sai hoàn toàn ở lượt 1.<br>3. Xác nhận hệ thống chuyển sang câu hỏi chế độ `hint` ở lượt 2; khi chạy Gemini thật, xác nhận câu hỏi thu hẹp câu vừa sai; tiếp tục trả lời sai hoàn toàn.<br>4. Xác nhận hệ thống tiếp tục ở chế độ `hint` tại lượt 3; khi chạy Gemini thật, xác nhận câu hỏi được thu hẹp thêm; tiếp tục trả lời sai hoàn toàn.<br>5. Sau khi chạm trần C6, kiểm tra kết quả phiên và hàng đợi ôn hoặc DB: `tracebackSkipReason`, review item `traceback` và review item `spaced_repetition`.            |
| **Dữ liệu đầu vào**      | Ba câu trả lời cố ý sai hoàn toàn cho cùng khái niệm qua một lượt `initial` và hai lượt `hint`; không dùng nội dung đáp án có thể xuất hiện trong feedback.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Kết quả mong đợi**     | - Sau lượt sai đầu tiên, hệ thống hỏi lại cùng khái niệm ở chế độ `hint`; khi chạy Gemini thật, mỗi câu hint phải thu hẹp câu hỏi trước đó.<br>- Khái niệm đóng khi chạm trần C6 (mặc định 3 lượt).<br>- Hai lượt gợi ý không được tính vào `mastery_score`; chỉ lượt 1 được tính và verdict `wrong` bảo đảm `mastery_score < 0.40`.<br>- `tracebackSkipReason = null` chứng minh traceback đã chạy; không có review item `traceback` vì không tìm thấy tiên quyết.<br>- Hệ thống tạo một review item `spaced_repetition` cho chính khái niệm với trạng thái `pending` và lịch tương lai. |
| **Kết quả thực tế**      | Chạy ngày 31/08/2026 với `USE_MOCK_AI=true`, concept gốc không có tiên quyết và `tracebackEnabled = true`: trả lời `a` ở cả 3 lượt đều nhận verdict `wrong`; lượt 2 và 3 ở chế độ `hint` và có nội dung giống nhau theo thiết kế mock. Khái niệm đóng ở lượt 3, 2 lượt gợi ý không tính vào mastery và điểm quan sát được là `0.15`, chỉ từ lượt 1. `tracebackSkipReason = null`; traceback không tìm thấy tiên quyết, không có review item `traceback`; chỉ tạo một review item `spaced_repetition` cho chính concept với trạng thái `pending` và lịch tương lai.                        |
| **Trạng thái**           | PASS (MOCK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Ghi chú**              | Phát hiện khi rà toàn tệp theo #448: đây là test case thứ hai còn phụ thuộc luật cũ. Kết quả mock xác nhận state machine, hai lượt có mode `hint`, traceback được chạy và spaced repetition. Mock cố định `wrong = 0.15` và chỉ sinh câu hint từ tên khái niệm, nên lượt 2 và 3 trùng nhau; mock không xác nhận điểm số hay mức độ thu hẹp nội dung. Vẫn phải chạy Gemini thật trước khi chuyển trạng thái sang PASS/FAIL.                                                                                                                                                                |
| **Nhận xét**             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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

| Trường                   | Nội dung                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Giới hạn lượt hỏi                                                                                                                                                               |
| **Mã TC**                | TC-AE-009                                                                                                                                                                       |
| **Tiêu đề**              | Hệ thống dừng ở tối đa 3 lượt cho mỗi khái niệm                                                                                                                                 |
| **Mô tả**                | Kiểm tra giới hạn số lượt hỏi (C6) để tránh AI hỏi vô tận.                                                                                                                      |
| **Loại kiểm thử**        | Functionality                                                                                                                                                                   |
| **Độ ưu tiên**           | High                                                                                                                                                                            |
| **Điều kiện tiên quyết** | Phiên kiểm tra mới.                                                                                                                                                             |
| **Các bước thực hiện**   | 1. Bắt đầu kiểm tra một khái niệm.<br>2. Trả lời để hệ thống tiếp tục sang lượt 2.<br>3. Trả lời để hệ thống tiếp tục sang lượt 3.<br>4. Gửi câu trả lời lượt 3 và xem kết quả. |
| **Dữ liệu đầu vào**      | Chuỗi câu trả lời khiến khái niệm đi đủ 3 lượt; C6 đếm mọi lượt bất kể mode (`initial`, `deeper`, `probe` hoặc `hint`).                                                         |
| **Kết quả mong đợi**     | - Hệ thống bắt buộc phải dừng khái niệm sau lượt thứ 3, bất kể mode của từng lượt.<br>- Không được sinh ra câu hỏi thứ 4 cho cùng khái niệm.                                    |
| **Kết quả thực tế**      | Hệ thống tự động dừng ở lượt 3 (CF-01) theo đúng ràng buộc C6.                                                                                                                  |
| **Trạng thái**           | PASS                                                                                                                                                                            |
| **Ghi chú**              | TC-AE-003 và TC-AE-004 đối chứng chuỗi `initial → hint → hint` cũng chạm cùng trần C6.                                                                                          |
| **Nhận xét**             |                                                                                                                                                                                 |

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

| Trường                   | Nội dung                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature**   | Idempotency API                                                                                                                                                                                                 |
| **Mã TC**                | TC-AE-011                                                                                                                                                                                                       |
| **Tiêu đề**              | Gửi 2 request POST /answers liên tiếp chỉ tạo ra 1 turn                                                                                                                                                         |
| **Mô tả**                | Đảm bảo hệ thống không tạo dữ liệu rác hoặc turn trùng lặp khi người dùng double click.                                                                                                                         |
| **Loại kiểm thử**        | Interface / Database                                                                                                                                                                                            |
| **Độ ưu tiên**           | High                                                                                                                                                                                                            |
| **Điều kiện tiên quyết** | Đang ở màn hình trả lời câu hỏi của một phiên kiểm tra.                                                                                                                                                         |
| **Các bước thực hiện**   | 1. Tạo phiên học qua API, để câu hỏi xuất hiện trên UI (không trả lời).<br>2. Chạy script `test-idempotency.ts` với `SESSION_ID` và `TOKEN` thực tế, bắn 2 request `POST /answers` đồng thời qua `Promise.all`. |
| **Dữ liệu đầu vào**      | Phiên học đang có câu hỏi chờ; cùng một payload câu trả lời được gửi 2 lần cùng lúc.                                                                                                                            |
| **Kết quả mong đợi**     | - Chỉ có 1 turn trả lời được tạo trong Database.<br>- Hệ thống xử lý an toàn request đúp (ví dụ: request sau đợi request trước và trả về cùng kết quả).                                                         |
| **Kết quả thực tế**      | DB chỉ tạo 1 turn. Cả 2 request đều 200, nhưng 1 request trả về kèm flag `replayed: true`. Hoạt động đúng thiết kế.                                                                                             |
| **Trạng thái**           | PASS                                                                                                                                                                                                            |
| **Ghi chú**              | Test ngày 2026-08-08 bằng script `test-idempotency.ts`. Đã loại bỏ bug report do phân tích lại hệ thống.                                                                                                        |
| **Nhận xét**             | Hệ thống thiết kế rất thông minh! Trả về 200 kèm `replayed: true` thay vì `409` giúp client không cần phải viết code tự động retry.                                                                             |

---

## Bảng tóm tắt — AI Examiner

| Mã TC     | Tiêu đề                                                                        | Loại                 | Độ ưu tiên | Trạng thái    |
| --------- | ------------------------------------------------------------------------------ | -------------------- | ---------- | ------------- |
| TC-AE-001 | Trả lời tốt cả 3 lượt, hệ thống hỏi sâu hơn và không kích hoạt traceback       | Functionality        | High       | `PASS`        |
| TC-AE-002 | Trả lời hời hợt, hệ thống yêu cầu giải thích sâu hơn                           | Functionality        | High       | `PASS`        |
| TC-AE-003 | Trả lời sai ở khái niệm có tiên quyết, hệ thống chạy traceback                 | Functionality        | High       | `PASS (MOCK)` |
| TC-AE-004 | Trả lời sai ở khái niệm không có tiên quyết, hệ thống rơi về spaced repetition | Functionality        | Medium     | `PASS (MOCK)` |
| TC-AE-005 | Xử lý khi AI timeout hoặc hết API quota                                        | Functionality        | High       | `PASS`        |
| TC-AE-006 | Tạm dừng phiên, đóng tab và quay lại tiếp tục đúng tiến độ                     | Functionality        | High       | `PASS`        |
| TC-AE-007 | Bỏ qua khái niệm (AE-04)                                                       | Functionality        | Low        | Deferred      |
| TC-AE-008 | Khiếu nại kết quả chấm của AI (AE-10)                                          | Functionality        | Low        | Deferred      |
| TC-AE-009 | Hệ thống dừng ở tối đa 3 lượt cho mỗi khái niệm                                | Functionality        | High       | `PASS`        |
| TC-AE-010 | User A truy cập API phiên của User B bị từ chối với mã 404                     | Security             | High       | `PASS`        |
| TC-AE-011 | Gửi 2 request POST /answers liên tiếp chỉ tạo ra 1 turn                        | Interface / Database | High       | `PASS`        |
