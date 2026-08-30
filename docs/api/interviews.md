# Đặc tả API Interview (API Endpoints Spec)

Tất cả các API dưới đây có tiền tố `/api/v1/interviews` và yêu cầu xác thực người dùng qua
Header `Authorization: Bearer <TOKEN>`.

> **Vòng đời một phiên (I6.3 / AE-01…AE-09):** `POST /` mở phiên → `GET /:id` dựng lại màn →
> `POST /:id/answers` nộp trả lời & lấy bước kế → `pause` / `resume` → `GET /:id/summary` kết
> quả cuối; `POST /:id/abandon` kết thúc sớm mà vẫn chấm phần đã làm. Trường **`sourceCitation`**
> (C5) đi kèm mọi câu hỏi — đặc tả ở mục 8.
>
> **Mục lục:** 1. Bắt đầu phiên · 2. Lấy trạng thái + transcript · 3. Nộp trả lời ⭐ · 4. Tạm dừng · 5. Tiếp tục · 6. Danh sách phiên (lịch sử) · 7. Kết quả tổng hợp · 8. `sourceCitation` · 9. Kết thúc sớm.

---

### 1. Bắt đầu / lấy lại phiên (Start Interview — AE-01)

- **Endpoint:** `POST /api/v1/interviews`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Body:**

  ```jsonc
  {
    "planId": "3fa85f64-...-uuid", // UUID, BẮT BUỘC
    "conceptIds": ["b2d3e4f5-...-uuid"], // UUID[], 1–5 phần tử; BỎ TRỐNG = "chọn hộ tôi"
    "maxTurnsPerConcept": 3, // int 1–3, tùy chọn (mặc định C6 = 3)
  }
  ```

  - `conceptIds` vắng ⇒ service tự lấy top-K khái niệm từ đầu hàng đợi ôn (I7.3) của plan.
  - Ràng buộc Zod: `planId` UUID; `conceptIds` mỗi phần tử UUID, `min(1)`, `max(5)`; `maxTurnsPerConcept` số nguyên `1..3`.

- **Dùng để:** mở một phiên vấn đáp cho plan (AE-01). Nếu plan đã có phiên `active`/`paused` dở, endpoint **trả lại chính phiên đó** (`created = false`) thay vì tạo trùng — FE hiện dialog AE-03 để người dùng chọn _"tiếp tục"_ hay _"kết thúc & chấm phần đã làm"_.

- **Ràng buộc quan trọng:**
  - **Một plan chỉ một phiên chưa kết thúc.** Đã có phiên dở ⇒ `created = false` + trả session và câu hỏi đang chờ; muốn phiên mới thì FE gọi `POST /:id/abandon` rồi gọi lại endpoint này.
  - `created = true` ⇒ HTTP **201 Created**; `created = false` (trả phiên cũ) ⇒ HTTP **200 OK**.
  - Plan phải có tài liệu đã phân tích — plan không có material trả lỗi (xem #272).
  - Câu hỏi đầu tiên sinh bằng lời gọi AI `generate_question` — **độ trễ dự kiến 10–20s**, FE nên đặt timeout ≥ 30s. AI lỗi **không** làm request thất bại: phiên vẫn mở, `fallback ≠ null` và client vào luồng flashcard (AE-05).

- **Response thành công (HTTP 201 tạo mới · HTTP 200 trả phiên cũ):**

  ```jsonc
  {
    "success": true,
    "data": {
      "created": true,
      "session": {
        "id": "7c9e6679-...-uuid",
        "planId": "3fa85f64-...-uuid",
        "status": "active",
        "fallbackMode": false,
        "startedAt": "2026-08-11T09:00:00.000Z",
        "endedAt": null,
        "currentConcept": { "id": "b2d3e4f5-...-uuid", "name": "Đạo hàm riêng" },
        "progress": {
          "conceptIndex": 0,
          "conceptTotal": 3,
          "completedConcepts": 0,
          "turnIndex": 1,
          "maxTurnsPerConcept": 3,
        },
      },
      "question": {
        "turnId": "5f1c2d3e-...-uuid",
        "conceptId": "b2d3e4f5-...-uuid",
        "conceptName": "Đạo hàm riêng",
        "turnIndex": 1,
        "questionText": "Đạo hàm riêng của f theo x nghĩa là gì?",
        "questionType": "recall",
        "source": "ai",
        "sourceCitation": {
          "documentId": "...",
          "filename": "giai-tich.pdf",
          "kind": "pdf",
          "pageFrom": 7,
          "pageTo": 7,
        },
      },
      "message": null,
      "fallback": null,
    },
  }
  ```

  - `created = false`: `message` mang gợi ý _"Đang tiếp tục phiên chưa kết thúc…"_; `question` là câu đang chờ của phiên cũ.
  - `fallback ≠ null` (vd `reason: "question_unavailable"`): AI lỗi lúc sinh câu đầu — phiên vẫn `active`, `session.fallbackMode` có thể đã bật, FE vào luồng flashcard.

- **Response lỗi:** `400 VALIDATION_ERROR` (body sai schema) · `404 NOT_FOUND` (plan không tồn tại/không thuộc user) · `409 PLAN_NOT_ACTIVE` (plan `archived` hoặc `draft` — kể cả khi vừa bị `reanalyzePlan` hạ về `draft` trong lúc còn phiên dở; `message` khác nhau theo trạng thái, xem `buildInactivePlanMessage()`, cùng câu `GET /review-queue?planId=` dùng) · `409 NO_MATERIAL` (plan chưa có tài liệu — #272).

- **Liên quan:** [`interview.service.ts`](../../src/server/src/services/interview.service.ts) `startInterview()`; [`scheduling.service.ts`](../../src/server/src/services/scheduling.service.ts) (chọn hộ khái niệm khi `conceptIds` vắng).

---

### 2. Lấy trạng thái phiên + transcript (Get Interview)

- **Endpoint:** `GET /api/v1/interviews/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Path params:** `id` (UUID, required) — id của `InterviewSession`.
- **Dùng để:** FE dựng lại màn phỏng vấn (I6.6) — câu hỏi đang chờ, tiến độ, và toàn bộ transcript. Là **nguồn chân lý** khi client không chắc trạng thái (vd sau reload, sau double-click `/answers` bị `replayed`).
- **Ràng buộc quan trọng:**
  - `currentQuestion = null` khi phiên đã kết thúc (`completed`/`abandoned`) hoặc đang chờ AI sinh câu.
  - `turns` là transcript đầy đủ, cũ → mới, tối đa **5 khái niệm × 3 lượt**. Lượt đã trả lời mang điểm/verdict; lượt trong fallback có `source = "cache_fallback"`.
  - `fallback ≠ null` khi phiên đang ở chế độ flashcard (AE-05).

- **Response thành công (HTTP 200 OK):**

  ```jsonc
  {
    "success": true,
    "data": {
      "session": {/* InterviewSessionState — xem mục 1 */},
      "currentQuestion": {/* InterviewQuestionResponse hoặc null — xem mục 1 */},
      "turns": [
        {
          "id": "...",
          "conceptId": "...",
          "conceptName": "Đạo hàm riêng",
          "turnIndex": 1,
          "questionText": "...",
          "questionType": "recall",
          "answerText": "Là tốc độ thay đổi của f theo x khi giữ biến khác cố định",
          "score": 0.7,
          "feedback": "Đúng ý chính, thiếu điều kiện giữ biến khác cố định.",
          "verdict": "shallow",
          "askedAt": "...",
          "answeredAt": "...",
          "sourceCitation": {
            "documentId": "...",
            "filename": "giai-tich.pdf",
            "kind": "pdf",
            "pageFrom": 7,
            "pageTo": 7,
          },
        },
      ],
      "fallback": null,
    },
  }
  ```

- **Response lỗi:** `404 NOT_FOUND` (phiên không tồn tại/không thuộc user).

- **Liên quan:** [`interview.service.ts`](../../src/server/src/services/interview.service.ts) `getInterview()` / `buildView()`.

---

### 3. Nộp câu trả lời và lấy bước kế tiếp (Submit Answer) ⭐

- **Endpoint:** `POST /api/v1/interviews/:id/answers`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Path params:** `id` (UUID, required).
- **Body — HAI chế độ chấm (không được gửi cả hai, schema `.strict()`):**

  ```jsonc
  // (A) Chế độ AI chấm — mặc định
  { "answerText": "..." }               // string, 1–5000 ký tự

  // (B) Chế độ tự chấm — chỉ dùng trong flashcard fallback (AE-05)
  { "selfGrade": "correct" }            // enum: correct | partial | wrong
  ```

- **Dùng để:** ghi câu trả lời cho câu hỏi đang chờ, chấm điểm, và trả về **bước tiếp theo** của máy trạng thái phỏng vấn (I6.3). Đây là endpoint phức tạp nhất — FE đọc kỹ nhất.

- **Ràng buộc quan trọng:**
  - Chế độ (A) gọi AI `grade_answer` — **độ trễ 10–20s**, FE đặt timeout ≥ 30s. AI lỗi ⇒ **không** fail: trả `grading = null`, `fallback = { reason: "grading_unavailable" }`, phiên bật `fallbackMode`.
  - Chế độ (B) `selfGrade` dùng khi phiên **đã** ở fallback: không gọi AI, `grading.feedback = null` (không có nhận xét AI).
  - **C6:** tối đa 3 lượt/khái niệm. `decideNextStep` (AI) / `resolveFallbackStep` (flashcard) quyết định lượt kế / kết thúc khái niệm.
  - **`replayed = true`:** gọi lại trên câu đã chấm (double-click/retry) — trả lại kết quả đã lưu, **không tạo lượt 2**. Coi `nextQuestion` ở đây là _gợi ý_ và lấy `GET /interviews/:id` làm chuẩn.
  - Kết thúc khái niệm ⇒ `conceptCompleted ≠ null` (đi qua `finalizeConceptResult` I7.2: ghi `mastery_score`, xếp lịch ôn, chạy truy ngược AE-07).

- **BỐN loại response — phân biệt bằng tổ hợp field (FE nhìn field, không đoán):**

  | Trạng thái                            | `grading` | `conceptCompleted`      | `nextQuestion`                | `sessionCompleted`        |
  | ------------------------------------- | --------- | ----------------------- | ----------------------------- | ------------------------- |
  | **Còn lượt tiếp** (cùng khái niệm)    | ≠ null    | `null`                  | ≠ null (turnIndex+1)          | `false`                   |
  | **Hết khái niệm** (sang khái niệm kế) | ≠ null    | ≠ null                  | ≠ null (câu ĐẦU khái niệm kế) | `false`                   |
  | **Hết phiên**                         | ≠ null    | ≠ null (khái niệm cuối) | `null`                        | `true`                    |
  | **Fallback** (AI lỗi)                 | `null`    | (tùy)                   | (tùy)                         | (tùy) + `fallback ≠ null` |

  ```jsonc
  // (1) CÒN LƯỢT TIẾP
  {
    "success": true,
    "data": {
      "session": { /* ... status: "active" ... */ },
      "grading": { "score": 0.7, "feedback": "Đúng ý chính, thiếu…", "verdict": "shallow" },
      "gradedTurnId": "5f1c2d3e-...-uuid",
      "nextQuestion": { /* cùng conceptId, turnIndex: 2 */ },
      "conceptCompleted": null,
      "sessionCompleted": false,
      "replayed": false,
      "fallback": null
    }
  }

  // (2) HẾT KHÁI NIỆM — nextQuestion là câu đầu của khái niệm KẾ
  {
    "success": true,
    "data": {
      "session": { /* progress.completedConcepts +1 */ },
      "grading": { "score": 0.85, "feedback": "…", "verdict": "deep" },
      "gradedTurnId": "...",
      "conceptCompleted": {
        "conceptId": "b2d3e4f5-...", "conceptName": "Đạo hàm riêng",
        "masteryScore": 0.78, "reviewInDays": 5, "scheduledFor": "2026-08-16T...",
        "prerequisites": [
          { "conceptId": "c4e5...", "name": "Giới hạn hàm số", "depth": 1, "reason": "weak_prerequisite", "masteryScore": 0.4 }
        ],
        "tracebackSkipReason": null
      },
      "nextQuestion": { "conceptId": "<khái niệm kế>", "turnIndex": 1, "...": "..." },
      "sessionCompleted": false,
      "replayed": false,
      "fallback": null
    }
  }

  // (3) HẾT PHIÊN — nextQuestion null, sessionCompleted true
  {
    "success": true,
    "data": {
      "session": { /* status: "completed", endedAt ≠ null, currentConcept: null */ },
      "grading": { "score": 0.5, "feedback": "…", "verdict": "shallow" },
      "gradedTurnId": "...",
      "conceptCompleted": { /* khái niệm cuối, prerequisites có thể rỗng */ },
      "nextQuestion": null,
      "sessionCompleted": true,
      "replayed": false,
      "fallback": null
    }
  }

  // (4) FALLBACK — AI chấm không khả dụng
  {
    "success": true,
    "data": {
      "session": { /* fallbackMode: true */ },
      "grading": null,
      "gradedTurnId": "...",
      "nextQuestion": { "source": "cache_fallback", "...": "..." },   // hoặc null nếu hết
      "conceptCompleted": null,
      "sessionCompleted": false,
      "replayed": false,
      "fallback": { "reason": "grading_unavailable", "message": "Không chấm được câu trả lời lúc này — chuyển sang chế độ ôn nhanh." }
    }
  }
  ```

  - `fallback.reason`: `grading_unavailable` (chấm lỗi) · `question_unavailable` (sinh câu lỗi) · `no_cached_questions` (fallback cần câu cache nhưng không có — UC-12 E1, phiên tự đóng `completed`).
  - `conceptCompleted.tracebackSkipReason ≠ null` (vd `"mastered"`) ⇒ không truy ngược tiên quyết nào; `null` ⇒ truy ngược đã chạy.

- **Response lỗi:** `400 VALIDATION_ERROR` (body không phải `{answerText}` hay `{selfGrade}` hợp lệ, hoặc lẫn cả hai) · `404 NOT_FOUND` · `409` (phiên đã kết thúc, không còn câu chờ).

- **Liên quan:** [`interview.service.ts`](../../src/server/src/services/interview.service.ts) `submitAnswer()` · `decideNextStep()` (AI) / `resolveFallbackStep()` (flashcard); [`concept-result.service.ts`](../../src/server/src/services/concept-result.service.ts) `finalizeConceptResult()` (I7.2).

---

### 4. Tạm dừng phiên (Pause Interview)

- **Endpoint:** `POST /api/v1/interviews/:id/pause`
- **Xác thực:** ✅ Yêu cầu Bearer Token · **Path params:** `id` (UUID).
- **Body:** _không có._
- **Dùng để:** chuyển phiên `active → paused` (AE-04) — người dùng rời giữa chừng, câu đang chờ được giữ nguyên.
- **Ràng buộc:** chỉ phiên `active` mới pause được; gọi trên phiên `paused` là no-op trả trạng thái hiện tại; phiên đã kết thúc ⇒ `409`. Không gọi AI.
- **Response thành công (HTTP 200):** `{ "success": true, "data": { "session": { /* status: "paused" */ } } }`
- **Response lỗi:** `404 NOT_FOUND` · `409` (phiên đã `completed`/`abandoned`).
- **Liên quan:** [`interview.service.ts`](../../src/server/src/services/interview.service.ts) `pauseInterview()`.

---

### 5. Tiếp tục phiên (Resume Interview)

- **Endpoint:** `POST /api/v1/interviews/:id/resume`
- **Xác thực:** ✅ Yêu cầu Bearer Token · **Path params:** `id` (UUID).
- **Body:** _không có._
- **Dùng để:** chuyển `paused → active` và trả lại câu hỏi đang chờ để FE dựng lại màn.
- **Ràng buộc:** phiên `active` sẵn ⇒ no-op trả câu hiện tại; phiên đã kết thúc ⇒ `409`. `fallback ≠ null` nếu phiên đang ở chế độ flashcard.
- **Response thành công (HTTP 200):**

  ```jsonc
  {
    "success": true,
    "data": {
      "session": {/* status: "active" */},
      "currentQuestion": {/* InterviewQuestionResponse hoặc null */},
      "fallback": null,
    },
  }
  ```

- **Response lỗi:** `404 NOT_FOUND` · `409` (phiên đã kết thúc).
- **Liên quan:** [`interview.service.ts`](../../src/server/src/services/interview.service.ts) `resumeInterview()`.

---

### 6. Lấy Danh sách Phiên (Session History — SPEC_DB-03)

- **Endpoint:** `GET /api/v1/interviews`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Query params:**
  - `limit` (int, tuỳ chọn, 1–50, mặc định 20).
  - `offset` (int, tuỳ chọn, ≥ 0, mặc định 0).
  - `planId` (UUID, tuỳ chọn) — chỉ trả phiên của plan đó; `planId` không tồn tại hoặc không
    thuộc user hiện tại → `404 NOT_FOUND` (không phân biệt 2 trường hợp, cùng quy tắc #115).

- **Dùng để:** màn "Lịch sử & Tiến độ" tab Phiên kiểm tra (DB-03) — danh sách phiên, mới nhất
  trước. Read-only tuyệt đối: không gọi AI, không ghi `mastery_score`, không sinh nhận xét.

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "7c9e6679-...-uuid",
        "startedAt": "2026-07-26T21:40:00.000Z",
        "endedAt": "2026-07-26T22:06:00.000Z",
        "status": "completed",
        "fallbackMode": false,
        "plan": { "id": "3fa85f64-...-uuid", "name": "Cấu trúc dữ liệu & Giải thuật" },
        "conceptTotal": 3,
        "averageMasteryScore": 0.61,
        "concepts": [
          {
            "conceptId": "b2d3e4f5-...-uuid",
            "name": "Cây nhị phân",
            "masteryBefore": 0.58,
            "masteryAfter": 0.72,
            "isFirstAssessment": false
          },
          {
            "conceptId": "c4e5f6a7-...-uuid",
            "name": "BFS",
            "masteryBefore": null,
            "masteryAfter": 0.68,
            "isFirstAssessment": true
          }
        ]
      }
    ]
  }
  ```

  - `data` là mảng trần (không bọc `items`/`nextCursor`) — danh sách rỗng hợp lệ là `[]` (AF1),
    không phải lỗi. Client tự biết còn trang tiếp theo hay không bằng cách so
    `data.length < limit`.
  - `concepts[].masteryBefore`/`masteryAfter` suy từ `interview_turns` (`sessionMasteryScore()`
    ở `utils/mastery.ts`), **không phải** `Concept.masteryScore` sống — điểm đó có thể đã bị một
    phiên sau đè lên. `masteryBefore` tính trên **toàn bộ lịch sử** của user cho khái niệm đó,
    không chỉ trong trang hiện tại.
  - `isFirstAssessment: true` khi đây là lần đầu tiên khái niệm có điểm thật — lúc đó
    `masteryBefore` luôn là `null` (chưa đo, không phải `0.0` đã đo và sai hoàn toàn — UC-Overview
    §5.3). FE hiển thị nhãn "lần đầu" thay vì mức tăng/giảm cho case này.
  - Khái niệm đã bị xoá (re-analysis, SP-05) giữa hai phiên bị bỏ qua khỏi `concepts`, không có
    placeholder.
  - `conceptTotal` là số khái niệm trong hàng đợi của phiên (không phải tiến độ "X/Y") — muốn
    tiến độ chi tiết của một phiên cụ thể thì gọi `GET /interviews/:id`.
  - `averageMasteryScore` chỉ là tín hiệu phụ (theo SPEC_DB-03): trộn khái niệm mới học lần đầu
    với khái niệm đã ôn nhiều lần nên ít phản ánh giá trị thật của phiên — tín hiệu chính là
    `concepts[].masteryBefore/masteryAfter` từng khái niệm.
  - Nhóm theo mốc thời gian (hôm nay/tuần này/tuần trước…) là việc của FE trên chính mảng phẳng
    này — endpoint chỉ trả `startedAt`, không tự dựng nhãn tiếng Việt.
  - Biểu đồ tiến độ theo thời gian (SPEC_DB-03 bước #8) render/nội suy phía FE trên chính các cặp
    before/after đã trả qua nhiều lần gọi — không có data contract riêng.

- **Response lỗi:**

  ```jsonc
  // 404 — planId không tồn tại hoặc không thuộc user hiện tại
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Study plan not found" } }
  ```

- **Liên quan:**
  - [`src/server/src/services/interview-history.service.ts`](../../src/server/src/services/interview-history.service.ts) — logic đầy đủ (`listInterviews`).
  - [`src/server/src/utils/mastery.ts`](../../src/server/src/utils/mastery.ts) — `conceptMasteryForSession()`, thuật toán before/after.

---

### 7. Lấy Kết quả Tổng hợp của một Phiên (Get Session Summary)

- **Endpoint:** `GET /api/v1/interviews/:id/summary`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Path params:**
  - `id` (string, UUID, required): id của `InterviewSession`.

- **Dùng để:** màn kết quả tổng hợp cuối phiên Interview (I6.7 / UC-14) — hiển thị bảng điểm
  từng khái niệm, nhận xét bằng ngôn ngữ tự nhiên do AI viết, và danh sách khái niệm mà
  Traceback (AE-08 / I7.2) đã đề xuất ôn lại cho phiên tiếp theo.

- **Ràng buộc quan trọng:**
  - Gọi được khi phiên đã `status = 'completed'` **hoặc** `'abandoned'` (SPEC_DB-03) — gọi khi
    phiên còn `active`/`paused` trả về `409`.
  - Phiên `abandoned` (SPEC_DB-03 AF3): `summarize_session` **cố tình không được gọi** — hàng đợi
    chưa chạy hết nên không có gì để tổng hợp. Trả `200` với bảng điểm structured đầy đủ,
    `summary.generatedByAi = false`, `summary.text = null`, **`summary.message = null`** (đây
    không phải lỗi AI — khác với case AI lỗi ở dưới, message không được đặt).
  - `summarize_session` (lời gọi AI thứ 4 và cuối cùng — UC-Overview §5.1) chỉ nhận điểm số và
    verdict **đã tính xong**, không gửi lại tài liệu gốc, và không được phép tự sinh/sửa
    `mastery_score` (C4).
  - Nhận xét AI được sinh **một lần duy nhất** và cache lại — gọi endpoint này lần thứ 2 trở đi
    **không** tốn thêm lượt gọi Gemini nào (risk R01).
  - AI lỗi (chỉ áp dụng cho phiên `completed`) không làm request thất bại: vẫn trả `200` kèm
    bảng điểm structured đầy đủ, `summary.generatedByAi = false`, `summary.text = null`,
    `summary.message` chứa lý do.

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
      "reviewSchedule": [
        {
          "id": "9f1c2b3d-...-uuid",
          "conceptId": "c4e5f6a7-...-uuid",
          "name": "Giới hạn hàm số",
          "reason": "traceback",
          "depth": 1,
          "sourceConceptId": "b2d3e4f5-...-uuid",
          "sourceConceptName": "Đạo hàm riêng",
          "status": "pending",
          "scheduledFor": "2026-08-09T09:35:31.435Z"
        },
        {
          "id": "3a7d8e9f-...-uuid",
          "conceptId": "b2d3e4f5-...-uuid",
          "name": "Đạo hàm riêng",
          "reason": "spaced_repetition",
          "depth": null,
          "sourceConceptId": null,
          "sourceConceptName": null,
          "status": "pending",
          "scheduledFor": "2026-08-21T09:35:31.435Z"
        }
      ]
    }
  }
  ```

  `summary.generatedByAi = false` khi `summarize_session` lỗi (sau retry) hoặc khi phiên kết
  thúc trước khi có khái niệm nào được chấm (UC-12 E1) — khi đó `summary.text` là `null` và
  `summary.message` chứa nguyên văn: _"Không thể tổng hợp nhận xét lúc này."_ Bảng điểm
  (`concepts`) vẫn luôn đầy đủ và chính xác trong mọi trường hợp.

  `concepts[].masteryScore` là điểm **phiên này** tạo ra cho khái niệm — trung bình có trọng số
  `[0.2, 0.3, 0.5]` trên các turn đã chấm của chính phiên `:id`, không phải điểm live hiện tại của
  khái niệm (`Concept.mastery_score` có thể đã bị một phiên sau đè lên). `null` nghĩa là phiên này
  không chấm được khái niệm nào — không phải `0`.

  `reviewSchedule` đọc thẳng từ `ReviewQueueItem` (đã ghi bởi I7.2 khi từng khái niệm kết thúc
  trong phiên này) — không tính lại. Đây là **một hàng đợi duy nhất** chứa cả hai loại, phân biệt
  bằng `reason`:

  - `traceback` — khái niệm nền mà AE-08 chèn lên trước khi khái niệm vừa học bị chấm yếu.
    `depth` là `1`/`2`, `sourceConceptId`/`sourceConceptName` là khái niệm đã kích hoạt truy ngược,
    và `scheduledFor` là **ngay lập tức** (AE-07 bước 6).
  - `spaced_repetition` — dòng lịch ôn mà **mọi** khái niệm chấm xong đều có. `depth`,
    `sourceConceptId` và `sourceConceptName` luôn `null`; `scheduledFor` là ngày quay lại theo mức
    độ ghi nhớ.

  Hai định danh bền của mỗi dòng (#310):

  - `id` là id của chính `ReviewQueueItem` — đây là `:itemId` của
    [`PATCH /review-queue/:itemId`](./review-queue.md), tức nút "Bỏ khỏi lịch" trên màn kết quả gọi
    thẳng bằng giá trị này, **không** phải fetch lại `/review-queue` rồi dò theo `conceptId`.
  - `sourceConceptId` là id của khái niệm đã kích hoạt truy ngược. Gom nhóm khối Traceback theo id
    này chứ đừng theo `sourceConceptName` — hai khái niệm trùng tên sẽ dính vào một nhóm. Vì
    `source_concept_id` là tham chiếu mềm (không FK), khái niệm nguồn bị xoá sẽ cho `sourceConceptId`
    **vẫn có giá trị** trong khi `sourceConceptName` là `null`.

  Thứ tự trả về: nhóm `traceback` trước (theo `depth` tăng dần), rồi nhóm `spaced_repetition`
  (theo `scheduledFor` tăng dần). Client lọc theo `reason` chứ **không** theo vị trí. Khối
  Traceback trên màn kết quả chính là mảng này lọc `reason === 'traceback'`.

  Chỉ rỗng khi phiên không xếp lịch được cho khái niệm nào (ví dụ không khái niệm nào chấm được
  điểm). Phiên không kích hoạt truy ngược **vẫn** trả về đầy đủ các dòng `spaced_repetition`.

- **Response lỗi:**

  ```jsonc
  // 404 — phiên không tồn tại hoặc không thuộc user hiện tại (không phân biệt 2 trường hợp)
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Interview session not found" } }

  // 409 — phiên còn active/paused (chưa completed, chưa abandoned)
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

---

### 8. Neo nguồn trích dẫn của câu hỏi (`sourceCitation` — C5)

> Mô tả **một trường dùng chung**, không phải một endpoint. Ba endpoint mang nó — `POST /`
> (`question`), `GET /:id` (`currentQuestion` và từng phần tử của `turns`), `POST /:id/answers`
> (`nextQuestion`) — đã đặc tả ở mục 1, 2, 3.

- **Dùng để:** đóng ràng buộc cứng **C5 ("AI không bịa")** ngay trên màn phỏng vấn (I6.6) —
  dưới mỗi câu hỏi, sinh viên thấy được câu hỏi đó hỏi về khái niệm lấy ra từ **tài liệu nào,
  trang nào**. Neo nguồn gốc do `extract_concepts` ghi vào `concept_sources` lúc phân tích;
  không phát sinh lời gọi AI nào ⇒ **không ảnh hưởng C4** (vẫn 4 lời gọi cố định).

- **Chụp lúc hỏi, không suy lại lúc đọc** (#240). Mỗi `InterviewTurn` tự giữ ảnh chụp neo nguồn
  tại thời điểm câu hỏi được đặt (`source_document_id` / `source_page_from` / `source_page_to`),
  và endpoint đọc lại đúng ảnh chụp đó. Suy lại neo _hiện tại_ của khái niệm lúc đọc sẽ gắn tài
  liệu mới vào câu hỏi cũ mỗi khi sinh viên tạm dừng phiên (AE-03) rồi đổi tài liệu — SP-04
  update hàng `Document` **tại chỗ** (giữ nguyên `id`), nên trích dẫn sai kiểu đó trông hoàn
  toàn hợp lệ, không có dấu hiệu nào để phát hiện.

- **Shape:**

  ```jsonc
  {
    "turnId": "5f1c2d3e-...-uuid",
    "conceptId": "b2d3e4f5-...-uuid",
    "conceptName": "Đạo hàm riêng",
    "turnIndex": 1,
    "questionText": "Đạo hàm riêng của f theo x nghĩa là gì?",
    "questionType": "recall",
    "source": "ai",
    "sourceCitation": {
      "documentId": "9a8b7c6d-...-uuid",
      "filename": "giai-tich-1.pdf",
      "kind": "pdf", // pdf | image | text
      "pageFrom": 7,
      "pageTo": 7,
    },
  }
  ```

- **Khi nào là `null`** — **tất cả đều là trạng thái hợp lệ**, không phải lỗi; client chỉ việc
  không render khối trích dẫn:
  - **Khái niệm không có neo:** khái niệm thêm thủ công (#172), hoặc `extract_concepts` không
    trả về cả trang lẫn trích đoạn cho nó.
  - **Lượt cũ hơn cơ chế chụp:** lượt đã có trong DB trước migration `#240` không mang ảnh chụp
    và **không được backfill** — đoán ngược trích dẫn cho chúng đúng là kiểu bịa mà C5 cấm.
  - **Tài liệu đã bị xoá:** `source_document_id` là tham chiếu, **không phải FK** (cùng khuôn
    `ReviewQueueItem.sourceConceptId`) — xoá tài liệu không được kéo theo lịch sử phỏng vấn, nên
    id trỏ vào khoảng không là chuyện bình thường.
  - **Tệp bị thay sau khi hỏi:** `documents.updated_at > interview_turns.asked_at`. `documentId`
    sống sót qua SP-04 đổi tài liệu nhưng nội dung thì không — trả trích dẫn theo id đó là chỉ
    vào một tệp khác.
  - **Chế độ Flashcard (AE-05):** _không_ còn tự động là `null` như ở #239. Câu hỏi cache **có**
    trích dẫn khi hàng cache còn khớp tài liệu — cụ thể là khi neo nguồn không mới hơn hàng cache
    (`concept_sources.created_at <= question_cache.generated_at`). Nếu có một lần phân tích lại
    xen vào giữa (neo bị xoá rồi ghi lại **sau** lúc cache được sinh), lượt đó chụp `null`: câu
    hỏi sinh từ tài liệu v1 không được mượn số trang của v2.

- **Lưu ý:**
  - **Không có `excerpt`.** Transcript tối đa 5 khái niệm × 3 lượt; kèm trích đoạn nguyên văn
    (tới 2000 ký tự) cho từng lượt là ~30KB không ai đọc. Trích đoạn nguyên văn thuộc về panel
    chi tiết khái niệm (DB-06) và màn tập trung (FS-04) — nơi chỉ hiển thị một khái niệm.
  - **Không có trường chương/mục.** Model chỉ có `filename` / `pageFrom` / `pageTo`; hiển thị
    đúng thứ đang có (`{filename} · tr. N`). Bịa thêm tên chương là đúng thứ C5 cấm.
  - Khái niệm được neo trong nhiều tài liệu thì lấy neo **đầu tiên theo `createdAt`** — cùng
    thứ tự panel DB-06 (`getConceptDetail`) đang dùng, để một khái niệm chỉ có một trích dẫn.
  - **Trích dẫn là bất biến.** Đã hiện ra rồi thì một lượt cũ không bao giờ đổi sang tài liệu
    khác hay số trang khác; nó chỉ có thể chuyển thành `null` khi tệp bị thay hoặc bị xoá.

- **Liên quan:**
  - [`src/server/src/utils/question-citation.ts`](../../src/server/src/utils/question-citation.ts) — quy tắc chụp/ẩn neo nguồn (pure, không đụng DB).
  - [`src/server/src/services/interview.service.ts`](../../src/server/src/services/interview.service.ts) — `askQuestion()` / `askCachedQuestion()` chụp neo lúc hỏi, `buildView()` tra `documents` theo ảnh chụp của các lượt.
  - [`src/server/src/utils/concept-source.ts`](../../src/server/src/utils/concept-source.ts) — nơi neo nguồn được ghi ra lúc phân tích tài liệu.

---

### 9. Kết thúc phiên sớm và chấm phần đã làm (Abandon Session)

- **Endpoint:** `POST /api/v1/interviews/:id/abandon`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Path params:**
  - `id` (string, UUID, required): id của `InterviewSession`.
- **Body:** _không có._ Việc phải làm gì với khái niệm đang dở là quy tắc của endpoint, không
  phải lựa chọn của client.

- **Dùng để:** đóng một phiên `active` / `paused` mà **vẫn tính** phần sinh viên đã trả lời —
  `SPEC_DB-03` AF2 gọi hành động này là _"Kết thúc và chấm phần đã làm"_. Hai nơi gọi:
  - Dialog AE-01 khi `POST /interviews` trả `created = false` (đã có phiên dở trên plan đó):
    FE gọi abandon rồi gọi lại `POST /interviews` để mở phiên mới.
  - Màn Lịch sử phiên (DB-03, Sprint 5): kết thúc phiên **mà không** mở phiên mới.

- **Ràng buộc quan trọng:**
  - **Chấm, không vứt.** Khái niệm đang dở đi qua đúng `finalizeConceptResult` (I7.2) như một
    khái niệm kết thúc bình thường: ghi `mastery_score`, xếp lịch ôn, và **vẫn chạy truy ngược
    AE-07**. Lượt sinh viên đã trả lời là bằng chứng thật.
  - **Trọng số chuẩn hoá lại** trên số lượt thực có (`SPEC_DB-03` AF3): hai lượt dùng
    `[0.2, 0.3] → [0.4, 0.6]`, một lượt dùng `[1.0]`. Kết thúc sớm không bị phạt oan.
  - **Khái niệm không có lượt nào chấm được** ⇒ `conceptCompleted = null`, `mastery_score` và
    `last_tested_at` cũ **giữ nguyên**, và không có hàng `ReviewQueueItem` nào được ghi — chưa
    có bằng chứng gì để hành động.
  - **Không gọi `summarize_session`** (`SPEC_DB-03` AF3): phiên `abandoned` giữ
    `summary_text = NULL`, màn lịch sử bỏ hẳn khối nhận xét thay vì hiện khung trống ⇒ kết thúc
    sớm **không tốn thêm lời gọi AI** (C4).
  - **Idempotent:** gọi lại trên phiên đã `abandoned` trả về trạng thái hiện tại với
    `conceptCompleted = null`, **không** chấm lần hai.
  - Phiên đã `completed` ⇒ `409`, không được lật ngược về `abandoned`.

- **Response thành công (HTTP 200 OK):**

  ```jsonc
  {
    "success": true,
    "data": {
      "session": {
        "id": "7c9e6679-...-uuid",
        "planId": "3fa85f64-...-uuid",
        "status": "abandoned",
        "fallbackMode": false,
        "startedAt": "2026-08-05T14:02:11.000Z",
        "endedAt": "2026-08-05T14:10:48.000Z",
        "currentConcept": null,
        "progress": {
          "conceptIndex": 1,
          "conceptTotal": 3,
          "completedConcepts": 1,
          "turnIndex": null,
          "maxTurnsPerConcept": 3,
        },
      },
      // Cùng shape `conceptCompleted` của POST /:id/answers — null nếu không chấm được gì.
      "conceptCompleted": {
        "conceptId": "b2d3e4f5-...-uuid",
        "conceptName": "Danh sách liên kết",
        "masteryScore": 0.8,
        "reviewInDays": 5,
        "scheduledFor": "2026-08-10T14:10:48.000Z",
        "prerequisites": [],
        "tracebackSkipReason": "mastered",
      },
    },
  }
  ```

  Khái niệm vừa chấm được tính là **đã hoàn thành**: `progress.completedConcepts` cộng thêm 1 và
  `currentConcept` chuyển sang `null` / khái niệm kế trong hàng đợi. Phiên đã kết thúc nên client
  không hiển thị "đang kiểm tra" nữa.

- **Response lỗi:**

  ```jsonc
  // 404 — phiên không tồn tại hoặc không thuộc user hiện tại (không phân biệt 2 trường hợp)
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Interview session not found" } }

  // 409 — phiên đã completed
  {
    "success": false,
    "error": {
      "code": "SESSION_ENDED",
      "message": "This interview session has already ended"
    }
  }
  ```

- **Vì sao là endpoint riêng, không phải `force: true` trên `POST /interviews`:** DB-03 cần kết
  thúc phiên mà **không** mở phiên mới. Gộp vào cờ của `POST /interviews` sẽ trói hai việc vào
  nhau và DB-03 không dùng lại được. FE ở AE-01 gọi 2 lượt (abandon → create) là chấp nhận được.

- **Liên quan:**
  - [`src/server/src/services/interview.service.ts`](../../src/server/src/services/interview.service.ts) — `abandonInterview()`.
  - [`src/server/src/services/concept-result.service.ts`](../../src/server/src/services/concept-result.service.ts) (I7.2) — nơi ghi `mastery_score` / `ReviewQueueItem` và chạy truy ngược.
  - [`src/server/src/utils/mastery.ts`](../../src/server/src/utils/mastery.ts) — `gradedTurnScores()` + `calculateMasteryScore()` (chuẩn hoá trọng số).
  - `docs/requirements/use-case_specification/SPEC_DB-03_LichSuPhongVan.md` AF2 + AF3.
