# Đặc tả API Review Queue (API Endpoints Spec)

Tất cả các API dưới đây có tiền tố `/api/v1/review-queue` và yêu cầu xác thực người dùng qua
Header `Authorization: Bearer <TOKEN>`.

Đây là lớp **đọc/ghi** đầu ra của Scheduling & Remediation Engine — các dòng `ReviewQueueItem`
được ghi bởi [I7.2 (#123)](../../src/server/src/services/concept-result.service.ts) sau mỗi
phiên Interview kết thúc một khái niệm. API này không gọi AI, không chạy cron: `priority` được
tính lại bằng phép toán thuần mỗi lần đọc (đồ thị nhỏ nên đủ nhanh — xem
`src/server/src/services/scheduling.service.ts`).

---

## Ngữ nghĩa `status` (chốt 04/08/2026 — #224)

Truy ngược **áp thẳng** khái niệm nền vào hàng đợi ngay khi phiên chấm xong. **Không còn cổng
xác nhận**: sinh viên không phải bấm "Đồng ý ôn lại" để khái niệm vào lịch — nó đã ở đó rồi. Thao
tác duy nhất còn lại là **gỡ** khỏi lịch và **đưa lại**, sửa được bất cứ lúc nào.

| Giá trị    | Nghĩa                                                          | Ai ghi                                                     |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `pending`  | **Đã áp vào lịch.** Trạng thái bình thường, không chờ ai duyệt | `finalizeConceptResult()` lúc chấm xong; PATCH khi đưa lại |
| `accepted` | ⛔ **Ngừng dùng** (deprecated 04/08/2026)                      | Không ai. Dữ liệu cũ đã backfill về `pending`              |
| `skipped`  | **Người dùng đã gỡ khỏi lịch.** Hàng vẫn giữ, không xoá        | PATCH                                                      |
| `done`     | Chưa dùng                                                      | Không ai                                                   |

> ⚠️ Tên `pending` lệch nghĩa ("đang chờ" trong khi thực tế là "đang có hiệu lực"). Giữ nguyên
> trong Sprint 4 — đổi giá trị enum kéo theo migration phá huỷ và chạm mọi chỗ đọc. Nợ kỹ thuật
> đã ghi ở #220. **Đọc `pending` là "đã áp vào lịch", đừng hiển thị chữ "chờ duyệt" ở FE.**

Hệ quả cho các bộ lọc đọc: mọi truy vấn "mục còn nằm trên lịch" **loại trừ** `skipped` + `done`,
chứ không kén `status = 'pending'` (hằng số `OFF_SCHEDULE_STATUSES` trong `scheduling.service.ts`).
Áp dụng cho cả `isRemediating` của `GET /plans/:id` và `GET /concepts/:id`.

**Hợp đồng cho [#117](https://github.com/Lade1q/planning-ai/issues/117):** `GET /interviews/:id/summary`
**vẫn** trả `traceback[].status` như cũ — không thêm field, không đổi tên field, không đổi shape.
Chỉ cách đọc đổi: `pending` ở đó nghĩa là _"đã áp vào lịch"_, không phải _"chờ duyệt"_, nên màn
tóm tắt phiên không được vẽ nút Đồng ý / Bỏ qua nữa.

---

### 1. Lấy Hàng đợi Ôn tập của một Plan (Get Review Queue for a Plan)

- **Endpoint:** `GET /api/v1/review-queue?planId=<uuid>&limit=<number>&includeSkipped=<bool>`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Query params:**
  - `planId` (string, required): UUID của Study Plan.
  - `limit` (number, optional, mặc định `10`, tối đa `50`): số item tối đa trả về.
  - `includeSkipped` (`"true"` | `"false"`, optional, mặc định `false`): gắn thêm mảng
    `skippedItems` — nhóm "Đã gỡ khỏi lịch" (xem ngay dưới). Chỉ nhận đúng hai chữ đó; giá trị
    khác trả 400 chứ không im lặng hiểu thành `false`.

- **Dùng để:** AI Examiner ([I6.3](../../src/server/src/services)) tự chọn top-K khái niệm khi
  tạo phiên Interview mới mà không chỉ định `conceptIds`; màn **Kế hoạch ôn tập** (#225) hiển thị
  và cho sinh viên gỡ / đưa lại từng khái niệm.
  **Không lọc theo `scheduledFor`** — trả toàn bộ item còn nằm trên lịch của plan sắp theo ưu
  tiên, vì nếu lọc theo ngày, một plan có toàn bộ hàng đợi đang giãn cách trong tương lai sẽ
  khiến I6.3 không có gì để tự chọn. (Khác với endpoint `/today` bên dưới — xem mục 2.)

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

- **Nhóm "Đã gỡ khỏi lịch" (`includeSkipped=true`):** envelope có thêm `skippedItems`, cùng
  shape với `items` (mọi phần tử có `status: "skipped"`), sắp cùng một kiểu — mục đưa lại phải
  rơi đúng chỗ scheduler xếp cho nó, không phải xuống cuối danh sách chỉ vì từng bị gỡ.

  ```json
  {
    "success": true,
    "data": {
      "items": [/* … như trên … */],
      "message": null,
      "totalEstimatedMinutes": 14,
      "skippedItems": [
        {
          "id": "4b2f0d18-...-uuid",
          "conceptId": "a1c2e3f4-...-uuid",
          "name": "Cây AVL",
          "priority": 0.02,
          "reason": "spaced_repetition",
          "reasonText": "Đã đến lịch ôn tập theo mức độ ghi nhớ",
          "sourceConceptName": null,
          "depth": null,
          "masteryScore": 0.31,
          "status": "skipped",
          "estimatedMinutes": 9,
          "sourceSessionEndedAt": null
        }
      ]
    }
  }
  ```

  - **Không truyền `includeSkipped`** → field `skippedItems` **vắng mặt hẳn**, không phải `[]`:
    "sinh viên chưa gỡ gì" và "không ai hỏi tới" là hai sự thật khác nhau.
  - `totalEstimatedMinutes` **không** cộng nhóm này — đó là thời gian của hàng đợi thật.
  - `limit` áp cho cả hai mảng.
  - Đưa một mục trở lại lịch: `PATCH /review-queue/:itemId` với `{"status":"pending"}` (mục 3).

- **Đã ôn hết cả kế hoạch (HTTP 200 OK, không phải lỗi):**

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Bạn đã ôn hết kế hoạch này. Mỗi khái niệm có ngày ôn lại riêng, xa dần theo mức bạn nắm.",
      "totalEstimatedMinutes": 0
    }
  }
  ```

  ⚠️ **Khác câu của `/today`.** Endpoint này không lọc `scheduledFor`, nên rỗng ở đây nghĩa là
  hết sạch hàng đợi của **cả kế hoạch**, không phải hết phần **đến hạn hôm nay**. Trước 05/08 hai
  endpoint dùng chung một câu có chữ "hôm nay" — sai nghĩa ở bề mặt này, khiến sinh viên ngồi chờ
  một đợt ôn mà hôm nay không có, đồng thời giấu mất thành tựu thật (#224).

- **Sinh viên đã gỡ hết (`items: []` nhưng `skippedItems` khác rỗng):** backend vẫn trả
  `message` như trên; **FE bỏ qua `message`** và vẽ trạng thái "đã gỡ hết" của mockup
  `screen-plan-review-queue.html` (§3) — vì đây không phải đã ôn xong, và vẽ chung màn "đã ôn
  hết" sẽ chôn luôn đường đưa lại. Nhóm đã gỡ mở sẵn trong trạng thái này.

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

- **Đã ôn đủ mọi plan hôm nay (HTTP 200 OK):** `message: "Bạn đã hoàn thành kế hoạch hôm nay 🎉"`.
  Đây là **bề mặt duy nhất** được nói chữ "hôm nay", vì cũng là bề mặt duy nhất thật sự lọc theo
  `scheduledFor` — mục 1 có câu riêng của nó.

- **Không có `includeSkipped` ở endpoint này:** nhóm "đã gỡ" là chuyện của một kế hoạch cụ thể
  (màn Kế hoạch ôn tập), không phải của danh sách gợi ý gộp nhiều plan.

- **Lỗi Validation query (HTTP 400 Bad Request):** giống mục 1, chỉ áp dụng cho `limit`.

---

### 3. Gỡ khỏi lịch / Đưa lại (Remove from Schedule / Put Back)

- **Endpoint:** `PATCH /api/v1/review-queue/:itemId`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Dùng để:** màn **Kế hoạch ôn tập** (#225) — nút "Bỏ khỏi lịch" và "Đưa lại vào lịch" trên
  từng khái niệm.

- **Request body:**

  ```json
  { "status": "skipped" }
  ```

  `status` chỉ chấp nhận **`"skipped"`** (gỡ khỏi lịch) hoặc **`"pending"`** (đưa lại). Đây là
  hai chiều của cùng một thao tác — endpoint này không còn là cổng duyệt (#224), nên nó phải đi
  được cả hai chiều, nếu không thì "sửa lại bất cứ lúc nào" chỉ là cửa một chiều.

  - `"accepted"` → **400 VALIDATION_ERROR**. Giá trị đã ngừng dùng; gửi lên bị từ chối hẳn chứ
    không im lặng ghi một trạng thái không ai đọc nữa.
  - `"done"` → 400. Chưa code path nào ghi giá trị này, và nó không phải việc của người dùng.

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

  **Item bị gỡ không bị xoá** — chỉ đổi `status` thành `"skipped"`. Nó rời `items` của mục 1/2
  ngay lập tức, nhưng vẫn đọc lại được qua `includeSkipped=true` (mục 1) — chính chỗ đó làm cho
  chiều `"pending"` với tới được. Reload xong trạng thái vẫn đúng ở cả hai chiều.

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
