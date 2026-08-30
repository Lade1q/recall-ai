# Báo Cáo Thực Thi Kiểm Thử AI Examiner (Execution Log)

Dùng file này để ghi chép trực tiếp kết quả trong quá trình test thủ công. Sau khi hoàn tất, hãy copy bảng tổng hợp cuối cùng dán vào comment của Issue.

---

## 📍 CF-01: Happy Path - Trả lời tốt cả 3 lượt

**Concept đang hỏi:** `[Chờ nhập...]`

**Lượt 1:**

- **AI Hỏi:** `[Chờ nhập...]`
- **User Trả lời:** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`

**Lượt 2:**

- **AI Hỏi kế tiếp:** `[Chờ nhập...]`
- **User Trả lời:** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`

**Lượt 3:**

- **AI Hỏi kế tiếp:** `[Chờ nhập...]`
- **User Trả lời:** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`

**Kết luận State Machine:** Hệ thống có tự động dừng lại sau lượt 3 không? `[Chờ nhập...]`
**Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 CF-02: Đánh giá chất lượng - Trả lời hời hợt

**Concept đang hỏi:** `[Chờ nhập...]`

**Lượt 1:**

- **AI Hỏi:** `[Chờ nhập...]`
- **User Trả lời (Ngắn/Sơ sài):** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`
- **Phản ứng của State Machine:** AI có hỏi xoáy/bắt giải thích thêm không? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 CF-03: Traceback - Sai khái niệm CÓ tiên quyết (Bắt buộc PASS)

**Concept đang hỏi:** `[Chờ nhập...]`

- **AI Hỏi:** `[Chờ nhập...]`
- **User Trả lời (Sai bản chất):** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`
- **Phản ứng của State Machine:** Hệ thống có tự động chuyển sang hỏi khái niệm cơ bản hơn không? Khái niệm tiếp theo là gì? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 CF-04: Spaced Repetition - Sai khái niệm KHÔNG CÓ tiên quyết

**Concept đang hỏi:** `[Chờ nhập...]`

- **AI Hỏi:** `[Chờ nhập...]`
- **User Trả lời (Sai bản chất):** `[Chờ nhập...]`
- **Kết quả (Network Tab/UI):** Verdict: `[Chờ nhập...]` | Score: `[Chờ nhập...]`
- **Phản ứng của State Machine:** Hệ thống có lưu lại để hỏi sau (không Traceback) không? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 CF-05: Đứt gãy hệ thống - Hết Quota API (Bắt buộc PASS)

- **Hành động:** Hệ thống tự động bị lỗi mạng/hết quota khi đang gọi API chấm điểm.
- **Phản ứng của State Machine:** UI có bị sập không? Có tự động chuyển sang màn hình Flashcard an toàn không? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 CF-06: Phục hồi phiên - Tạm dừng và quay lại

- **Hành động:** Đang bị văng ra màn hình Flashcard, nhấn F5 (Tải lại trang).
- **Phản ứng của State Machine:** Hệ thống có tải lại đúng câu hỏi đang làm dở không? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 TC-AE-010: Bảo mật - Phân quyền truy cập

- **Hành động:** Dùng Token của User A để gọi API chấm điểm cho phiên học của User B.
- **Kết quả:** Mã lỗi trả về là gì? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## 📍 TC-AE-011: Idempotency - Gửi đúp (Tính lũy đẳng)

- **Hành động:** Gửi 2 request nộp bài (POST /answers) liên tiếp thật nhanh.
- **Kết quả:** Database có tạo 2 lượt trả lời (turn) bị trùng không? `[Chờ nhập...]`
  **Trạng thái Kịch bản:** `[Chờ nhập...]`

---

## BẢNG TỔNG HỢP (Dán vào GitHub Issue #120)

| Mã CF      | Mô tả Kịch bản                            | Kết quả thực tế (Verdict / Score / Phản hồi) |   Trạng thái    | Bug Issue (Nếu có) |
| :--------- | :---------------------------------------- | :------------------------------------------- | :-------------: | :----------------: |
| **CF-01**  | Happy Path (Trả lời tốt 3 lượt)           | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **CF-02**  | Trả lời hời hợt (Shallow)                 | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **CF-03**  | Traceback (Sai kiến thức tiên quyết)      | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **CF-04**  | Spaced Repetition (Sai khái niệm độc lập) | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **CF-05**  | Fallback Flashcard (Hết Quota/Lỗi API)    | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **CF-06**  | Khôi phục phiên học (Resume Session)      | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **TC-010** | Bảo mật (Phân quyền truy cập API)         | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
| **TC-011** | Idempotency (Gửi đúp POST /answers)       | `[Chờ nhập...]`                              | `[Chờ nhập...]` |      `[N/A]`       |
