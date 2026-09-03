# Đặc tả API Study Plans (API Endpoints Spec)

Tất cả các API quản lý Study Plan đều có tiền tố `/api/v1/plans` và yêu cầu xác thực người dùng qua Header `Authorization: Bearer <TOKEN>`.

---

### 1. Tạo Study Plan Mới (Create Study Plan + File Upload)

- **Endpoint:** `POST /api/v1/plans`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** `multipart/form-data`
- **Request Fields:**
  - `name` (string, required): Tên kế hoạch học tập (1 - 255 ký tự).
  - `deadline` (string, required): Thời hạn học tập dưới dạng ISO Date (phải là ngày trong tương lai).
  - `files` (file upload, **lặp lại được**): Cả bộ tài liệu của môn học. Hỗ trợ `.pdf`, `.txt`, `.png`, `.jpg`; **tối đa 8 tệp, mỗi tệp 10 MB, tổng 25 MB**. 🔴 **Mỗi tệp là MỘT chủ đề** trên tầng trên của đồ thị — không cắt chủ đề theo heading bên trong tệp.
  - `file` (file upload): Tên field CŨ, vẫn nhận đúng một tệp. Giữ lại để một client chưa deploy lại không 400; client mới dùng `files`. Hai field được đếm CHUNG cho trần 8 tệp.
  - `content` (string): Text dán trực tiếp thay cho việc upload file (UC-02 A3 "Dán text", tối đa 10,000 ký tự). Server tự lưu thành một Document `kind: "text"` (`pageCount: null`) và chạy đúng pipeline phân tích text hiện có — không cần thay đổi gì phía `extractConcepts`.

  **Bắt buộc chọn đúng một trong hai:** tệp (ở `files` và/hoặc `file`) hoặc `content`. Thiếu cả hai → `FILE_REQUIRED`; có cả hai → `CONTENT_OR_FILE_CONFLICT` (HTTP 400). Quá 8 tệp → `TOO_MANY_FILES`; tổng quá 25 MB → `TOTAL_SIZE_EXCEEDED`. Một tệp hỏng (PDF mã hoá, quá cỡ) làm **cả lô** bị từ chối trước khi ghi bất cứ gì, và message kèm TÊN TỆP — bỏ im lặng một tệp trong năm nghĩa là kế hoạch thiếu một phần giáo trình mà không gì trên màn hình nói vậy.

  Vì luôn có ít nhất một trong hai, **`POST /plans` luôn tạo ≥ 1 Document** cho plan mới — kịch bản "tạo plan chỉ bằng gõ concept, không file/text" (0 Document, không có `page_count`) không được mở qua endpoint này (Issue #172 chỉ phục vụ AF2 + dán text, xem mục 4). Đây là phát biểu về **endpoint này**, không phải bất biến toàn hệ thống: seed data và các đường tạo Plan khác vẫn có thể để plan không Document (xem guard `NO_MATERIAL` ở luồng Interview, #272/#303).

  ⚠️ **`TOO_MANY_FILES` đến từ hai chỗ với cùng một nghĩa** (đo 03/09): controller đếm cả hai field cộng lại, và middleware map `LIMIT_UNEXPECTED_FILE` khi `err.field ∈ {files, file}`. Multer chạm `maxCount` của từng field TRƯỚC bộ đếm tổng của busboy, nên `LIMIT_FILE_COUNT` **không bao giờ nổ** trên route này — `err.field` mới là thứ phân biệt "tràn field" với "tên field lạ".

- **Response thành công (HTTP 201 Created):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Kế hoạch ôn thi Giải tích",
        "deadline": "2026-08-30T00:00:00.000Z",
        "status": "draft"
      },
      "message": "Plan created"
    }
  }
  ```

- **Lỗi thiếu cả file lẫn content (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "FILE_REQUIRED",
      "message": "File or pasted content is required"
    }
  }
  ```

- **Lỗi gửi cả file lẫn content cùng lúc (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "CONTENT_OR_FILE_CONFLICT",
      "message": "Provide either a file upload or pasted content, not both"
    }
  }
  ```

- **Lỗi vượt quá dung lượng 10MB (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "FILE_TOO_LARGE",
      "message": "File size exceeds maximum limit of 10MB"
    }
  }
  ```

- **Lỗi định dạng file không cho phép (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_FILE_TYPE",
      "message": "File format not allowed. Accepted: .pdf, .txt, .png, .jpg"
    }
  }
  ```

- **Lỗi Validation Body (HTTP 400 Bad Request):**
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid input data",
      "details": [ ... ]
    }
  }
  ```

#### 1.1. Luồng Phân tích Bất đồng bộ (Asynchronous Analysis Flow)

Response 201 ở trên trả về **ngay lập tức** với `status: "draft"` và `concepts`/`edges` rỗng — việc trích xuất khái niệm **không** nằm trong vòng đời của request tạo Plan mà chạy ở nền:

1. Server lưu file, tạo `StudyPlan` (`status: "draft"`) và một `AnalysisJob` (`status: "pending"`) trong cùng transaction, rồi trả response ngay cho client.
2. Ngay sau đó, server gọi Gemini API (schema `extract_concepts`) để trích xuất danh sách khái niệm và quan hệ tiên quyết từ file đã upload. Nếu Gemini lỗi định dạng JSON, hệ thống tự retry tối đa 2 lần.
3. Khi có kết quả, hệ thống validate đồ thị là DAG (tự động loại cạnh gây chu trình nếu phát hiện, đánh dấu `dagAutoFixed: true`), lưu `Concept`/`ConceptEdge`, và cập nhật `StudyPlan.status` thành `"active"`.
4. Nếu Gemini vẫn lỗi sau khi hết số lần retry (sai JSON, hết quota, timeout...), `AnalysisJob.status` chuyển thành `"failed"` — **`StudyPlan.status` vẫn giữ nguyên `"draft"`** (Plan không có đồ thị hợp lệ để dùng), nhưng response của `GET /api/v1/plans/:id` lộ rõ trạng thái này qua field `analysisStatus` (xem mục 3).

**Client cần poll `GET /api/v1/plans/:id`** để biết khi phân tích hoàn tất — khuyến nghị polling mỗi 2-3 giây, dừng khi `analysisStatus` là `"done"` hoặc `"failed"`.

---

### 2. Danh sách Study Plans của User (List Study Plans)

- **Endpoint:** `GET /api/v1/plans`
- **Xác thực:** ✅ Yêu cầu Bearer Token

- **Dùng để:** Dựng màn hình Danh sách kế hoạch (SP-03) — mỗi phần tử đủ dữ liệu để vẽ một thẻ kế hoạch mà không cần gọi thêm `GET /plans/:id`.

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "plans": [
        {
          "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
          "name": "Kế hoạch ôn thi Giải tích",
          "deadline": "2026-08-30T00:00:00.000Z",
          "status": "draft",
          "conceptCount": 0,
          "masteryDistribution": { "strong": 0, "learning": 0, "weak": 0, "untested": 0 },
          "reviewQueueConceptCount": 0,
          "analysisStatus": "processing",
          "analysisStartedAt": "2026-07-20T21:00:12.000Z",
          "document": { "filename": "Chuong-4-Kiem-thu.pdf", "pageCount": 28 },
          "documentCount": 1,
          "createdAt": "2026-07-20T21:00:00.000Z"
        }
      ]
    }
  }
  ```

- **`masteryDistribution`** đếm concept theo 4 mức, tổng luôn bằng `conceptCount`. Ngưỡng: `strong ≥ 0.8`, `0.6 ≤ learning < 0.8`, `weak < 0.6`, `untested` là `mastery_score = null`. **`untested` không gộp vào `weak`**: "chưa hỏi bao giờ" khác hẳn "hỏi rồi và sai". Concept `deprecated` (do re-analyze loại bỏ, mục 6) không được đếm.

- **`reviewQueueConceptCount`** (#232) là dòng chân thẻ kế hoạch **"Hàng đợi ôn · N khái niệm"**
  (mockup `screen-plans.html`, màn #225): số **khái niệm** của plan còn nằm trên lịch ôn. Cùng bộ
  lọc với hàng đợi thật (`OFF_SCHEDULE_STATUSES` — loại `skipped` + `done`). Plan chưa từng có
  hàng đợi trả `0`, **không** phải `null`: "không còn khái niệm nào chờ ôn" là một sự thật, không
  phải một giá trị thiếu. Lấy bằng **một** truy vấn `groupBy` cho cả lưới thẻ, không phải mỗi thẻ
  một request.

  ⚠️ **Đếm khái niệm, không đếm dòng** — khác chữ "số mục trong hàng đợi" ở AC gốc của #232, và
  đây là lý do: `GET /review-queue` gộp mỗi khái niệm về **một** mục (mỗi phiên chấm xong lại đẻ
  một `ReviewQueueItem` cho cùng khái niệm — xem `docs/api/review-queue.md`, mục "Một mục / một
  khái niệm"). Đếm dòng thì con số ở chân thẻ sẽ lớn hơn số dòng mà chính màn hình nó dẫn tới
  hiển thị được: một plan trên DB dev có 8 dòng nhưng chỉ 3 khái niệm. AC yêu cầu "đếm đúng cái
  lưới thẻ hiển thị" — sau khi gộp, thứ đó là khái niệm. Bề mặt này **không** dựng danh sách
  fallback A3 như `/review-queue`: fallback là gợi ý tạm, không phải mục đã lên lịch.

- **`analysisStatus` / `analysisStartedAt`** lấy từ `AnalysisJob` gần nhất của Plan, cùng quy tắc "mới nhất theo `createdAt`" như mục 3; `null` khi Plan chưa có job nào. `analysisStartedAt` để client hiển thị đồng hồ đếm thời gian đã chạy.

- **`document`** là tài liệu **ĐẦU TIÊN** của Plan (`createdAt` cũ nhất), `null` nếu chưa có. `pageCount` là `null` với tài liệu không phân trang (text/ảnh).
  ⚠️ Trước khi một kế hoạch có nhiều tệp, trường này lấy `desc, take: 1` và tài liệu ấy được mô tả là "mới nhất". Đổi sang **cũ nhất** là cố ý: `createdAt asc` là tiêu chí đứt điểm mà cả tầng chủ đề dựng trên (neo `concept_sources`, chủ đề của khái niệm trùng tên, tệp mà phỏng vấn đọc), và thẻ kế hoạch chỉ ra vẻ đúng chừng nào chỉ có một tệp. Với kế hoạch nhiều tệp, con số cần đọc là `documentCount`, không phải cái tên này.

- **`documentCount`** là số tài liệu của Plan — nguồn của dòng "**{n} chủ đề**" trên thẻ kế hoạch, vì **một tệp = một chủ đề**. Bằng `1` cho mọi kế hoạch cũ, và bằng `0` cho kế hoạch dán văn bản thất bại trước khi tạo được `Document`.

---

### 3. Lấy Chi tiết Study Plan (Get Study Plan Details)

- **Endpoint:** `GET /api/v1/plans/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Dùng để:** Poll tiến trình phân tích (xem mục 1.1) — gọi lặp lại cho tới khi đồ thị khái niệm xuất hiện.

- **`data.analysisStatus`** phản ánh trạng thái xử lý thực tế của `AnalysisJob` gần nhất (bản ghi mới nhất theo `createdAt` — quan trọng khi Plan có nhiều job do re-analyze/SP-05), tách biệt với `data.status` (vòng đời của Plan). Giá trị: `"pending"` | `"processing"` | `"done"` | `"failed"` | `null` (chưa có job nào — trường hợp hiếm).

- **Response khi đang chờ xử lý (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "userId": "u1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "name": "Kế hoạch ôn thi Giải tích",
      "deadline": "2026-08-30T00:00:00.000Z",
      "status": "draft",
      "analysisStatus": "pending",
      "analysisPhase": null,
      "analysisDocumentsTotal": 3,
      "analysisDocumentsDone": 0,
      "dagAutoFixed": false,
      "tracebackEnabled": true,
      "createdAt": "2026-07-20T21:00:00.000Z",
      "updatedAt": "2026-07-20T21:00:00.000Z",
      "concepts": [],
      "edges": []
    }
  }
  ```

  `analysisStatus` chuyển `"pending"` → `"processing"` trong lúc gọi Gemini, rồi tới đích `"done"` (xem ví dụ dưới) hoặc `"failed"` (JSON body giống hệt ví dụ trên, chỉ khác `analysisStatus: "failed"` — `status` vẫn giữ `"draft"` vì Plan không có đồ thị khái niệm hợp lệ để dùng). FE nên polling tới khi `analysisStatus` là `"done"` hoặc `"failed"`, và hiển thị nút "Thử lại" khi gặp `"failed"`.

- **Response khi phân tích hoàn tất (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "userId": "u1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "name": "Kế hoạch ôn thi Giải tích",
      "deadline": "2026-08-30T00:00:00.000Z",
      "status": "active",
      "analysisStatus": "done",
      "analysisPhase": null,
      "analysisDocumentsTotal": 3,
      "analysisDocumentsDone": 3,
      "dagAutoFixed": false,
      "tracebackEnabled": true,
      "createdAt": "2026-07-20T21:00:00.000Z",
      "updatedAt": "2026-07-20T21:00:05.000Z",
      "concepts": [
        {
          "id": "a1...",
          "name": "Giới hạn (Limit)",
          "difficulty": 2,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "primaryDocumentId": "d1...",
          "createdAt": "2026-07-20T21:00:05.000Z"
        },
        {
          "id": "a2...",
          "name": "Đạo hàm (Derivative)",
          "difficulty": 3,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "primaryDocumentId": "d1...",
          "createdAt": "2026-07-20T21:00:05.000Z"
        },
        {
          "id": "a3...",
          "name": "Tích phân (Integral)",
          "difficulty": 4,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "primaryDocumentId": "d2...",
          "createdAt": "2026-07-20T21:00:05.000Z"
        }
      ],
      "edges": [
        { "id": "e1...", "fromConceptId": "a1...", "toConceptId": "a2..." },
        { "id": "e2...", "fromConceptId": "a2...", "toConceptId": "a3..." }
      ],
      "documents": [
        {
          "id": "d1...",
          "filename": "LN02 - Gioi han va dao ham.pdf",
          "pageCount": 55,
          "kind": "pdf"
        },
        { "id": "d2...", "filename": "LN04 - Tich phan.pdf", "pageCount": 36, "kind": "pdf" }
      ],
      "documentEdges": [{ "id": "t1...", "fromDocumentId": "d1...", "toDocumentId": "d2..." }]
    }
  }
  ```

  - `dagAutoFixed: true` nếu Gemini trả về đồ thị chứa chu trình và hệ thống đã tự loại cạnh gây lỗi.
  - `concepts[].masteryScore` luôn là `null` cho tới khi user hoàn thành phiên Interview đầu tiên trên khái niệm đó (Sprint 4 — AI Examiner).
  - `documents` là **tầng chủ đề** — một tệp là một chủ đề, `createdAt` cũ nhất trước. Thứ tự này không trang trí: nó là tiêu chí đứt điểm cho chủ đề của khái niệm trùng tên, và `documents[0]` là tệp mà phiên phỏng vấn đọc khi khái niệm chưa có chủ đề.
  - `documentEdges` là thứ tự nên học **giữa các tài liệu**, do pha 2 suy ra. Có thể là `[]` khi kế hoạch có nhiều tệp — nghĩa là _"chưa biết thứ tự"_, và client vẫn phải vẽ đủ N ô chủ đề rời. 🔴 **Điều kiện rẽ về đồ thị phẳng là `documents.length <= 1`, KHÔNG phải `documentEdges.length === 0`** — nhầm chỗ này là giấu mất việc kế hoạch có nhiều tệp.
    🔴 **Mọi hàng ở đây đều là AI suy**, nên UI vẽ toàn bộ tầng này bằng nét đứt. Không có cột `source` để phân biệt: pha 1 chỉ nhìn MỘT tệp nên về nguyên tắc không thể sinh cạnh giữa hai tệp, và một cột mà mọi hàng cùng giá trị không khoá bất biến nào. Guard tương ứng nằm ở tầng code — pha 1 vẫn bị JSON Schema **ép** trả `topic_edges` (`.catch([])` không làm trường thành optional), và lượt chạy thật đầu tiên 03/09 đã vứt **22 hàng** nó bịa ra.
  - `analysisPhase` là bước con bên trong một job `processing`: `"sending_to_ai"` | `"extracting"` | `"linking"` | `"validating"` | `null`. `"linking"` là pha 2 — một lời gọi mạng ~6–20s, tách riêng chứ không gộp vào `validating`, nếu không panel tiến độ nói dối về việc đang chờ cái gì.
  - `analysisDocumentsTotal` / `analysisDocumentsDone` nuôi dòng "Đang đọc tệp k/N". `null` với job tạo trước khi có hai cột này.
  - `concepts[].primaryDocumentId` là **chủ đề** của khái niệm — id một phần tử của `documents`, hoặc `null`. Khác `concept_sources` (N:M, mang excerpt/trang, phục vụ trích dẫn C5): cột này là N:1 và phục vụ **điều hướng**. Khái niệm dạy ở hai tệp có hai hàng source nhưng chỉ nằm dưới **một** chủ đề — tệp `createdAt` sớm nhất. `null` gom vào rổ "Chưa xếp chủ đề" trên UI; nguồn `null` có thật là khái niệm người dùng tự thêm ở màn kiểm chứng mà client quên gửi `primaryDocumentId` (mục 4).
  - `concepts` chỉ trả `status = 'active'`. Concept `deprecated` (re-analyze loại bỏ, mục 6) vẫn còn trong DB làm tombstone giữ lịch sử — hồi sinh lại nếu re-analyze sau này gặp lại đúng tên — nhưng không xuất hiện ở đây, vì đây là đồ thị hiện tại của Plan chứ không phải lịch sử chỉnh sửa.

- **Lỗi ID không đúng định dạng UUID (HTTP 400 Bad Request):**

  `id` trong `StudyPlan` là kiểu `@db.Uuid` trong Prisma — mọi route `/plans/:id` (kể cả các route graph, retry, reanalyze, đổi tài liệu, archive, delete) đều validate `id` là UUID hợp lệ trước khi chạm DB:

  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid input data",
      "details": [ ... ]
    }
  }
  ```

- **Lỗi không tìm thấy Plan (HTTP 404 Not Found):**

  ```json
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Study plan not found"
    }
  }
  ```

- **Lỗi truy cập Plan người khác (HTTP 403 Forbidden):**
  ```json
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "Access denied to this study plan"
    }
  }
  ```

---

### 4. Lưu Đồ thị Khái niệm (Save Concept Graph)

- **Endpoint:** `PUT /api/v1/plans/:id/graph`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Dùng để:** Lưu đồ thị mà Sinh viên đã review/chỉnh sửa trong Edit mode (UC Spec SP-01, basic flow bước 8-9) — ví dụ nút "Confirm Graph" ở [I3.5](https://github.com/Lade1q/planning-ai/issues/79). Cũng dùng cho việc thêm/xóa 1 edge/node đơn lẻ trong lúc chỉnh sửa: FE gửi lại **toàn bộ** trạng thái canvas hiện tại mỗi lần.

  **Đây cũng chính là API cho SP-01 AF2** (Issue #172): "AI thất bại 3 lần → tự nhập khái niệm và bắt đầu ngay" (UC-02, các trường hợp E1/E4). Endpoint này không có ràng buộc nào về `analysisStatus`, nên khi `AnalysisJob` gần nhất `failed` (plan vẫn `draft`, `concepts: []`), FE có thể gọi thẳng endpoint này với các concept do người dùng gõ tay + `confirm: true` — không cần, và không có, một endpoint `POST /plans/:id/concepts` riêng. Concept tên mới tự nhận `source: "manual"` (mục "Semantics" bên dưới) và không tạo `ConceptSourceRef` nào (không có trang/đoạn trích để neo vào — concept do người dùng gõ, không trích từ tài liệu).

- **Semantics:** Đây là **full replace**, không phải patch từng phần. Body chứa toàn bộ tập concepts + edges mong muốn của đồ thị:
  - Concept được khớp theo **tên** (`name`) với concept đã có trong DB — tên trùng thì giữ nguyên `id`, `masteryScore` và lịch sử; tên biến mất thì bị xóa (cascade xóa các edge liên quan); tên mới thì được tạo với `source: "manual"`.
  - `edges[].from` / `edges[].to` tham chiếu tới `concepts[].name` (không phải id) — vì FE có thể vừa thêm 1 node mới chưa có id từ server.
  - `concepts[].primaryDocumentId` (uuid, optional): chủ đề của một concept **MỚI**. Chỉ đọc cho tên plan chưa có; concept đã tồn tại luôn giữ chủ đề cũ, nên gửi lại toàn bộ đồ thị không thể xáo trộn tầng chủ đề. Thiếu trường này thì concept người dùng thêm khi đang mở một chủ đề sẽ rơi về `NULL` và biến khỏi đúng chủ đề vừa thêm nó vào — im lặng, vì nó chỉ hiện lại ở rổ "Chưa xếp chủ đề".
  - `documentEdges` (array, **optional**): tầng chủ đề — thứ tự nên học giữa các TÀI LIỆU, `{from, to}` là **document id**.
    🔴 **Vắng mặt ≠ rỗng.** Không gửi trường này nghĩa là _"đừng đụng vào tầng chủ đề"_; gửi `[]` nghĩa là _"người dùng đã bỏ hết mũi tên"_. Phân biệt này là toàn bộ tính an toàn của trường: trình soạn thảo gửi lại đồ thị khái niệm sau **mỗi** lần sửa để kiểm DAG trực tiếp và không biết gì về chủ đề — mặc định `[]` sẽ xoá sạch thứ tự học giữa các tài liệu ngay ở nét sửa đầu tiên, trong lúc các mũi tên đó thậm chí không ở trên màn hình.
    Cạnh trỏ tài liệu không thuộc plan, tự trỏ, hoặc trùng cặp thì bị **bỏ lặng lẽ** (giống `primaryDocumentId` lạ) — một mũi tên cũ sót lại không được chặn cả thao tác xác nhận. Nhưng **chu trình thì BỊ TỪ CHỐI** (`DAG_CYCLE`, 409): đó là hai khẳng định người dùng cố ý đưa ra, bỏ bớt một nửa sẽ giấu mất nửa nào bị vứt.

- **DAG validation (I3.3):** Trước khi ghi bất cứ gì vào DB, server chạy Kahn's Algorithm trên đồ thị gửi lên. Nếu tạo thành chu trình (kể cả self-loop) → **toàn bộ request bị từ chối**, DB giữ nguyên trạng thái cũ (không tự động loại cạnh như luồng AI extraction ở mục 1.1 — theo SDP §4.3.2 rủi ro R03: _"edges causing cycles are rejected with user notification and logged"_).

- **Request body:**

  ```json
  {
    "concepts": [
      { "name": "Giới hạn (Limit)", "difficulty": 2 },
      { "name": "Đạo hàm (Derivative)", "difficulty": 3 }
    ],
    "edges": [{ "from": "Giới hạn (Limit)", "to": "Đạo hàm (Derivative)" }]
  }
  ```

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "status": "active",
      "dagAutoFixed": false,
      "concepts": [
        {
          "id": "a1...",
          "name": "Giới hạn (Limit)",
          "difficulty": 2,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "createdAt": "2026-07-20T21:00:05.000Z"
        }
      ],
      "edges": [{ "id": "e1...", "fromConceptId": "a1...", "toConceptId": "a2..." }]
    }
  }
  ```

  - `status` chuyển từ `"draft"` sang `"active"` nếu đây là lần confirm đầu tiên (đồ thị có ít nhất 1 concept).

- **Lỗi tạo chu trình (HTTP 409 Conflict):**

  ```json
  {
    "success": false,
    "error": {
      "code": "DAG_CYCLE",
      "message": "Adding this edge would create a cycle"
    }
  }
  ```

- **Lỗi edge tham chiếu concept không tồn tại trong body (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_EDGE_REFERENCE",
      "message": "Edge references a concept not in the graph: \"A\" -> \"Ghost\""
    }
  }
  ```

- **Lỗi tên concept trùng lặp trong body (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "DUPLICATE_CONCEPT",
      "message": "Duplicate concept name: \"A\""
    }
  }
  ```

- **Lỗi kế hoạch có NHIỀU tài liệu (HTTP 409 Conflict), `code: "DOCUMENT_CHANGE_AMBIGUOUS"`:**

  Endpoint này **ghi đè tại chỗ** đúng một hàng `Document`, nên với kế hoạch nhiều tệp nó không nói được là thay tệp nào. Trước khi có nhiều tệp, `findFirst(asc)` lặng lẽ chọn tệp đầu — tức người dùng gửi tệp thay thế và hệ thống thay **một tệp khác** với tệp họ nghĩ, giữ nguyên id và mọi hàng `concept_sources` của tệp cũ, nên từ đó mọi trích dẫn của chương 2 lại đề tên tệp mới. Nay là 409 tường minh.

  🔴 **Không có đường thay một tệp trong kế hoạch nhiều tài liệu, và đừng chỉ người dùng sang mục 6 hay mục 10** — phân tích lại dùng **đúng bộ tệp cũ**, thêm tài liệu chỉ **cộng thêm**; không cái nào THAY được một tệp. `message` server trả về nói đúng đường duy nhất đang có, và client hiển thị nguyên văn:

  ```json
  {
    "success": false,
    "error": {
      "code": "DOCUMENT_CHANGE_AMBIGUOUS",
      "message": "Kế hoạch này có 3 tài liệu, không xác định được tệp cần thay. Hãy xoá kế hoạch và tạo lại với bộ tài liệu đúng."
    }
  }
  ```

- **Lỗi ID không đúng định dạng UUID (HTTP 400)**, **không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

---

### 5. Retry Phân tích Study Plan (Retry Analysis)

- **Endpoint:** `POST /api/v1/plans/:id/retry`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** Không cần body (empty POST)
- **Dùng để:** Khi `AnalysisJob` gần nhất của Plan ở trạng thái `failed` (do LLM trả sai format, timeout, hết quota sau khi đã retry nội bộ hết `callAiWithRetry`), user có thể retry mà **không cần upload lại file**. Server tạo `AnalysisJob` mới với cùng `fileKey` từ job failed và trigger lại luồng phân tích.

- **Response thành công (HTTP 202 Accepted):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Kế hoạch ôn thi Giải tích",
        "deadline": "2026-08-30T00:00:00.000Z",
        "status": "draft",
        "analysisStatus": "pending"
      },
      "message": "Analysis retry initiated"
    }
  }
  ```

  Sau khi nhận 202, client **tiếp tục polling `GET /api/v1/plans/:id`** (giống luồng tạo plan mới ở mục 1.1) cho tới khi `analysisStatus` là `"done"` hoặc `"failed"`.

- **Lỗi trạng thái không cho phép retry (HTTP 409 Conflict):**

  Khi `AnalysisJob` gần nhất không ở trạng thái `failed` (ví dụ đang `processing`, `pending`, hoặc đã `done`):

  ```json
  {
    "success": false,
    "error": {
      "code": "RETRY_NOT_ALLOWED",
      "message": "Plan analysis is not in a failed state"
    }
  }
  ```

  Hoặc khi đang có job chạy (user nhấn retry 2 lần liên tiếp):

  ```json
  {
    "success": false,
    "error": {
      "code": "RETRY_NOT_ALLOWED",
      "message": "An analysis is already in progress"
    }
  }
  ```

- **Lỗi không có AnalysisJob nào (HTTP 409 Conflict):**

  ```json
  {
    "success": false,
    "error": {
      "code": "RETRY_NOT_ALLOWED",
      "message": "No analysis job found for this plan"
    }
  }
  ```

- **Lỗi Plan không ở trạng thái draft (HTTP 409 Conflict):**

  Khi Plan đã ở trạng thái `active` (đã có concepts), retry sẽ bị từ chối để tránh tạo concepts trùng lặp:

  ```json
  {
    "success": false,
    "error": {
      "code": "RETRY_NOT_ALLOWED",
      "message": "Retry is only allowed for draft plans"
    }
  }
  ```

- **Lỗi thiếu file gốc (HTTP 409 Conflict):**

  Khi `fileKey` của AnalysisJob gốc bị null (edge case hiếm gặp):

  ```json
  {
    "success": false,
    "error": {
      "code": "RETRY_NOT_ALLOWED",
      "message": "Original file key is missing, cannot retry"
    }
  }
  ```

- **Lỗi ID không đúng định dạng UUID (HTTP 400)**, **không tìm thấy Plan (HTTP 404 Not Found)** và **truy cập Plan người khác (HTTP 403 Forbidden)**: giống hệt mục 3.

---

### 6. Phân tích lại Study Plan (Re-analyze) — SP-05

- **Endpoint:** `POST /api/v1/plans/:id/reanalyze`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** Không cần body (empty POST)
- **Dùng để:** Tài liệu được cập nhật, hoặc user muốn dựng lại đồ thị. Server đọc lại `fileKey` của `Document` **mới nhất** (không upload lại) và tạo `AnalysisJob` mới.

**Khác với Retry (mục 5):** retry cứu một Plan `draft` có job `failed`; re-analyze chạy trên Plan **đang `active`**.

**Plan chuyển ngay về `draft`** trong cùng request (không đợi job chạy xong) — cùng một trạng thái mà SP-01 dùng cho "đang phân tích + chờ xác nhận", theo đúng `UC-Overview.md` (SP-05 `<<include>>` SP-02 "Review đồ thị sau re-analyze"). Hệ quả:

- Trong lúc `draft`, plan tạm biến mất khỏi hàng đợi ôn (`GET /review-queue*`) và `/dashboard/stats` — dùng chung hạ tầng "draft chờ xác nhận" đã có từ #265 (mục 4), không phải case mới; review queue trả về thông báo có sẵn thay vì rỗng im lặng.
- Job chạy xong (merge xong theo chính sách bên dưới) **không** tự đưa plan về `active`. User phải xác nhận lại qua `PUT /plans/:id/graph {confirm:true}` (mục 4) thì plan mới hoạt động trở lại — đồ thị đã merge, mastery cũ vẫn còn nguyên trong lúc chờ xác nhận, chỉ là tạm ẩn khỏi lịch ôn.

**Chính sách hợp nhất đồ thị (bắt buộc đọc):** kết quả mới được **merge** vào đồ thị cũ, không ghi đè. Đối chiếu theo tên concept đã chuẩn hoá (bỏ khoảng trắng thừa + không phân biệt hoa/thường):

| Trường hợp                         | Xử lý                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tên có ở cả cũ và mới              | **Giữ nguyên row** → `mastery_score`, lịch sử vấn đáp, review queue còn nguyên. Cập nhật `difficulty` + tên theo bản mới |
| Tên chỉ có ở bản mới               | Tạo concept mới, `mastery_score = null`                                                                                  |
| Tên chỉ có ở bản cũ                | `status = 'deprecated'` — **không xóa**, để không mất lịch sử học                                                        |
| Concept `deprecated` xuất hiện lại | Hồi sinh chính row cũ → điểm cũ quay lại                                                                                 |

Cạnh (`ConceptEdge`) thì **dựng lại toàn bộ** theo bản mới — cạnh không mang dữ liệu học tập nào đáng giữ. `dag_auto_fixed` tính lại như luồng SP-01.

- **Response thành công (HTTP 202 Accepted):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Kế hoạch ôn thi Giải tích",
        "deadline": "2026-08-30T00:00:00.000Z",
        "status": "draft",
        "analysisStatus": "pending"
      },
      "message": "Re-analysis initiated"
    }
  }
  ```

  Client tiếp tục polling `GET /api/v1/plans/:id` như mục 1.1, rồi điều hướng sang màn xác nhận đồ thị (mục 4) khi `analysisStatus` chuyển `done`.

- **Lỗi Plan không ở trạng thái `active` (HTTP 409 Conflict):**

  Plan `draft` thuộc về retry (mục 5); Plan `archived` phải khôi phục (mục 7) trước.

  ```json
  {
    "success": false,
    "error": {
      "code": "REANALYZE_NOT_ALLOWED",
      "message": "Only an active plan can be re-analysed"
    }
  }
  ```

- **Lỗi đang có job chạy (HTTP 409 Conflict):** `message: "An analysis is already in progress"`, cùng `code`. Hai request đồng thời được tuần tự hoá bằng `SELECT ... FOR UPDATE` nên chỉ một job được tạo.

- **Lỗi Plan không có tài liệu nguồn (HTTP 409 Conflict):** `message: "This plan has no source document to re-analyse"`, cùng `code`.

- **Lỗi ID không đúng định dạng UUID (HTTP 400)**, **không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

---

### 7. Lưu trữ / Khôi phục Study Plan (Archive) — SP-04

- **Endpoint:** `PATCH /api/v1/plans/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** `application/json`

- **Request body:**

  ```json
  { "status": "archived" }
  ```

  Chỉ nhận `"archived"` (lưu trữ) hoặc `"active"` (khôi phục). Giá trị `"draft"` bị từ chối — chỉ pipeline phân tích được đặt trạng thái đó; cho client gửi sẽ đẩy một Plan đã có đồ thị đầy đủ kẹt vĩnh viễn ở tab "Chưa xác nhận".

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Kế hoạch ôn thi Giải tích",
        "deadline": "2026-08-30T00:00:00.000Z",
        "status": "archived",
        "updatedAt": "2026-07-31T09:00:00.000Z"
      }
    }
  }
  ```

  Đặt lại đúng trạng thái Plan đang có là **no-op và vẫn trả 200** — nhấn "Lưu trữ" hai lần không sinh lỗi.

- **Lỗi body sai (HTTP 400 Bad Request):** `code: "VALIDATION_ERROR"`.

- **Lỗi Plan đang ở `draft` (HTTP 409 Conflict):**

  ```json
  {
    "success": false,
    "error": {
      "code": "STATUS_TRANSITION_NOT_ALLOWED",
      "message": "An unconfirmed plan cannot be archived — confirm its concept graph, or delete it"
    }
  }
  ```

  Guard này giữ bước kiểm chứng SP-01 bắt buộc (#265): một `draft` chưa xác nhận đồ thị chưa phải "tài liệu đã học xong" để cất — phải xác nhận đồ thị trước (`PUT /plans/:id/graph { "confirm": true }`) hoặc xóa (mục 8); nếu phân tích lỗi thì retry (mục 5). Yêu cầu **khôi phục** (`{ "status": "active" }`) trên một `draft` cũng bị từ chối cùng `code`, với `message: "A draft plan becomes active by confirming its concept graph"`.

- **Lỗi ID không đúng định dạng UUID (HTTP 400)**, **không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

---

### 8. Xóa Study Plan (Delete Study Plan)

- **Endpoint:** `DELETE /api/v1/plans/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token

Xóa vĩnh viễn study plan và tất cả dữ liệu liên quan. Không thể hoàn tác.

- **Response thành công (HTTP 204 No Content):**
  Không có response body.

- **Cascade Delete:** Khi xóa StudyPlan, các dữ liệu sau bị xóa theo:
  - Tất cả Concepts + ConceptEdges (đồ thị kiến thức)
  - Tất cả AnalysisJobs (lịch sử phân tích — xóa thủ công, không có FK)
  - Tất cả InterviewSessions + InterviewTurns (lịch sử vấn đáp)
  - Tất cả FocusSessions (lịch sử Pomodoro)
  - Tất cả ReviewQueueItems (hàng đợi ôn tập)
  - Tất cả Documents + ConceptSourceRefs (tài liệu nguồn)
  - Tất cả QuestionCaches (cache câu hỏi — cascade gián tiếp qua Concept)
  - File tài liệu gốc trên storage (best-effort cleanup)

- **Lỗi ID không đúng định dạng UUID (HTTP 400 Bad Request):** giống hệt mục 3.

- **Lỗi không tìm thấy Plan (HTTP 404 Not Found):**

  ```json
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Study plan not found"
    }
  }
  ```

- **Lỗi truy cập Plan người khác (HTTP 403 Forbidden):**

  ```json
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN",
      "message": "Access denied to this study plan"
    }
  }
  ```

---

### 9. Đổi tài liệu khác cho Plan thất bại (Change Document)

- **Endpoint:** `POST /api/v1/plans/:id/document`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** `multipart/form-data`
- **Request Fields:**
  - `file` (file upload, required): Tài liệu thay thế (hỗ trợ `.pdf`, `.txt`, `.png`, `.jpg`, tối đa 10MB).

- **Dùng để:** Khi `AnalysisJob` gần nhất của Plan `failed` vì **chính tệp gốc có vấn đề** (ví dụ PDF bị mã hoá khiến Gemini không đọc được nội dung) — retry (mục 5) không giúp được gì vì nó dùng lại đúng `fileKey` cũ. Endpoint này tải lên tệp mới và tạo `AnalysisJob` mới trỏ vào tệp đó.

- **Xử lý Document cũ:** Bản ghi `Document` hiện có của Plan bị **ghi đè** (`filename`/`fileKey`/`kind`/`pageCount`/`byteSize`) chứ không tạo dòng mới — khớp với cách `processAnalysisJob` neo `concept_sources` vào Document theo `orderBy: createdAt asc`. Tệp vật lý cũ bị xoá khỏi storage (best-effort, không làm fail request nếu xoá lỗi).

- **Response thành công (HTTP 202 Accepted):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Kế hoạch ôn thi Giải tích",
        "deadline": "2026-08-30T00:00:00.000Z",
        "status": "draft",
        "analysisStatus": "pending"
      },
      "message": "Document changed, analysis initiated"
    }
  }
  ```

  Sau khi nhận 202, client **tiếp tục polling `GET /api/v1/plans/:id`** (giống luồng tạo plan mới ở mục 1.1) cho tới khi `analysisStatus` là `"done"` hoặc `"failed"`.

- **Lỗi thiếu file (HTTP 400 Bad Request):** `code: "FILE_REQUIRED"` — giống hệt mục 1.

- **Lỗi vượt quá dung lượng / định dạng không cho phép (HTTP 400 Bad Request):** `code: "FILE_TOO_LARGE"` / `"INVALID_FILE_TYPE"` — giống hệt mục 1.

- **Lỗi trạng thái không cho phép (HTTP 409 Conflict), cùng `code: "DOCUMENT_CHANGE_NOT_ALLOWED"`:**

  Khi Plan không ở trạng thái `draft` (`message: "Changing the document is only allowed for draft plans"`), khi Plan chưa từng có `AnalysisJob` nào (`message: "No analysis job found for this plan"`), khi đang có job chạy (`message: "An analysis is already in progress"`), hoặc khi `AnalysisJob` gần nhất không ở trạng thái `failed` (`message: "Plan analysis is not in a failed state"`) — cùng một `code`, khác `message`, giống quy ước của retry (mục 5).

  ```json
  {
    "success": false,
    "error": {
      "code": "DOCUMENT_CHANGE_NOT_ALLOWED",
      "message": "Plan analysis is not in a failed state"
    }
  }
  ```

- **Lỗi ID không đúng định dạng UUID (HTTP 400)**, **không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

---

### 10. Thêm tài liệu vào kế hoạch đã có (Add Documents)

- **Endpoint:** `POST /api/v1/plans/:id/documents`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** `multipart/form-data`
- **Số nhiều, và KHÁC hẳn mục 9 (`POST /:id/document`, số ít).** Mục 9 **thay** tệp của một draft phân tích lỗi; endpoint này **cộng thêm** tệp vào một kế hoạch đang chạy. Hai đường dẫn cách nhau một chữ cái, nên chỗ nào nhắc tới chúng cũng phải nói rõ cái nào.
- **Request Fields:**
  - `files` (file upload, lặp lại được) — cùng giới hạn như mục 1, nhưng **trần 8 tệp / 25 MB tính TRÊN CẢ KẾ HOẠCH**, không phải trên request. Kế hoạch đang có 6 tệp chỉ thêm được 2.
  - `mode` (string, **required, KHÔNG có mặc định**): `"full"` hoặc `"append"`.

| `mode`   | AI đọc                          | Đồ thị cũ                                                                                                 |
| -------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `full`   | Đọc lại **mọi** tệp (song song) | Dựng lại; `planConceptMerge` giữ id nên điểm thành thạo/lịch sử còn nguyên                                |
| `append` | Chỉ đọc **tệp mới**             | **Chỉ cộng thêm.** Không khai tử, không xoá cạnh, không đổi chủ đề/tên/độ khó/checkpoint của khái niệm cũ |

- 🔴 **`append` khác `full` ở BỐN chỗ, cả bốn đều là lỗi im lặng nếu quên** (ba chỗ đầu đã lường trước, chỗ thứ tư chỉ lộ ra khi chạy thật 03/09):
  1. **Bỏ qua `toDeprecate`.** AI chỉ thấy tệp mới ⇒ mọi khái niệm cũ "vắng mặt" ⇒ khai tử sạch đồ thị.
  2. **Cạnh khái niệm CỘNG THÊM**, không `deleteMany` rồi dựng lại.
  3. **`document_edges` vẫn thay TRỌN** — đây là chỗ `append` _không_ append: pha 2 luôn chạy trên toàn bộ tài liệu nên nó trả về thứ tự đầy đủ.
  4. **Khái niệm dùng chung giữ nguyên chủ đề cũ.** Đo thật: thêm `LN09 - Test Automation` vào kế hoạch đã có `LN08` làm khái niệm `Test Automation` bị chuyển chủ đề sang LN09, vì pha 1 không thấy LN08 đã sở hữu nó. Cùng lý do, checkpoint của khái niệm dùng chung cũng không được dựng lại — nó là thước đã dùng để chấm mọi câu trả lời trước đó (INV-1).
- 🟢 **Chủ đề mới không thành một đảo, và điều đó ĐO ĐƯỢC.** Pha 2 luôn chạy trên toàn bộ tài liệu (khái niệm cũ đọc trích đoạn từ DB). Đo 03/09: thêm `LN07 - Software V&V` vào kế hoạch có LN02/LN04/LN08/LN09 → pha 2 xếp LN07 vào **GIỮA** LN04 và LN08. Nếu nó chỉ thấy tệp mới thì kết quả duy nhất có thể là "nối vào đuôi".
  ⚠️ Nhưng **chỉ ở tầng chủ đề**: khái niệm của tệp mới không có cạnh sang khái niệm cũ. Câu quảng cáo đúng là _"nhanh và rẻ, không sửa gì của đồ thị cũ"_ — **không phải** _"nối liền hai đồ thị"_.
- **Guard:** `active` ✅ · `draft` + job cuối `done` ✅ (kế hoạch chờ xác nhận — sinh viên quên một tệp) · job đang chạy ❌ 409 · `draft` + job `failed` ❌ 409 (địa hạt retry/mục 9) · `archived` ❌ 409. Mã: `ADD_DOCUMENTS_NOT_ALLOWED`. Job kẹt quá `STALE_JOB_THRESHOLD_MS` (10 phút) được giải phóng như ba endpoint kia (#178).
- **Sau khi gọi:** kế hoạch quay về `draft` (qua đúng cổng xác nhận #265), cache chất liệu AI và cache câu hỏi bị xoá.
- **Response (HTTP 202 Accepted):**

  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "id": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "name": "Công nghệ phần mềm",
        "deadline": "2026-12-31T23:59:59.999Z",
        "status": "draft",
        "analysisStatus": "pending",
        "mode": "append",
        "documentCount": 4
      },
      "message": "Documents added, analysis initiated"
    }
  }
  ```
