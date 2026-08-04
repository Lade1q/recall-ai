# Đặc tả API Interview (API Endpoints Spec)

Tất cả các API dưới đây có tiền tố `/api/v1/interviews` và yêu cầu xác thực người dùng qua
Header `Authorization: Bearer <TOKEN>`.

> Tài liệu này hiện chỉ mô tả endpoint **AE-09 (I6.5) — Kết quả tổng hợp cuối phiên**. Các
> endpoint khác của AI Examiner (`POST /`, `GET /:id`, `POST /:id/answers`, `.../pause`,
> `.../resume` — I6.3/#115, AE-05/#116) sẽ được bổ sung khi I9.2 (#128) tổng hợp toàn bộ API spec.

---

### 1. Lấy Kết quả Tổng hợp của một Phiên (Get Session Summary)

- **Endpoint:** `GET /api/v1/interviews/:id/summary`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Path params:**
  - `id` (string, UUID, required): id của `InterviewSession`.

- **Dùng để:** màn kết quả tổng hợp cuối phiên Interview (I6.7 / UC-14) — hiển thị bảng điểm
  từng khái niệm, nhận xét bằng ngôn ngữ tự nhiên do AI viết, và danh sách khái niệm mà
  Traceback (AE-08 / I7.2) đã đề xuất ôn lại cho phiên tiếp theo.

- **Ràng buộc quan trọng:**
  - Chỉ gọi được khi phiên đã `status = 'completed'` — gọi khi phiên còn dở trả về `409`.
  - `summarize_session` (lời gọi AI thứ 4 và cuối cùng — UC-Overview §5.1) chỉ nhận điểm số và
    verdict **đã tính xong**, không gửi lại tài liệu gốc, và không được phép tự sinh/sửa
    `mastery_score` (C4).
  - Nhận xét AI được sinh **một lần duy nhất** và cache lại — gọi endpoint này lần thứ 2 trở đi
    **không** tốn thêm lượt gọi Gemini nào (risk R01).
  - AI lỗi không làm request thất bại: vẫn trả `200` kèm bảng điểm structured đầy đủ,
    `summary.generatedByAi = false`, `summary.text = null`.

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "sessionId": "7c9e6679-...-uuid",
      "status": "completed",
      "durationMinutes": 12,
      "concepts": [
        {
          "conceptId": "b2d3e4f5-...-uuid",
          "name": "Đạo hàm riêng",
          "masteryScore": 0.83,
          "turns": [{ "turnIndex": 1, "score": 0.7, "verdict": "shallow" }]
        }
      ],
      "summary": {
        "text": "Bạn nắm khá chắc phần Đạo hàm riêng...",
        "strengths": ["Đạo hàm riêng"],
        "weaknesses": [],
        "recommendations": ["Ôn lại phần ứng dụng thực tế của đạo hàm."],
        "generatedByAi": true,
        "message": null
      },
      "traceback": [
        {
          "conceptId": "c4e5f6a7-...-uuid",
          "name": "Giới hạn hàm số",
          "reason": "traceback",
          "depth": 1,
          "sourceConceptName": "Đạo hàm riêng",
          "status": "pending"
        }
      ]
    }
  }
  ```

  `summary.generatedByAi = false` khi `summarize_session` lỗi (sau retry) hoặc khi phiên kết
  thúc trước khi có khái niệm nào được chấm (UC-12 E1) — khi đó `summary.text` là `null` và
  `summary.message` chứa nguyên văn: _"Không thể tổng hợp nhận xét lúc này."_ Bảng điểm
  (`concepts`) vẫn luôn đầy đủ và chính xác trong mọi trường hợp.

  `traceback` đọc thẳng từ `ReviewQueueItem` (đã ghi bởi I7.2 khi từng khái niệm kết thúc trong
  phiên này) — không tính lại. Rỗng nếu phiên không có khái niệm nào cần truy ngược.

- **Response lỗi:**

  ```jsonc
  // 404 — phiên không tồn tại hoặc không thuộc user hiện tại (không phân biệt 2 trường hợp)
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Interview session not found" } }

  // 409 — phiên chưa kết thúc
  {
    "success": false,
    "error": {
      "code": "SESSION_NOT_COMPLETED",
      "message": "This interview session has not finished yet"
    }
  }
  ```

- **Liên quan:**
  - [`src/server/src/services/session-summary.service.ts`](../../src/server/src/services/session-summary.service.ts) — logic đầy đủ.
  - [`src/server/src/services/gemini.service.ts`](../../src/server/src/services/gemini.service.ts) — `summarizeSession()`.
  - [`src/server/src/services/concept-result.service.ts`](../../src/server/src/services/concept-result.service.ts) (I7.2) — nơi ghi `mastery_score` và `ReviewQueueItem` mà endpoint này chỉ đọc lại.
