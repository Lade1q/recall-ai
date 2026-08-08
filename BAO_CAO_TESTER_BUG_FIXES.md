# BÁO CÁO PHẢN HỒI KẾT QUẢ XỬ LÝ BUG — MODULE AI EXAMINER

**Ngày báo cáo:** 08/08/2026  
**Người thực hiện:** Antigravity AI Assistant / Dev Team  
**Đối tượng nhận:** QA / Tester  
**Nhánh Git:** `bugfix/ai-examiner-state-machine-idempotency`

---

## 📋 TỔNG QUAN XỬ LÝ

Đã hoàn tất phân tích, sửa lỗi và kiểm thử tự động cho toàn bộ **4 vấn đề/bug** được nêu trong các báo cáo kiểm thử gần nhất của QA:

| STT | Mã / Tiêu đề Bug                                                                  | Mức độ | Trạng thái            | Tệp tin đã chỉnh sửa                                                    |
| --- | --------------------------------------------------------------------------------- | ------ | --------------------- | ----------------------------------------------------------------------- |
| 1   | **CF-03**: Fallback mode không ngắt khái niệm khi tự chấm `wrong`                 | High   | **Fixed**             | `interview-state.ts`, `interview.service.ts`, `interview-state.test.ts` |
| 2   | **CF-04**: Fallback mode vẫn phục vụ câu hỏi cache tiếp theo dù câu trước `wrong` | High   | **Fixed**             | `interview-state.ts`, `interview.service.ts`, `interview-state.test.ts` |
| 3   | **Idempotency**: Gửi 2 request concurrent `POST /answers` nhận lỗi `409`          | High   | **Fixed**             | `interview.service.ts`                                                  |
| 4   | **BR-AIEX-001**: State machine dừng khái niệm sau lượt 2 (kịch bản CF-01)         | High   | **Verified & Tested** | `interview-state.test.ts`                                               |

---

## 🛠️ CHI TIẾT KẾT QUẢ XỬ LÝ NGUYÊN NHÂN & GIẢI PHÁP

### 1. Bug CF-03 & CF-04: Fallback Mode bỏ qua Verdict `wrong`

- **Nguyên nhân gốc (Root Cause):**
  Trước đây hàm `resolveFallbackStep` trong chế độ flashcard fallback (AE-05) chỉ đếm số lượt câu hỏi cache đã phục vụ mà hoàn toàn bỏ qua kết quả tự chấm (`selfGrade`). Do đó khi sinh viên tự đánh giá `wrong`, hệ thống vẫn tiếp tục đưa ra câu hỏi cache thứ 2 thay vì dừng khái niệm để kích hoạt quy trình Traceback (BFS) theo đúng thiết kế (UC-12 / AE-02).

- **Giải pháp đã thực hiện:**
  - Cập nhật `FallbackStateInput` thêm thuộc tính `lastVerdict: Verdict | null`.
  - Cập nhật `resolveFallbackStep` trong `src/server/src/utils/interview-state.ts`:
    ```typescript
    if (lastVerdict === 'wrong' && totalTurnsServed > 0) {
      return { type: 'finish_concept' };
    }
    ```
  - Cập nhật `advanceFallback` trong `interview.service.ts` để đọc verdict của lượt vừa tự chấm và truyền vào `resolveFallbackStep`.
  - **Kết quả:** Khi tự chấm `wrong` ở chế độ fallback, khái niệm lập tức hoàn tất (`finish_concept`), kích hoạt `finalizeConceptResult` để tạo dòng ôn tập Traceback trong Review Queue cho các khái niệm tiên quyết.

---

### 2. Bug Idempotency: Gửi 2 Request Concurrent Trả Về 409 Conflict

- **Nguyên nhân gốc (Root Cause):**
  Cơ chế Idempotency dựa trên việc "claim" lượt trước khi gọi Gemini API. Khi gửi 2 request song song cùng 1 `Idempotency-Key` / câu trả lời:
  - Request 1 claim thành công và bắt đầu chờ Gemini chấm điểm (10-20 giây).
  - Request 2 đến sau 0.5s, thấy `claim.count === 0` nên gọi `replayAnswer()`.
  - Hàm `replayAnswer()` cũ lập tức ném lỗi HTTP 409 Conflict vì thấy lượt chưa có `verdict`. Kết quả là request 2 bị từ chối thay vì chờ kết quả từ request 1.

- **Giải pháp đã thực hiện:**
  - Cập nhật hàm `replayAnswer()` trong `src/server/src/services/interview.service.ts` thêm vòng lặp Polling (Retry-Wait):
    ```typescript
    const REPLAY_POLL_ATTEMPTS = 10;
    const REPLAY_POLL_INTERVAL_MS = 2_000;

    // Đợi tối đa 10 lần x 2 giây (20s) cho request 1 hoàn tất
    for (let attempt = 0; attempt < REPLAY_POLL_ATTEMPTS && turn?.verdict === null; attempt++) {
      await sleep(REPLAY_POLL_INTERVAL_MS);
      turn = await prisma.interviewTurn.findUnique({...});
    }
    ```
  - **Lưu ý về cửa sổ poll:** bản sửa đầu tiên chỉ đợi 3×2s = 6s, trong khi comment của chính file
    này ghi nhận Gemini grading thường mất 10–20s — nghĩa là double-submit thật trong lúc AI đang
    chấm điểm vẫn thường xuyên bị 409 trước khi request thắng chấm xong. Đã nâng lên 10×2s = 20s để
    phủ hết khoảng thời gian chấm điểm thực tế, và bổ sung 2 test (`interview-service.test.ts`) mô
    phỏng cả hai nhánh: (1) request thua replay thành công khi kết quả về giữa lúc đang poll, và
    (2) request thua nhận `ANSWER_IN_PROGRESS` (409) nếu request thắng không hoàn tất trong cửa sổ poll.
  - **Kết quả:** Request 2 sẽ đợi vừa đủ để request 1 ghi xong điểm vào DB, sau đó replay kết quả `200 OK` (`replayed: true`), không còn tình trạng trả về 409 cho cả 2 request trong các trường hợp thực tế.

---

### 3. Bug BR-AIEX-001: State Machine ngắt sau lượt 2 (CF-01)

- **Kết quả Phân tích Code (`decideNextStep`):**
  Đã rà soát chi tiết hàm `decideNextStep` trong `src/server/src/utils/interview-state.ts`:

  ```typescript
  const hasTurnsLeft = turnIndex < maxTurns;
  if (verdict !== 'wrong' && hasTurnsLeft) {
    return verdict === 'deep' ? 'ask_deeper' : 'ask_probe';
  }
  ```
  - Với lượt 2 trả lời đúng hoàn hảo (`deep`), `turnIndex = 2`, `maxTurns = 3`:
    - `hasTurnsLeft = 2 < 3` $\rightarrow$ `true`.
    - Hàm **luôn luôn trả về `'ask_deeper'`** để tiếp tục sinh câu hỏi lượt thứ 3.
  - Logic toán không bị lệch offset (off-by-one) và không gán cứng số lượt bằng 2.

- **Nguyên nhân QA phát hiện hiện tượng này khi test:**
  1. **Phiên test được tạo với `maxTurnsPerConcept: 2`**: Nếu API request `POST /api/v1/interviews` hoặc cấu hình môi trường test truyền tham số `maxTurnsPerConcept = 2`, hệ thống sẽ tuân thủ giới hạn 2 lượt của phiên đó.
  2. **Gemini API ở lượt 3 gặp lỗi Timeout/Rate-limit**: Khi lệnh gọi sinh câu hỏi lượt 3 gặp sự cố mạng, hệ thống bắt exception và chuyển sang `fallbackMode`, trả về `currentQuestion: null`. Khi màn hình không có câu hỏi, giao diện sẽ không hiển thị ô nhập, khiến người dùng lầm tưởng phiên đã bị ngắt/kết thúc.
  3. **Môi trường chạy bản build `dist/` chưa recompile.**

- **Hành động khắc phục:**
  - Bổ sung Unit Test Regression `BR-AIEX-001` để đảm bảo khẳng định logic lượt 2 luôn tiếp tục lượt 3 khi `maxTurns = 3`.
  - **Không có thay đổi logic nào trong `decideNextStep`** — hàm này vốn đã đúng. QA vui lòng re-test theo hướng dẫn mục 3 bên dưới để xác định nguyên nhân thật sự trong 3 khả năng đã liệt kê.
  - Đề nghị chạy lại `npm run build` trên máy local trước khi re-test, để chắc chắn `dist/` không còn là bản build cũ.

---

## 🧪 KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST RESULTS)

Các test case mới bổ sung (đều PASS):

```
decideNextStep — continuing the same concept
  ✓ BR-AIEX-001: continues to turn 3 (ask_deeper) after turn 2 has verdict deep when maxTurns = 3

resolveFallbackStep — wrong verdict ends concept (CF-03/CF-04)
  ✓ ends the concept immediately when the last verdict is wrong, even with cache left
  ✓ ends the concept on wrong after AI turns + one cached turn
  ✓ still serves the next cached question when the last verdict is deep
  ✓ still serves the next cached question when the last verdict is shallow

submitAnswer — replaying a concurrent double-submit
  ✓ replays the winner's grade once it lands inside the poll window
  ✓ gives up with ANSWER_IN_PROGRESS if the winner never finishes inside the poll window
```

Kết quả chạy thực tế (`cd src/server`):

| Lệnh                                                                    | Kết quả                |
| ----------------------------------------------------------------------- | ---------------------- |
| `npx jest src/__tests__/interview-state.test.ts`                        | 36 passed / 36 total   |
| `npx jest src/__tests__/interview-{service,controller,abandon}.test.ts` | 49 passed / 49 total   |
| `npx tsc --noEmit`                                                      | 0 lỗi                  |
| `npx jest` (toàn bộ)                                                    | 507 passed / 507 total |

---

## 📌 HƯỚNG DẪN KIỂM THỬ LẠI DÀNH CHO QA (RE-TEST GUIDE)

1. **Kiểm tra CF-03 / CF-04 (Fallback wrong):**
   - Vào phiên phỏng vấn, giả lập/bật chế độ fallback.
   - Chọn tự chấm **"Sai" (`wrong`)** ở câu đầu tiên.
   - **Kỳ vọng:** Phiên dừng ngay khái niệm đó, không hiển thị câu hỏi cache thứ 2. Kiểm tra DB/Review queue xuất hiện các khái niệm tiên quyết (Traceback).
2. **Kiểm tra Concurrent Idempotency:**
   - Dùng Postman / JMeter gửi 2 request `POST /api/v1/interviews/:id/answers` giống hệt nhau đồng thời.
   - **Kỳ vọng:** Cả 2 request đều thành công `200 OK` (1 request mới, 1 request replay), lượt trả lời lưu thành công vào DB.
3. **Kiểm tra CF-01 (Happy Path 3 lượt):**
   - Đảm bảo khi tạo phiên không truyền override `maxTurnsPerConcept: 2`.
   - Trả lời `deep` ở lượt 1 $\rightarrow$ Xuất hiện lượt 2 (`ask_deeper`).
   - Trả lời `deep` ở lượt 2 $\rightarrow$ **Xuất hiện lượt 3 (`ask_deeper`)**.
