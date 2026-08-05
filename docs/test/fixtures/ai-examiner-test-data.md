# Bộ Dữ liệu Đầu vào (Test Script) - AI Examiner

_Dùng cho quá trình Thực thi Giai đoạn 3_

**Tài liệu sử dụng (Fixture):** `search_algorithms.pdf` (Chủ đề: Linear Search & Binary Search)

Dưới đây là bộ các câu trả lời (Prompt Input) được thiết kế sẵn cho từng kịch bản. Khi chạy test trên hệ thống, QA/Tester chỉ việc copy nguyên văn các câu này dán vào khung chat để đảm bảo tính ổn định (Reproducibility).

---

## CF-01: Happy Path (Trả lời tốt 3 lượt liên tục)

**Hoàn cảnh:** Hệ thống yêu cầu giải thích về Binary Search (Tìm kiếm nhị phân).

- **Lượt 1 (Input):** _"Tìm kiếm nhị phân hoạt động theo cơ chế chia để trị (divide and conquer). Nó tìm kiếm bằng cách liên tục chia đôi không gian tìm kiếm. Yêu cầu bắt buộc là mảng dữ liệu (Array) phải được sắp xếp (sorted) từ trước."_
  - _(Kỳ vọng: AI đánh giá tốt, cho điểm cao và hỏi câu khó hơn, ví dụ về độ phức tạp)._
- **Lượt 2 (Input):** _"Độ phức tạp thời gian trung bình và xấu nhất của Binary Search là O(log n), tốt hơn rất nhiều so với O(n) của Linear Search."_
  - _(Kỳ vọng: AI đánh giá tốt và tiếp tục hỏi sâu hơn, ví dụ hỏi về mặt hạn chế)._
- **Lượt 3 (Input):** _"Hạn chế là chi phí để duy trì mảng luôn ở trạng thái đã sắp xếp (sorted order) có thể rất tốn kém (overhead cost)."_
  - _(Kỳ vọng: AI đánh giá xuất sắc, lưu điểm mastery_score và **DỪNG** hỏi khái niệm này để chuyển sang khái niệm khác - Tuân thủ ràng buộc C6)._

---

## CF-02: Đánh giá chất lượng (Trả lời đúng nhưng hời hợt)

**Hoàn cảnh:** Hệ thống hỏi về "Linear search without a sentinel" (Tìm kiếm tuyến tính không có lính canh).

- **Lượt 1 (Input):** _"Thuật toán này sẽ duyệt qua từng phần tử một để tìm kiếm."_
- **Kỳ vọng:** Câu trả lời này đúng nhưng chưa đủ sâu (chưa nhắc đến việc return index nếu thấy, hoặc return -1 nếu duyệt hết). AI bắt buộc phải trả về verdict là `shallow` và hỏi vặn lại (Ví dụ: _"Vậy nếu không tìm thấy thì thuật toán trả về gì?"_).

---

## CF-03: Traceback (Trả lời sai kiến thức tiên quyết) - BẮT BUỘC PASS

**Hoàn cảnh:** Hệ thống đang hỏi về Binary Search.

- **Lượt 1 (Input):** _"Binary search có thể áp dụng cho bất kỳ mảng dữ liệu lộn xộn nào, nó duyệt từ trái qua phải để tìm phần tử."_
- **Kỳ vọng:** Câu trả lời này sai bản chất hoàn toàn (nhầm sang Linear Search và sai cả tiên quyết là mảng phải sorted). AI phải trả về verdict là `wrong`, chấm dứt hỏi Binary Search và **kích hoạt cơ chế Traceback (lùi khái niệm)**. Hệ thống sẽ quay lại hỏi khái niệm cơ bản hơn (ví dụ: Linear Search là gì? hoặc Sorted Array là gì?).

---

## CF-04: Spaced Repetition (Sai khái niệm độc lập)

**Hoàn cảnh:** Hệ thống hỏi về "Sentinel" (Lính canh).

- **Lượt 1 (Input):** _"Lính canh là một người đứng canh gác cho hệ thống bảo mật."_
- **Kỳ vọng:** Sai hoàn toàn. Vì khái niệm "Sentinel" (trong ngữ cảnh bài này) không có khái niệm gốc nào khác để lùi. Hệ thống không kích hoạt Traceback mà đưa nó vào danh sách ôn tập ngắt quãng (Spaced repetition) để hỏi lại sau.

---

## CF-05: Đứt gãy hệ thống (Giả lập hết Quota) - BẮT BUỘC PASS

**Hoàn cảnh:** Đang làm dở bất kỳ câu nào.

- **Hành động Tester:** Đổi `GEMINI_API_KEY` thành key sai, hoặc ngắt mạng. Sau đó submit một câu trả lời (ví dụ _"Linear search rất chậm"_).
- **Kỳ vọng:** Hệ thống gọi API AI bị fail, nhưng **KHÔNG ĐƯỢC SẬP GIAO DIỆN**. Hệ thống tự động chuyển sang chế độ Flashcard an toàn (fallback) để sinh viên tự chấm điểm.

---

## CF-06: Phục hồi phiên (Tạm dừng và quay lại)

**Hoàn cảnh:** Đang trả lời dở Lượt 2 của CF-01.

- **Hành động Tester:** Ấn F5 tải lại trang, hoặc đóng tab mở lại.
- **Kỳ vọng:** UI khôi phục lại đúng cuộc hội thoại ở Lượt 2, số lượt hỏi còn lại không bị reset lại từ đầu.
