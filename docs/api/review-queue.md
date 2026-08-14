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

---

## Một mục / một khái niệm (chốt 06/08/2026 — #232)

`@@unique([sourceSessionId, conceptId])` chỉ chống trùng **trong một phiên**. Mỗi phiên chấm
xong lại upsert thêm một `ReviewQueueItem` cho cùng khái niệm, nên qua nhiều phiên một concept
tích lũy nhiều hàng `pending`. Chạy thật trên một plan đã vấn đáp vài lần:

```
8 mục / 3 khái niệm  →  Array ×4 · Binary Tree ×2 · Linked List ×2
```

Từ #232, **cả hai endpoint đọc đều gộp về một mục cho mỗi khái niệm**:

- Mục sống sót là mục mà thứ tự 2 cấp (`traceback` trước, rồi `priority` giảm dần) **vốn đã xếp
  lên đầu** — gộp trùng không đổi thứ tự hiển thị, chỉ bỏ bớt số lần lặp lại.
- Nhóm `skippedItems` gộp theo đúng cách đó.
- `totalEstimatedMinutes` vì thế tính **một lần** cho mỗi khái niệm.
- Gộp theo từng plan là đủ cho `/today`: một `Concept` chỉ thuộc đúng một plan.

**Không sửa `@@unique`, không migration.** Giá trị per-session là chủ đích (audit A1: giữ dấu
vết phiên nào yêu cầu ôn cái gì) — gộp lúc đọc là đủ, và một migration dọn hàng trùng sẽ xoá
đúng phần dấu vết đó. Hệ quả duy nhất cần biết: hàng cũ bị gỡ **trước** #232 có thể để một
khái niệm vừa có hàng `pending` vừa có hàng `skipped`, nên nó hiện ở cả hai danh sách; lần đầu
sinh viên bấm gỡ / đưa lại khái niệm đó là nó tự khớp lại, vì `PATCH` từ #232 chuyển **cả cụm
hàng của khái niệm** (xem mục 3).

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
          "planId": "c1f8a8b1-...-uuid",
          "planName": "Giải tích 1",
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

  `planId` / `planName` là phần bổ sung của **#232** — cũng chỉ **thêm** field. Ở endpoint này
  bên gọi vốn đã biết plan, nhưng hai endpoint phải cùng một shape (xem mục 2: `/today` gộp
  nhiều plan nên **bắt buộc** phải có). Có ở cả item fallback A3 — item đó không có row thật
  nhưng vẫn thuộc về một kế hoạch cụ thể.

- **Hàng đợi rỗng cho plan mới (chưa từng có phiên Interview nào):** trả `items` là gợi ý trực
  tiếp từ `concepts` của plan (chưa được kiểm tra trước, khó nhất trước), với
  `reason: "spaced_repetition"`, `reasonText: "Khái niệm chưa được kiểm tra"`, `id: null` (vì
  chưa có row `ReviewQueueItem` thật — không thể `PATCH` các item này) và
  `sourceSessionEndedAt: null` (chưa có phiên nào để truy ngược).

  ⚠️ **Danh sách fallback A3 này CHỈ có ở endpoint `?planId=`, KHÔNG có ở `/today`** (#273). Mục
  fallback không mang `scheduledFor` nên không bao giờ "đến hạn"; đưa nó vào `/today` khiến gợi ý
  của một plan mới toanh (priority từ mastery `null`) lấn át mục **thật sự đến hạn** của plan
  đang học dở. Xem mục 2.

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
          "planId": "c1f8a8b1-...-uuid",
          "planName": "Giải tích 1",
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

- **Đã vấn đáp nhưng khái niệm trong lịch cũ đã bị gỡ (#345):** kế hoạch từng có kết quả chấm, rồi
  SP-05 phân tích lại gỡ hết những khái niệm đang nằm trong lịch. Sau #344 hàng đợi không còn hiện
  chúng nữa, nên endpoint trả về **danh sách gợi ý A3** — tức `items` **khác rỗng** và `message`
  theo định nghĩa là `null`. Câu giải thích đi bằng field riêng **`noScheduleNote`**:

  ```json
  {
    "success": true,
    "data": {
      "items": [{ "id": null, "conceptId": "…", "…": "…" }],
      "message": null,
      "noScheduleNote": "Kế hoạch này đã được phân tích lại, nên những khái niệm trong lịch ôn trước đó không còn trong nội dung hiện tại. Làm một phiên với nội dung mới để có lịch thật.",
      "totalEstimatedMinutes": 21
    }
  }
  ```

  `noScheduleNote` là `null` ở **mọi** ca khác — kể cả ca "chưa vấn đáp bao giờ", vốn cũng hiện
  gợi ý A3 nhưng dùng câu **của client** (ngoại lệ #273/#124). Chính vì thế nó phải là field
  riêng chứ không phải một câu thứ hai nhét vào `message`: `noScheduleNote !== null` **là** dấu
  hiệu phân biệt hai ca, khỏi bắt FE dò chuỗi.

- **Kế hoạch `active` mà đồ thị rỗng (#345):** không còn khái niệm `status: 'active'` nào (phân
  tích lại gỡ hết, hoặc `PUT /graph` với `concepts: []`). `items` rỗng, và envelope mang thêm
  **`hasActiveConcepts: false`**:

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Kế hoạch này hiện không có khái niệm nào, nên chưa có gì để ôn. Thêm khái niệm vào đồ thị hoặc phân tích lại tài liệu để bắt đầu.",
      "noScheduleNote": null,
      "hasActiveConcepts": false,
      "totalEstimatedMinutes": 0
    }
  }
  ```

  ⚠️ **`hasActiveConcepts` là dữ kiện, không phải câu chữ** — FE chọn **khung** trạng thái rỗng
  (icon/tiêu đề/nút) từ nó, đúng như đang chọn theo `plan.status`. Chọn khung bằng cách dò chuỗi
  trong `message` là thứ field này sinh ra để khỏi phải làm.
  ⚠️ **Vắng mặt hẳn** (không phải `false`) khi plan chưa `active`: response đó trả về trước khi
  đếm bất cứ thứ gì, và plan `draft` thì **vẫn có** khái niệm (đang chờ xác nhận) nên `false` sẽ
  là nói dối chứ không phải giá trị mặc định. Cùng quy ước với `skippedItems`.
  ⚠️ **Câu này còn là body của `409 NO_CONCEPTS_TO_REVIEW`** khi sinh viên bấm mở phiên trên đúng
  kế hoạch đó (`POST /interviews` đọc `queue.message` của chính endpoint này). Sửa câu là sửa cả
  lý do từ chối — có assertion ghim trong test.

- **Plan chưa ở trạng thái `active` (HTTP 200 OK, không phải lỗi):** câu trả về **rẽ theo
  `status`** (#232, sau #265). Guard là `status !== 'active'` nên nó bắt cả `draft` lẫn
  `archived` — hai việc khác hẳn nhau, không dùng chung một câu được:

  | `plan.status` | `message`                                                                                              |
  | ------------- | ------------------------------------------------------------------------------------------------------ |
  | `draft`       | `"Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy."` |
  | `archived`    | `"Kế hoạch này đã được lưu trữ. Bỏ lưu trữ để ôn tiếp."`                                               |

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.",
      "totalEstimatedMinutes": 0
    }
  }
  ```

  Trước 06/08 cả hai nhận chung câu _"Kế hoạch chưa ở trạng thái hoạt động."_ — nói **trạng thái
  hệ thống** thay vì **việc người dùng còn nợ**, và giấu mất lối đi tới đó. Vô hại khi `draft`
  chỉ sống vài giây; sau **#265** `draft` nghĩa là _"phân tích xong, chờ xác nhận đồ thị"_ và là
  trạng thái sống lâu. Chữ "xác nhận" bám theo nhãn **"Chờ xác nhận"** của thẻ kế hoạch SP-03
  (#269) và nút "Kiểm chứng đồ thị" — cùng một trạng thái không mang hai tên.

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

- **KHÔNG có fallback A3 (#273):** plan có `0` dòng `ReviewQueueItem` (chưa từng vấn đáp) đóng
  góp `[]` vào `/today`, **không** phải danh sách gợi ý từ `concepts`. Chỉ mục **đã lên lịch
  thật** và đến hạn (`scheduledFor <= now`, đã lọc `OFF_SCHEDULE_STATUSES`) mới vào. Lý do:
  "hôm nay" chỉ nên có việc thật đến hạn — plan chưa học không có gì "đến hạn", nhất quán với
  việc plan `draft` cũng không vào (#265). Fallback là gợi ý học mới, thuộc bề mặt `?planId=`
  (mục 1) / Dashboard, không phải danh sách nhắc ôn. Trước 06/08 fallback lọt vào đây và **nuốt
  mất** mục đến hạn thật của plan khác (gợi ý plan-mới `priority ≈ 0.07` > mục thật đã lên lịch).

- **Response thành công (HTTP 200 OK):** shape giống hệt mục 1
  (`{ items, message, totalEstimatedMinutes }`), nhưng `items` gộp từ nhiều plan. Mỗi item mang
  `planId` + `planName` của **plan chứa nó** (#232) — không có hai field này thì Dashboard
  (#169) không dựng nổi request cho cả hai CTA "Bắt đầu Focus Session" và "Vào thẳng phiên kiểm
  tra", vì `POST /interviews` bắt buộc `planId` và `FocusSession.planId` cũng vậy.

- **User chưa có plan nào đang `active` (HTTP 200 OK, không phải lỗi):** ba ca, **ba câu**
  (#232, sau #265). Truy vấn hỏi **mọi** plan của user rồi lọc `active` trong JS — vẫn **một**
  round trip — nên lúc rỗng nó còn phân biệt được rỗng kiểu gì:

  | Tình trạng các plan     | `message`                                                                             |
  | ----------------------- | ------------------------------------------------------------------------------------- |
  | không có plan nào       | `"Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn."`                  |
  | có ≥ 1 plan `draft`     | `"Bạn có N kế hoạch đang chờ xác nhận đồ thị. Xác nhận để hàng đợi ôn bắt đầu chạy."` |
  | còn lại toàn `archived` | `"Mọi kế hoạch của bạn đang được lưu trữ. Bỏ lưu trữ một kế hoạch để ôn tiếp."`       |

  ```json
  {
    "success": true,
    "data": {
      "items": [],
      "message": "Bạn có 1 kế hoạch đang chờ xác nhận đồ thị. Xác nhận để hàng đợi ôn bắt đầu chạy.",
      "totalEstimatedMinutes": 0
    }
  }
  ```

  🚨 **Nới `where` không có nghĩa là cho plan `draft` vào hàng đợi.** Plan chưa xác nhận vẫn
  **không** đóng góp item nào (#265) — `where` rộng ra chỉ để **đếm và phân loại** cho việc chọn
  câu. Ca `draft` được ưu tiên hơn `archived` khi có cả hai: đó là ca duy nhất người dùng đang
  còn nợ một việc cụ thể.

  Cả ba đều khác trạng thái "đã ôn hết hôm nay" — theo đúng fix của audit A3, không được dùng
  nhầm message 🎉 cho người chưa từng bắt đầu.

- **Đã ôn đủ mọi plan hôm nay (HTTP 200 OK):** `message: "Bạn đã hoàn thành kế hoạch hôm nay 🎉"`.
  Đây là **bề mặt duy nhất** được nói chữ "hôm nay", vì cũng là bề mặt duy nhất thật sự lọc theo
  `scheduledFor` — mục 1 có câu riêng của nó. Câu 🎉 này chỉ hiện khi **có lịch sử** (`hasHistory`)
  — tức đã từng vấn đáp và giờ không còn mục đến hạn.

- **Có plan `active` nhưng chưa mục nào đến hạn, và chưa plan nào từng vấn đáp (HTTP 200 OK):**
  trạng thái rỗng **mới** do #273 mở ra khi bỏ fallback khỏi `/today`. Không plan nào có lịch sử
  nên `message` là `null` → `{ items: [], message: null, totalEstimatedMinutes: 0 }`.
  #273 **cố ý không** tự chế câu cho ca này — câu chữ + UI (mời tạo phiên vấn đáp / học mới)
  thuộc **#231** (design trạng thái Dashboard) và **#232 phần 4** (chọn câu rỗng). Không được
  dùng câu 🎉 ở đây: chưa ôn gì thì không phải "đã hoàn thành".

#### Chọn câu khi `items` rỗng — bảng 5 nhánh (#345)

Gọi nhánh bằng **tên**, đừng bằng số: ba session soạn phần này đánh số khác nhau và suýt lẫn hai
nhánh. `L` = **có** plan còn dòng sống · `g` = plan từng được chấm · `C` = plan còn khái niệm active.

| tên            | điều kiện         | `message`                                                                                                                                          |
| -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DUE-DONE`     | `some(L)`         | `"Bạn đã hoàn thành kế hoạch hôm nay 🎉"`                                                                                                          |
| `EMPTY-GRAPH`  | `!L`, `every(!C)` | `"Hôm nay không có gì đến hạn. Kế hoạch của bạn hiện không có khái niệm nào — thêm khái niệm vào đồ thị hoặc phân tích lại tài liệu để bắt đầu."`  |
| `CHANGED`      | `!L`, `every(g)`  | `"Hôm nay không có gì đến hạn. Nội dung kế hoạch đã thay đổi nên lịch ôn cũ không còn hiệu lực — làm một phiên với nội dung mới để có lịch thật."` |
| `INVITE`       | `!L`, `every(!g)` | `null` → FE giữ lời mời của riêng nó                                                                                                               |
| `INVITE-MIXED` | `!L`, `g` lẫn lộn | `null` → **cùng lời mời, mượn CÓ CHỦ ĐÍCH**                                                                                                        |

⚠️ **Ba cờ dùng ba lượng từ khác nhau, và đó là chủ đích.** Lời mời chỉ cần **một** plan thật sự
sẵn sàng cho phiên đầu là đủ giữ (`some`); còn **chẩn đoán** thì phải đúng với **mọi** plan nó
đang nói về (`every`). "Thống nhất" ba cờ về cùng một lượng từ là dựng lại đúng bug: bản nháp
dùng `some` bắn câu "nội dung đã đổi" vào sinh viên mà plan kia chỉ đơn giản là mới, đồng thời
nuốt mất lời mời duy nhất họ hành động được.

⚠️ `EMPTY-GRAPH` xét **trước** `CHANGED` vì một đồ thị bị xoá sạch thoả **cả hai**; "kế hoạch
không có khái niệm nào" là chẩn đoán cụ thể hơn và hành động được, còn `CHANGED` sẽ mời họ đi xem
một đồ thị rỗng.

⚠️ **Câu của `/today` KHÔNG dùng lại câu của mục 1** dù cùng ca: `/today` gộp nhiều kế hoạch nên
không được nói "Kế hoạch **này**".

⚠️ **Vế cuối nêu VIỆC NGƯỜI DÙNG LÀM, không nêu NƠI NGƯỜI DÙNG TỚI** — nút đã nói nơi rồi. Vì thế
vế hành động của `CHANGED` **trùng nguyên văn** với câu `noScheduleNote` ở mục 1, và của
`EMPTY-GRAPH` trùng nguyên văn với câu ca "đồ thị rỗng": bốn câu, hai cặp, không cặp nào lệch chữ
ở phần việc-phải-làm. Nếu sửa một câu mà cặp của nó lệch theo thì một trong hai đang sai.

- **Không có `includeSkipped` ở endpoint này:** nhóm "đã gỡ" là chuyện của một kế hoạch cụ thể
  (màn Kế hoạch ôn tập), không phải của danh sách gợi ý gộp nhiều plan.

- **Lỗi Validation query (HTTP 400 Bad Request):** giống mục 1, chỉ áp dụng cho `limit`.

---

### 3. Sửa một mục: Gỡ khỏi lịch / Đưa lại / Hoãn đến mai

- **Endpoint:** `PATCH /api/v1/review-queue/:itemId`
- **Xác thực:** ✅ Yêu cầu Bearer Token
- **Dùng để:**
  - màn **Kế hoạch ôn tập** (#225) — nút "Bỏ khỏi lịch" và "Đưa lại vào lịch" trên từng khái niệm;
  - khối **Gợi ý hôm nay** của Dashboard (DB-09 / #233) — hai lối thoát "Hoãn đến mai" và
    "Bỏ qua gợi ý".

**Hai hành động, hai hình dạng body.** Chúng đổi hai **trục khác nhau** và không được gộp:

| Body                 | Hành động    | Đổi cái gì                           | Còn trên lịch?                          |
| -------------------- | ------------ | ------------------------------------ | --------------------------------------- |
| `{ "status": ... }`  | Gỡ / đưa lại | `status`                             | `skipped` → không · `pending` → có      |
| `{ "snooze": true }` | Hoãn đến mai | `scheduledFor` (`status` giữ nguyên) | **Có** — chỉ rời phần "đến hạn hôm nay" |

Body mang **cả hai** key → **400 VALIDATION_ERROR** (cả hai nhánh đều `.strict()`): "giữ trên
lịch" và "gỡ khỏi lịch" là hai lệnh mâu thuẫn, chọn đại một cái nghĩa là nuốt mất một nửa yêu cầu.

#### 3a. `{ "status": ... }` — Gỡ khỏi lịch / Đưa lại

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

  ⚠️ **Thao tác áp cho cả cụm hàng của khái niệm đó trong plan, không riêng `itemId` được gửi**
  (#232). Vì hàng đợi đọc ra đã gộp một mục / một khái niệm, nếu chỉ chuyển đúng một hàng thì
  khái niệm vừa gỡ sẽ quay lại ngay ở lần đọc sau từ một hàng anh em — nút bấm trông như không
  làm gì. Response vẫn trả **đúng item được gửi lên** (shape không đổi); thứ đổi là số hàng
  trong DB đi theo nó.

#### 3b. `{ "snooze": true }` — Hoãn đến mai (DB-09 / #233)

- **Request body:**

  ```json
  { "snooze": true }
  ```

  Cờ trần, **không kèm ngày**. `scheduledFor` mới được đặt bằng **00:00 ngày mai theo giờ
  `Asia/Ho_Chi_Minh`** (`getVnTomorrowStartUtc()` trong `utils/dashboard-stats.ts`) — cùng mốc
  ngày mà streak của #200 dùng, không phải `now + 24h`: hoãn lúc 23:30 mà cộng 24 giờ thì mục
  quay lại lúc 23:30 hôm sau, mất gần trọn ngày đáng lẽ được nhắc.

  `{ "snooze": false }` → **400**. Đó là một lệnh không có nghĩa; nhận nó sẽ thành một no-op 200
  mà người gọi tưởng đã hoãn xong. Gửi kèm `snoozedUntil` cũng **400** — biên ngày thuộc về
  server (C4), không phải đồng hồ của client.

- **Hệ quả:** `status` **không đổi**. Mục rời `GET /review-queue/today` (endpoint duy nhất lọc
  `scheduledFor <= now`) cho hết hôm nay rồi tự quay lại vào ngày mai, và **vẫn nằm nguyên** trong
  hàng đợi của kế hoạch ở mục 1. Đây là chỗ khác hẳn `"skipped"`: "hôm nay bận" không phải là
  "không cần ôn nữa".

- **Phạm vi ghi:** cũng áp cho cả cụm hàng của khái niệm (#232), nhưng thu hẹp hai lần — chỉ các
  hàng **đang đến hạn** (`scheduledFor <= now`) và **còn trên lịch** (không `skipped`/`done`).
  Hàng đã xếp cho một ngày trong tương lai mà bị dời về mai hoá ra là **kéo sớm lên**, ngược nghĩa
  nút bấm; còn hàng đã bị gỡ thì ngày đến hạn của nó là thứ nút "Đưa lại vào lịch" dựa vào.

- **Response thành công (HTTP 200 OK):** cùng shape mục 3a, **thêm `scheduledFor`** — mốc do
  server chốt, đọc lại từ DB sau khi ghi (gọi API cho một hàng không đến hạn là hợp lệ và sẽ
  không dời gì cả; response phải nói đúng sự thật đó).

  ```json
  {
    "success": true,
    "data": {
      "item": {
        "id": "9f1c1e2a-...-uuid",
        "conceptId": "b2d3e4f5-...-uuid",
        "planId": "c1f8a8b1-...-uuid",
        "status": "pending",
        "scheduledFor": "2026-08-05T17:00:00.000Z"
      }
    }
  }
  ```

#### Vì sao là một endpoint hai hình dạng body (chốt 09/08/2026 — #233)

Năm phương án đã cân, bốn bị loại vì lý do cứng:

| Phương án                       | Vì sao loại                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `{ "snoozedUntil": "..." }`     | Client sở hữu mốc ngày → mở đường cho `now + 24h` và cho mọi múi giờ khác. AC cấm thẳng (C4).                                      |
| `{ "status": "snoozed" }`       | Trộn hai trục: hoãn **giữ** `status = 'pending'`. Thêm một giá trị enum vào đúng chỗ #224 vừa dọn.                                 |
| Endpoint thứ hai (`/snooze`)    | AC cấm "đẻ endpoint thứ hai cho một thao tác cùng tài nguyên".                                                                     |
| `{ "action": "snooze" \| ... }` | Discriminant đẹp hơn, nhưng phá contract `{ status }` mà #225 **đang gửi live** — viết lại + test lại phần đã ship, không thêm gì. |

Còn lại là union hai shape ở trên: **cộng thuần**, nhánh `{ status }` cũ đi qua y hệt như trước.
Hai shape khác nhau là trung thực chứ không phải bừa bãi — chúng đổi hai trục khác nhau
(`status` với `scheduledFor`), đúng như bảng đầu mục 3.

---

#### Lỗi — chung cho cả hai hình dạng body

- **Lỗi Validation body (HTTP 400 Bad Request):** body không khớp nhánh nào — thiếu cả `status`
  lẫn `snooze`, `status` sai giá trị, `snooze` không phải `true`, hoặc có key lạ / mang cả hai.

  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid input data",
      "details": [
        {
          "code": "invalid_union",
          "path": [],
          "message": "body must be { status: 'skipped' | 'pending' } or { snooze: true }",
          "errors": ["…issue của từng nhánh…"]
        }
      ]
    }
  }
  ```

  Union hỏng thì **mọi** nhánh đều hỏng, nên câu mặc định của zod (`"Invalid input"`) không nói
  được gì; `details[0].message` vì thế nêu thẳng cả hai hình dạng hợp lệ. Hai chỗ **không** dọn:
  `error.message` vẫn là câu chung `"Invalid input data"` và `details[0].errors` vẫn kèm issue
  của từng nhánh — cả hai do `middleware/errorHandler.ts` trả nguyên `err.issues`, sửa nó là
  chạm mọi endpoint dùng Zod.

- **Lỗi `itemId` thiếu hoặc không phải UUID (HTTP 400 Bad Request):** `itemId` là `@db.Uuid`
  trong Prisma nên được validate là UUID hợp lệ trước khi chạm DB (tránh P2023 → 500).

  ```json
  {
    "success": false,
    "error": { "code": "VALIDATION_ERROR", "message": "Invalid input data", "details": [] }
  }
  ```

- **Lỗi không tìm thấy / không thuộc về user (HTTP 404 Not Found):** item không tồn tại **hoặc**
  thuộc plan của user khác đều trả cùng lỗi này. Cũng là câu trả lời cho gợi ý ảo **A3-fallback**
  (`id: null` ở mục 1): nó không có hàng trong DB nên không hoãn / không gỡ được — FE ẩn hẳn hai
  nút, BE vẫn phải trả lỗi tử tế nếu bị gọi thẳng.

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
