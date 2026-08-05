# Đặc tả API Focus Session (Pomodoro)

Tất cả các API dưới đây yêu cầu xác thực người dùng qua Header `Authorization: Bearer <TOKEN>`.

> **Lưu ý nền tảng:** timer chạy hoàn toàn ở client (không socket, không polling). Backend chỉ
> nhận thời điểm bắt đầu/kết thúc và các số liệu tổng kết do client đo (`focusedSeconds`,
> `awayCount`, `pomodorosCompleted`) rồi lưu lại cho lịch sử học tập. **Không endpoint nào ở
> đây ghi `concepts.mastery_score` hay `concepts.last_tested_at`** — đó là việc riêng của AI
> Examiner (AE-02).

---

### 1. Bắt đầu phiên học (FS-01)

- **Endpoint:** `POST /api/v1/focus-sessions`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Request Body:**
  - `planId` (uuid, optional): plan đang ôn tập. Nếu bỏ trống, phiên không gắn với plan nào.
  - `conceptIds` (uuid[], required, tối thiểu 1 phần tử): các khái niệm được ôn trong phiên này.
    Nếu có `planId`, mọi `conceptIds` phải thuộc đúng plan đó.
  - `strictMode` (boolean, optional, mặc định `false`): phiên này có bật chế độ nghiêm ngặt
    (theo dõi rời tab qua Page Visibility API) hay không.

- **Response thành công (HTTP 201 Created):**

  ```json
  {
    "success": true,
    "data": {
      "id": "b1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "planId": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "conceptIds": ["d1f8a8b1-..."],
      "status": "running",
      "strictMode": true,
      "startedAt": "2026-08-05T08:00:00.000Z"
    }
  }
  ```

- **Lỗi plan không tồn tại/không thuộc user (HTTP 404 Not Found):**

  ```json
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Plan not found" } }
  ```

- **Lỗi conceptIds không thuộc planId (HTTP 400 Bad Request):**

  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_CONCEPT_IDS",
      "message": "conceptIds must belong to the given planId"
    }
  }
  ```

---

### 2. Kết thúc / hủy phiên (FS-01 Alt flow 1/3/4)

- **Endpoint:** `PATCH /api/v1/focus-sessions/:id`
- **Xác thực:** ✅ Yêu cầu Bearer Token — session phải thuộc user hiện tại, nếu không trả `404`
  (không lộ sự tồn tại của session cho người khác).
- **Hành vi phụ:** trước khi thao tác, mọi session `running` của user quá 8 giờ mà chưa có
  `endedAt` được coi là bỏ dở — tự động chuyển `status: "cancelled"`, `durationMinutes: 0`
  (cùng cơ chế lazy-reap với `GET`, không cần cron). Nếu `:id` trong request rơi vào trường hợp
  này, nó sẽ được reap trước, sau đó bị từ chối bởi lỗi "session đã kết thúc" bên dưới — một
  phiên bị bỏ quên hơn 8 tiếng không thể "hoàn thành" ngược lại được nữa.
- **Request Body:**
  - `status` (`'completed' | 'cancelled'`, required).
  - `focusedSeconds` (int, required, 0–28800): thời gian tập trung thực tế, client đo được
    (đã trừ pause). Không được vượt quá `now - startedAt` tính bằng giây.
  - `awayCount` (int, optional, mặc định 0, ≥0): số lần rời tab.
  - `pomodorosCompleted` (int, optional, mặc định 0, ≥0): số lượt work đã hoàn thành.

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "id": "b1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
      "status": "completed",
      "durationMinutes": 47,
      "focusedSeconds": 2832,
      "awayCount": 2,
      "pomodorosCompleted": 2,
      "strictMode": true,
      "startedAt": "2026-08-05T08:00:00.000Z",
      "endedAt": "2026-08-05T08:47:12.000Z"
    }
  }
  ```

  Server tự tính `durationMinutes = floor(focusedSeconds / 60)`. Riêng khi `status: "cancelled"`
  (Alt flow 4 — hủy phiên), `durationMinutes` luôn là `0` dù `focusedSeconds` là bao nhiêu:
  thời gian của phiên bị hủy không được tính vào lịch sử học tập.

- **Lỗi session đã kết thúc (HTTP 409 Conflict):**

  ```json
  {
    "success": false,
    "error": { "code": "ALREADY_ENDED", "message": "Focus session has already ended" }
  }
  ```

- **Lỗi `focusedSeconds` âm hoặc > 28800 (HTTP 400 Bad Request):** bị Zod chặn ở tầng schema,
  cùng mã lỗi validate chung của toàn hệ thống — không phải mã riêng bên dưới.

  ```json
  {
    "success": false,
    "error": { "code": "VALIDATION_ERROR", "message": "Invalid input data", "details": [...] }
  }
  ```

- **Lỗi `focusedSeconds` vượt quá thời gian thực tế đã trôi qua kể từ `startedAt` (HTTP 400 Bad
  Request):** riêng ca này mới ra mã lỗi chuyên biệt, vì cần biết `startedAt` của session (Zod
  không kiểm được, chỉ service mới có).

  ```json
  {
    "success": false,
    "error": {
      "code": "FOCUSED_SECONDS_EXCEEDS_ELAPSED",
      "message": "focusedSeconds must not exceed the elapsed session time"
    }
  }
  ```

---

### 3. Lịch sử phiên học (FS-03)

- **Endpoint:** `GET /api/v1/focus-sessions?limit=&offset=`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Query params:** `limit` (1–50, mặc định 20), `offset` (≥0, mặc định 0).
- **Hành vi phụ:** trước khi trả kết quả, mọi session `running` của user quá 8 giờ mà chưa có
  `endedAt` được coi là bỏ dở — tự động chuyển `status: "cancelled"`, `durationMinutes: 0`
  (xử lý ngay lúc query, không cần cron).

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "b1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "planId": "c1f8a8b1-3e4d-4b5a-9a8b-1c2d3e4f5a6b",
        "concepts": [{ "id": "d1f8a8b1-...", "name": "Ngăn xếp (Stack)" }],
        "status": "completed",
        "durationMinutes": 47,
        "focusedSeconds": 2832,
        "awayCount": 2,
        "pomodorosCompleted": 2,
        "strictMode": true,
        "startedAt": "2026-08-05T08:00:00.000Z",
        "endedAt": "2026-08-05T08:47:12.000Z"
      }
    ]
  }
  ```

---

### 4. Đọc / cập nhật cấu hình Pomodoro (FS-02)

- **Endpoint:** `GET /api/v1/users/me/pomodoro-config` · `PATCH /api/v1/users/me/pomodoro-config`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **PATCH Request Body** (mọi field optional, partial update — merge vào cấu hình hiện có):
  - `work` (int, 1–120)
  - `short_break` (int, 1–60)
  - `long_break` (int, 1–60)
  - `cycles` (int, 1–10)
  - `sound` (boolean)

- **Response thành công (HTTP 200 OK, cho cả GET và PATCH):**

  ```json
  {
    "success": true,
    "data": {
      "work": 25,
      "short_break": 5,
      "long_break": 15,
      "cycles": 4,
      "sound": true
    }
  }
  ```

---

### Ghi chú phạm vi

- Ghi chú nhanh (FS-05, bảng `session_notes`) **không** thuộc phạm vi API này — xem #228.
- Endpoint thống kê tuần cho Dashboard (#200) không nằm trong phạm vi này; các field
  `durationMinutes`/`focusedSeconds` ở đây là nguồn dữ liệu thô để #200 tổng hợp sau.
- Tài liệu này cần đối chiếu lại với I9.2 (OpenAPI spec chung) khi module đó hoàn thành.
