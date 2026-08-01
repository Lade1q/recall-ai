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
  - `file` (file upload, required): File tài liệu học tập đính kèm (hỗ trợ `.pdf`, `.txt`, `.png`, `.jpg`, tối đa 10MB).

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

- **Lỗi thiếu file (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "FILE_REQUIRED",
      "message": "File is required"
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
          "analysisStatus": "processing",
          "analysisStartedAt": "2026-07-20T21:00:12.000Z",
          "document": { "filename": "Chuong-4-Kiem-thu.pdf", "pageCount": 28 },
          "createdAt": "2026-07-20T21:00:00.000Z"
        }
      ]
    }
  }
  ```

- **`masteryDistribution`** đếm concept theo 4 mức, tổng luôn bằng `conceptCount`. Ngưỡng: `strong ≥ 0.8`, `0.6 ≤ learning < 0.8`, `weak < 0.6`, `untested` là `mastery_score = null`. **`untested` không gộp vào `weak`**: "chưa hỏi bao giờ" khác hẳn "hỏi rồi và sai". Concept `deprecated` (do re-analyze loại bỏ, mục 6) không được đếm.

- **`analysisStatus` / `analysisStartedAt`** lấy từ `AnalysisJob` gần nhất của Plan, cùng quy tắc "mới nhất theo `createdAt`" như mục 3; `null` khi Plan chưa có job nào. `analysisStartedAt` để client hiển thị đồng hồ đếm thời gian đã chạy.

- **`document`** là tài liệu nguồn mới nhất của Plan, `null` nếu chưa có. `pageCount` là `null` với tài liệu không phân trang (text/ảnh).

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
          "createdAt": "2026-07-20T21:00:05.000Z"
        },
        {
          "id": "a2...",
          "name": "Đạo hàm (Derivative)",
          "difficulty": 3,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "createdAt": "2026-07-20T21:00:05.000Z"
        },
        {
          "id": "a3...",
          "name": "Tích phân (Integral)",
          "difficulty": 4,
          "masteryScore": null,
          "source": "ai_generated",
          "status": "active",
          "createdAt": "2026-07-20T21:00:05.000Z"
        }
      ],
      "edges": [
        { "id": "e1...", "fromConceptId": "a1...", "toConceptId": "a2..." },
        { "id": "e2...", "fromConceptId": "a2...", "toConceptId": "a3..." }
      ]
    }
  }
  ```

  - `dagAutoFixed: true` nếu Gemini trả về đồ thị chứa chu trình và hệ thống đã tự loại cạnh gây lỗi.
  - `concepts[].masteryScore` luôn là `null` cho tới khi user hoàn thành phiên Interview đầu tiên trên khái niệm đó (Sprint 4 — AI Examiner).
  - `concepts` chỉ trả `status = 'active'`. Concept `deprecated` (re-analyze loại bỏ, mục 6) vẫn còn trong DB làm tombstone giữ lịch sử — hồi sinh lại nếu re-analyze sau này gặp lại đúng tên — nhưng không xuất hiện ở đây, vì đây là đồ thị hiện tại của Plan chứ không phải lịch sử chỉnh sửa.

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

- **Semantics:** Đây là **full replace**, không phải patch từng phần. Body chứa toàn bộ tập concepts + edges mong muốn của đồ thị:
  - Concept được khớp theo **tên** (`name`) với concept đã có trong DB — tên trùng thì giữ nguyên `id`, `masteryScore` và lịch sử; tên biến mất thì bị xóa (cascade xóa các edge liên quan); tên mới thì được tạo với `source: "manual"`.
  - `edges[].from` / `edges[].to` tham chiếu tới `concepts[].name` (không phải id) — vì FE có thể vừa thêm 1 node mới chưa có id từ server.

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

- **Lỗi không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

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

- **Lỗi không tìm thấy Plan (HTTP 404 Not Found)** và **truy cập Plan người khác (HTTP 403 Forbidden)**: giống hệt mục 3.

---

### 6. Phân tích lại Study Plan (Re-analyze) — SP-05

- **Endpoint:** `POST /api/v1/plans/:id/reanalyze`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** Không cần body (empty POST)
- **Dùng để:** Tài liệu được cập nhật, hoặc user muốn dựng lại đồ thị. Server đọc lại `fileKey` của `Document` **mới nhất** (không upload lại) và tạo `AnalysisJob` mới.

**Khác với Retry (mục 5):** retry cứu một Plan `draft` có job `failed`; re-analyze chạy trên Plan **đang `active`** và Plan **giữ nguyên `active`** trong lúc job chạy — đồ thị cũ vẫn dùng được, không có khoảng trống.

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
        "status": "active",
        "analysisStatus": "pending"
      },
      "message": "Re-analysis initiated"
    }
  }
  ```

  Client tiếp tục polling `GET /api/v1/plans/:id` như mục 1.1.

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

- **Lỗi không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

---

### 7. Lưu trữ / Khôi phục Study Plan (Archive) — SP-04

- **Endpoint:** `PATCH /api/v1/plans/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Content-Type:** `application/json`

- **Request body:**

  ```json
  { "status": "archived" }
  ```

  Chỉ nhận `"archived"` (lưu trữ) hoặc `"active"` (khôi phục). Giá trị `"draft"` bị từ chối — chỉ pipeline phân tích được đặt trạng thái đó; cho client gửi sẽ đẩy một Plan đã có đồ thị đầy đủ kẹt vĩnh viễn ở tab "Đang phân tích".

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
      "message": "A plan that is still being analysed cannot be archived"
    }
  }
  ```

  Lưu trữ là cách cất đi tài liệu đã học xong; một `draft` chưa có nội dung nào để cất — thao tác áp dụng cho nó là retry (mục 5) hoặc xóa (mục 8).

- **Lỗi không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.

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

- **Lỗi không tìm thấy Plan (HTTP 404)** và **truy cập Plan người khác (HTTP 403)**: giống hệt mục 3.
