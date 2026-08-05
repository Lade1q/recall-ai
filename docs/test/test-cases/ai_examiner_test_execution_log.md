# Báo Cáo Thực Thi Kiểm Thử AI Examiner (Execution Log)

Dùng file này để ghi chép trực tiếp kết quả trong quá trình test thủ công. Sau khi hoàn tất, hãy copy bảng tổng hợp cuối cùng dán vào comment của Issue #120.

---

## 📍 CF-01: Happy Path - Trả lời tốt cả 3 lượt

**Concept đang hỏi:** `Linear Search with a sentinel`

**Lượt 1:**

- **AI Hỏi:** `In linear search with a sentinel, how is the array modified before running the search loop?`
- **User Trả lời:** `Before running the search loop, the array is modified by appending the target search key to the very end of the array. This appended value acts as a 'sentinel'. The main purpose of this modification is to guarantee that the search loop will always find the target value, which allows us to completely eliminate the array bounds checking condition (like i < n) from the inner loop. This reduces the number of comparisons per iteration, making the algorithm slightly faster.`
- **Kết quả (Network Tab/UI):** Verdict: `deep` (Hiểu sâu) | Score: `0.85`

**Lượt 2:**

- **AI Hỏi kế tiếp:** `In the sentinel linear search algorithm, after the loop finishes and the last element is restored (arr[n - 1] = last), why must the final check evaluate both i < n - 1 and x == arr[n - 1] to determine if the search key was found?`
- **User Trả lời:** `The final check requires both conditions to distinguish between a genuine match and hitting the sentinel. The loop terminates when the key is found, but this could be the actual target or our artificial sentinel at the end. The condition 'i < n - 1' confirms we found the key before the last element (a genuine match). If this is false, we reached the end of the array. We then need 'x == arr[n - 1]' (or checking the restored 'last' value) to verify if the original last element itself happens to be the target key.`
- **Kết quả (Network Tab/UI):** Verdict: `deep` (Hiểu sâu) | Score: `1.00`

**Lượt 3:**

- **AI Hỏi kế tiếp:** `Why does linear search with a sentinel achieve lower running time (up to 20% faster for large arrays) compared to linear search without a sentinel, even though both algorithms have a worst-case time complexity of O(n)?`
- **User Trả lời:** `Although both algorithms have an O(n) worst-case time complexity, the Big-O notation ignores constant factors. Linear search with a sentinel is faster in practice because it reduces the constant overhead inside the inner loop. A standard linear search must perform two comparisons per iteration: one to check the array bounds (i < n), and one to check the element (arr[i] == x). The sentinel search guarantees the target will be found, allowing us to safely eliminate the bounds check. This reduces the number of operations per iteration by half, which translates to a noticeable performance improvement—like the 20% speedup for large arrays—despite the asymptotic complexity remaining O(n).`
- **Kết quả (Network Tab/UI):** Verdict: `deep` (Hiểu sâu) | Score: `1.00`

**Kết luận State Machine:** Hệ thống có tự động dừng lại sau lượt 3 không? `[CÓ, hệ thống đã ngừng hỏi về Linear Search và tự động chuyển sang hỏi khái niệm mới là Binary Search]`
**Trạng thái Kịch bản:** `PASS`

---

## 📍 CF-02: Đánh giá chất lượng - Trả lời hời hợt

_(Ghi chú: Tiếp tục sử dụng luôn session từ CF-01 vì hệ thống tự động chuyển sang khái niệm mới)_

**Concept đang hỏi:** `Binary Search`

- **AI Hỏi:** `What type of data structure ordering is specifically required to perform a Binary Search?`
- **User Trả lời (Ngắn/Sơ sài):** `It requires a sorted array.`
- **Kết quả (Network Tab/UI):** Verdict: `shallow` (Còn nông) | Score: `0.50`
- **Phản ứng của State Machine:** AI có hỏi xoáy/bắt giải thích thêm không? `[CÓ, hệ thống đã chuyển tag sang "VÌ SAO" và yêu cầu giải thích tại sao mảng phải được sắp xếp]`
  **Trạng thái Kịch bản:** `PASS`

---

## 📍 CF-03: Traceback - Sai khái niệm CÓ tiên quyết (Bắt buộc PASS)

_(Ghi chú: Tiếp tục sử dụng luôn session từ CF-02. Khái niệm Binary Search CÓ khái niệm tiên quyết là Interval Search)._

**Concept đang hỏi:** `Binary Search`

- **AI Hỏi:** `Why must the array be sorted for the binary search algorithm to successfully find an element or narrow down the search space?`
- **User Trả lời (Sai bản chất):** `Because binary search starts from the first element and checks each item one by one sequentially. Sorting the array just makes this sequential checking process look better on the screen.`
- **Kết quả (Network Tab/UI):** Verdict: `wrong` (Ghi chú: Mô phỏng bằng cách bấm nút "Sai" trên giao diện Flashcard do hệ thống đang ở chế độ Fallback) | Score: `0.00`
- **Phản ứng của State Machine:** Hệ thống có tự động chuyển sang hỏi khái niệm cơ bản hơn không? Khái niệm tiếp theo là gì? `[KHÔNG! Trái với kỳ vọng, hệ thống KHÔNG chuyển sang Interval Search mà lại lặp lại một câu hỏi GHI NHỚ khác của chính Binary Search (Lỗi State Machine hoặc Lỗi cơ chế Fallback)]`
  **Trạng thái Kịch bản:** `FAIL` (Cần tạo Bug Report)

---

## 📍 CF-04: Spaced Repetition - Sai khái niệm KHÔNG CÓ tiên quyết

_(Ghi chú: Khởi tạo phiên kiểm tra tùy chọn với 2 khái niệm "Search Algorithms" và "Sequential Search" từ dữ liệu PDF cũ. Khái niệm "Search Algorithms" được mang ra hỏi trước vì nó là gốc, KHÔNG CÓ khái niệm tiên quyết)._

**Concept đang hỏi:** `Search Algorithms`

- **AI Hỏi:** `According to the material, what are the two main types of search algorithms mentioned?`
- **User Trả lời (Sai bản chất):** `Search algorithms are actually just random number generators used in modern video games to create unpredictable weather patterns.`
- **Kết quả (Network Tab/UI):** Verdict: `wrong` (0.00) (Qua chế độ Flashcard)
- **Phản ứng của State Machine:** Hệ thống có lưu lại để hỏi sau (không Traceback) không? `[KHÔNG! Lại là một con bug nữa. Thay vì tạm cất bài này đi và chuyển sang học Sequential Search, hệ thống vẫn lỳ lợm bám lấy bài cũ và hỏi tiếp câu số 2 cho Search Algorithms (Lượt 2/3)]`
  **Trạng thái Kịch bản:** `FAIL` (Chung nguồn gốc với bug của CF-03)

---

## 📍 CF-05: Đứt gãy hệ thống - Hết Quota API (Bắt buộc PASS)

_(Ghi chú: Lỗi API phát sinh ngẫu nhiên trong quá trình test CF-03 do Rate Limit của Gemini API)_

- **Hành động:** Hệ thống tự động bị lỗi mạng/hết quota khi đang gọi API chấm điểm.
- **Phản ứng của State Machine:** UI có bị sập không? Có tự động chuyển sang màn hình Flashcard an toàn không? `[CÓ. UI không sập. Giao diện tự động vô hiệu hóa AI và hiển thị 3 nút tự đánh giá: Đúng / Một phần / Sai (Flashcard mode)]`
  **Trạng thái Kịch bản:** `PASS`

---

## 📍 CF-06: Phục hồi phiên - Tạm dừng và quay lại

_(Ghi chú: Test luôn trong quá trình xảy ra CF-05)_

- **Hành động:** Đang bị văng ra màn hình Flashcard, nhấn F5 (Tải lại trang).
- **Phản ứng của State Machine:** Hệ thống có tải lại đúng câu hỏi đang làm dở không? `[CÓ, hệ thống nhớ y nguyên trạng thái bị kẹt ở giao diện Flashcard chứ không bị mất bài]`
  **Trạng thái Kịch bản:** `PASS`

---

## 📍 CF-Bảo Mật & Idempotency

_(Ghi chú: Test tự động thông qua Script Node.js do AI viết chạy trực tiếp trên Server)_

- **Security (Lấy Token A gọi API của B):** Mã lỗi trả về là gì? `[404 Not Found]` -> `[PASS]`
- **Idempotency (Gửi đúp POST /answers):** Database có tạo 2 turn không? `[Không. Nhưng cả 2 request đều bị văng mã lỗi 409 Conflict và không có lượt nào được tạo ra trong DB. Lẽ ra phải có 1 request thành công 200 OK và request kia bị chặn/trả về cache. Lỗi Logic API.]` -> `[FAIL]`

---

## BẢNG TỔNG HỢP (Dán vào GitHub Issue #120)

| Mã CF        | Mô tả Kịch bản                            | Kết quả thực tế (Verdict / Score / Phản hồi)                                | Trạng thái |    Bug Issue (Nếu có)     |
| :----------- | :---------------------------------------- | :-------------------------------------------------------------------------- | :--------: | :-----------------------: |
| **CF-01**    | Happy Path (Trả lời tốt 3 lượt)           | Verdict: `deep` (Score: 1.00). State Machine dừng đúng ở Lượt 3.            |   `PASS`   |          `[N/A]`          |
| **CF-02**    | Trả lời hời hợt (Shallow)                 | Verdict: `shallow` (Score: 0.50). State Machine bẻ lái hỏi VÌ SAO.          |   `PASS`   |          `[N/A]`          |
| **CF-03**    | Traceback (Sai kiến thức tiên quyết)      | Verdict: `wrong` (0.00). Hệ thống KHÔNG Traceback mà vẫn hỏi Binary Search. |   `FAIL`   |   `[Sẽ tạo Issue sau]`    |
| **CF-04**    | Spaced Repetition (Sai khái niệm độc lập) | Verdict: `wrong` (0.00). Không đổi bài, vẫn hỏi tiếp Lượt 2 của bài cũ.     |   `FAIL`   | `[Gộp chung Issue CF-03]` |
| **CF-05**    | Fallback Flashcard (Hết Quota/Lỗi API)    | Đứt API -> Chuyển mượt mà sang UI Flashcard tự chấm.                        |   `PASS`   |          `[N/A]`          |
| **CF-06**    | Khôi phục phiên học (Resume Session)      | F5 trang web -> Giao diện nhớ nguyên vị trí kẹt ở Flashcard.                |   `PASS`   |          `[N/A]`          |
| **Sec/Idem** | Bảo mật & Gửi đúp                         | Security: `404` (Pass). Idempotency: 2 requests đều tạch `409` (Fail).      |   `FAIL`   |     `[Sẽ tạo Issue]`      |
