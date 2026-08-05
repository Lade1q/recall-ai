# Đặc tả API Interview (API Endpoints Spec)

Tất cả các API dưới đây có tiền tố `/api/v1/interviews` và yêu cầu xác thực người dùng qua
Header `Authorization: Bearer <TOKEN>`.

> Tài liệu này hiện mô tả endpoint **AE-09 (I6.5) — Kết quả tổng hợp cuối phiên** (§1), trường
> **`sourceCitation`** dùng chung cho các endpoint hỏi–đáp (§2), và endpoint **kết thúc phiên
> sớm** (§3). Bản đặc tả đầy đủ của các endpoint còn lại (`POST /`, `GET /:id`,
> `POST /:id/answers`, `.../pause`, `.../resume` — I6.3/#115, AE-05/#116) sẽ được bổ sung khi
> I9.2 (#128) tổng hợp toàn bộ API spec.

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

---

### 2. Neo nguồn trích dẫn của câu hỏi (`sourceCitation` — C5)

> Mô tả **một trường dùng chung**, không phải một endpoint. Ba endpoint mang nó — `POST /`
> (`question`), `GET /:id` (`currentQuestion` và từng phần tử của `turns`), `POST /:id/answers`
> (`nextQuestion`) — sẽ được đặc tả đầy đủ ở I9.2 (#128).

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

### 3. Kết thúc phiên sớm và chấm phần đã làm (Abandon Session)

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
