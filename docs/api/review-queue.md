# Đặc tả API Review Queue (API Endpoints Spec)

Tất cả các API dưới đây có tiền tố `/api/v1/review-queue` và yêu cầu xác thực người dùng qua
Header `Authorization: Bearer <TOKEN>`.

Đây là lớp **đọc/ghi** đầu ra của Scheduling & Remediation Engine — các dòng `ReviewQueueItem`
được ghi bởi [I7.2 (#123)](../../src/server/src/services/concept-result.service.ts) sau mỗi
phiên Interview kết thúc một khái niệm. API này không gọi AI, không chạy cron: `priority` được
tính lại bằng phép toán thuần mỗi lần đọc (đồ thị nhỏ nên đủ nhanh — xem
`src/server/src/services/scheduling.service.ts`).

---

### 1. Lấy Hàng đợi Ôn tập của một Plan (Get Review Queue for a Plan)

- **Endpoint:** `GET /api/v1/review-queue?planId=<uuid>&limit=<number>`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Query params:**
  - `planId` (string, required): UUID của Study Plan.
  - `limit` (number, optional, mặc định `10`, tối đa `50`): số item tối đa trả về.

- **Dùng để:** AI Examiner ([I6.3](../../src/server/src/services)) tự chọn top-K khái niệm khi
  tạo phiên Interview mới mà không chỉ định `conceptIds`; màn kết quả phiên (I6.7) hiển thị các
  đề xuất traceback để sinh viên Đồng ý / Bỏ qua.
  **Không lọc theo `scheduledFor`** — trả toàn bộ item `pending` của plan sắp theo ưu tiên, vì
  nếu lọc theo ngày, một plan có toàn bộ hàng đợi đang giãn cách trong tương lai sẽ khiến I6.3
  không có gì để tự chọn. (Khác với endpoint `/today` bên dưới — xem mục 2.)

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "9f1c1e2a-...-uuid",
          "conceptId": "b2d3e4f5-...-uuid",
          "name": "Giới hạn hàm số",
          "priority": 0.42,
          "reason": "traceback",
          "reasonText": "Nền tảng của 'Đạo hàm riêng' mà bạn còn yếu",
          "sourceConceptName": "Đạo hàm riêng",
          "depth": 1,
          "masteryScore": null,
          "status": "pending",
          "estimatedMinutes": 14,
          "sourceSessionEndedAt": "2026-08-01T21:30:00.000Z"
        }
      ],
      "message": null,
      "totalEstimatedMinutes": 14
    }
  }
  ```

  `reason = 'traceback'` luôn đứng trước mọi `reason` khác trong `items` (sắp xếp 2 cấp — xem
  ràng buộc bên dưới), sau đó mới tới `priority` giảm dần.

  `estimatedMinutes` / `totalEstimatedMinutes` / `sourceSessionEndedAt` là phần bổ sung của
  **#201** cho mockup Dashboard (DB-04) — chỉ **thêm** field, không đổi thứ tự sắp xếp cũng như
  công thức `priority`. Xem [mục cuối](#ước-lượng-thời-gian-estimatedminutes) về công thức ước
  lượng.

- **Hàng đợi rỗng cho plan mới (chưa từng có phiên Interview nào):** trả `items` là gợi ý trực
  tiếp từ `concepts` của plan (chưa được kiểm tra trước, khó nhất trước), với
  `reason: "spaced_repetition"`, `reasonText: "Khái niệm chưa được kiểm tra"`, `id: null` (vì
  chưa có row `ReviewQueueItem` thật — không thể `PATCH` các item này) và
  `sourceSessionEndedAt: null` (chưa có phiên nào để truy ngược).

- **Đã ôn hết / plan hết item pending (HTTP 200 OK, không phải lỗi):**

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Bạn đã hoàn thành kế hoạch hôm nay 🎉",
      "totalEstimatedMinutes": 0
    }
  }
  ```

- **Plan chưa ở trạng thái `active` (HTTP 200 OK, không phải lỗi):**

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Kế hoạch chưa ở trạng thái hoạt động.",
      "totalEstimatedMinutes": 0
    }
  }
  ```

- **Lỗi Validation query (HTTP 400 Bad Request):** thiếu `planId`, `planId` không phải UUID, hoặc
  `limit` không hợp lệ.

  ```json
  {
    "success": false,
    "error": { "code": "VALIDATION_ERROR", "message": "Invalid input data", "details": [] }
  }
  ```

- **Lỗi không tìm thấy / không thuộc về user (HTTP 404 Not Found):** plan không tồn tại **hoặc**
  thuộc về user khác đều trả cùng một lỗi này (không phân biệt 403 — theo đúng AC của #124).

  ```json
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Study plan not found" } }
  ```

---

### 2. Gợi ý Ôn tập Hôm nay (Today's Review Queue)

- **Endpoint:** `GET /api/v1/review-queue/today?limit=<number>`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Query params:** `limit` (number, optional, mặc định `5`, tối đa `50`).

- **Dùng để:** tab "Gợi ý hôm nay" của Focus Session (I8.2) và nhắc nhở trên Dashboard (UC-19).
  Gộp top-K từ **tất cả** plan `active` của user (không chỉ 1 plan), **có lọc**
  `scheduledFor <= hiện tại` — item hẹn ôn trong tương lai chưa xuất hiện ở đây.

- **Response thành công (HTTP 200 OK):** shape giống hệt mục 1
  (`{ items, message, totalEstimatedMinutes }`), nhưng `items` gộp từ nhiều plan.

- **User chưa có plan nào đang `active` (HTTP 200 OK, không phải lỗi):**

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Bạn chưa có kế hoạch ôn tập nào đang hoạt động.",
      "totalEstimatedMinutes": 0
    }
  }
  ```

  Đây là trạng thái khác với "đã ôn hết hôm nay" — theo đúng fix của audit A3, không được dùng
  nhầm message 🎉 cho người chưa từng bắt đầu.

- **Đã ôn đủ mọi plan hôm nay (HTTP 200 OK):** `message: "Bạn đã hoàn thành kế hoạch hôm nay 🎉"`
  — giống mục 1.

- **Lỗi Validation query (HTTP 400 Bad Request):** giống mục 1, chỉ áp dụng cho `limit`.

---

### 3. Đồng ý / Bỏ qua một Đề xuất (Accept / Skip a Review Queue Item)

- **Endpoint:** `PATCH /api/v1/review-queue/:itemId`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Dùng để:** màn kết quả phiên (I6.7) — nút Đồng ý / Bỏ qua từng đề xuất traceback.

- **Request body:**

  ```json
  { "status": "accepted" }
  ```

  `status` chỉ chấp nhận `"accepted"` hoặc `"skipped"`. Không thể set lại `"pending"` hay
  `"done"` qua endpoint này.

- **Response thành công (HTTP 200 OK):**

  ```json
  {
    "success": true,
    "data": {
      "item": {
        "id": "9f1c1e2a-...-uuid",
        "conceptId": "b2d3e4f5-...-uuid",
        "planId": "c1f8a8b1-...-uuid",
        "status": "skipped"
      }
    }
  }
  ```

  **Item bị skip không bị xoá** — chỉ đổi `status` thành `"skipped"` để giữ dấu vết, và nó sẽ
  không còn xuất hiện trong `items` của mục 1/2 (chỉ trả `status: "pending"`).

- **Lỗi Validation body (HTTP 400 Bad Request):** thiếu `status` hoặc giá trị không hợp lệ.

  ```json
  {
    "success": false,
    "error": { "code": "VALIDATION_ERROR", "message": "Invalid input data", "details": [] }
  }
  ```

- **Lỗi `itemId` thiếu hoặc không phải UUID (HTTP 400 Bad Request):** `itemId` là `@db.Uuid`
  trong Prisma nên được validate là UUID hợp lệ trước khi chạm DB (tránh P2023 → 500).

  ```json
  {
    "success": false,
    "error": { "code": "VALIDATION_ERROR", "message": "Invalid input data", "details": [] }
  }
  ```

- **Lỗi không tìm thấy / không thuộc về user (HTTP 404 Not Found):** item không tồn tại **hoặc**
  thuộc plan của user khác đều trả cùng lỗi này.

  ```json
  { "success": false, "error": { "code": "NOT_FOUND", "message": "Review queue item not found" } }
  ```

---

## Công thức tính `priority`

```
remainingDays = max(deadline - hôm_nay, 1)   // ngày; không có deadline → dùng 30
priority = (1 / remainingDays) * (1 - COALESCE(masteryScore, 0))
```

`priority` **không** quyết định việc `reason = 'traceback'` được xếp trước — đó là một sắp xếp
2 cấp riêng (`ORDER BY (reason = 'traceback') DESC, priority DESC`), không phải cộng bonus điểm
(xem `docs/management/sprint-4-spec-audit.md`, mục audit B4).

---

## Ước lượng thời gian (`estimatedMinutes`)

```
turns          = maxTurnsPerConcept của phiên đã tạo item (không có → mặc định 3)
relearn        = reason == 'traceback' ? 5 * COALESCE(depth, 1) : 0
estimatedMinutes = turns * 3 + relearn
```

Heuristic số học thuần, **không gọi AI** (#201). Các giả định — đã ghi trong
`scheduling.service.ts`:

- **3 phút / lượt hỏi–đáp:** đọc câu hỏi + soạn câu trả lời + đọc feedback. Đây là _ước lượng_,
  chưa phải đo đạc; khi `InterviewTurn.askedAt`/`answeredAt` đủ dữ liệu thì hiệu chỉnh lại hằng
  số này.
- **+5 phút mỗi cấp `depth` cho item traceback:** khái niệm tiên quyết vốn là thứ sinh viên
  _chưa_ nắm nên phải đọc lại trước khi trả lời được; `depth = 2` (tiên quyết của tiên quyết) xa
  khái niệm đã kiểm tra hơn nên tốn thêm.

`totalEstimatedMinutes` là tổng của **các item thực sự trả về** (sau khi cắt theo `limit`), để
khớp đúng danh sách hiển thị. Bộ hằng số được canh theo header mockup Dashboard
"Hàng đợi hôm nay · ≈ 50 phút": một trang `/today` mặc định (5 item, 1 traceback `depth = 1`
dẫn đầu) cho `14 + 4 × 9 = 50`.

## Nguồn phiên (`sourceSessionEndedAt`)

`ReviewQueueItem.sourceSessionId → InterviewSession.endedAt`, resolve bằng một lookup **batched**
cho cả trang (giống cách `sourceConceptId → name` được xử lý — cả hai đều là soft-ref, không FK).

Dùng cho narrative AE-08 trên Dashboard: _"bạn trả lời sai **Duyệt đồ thị DFS** trong phiên kiểm
tra tối qua"_ — FE tự chọn cách diễn đạt thời điểm ("tối qua", "3 ngày trước") từ mốc thời gian
này. `null` khi item không có phiên nguồn (gợi ý fallback A3, item thêm thủ công) hoặc khi phiên
nguồn vẫn đang chạy (chưa `endedAt`).
