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
          "createdAt": "2026-07-20T21:00:00.000Z"
        }
      ]
    }
  }
  ```

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
