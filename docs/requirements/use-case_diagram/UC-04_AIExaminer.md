# UC-04: Module AI Examiner - Interview

> **Module:** AI Examiner
> **Sprint:** 4 (AI Examiner), nối vào Concept Graph Engine từ Sprint 3
> **DB liên quan:** `interview_sessions`, `interview_turns`, `concepts` (cập nhật `mastery_score`)
> **AI calls:**
>
> - `generate_question` → trả về `{question_text, question_type}` — **không** có `concept_id`, xem `UC-Overview.md` §5.1
> - `grade_answer` → trả về `{score: 0.0-1.0, feedback: string, verdict: "deep"|"shallow"|"wrong"}`

---

## UC-11: Phiên Interview vấn đáp nhiều lượt ⭐ (Use-case phức tạp nhất)

| Trường                              | Nội dung                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Actor**                           | Student, AI Service, Scheduling & Remediation Engine                                               |
| **Mục tiêu**                        | Kiểm chứng khách quan mức độ hiểu bài thực sự của Student cho một hoặc nhiều khái niệm             |
| **Điều kiện tiên quyết**            | Student đã đăng nhập, đã có plan với đồ thị khái niệm đã xác nhận                                  |
| **Điều kiện kết thúc (thành công)** | `mastery_score` của các khái niệm được phỏng vấn được cập nhật vào DB, lịch ôn tập được điều chỉnh |

### Luồng chính

```
START
│
├─ [Hệ thống] Lấy khái niệm C từ danh sách hàng đợi phiên học
│
├─ [AI Call] generate_question(concept=C, material=<tài liệu gốc>, turn=1)
│   └─ Trả về: {question_text, question_type: "recall|application|why"}
│
├─ [Student] Nhập câu trả lời
│
├─ [AI Call] grade_answer(question, answer, rubric=<rubric từ tài liệu>)
│   └─ Trả về: {score, feedback, verdict: "deep|shallow|wrong"}
│
├─ [State Machine - Logic phần mềm tất định]
│   ├─ verdict == "deep" && turns_remaining > 0
│   │   └─ generate_question(deeper=True) → lặp lại vòng hỏi-đáp
│   │
│   ├─ verdict == "shallow" && turns_remaining > 0
│   │   └─ generate_question(probe=True) → lặp lại vòng hỏi-đáp
│   │
│   ├─ verdict == "wrong" && concept has prerequisites
│   │   └─ Kích hoạt UC-13 (Traceback), lưu partial score cho C
│   │
│   ├─ turns_remaining == 0 (đã đủ N lượt)
│   │   └─ Kết thúc khái niệm C, tính mastery_score = avg(scores)
│   │
│   └─ Còn khái niệm tiếp theo trong hàng đợi?
│       ├─ Có → lặp lại với khái niệm tiếp theo
│       └─ Không → kết thúc phiên → UC-14 (Xem kết quả tổng hợp)
│
END
```

### Giới hạn State Machine

- **Tối đa N lượt hỏi-đáp cho mỗi khái niệm** (N = 3, có thể cấu hình)
- **Số khái niệm tối đa mỗi phiên** để kiểm soát thời gian và chi phí API
- Mọi quyết định điều phối là **logic phần mềm tất định**, không phụ thuộc AI

### Luồng ngoại lệ

- **[E1] AI Service lỗi / timeout trong lúc sinh câu hỏi:** → Kích hoạt UC-12 (Fallback Flashcard)
- **[E2] AI Service lỗi / timeout trong lúc chấm điểm:** → Retry 1 lần → nếu vẫn lỗi → UC-12
- **[E3] AI trả về JSON sai schema:** → Retry 1 lần → nếu vẫn sai → UC-12
- **[E4] Student thoát giữa chừng:**
  1. Lưu `mastery_score` đã tính được cho các khái niệm đã hoàn thành
  2. Đánh dấu session là `incomplete`
  3. Lần sau mở lại: hỏi "Bạn có muốn tiếp tục phiên Interview còn dở không?"

---

## UC-12: Fallback - Tự chấm bằng Flashcard tĩnh

| Trường        | Nội dung                                                                |
| ------------- | ----------------------------------------------------------------------- |
| **Actor**     | Student, System                                                         |
| **Kích hoạt** | Tự động khi AI Service không phản hồi trong UC-11 (extend relationship) |
| **Mục tiêu**  | Đảm bảo học tập không bị gián đoạn hoàn toàn dù AI fail                 |
| **Điều kiện** | Phải có câu hỏi đã được sinh sẵn từ phiên trước (cached)                |

### Luồng chính

1. Hệ thống thông báo: "AI tạm thời không khả dụng. Chuyển sang chế độ Flashcard tự chấm."
2. Hiển thị câu hỏi đã sinh sẵn từ lần phân tích trước (cached trong DB)
3. Student đọc câu hỏi, tự trả lời trong đầu
4. Student tự đánh giá: "Đúng" / "Sai" / "Một phần"
5. Hệ thống ánh xạ lựa chọn sang score: Đúng=1.0 / Một phần=0.5 / Sai=0.0
6. Cập nhật `mastery_score` bình thường → Scheduling & Remediation Engine vẫn hoạt động

### Luồng ngoại lệ

- **[E1] Không có câu hỏi cached (lần đầu tiên, chưa có lịch sử):** Thông báo "Không thể chuyển sang chế độ Flashcard do chưa có câu hỏi sẵn. Vui lòng thử lại sau khi AI khả dụng."

---

## UC-13: Truy ngược khái niệm tiên quyết (Concept Traceback) ⭐ (Use-case Agentic)

| Trường        | Nội dung                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| **Actor**     | System (Scheduling & Remediation Engine) → thông báo kết quả cho Student     |
| **Kích hoạt** | Tự động khi `mastery_score(C) < ngưỡng` (ví dụ 0.6) sau khi chấm trong UC-11 |
| **Mục tiêu**  | Tự động xác định và chèn phiên ôn lại đúng khái niệm gốc rễ gây ra điểm yếu  |
| **Tính chất** | Hoàn toàn tất định - không gọi AI - có thể unit test với dữ liệu giả lập     |

### Thuật toán BFS ngược (pseudocode)

```text
FUNCTION traceback(C):
  Q = empty queue
  # Queue chứa tuple (concept_id, depth). depth CHỈ tăng khi enqueue node con.
  ENQUEUE (P, depth=1) cho mỗi tiên quyết trực tiếp của C (concept_edges WHERE to = C)
  visited = {C}
  results = []

  WHILE Q not empty:
    (P, depth) = DEQUEUE(Q)
    IF P in visited: CONTINUE
    visited.add(P)

    IF mastery_score(P) is null OR mastery_score(P) < 0.6:
      results.add(P)   # P yếu -> chèn vào đầu hàng đợi phiên kế tiếp (ưu tiên trước C)
      IF depth < 2:    # giới hạn cứng max_depth = 2
        ENQUEUE (P', depth+1) cho mỗi tiên quyết trực tiếp của P
    ELSE:
      # PRUNING: P đã vững (>= 0.6) -> bỏ qua P VÀ KHÔNG duyệt tiếp tiên quyết của P
      PASS

  IF results rỗng:
    Áp dụng spaced repetition thông thường cho C (hẹn ôn lại C sau X ngày)
  RETURN results
```

> ⚠️ **Đã sửa 2 lỗi so với bản cũ (đồng bộ với `UC-Overview.md` §5.3):**
> (1) Queue chứa tuple `(id, depth)`, depth chỉ tăng khi enqueue con — bản cũ viết `depth += 1` trong vòng `WHILE` khiến thuật toán dừng sau đúng 3 node bất kể hình dạng đồ thị.
> (2) Bổ sung **PRUNING**: gặp tiên quyết đã vững thì cắt nhánh, không duyệt sâu tiếp (theo `Use-case_Specification.pdf` mục 2.5 AF1) — bản markdown cũ thiếu quy tắc này.

### Luồng chính

1. Sau khi khái niệm `C` được đánh giá **xong** (hết các lượt) trong UC-11, Scheduling & Remediation Engine tính `mastery_score(C)` (weighted average) và kiểm tra — chạy per-concept, **không** sau mỗi lượt
2. Nếu `mastery_score < 0.6`: chạy thuật toán BFS ngược
3. Tìm các tiên quyết P cần ôn lại (tối đa 2 tầng)
4. Chèn P vào đầu hàng đợi phiên học kế tiếp (trước C)
5. **Thông báo cho Student** sau khi phiên kết thúc:
   - "Phát hiện bạn còn yếu ở khái niệm **[C]**. Hệ thống đã thêm **[P1, P2]** vào lịch ôn tập tiếp theo vì chúng là nền tảng của [C]."
   - _(Câu "**đã thêm**" là đúng mô hình mới — lịch được áp tự động ở bước 4, không chờ phê duyệt. **Giữ nguyên, đừng "sửa cho khớp spec cũ"** thành "đề xuất chờ xác nhận".)_
6. Student xem và có thể **điều chỉnh** — **gỡ bớt hoặc đưa lại** khái niệm nền — ở **hai** nơi: trạng thái cuối của phiên vấn đáp (AE-02), và trong Kế hoạch ôn tập. Đây không phải cổng phê duyệt: lịch đã được áp ở bước 4.

> ⚠️ **Đã làm rõ UC-13 bước 5–6 (chốt 2026-08-04):** truy ngược **tự áp** lịch ôn ngay khi chấm xong, không có cổng "Đồng ý" trước khi áp; "điều chỉnh" ở bước 6 = **gỡ / đưa lại**, làm được ở trạng thái cuối phiên **và** Kế hoạch ôn tập. Bước 5 vốn đã nói đúng ("đã thêm") nên giữ nguyên. Khớp mô hình đang chạy trong code; C4 không đổi.

### Luồng ngoại lệ

- **[E1] Khái niệm C không có tiên quyết nào trong đồ thị:**
  - Không chạy BFS
  - Áp dụng spaced repetition thông thường ngay lập tức
- **[E2] Môn học không có cấu trúc phân tầng (đồ thị quá thưa):**
  - Phần lớn C đều rơi vào [E1]
  - Hệ thống hoạt động bình thường như công cụ spaced repetition thông thường
- **[E3] BFS tìm thấy quá nhiều tiên quyết (đồ thị dày đặc):**
  - Giới hạn cứng tối đa 2 tầng để tránh phiên học phình quá dài
  - Chỉ thêm các tiên quyết trong 2 tầng đầu tiên

---

## UC-14: Xem kết quả tổng hợp cuối phiên Interview

| Trường        | Nội dung                                                                |
| ------------- | ----------------------------------------------------------------------- |
| **Actor**     | Student, AI Service                                                     |
| **Kích hoạt** | Tự động sau khi UC-11 kết thúc toàn bộ hàng đợi khái niệm               |
| **Mục tiêu**  | Cung cấp nhận xét tổng hợp có ngữ nghĩa, không chỉ là danh sách điểm số |

### Luồng chính

1. Hệ thống thu thập tất cả `{concept_name, mastery_score, verdict_history}` của phiên vừa xong
2. **[AI Call]** Gửi dữ liệu điểm số đến AI, yêu cầu viết nhận xét tự nhiên, chia theo đúng ba dải của `classifyMastery()`:
   - Phần đã vững (score >= 0.8)
   - Phần đang học (0.6 <= score < 0.8)
   - Phần còn yếu (score < 0.6)
   - Gợi ý ôn lại cụ thể
3. Hiển thị **trạng thái kết quả cuối phiên** — là **trạng thái cuối của màn phỏng vấn (AE-02)**, không phải một trang/route riêng — với:
   - Biểu đồ điểm số từng khái niệm
   - Nhận xét tự nhiên do AI viết
   - Danh sách khái niệm được thêm vào lịch ôn tiếp theo (do UC-13)
   - Nút "Bắt đầu phiên học tiếp theo"

> ⚠️ **Đã sửa bước 3 (chốt 2026-08-04):** "trang kết quả" → **trạng thái cuối của màn AE-02**, không đổi route. AE-09 là một trạng thái của phiên vấn đáp, không phải màn riêng. Nội dung 4 khối giữ nguyên. (Mốc "đã vững" ở bước 2 là một sửa đổi khác — xem blockquote ngay dưới.)

> ⚠️ **Đã sửa mốc "đã vững" ở bước 2 (chốt 2026-08-04):** bản cũ ghi `>= 0.7` và chỉ liệt kê hai nhóm, để trống khoảng `0.6 <= score < 0.7` — khái niệm 0.65 không thuộc nhóm nào. Mốc đang chạy trong code là `MASTERY_STRONG_THRESHOLD = 0.8` (`src/server/src/utils/mastery.ts`), chia ba dải liền mạch và là thứ quyết định màu hiển thị. Giữ hai con số khác nhau thì cùng một khái niệm sẽ vừa nằm ở danh sách "đã vững" AI viết vừa mang màu "đang học" trên biểu đồ ngay cạnh đó (màn AE-09).
>
> Lưu ý phân biệt với mốc `0.6` ở phần PRUNING của thuật toán truy ngược phía trên: chỗ đó "đã vững" trả lời câu hỏi **có đủ vững để ngừng duyệt sâu không** (`MASTERY_THRESHOLD`, dùng chung với `traceback.service.ts`), không phải dải hiển thị.

### Luồng ngoại lệ

- **[E1] AI fail khi tổng hợp nhận xét:** Hiển thị báo cáo điểm số dạng structured (bảng), không dùng AI viết nhận xét. Thông báo: "Không thể tổng hợp nhận xét lúc này."

---

## UC-15: Phản hồi / khiếu nại kết quả chấm điểm

| Trường          | Nội dung                                                    |
| --------------- | ----------------------------------------------------------- |
| **Actor**       | Student                                                     |
| **Mục tiêu**    | Cho phép Student phản hồi khi không đồng ý với điểm AI chấm |
| **Phạm vi MVP** | Chỉ ghi nhận feedback (log), không tự động điều chỉnh điểm  |

### Luồng chính

1. Student xem lại từng lượt hỏi-đáp trong phiên kết quả
2. Click "Không đồng ý với điểm này" ở một lượt cụ thể
3. Nhập lý do ngắn gọn (tùy chọn)
4. Hệ thống lưu feedback vào log
5. Thông báo: "Phản hồi của bạn đã được ghi nhận"

### Ghi chú

- Ở giai đoạn MVP, feedback chỉ được log, không tự động thay đổi `mastery_score`
- Có thể mở rộng sau để team review và cải thiện rubric/prompt chấm điểm
