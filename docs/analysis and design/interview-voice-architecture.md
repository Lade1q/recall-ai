# Interview v2 — Voice-to-Voice Architecture (Sprint 5)

> **Trạng thái:** v0 draft cho Quân duyệt · nguồn: [[project_interview_module_rethink_sprint5]] + verify live main 10/08 (sau #281/#289/#305/#310).
> **Cặp tài liệu:** kế hoạch/lịch/SDP ở `docs/management/sprint-plans/sprint-5-plan.md` (Co-Plan). File này = kiến trúc kỹ thuật lane (2)(3)(4).
> **Chưa commit** tới khi Quân duyệt; khi commit ra nhánh mới, không phải `feat/310`.

---

## 0. Nguyên tắc bất di

**Deterministic Concept Graph Engine (traceback BFS · mastery · spaced-repetition · scheduling) KHÔNG đổi.** Voice chỉ thay **tầng dẫn phiên** và **cách SINH RA** `masteryScore`. Engine vẫn nhận `masteryScore: number | null` per concept như hôm nay.

Ranh giới AI/tất định **dịch về phía tất định**, không phải rời xa: hôm nay AI phát thẳng `score` (`gradeAnswerResponseSchema = {score,feedback,verdict}`); v2 AI chỉ phát **bằng chứng**, **code tính điểm**.

---

## 1. Hai bất biến (viết vào code, không phải khuyến nghị)

**INV-1 — Checkpoint chốt TRƯỚC khi phiên mở, bất biến khi chấm.**
Danh sách checkpoint của một concept được sinh + persist lúc **phân tích** (extend `extract_concepts`), không phải lúc phỏng vấn. Lý do: nếu để model Live tự chế checkpoint giữa chừng thì _model tự đúc thước rồi tự đo mình_ — đúng thứ ta vừa loại. Đây là **C4 ở tầng vi mô**: bên tất định sở hữu cái thước. (Đo DB 10/08: `excerpt` median 81 ký tự, max 175 — là _neo_, không đủ đẻ checkpoint runtime; xác nhận phải persist trước.)

**INV-2 — `contradicted` CHỈ khi hiểu-sai đã chốt; mọi ca chưa ngã ngũ → không phát gì.**
Model phát `contradicted` cho một checkpoint **chỉ sau khi đã probe và sinh viên thể hiện rõ một hiểu-sai**. Dở dang / mơ hồ / bị ngắt / chưa nói tới → **không emit** → rơi vào `not_discussed` → null-ish → **không bị phạt**. Đây là "chưa trả lời xong ≠ sai" (lời chê gốc của Quân) sống ở grain checkpoint, cùng nguyên tắc `null ≠ 0` mà repo đã có (`calculateMasteryScore([]) → null`, verify `mastery.ts`).

---

## 2. Grain hợp nhất: AI phát bằng chứng, code chấm

### 2.1 Model chỉ phát 2 trạng thái

Cả text lẫn voice, model phát evidence **per-checkpoint**, KHÔNG phát điểm:

```
record_evidence(checkpointId, status: 'covered' | 'contradicted', quote: <trích lời sinh viên>)
```

- `not_discussed` **không nằm trong schema model** — nó là **suy tất định lúc đóng concept**: `checkpoints_chốt − checkpoints_có_evidence`. Đẩy thêm một mẩu từ AI sang code.
- **Voice:** model gọi `record_evidence` **tăng dần** (async FC + `SILENT`: ghi nhận không cắt lời) mỗi khi một checkpoint ngã ngũ.
- **Text:** `grade_answer` **đổi schema** sang cùng shape evidence (thay `{score,feedback,verdict}`). Một câu trả lời text → 0..n evidence.
- 🔎 **Quyết định mở:** gom `grade_answer` (text) + `record_evidence` (voice) thành **một schema `assess_checkpoints`** dùng chung? → giảm còn 4 fixed-schema. Nghiêng "có" (cùng shape, khác cách gọi). Chốt khi dựng schema.

### 2.2 Bảng evidence + atomicity

```
InterviewEvidence: (sessionId, conceptId, checkpointId) UNIQUE
  status: 'covered' | 'contradicted'
  quote:  text
  turnRef / timestamp
```

- **`upsert` theo khoá `(sessionId, conceptId, checkpointId)`** ⇒ **idempotent tự nhiên**: model re-emit (reconnect/retry) chỉ ghi đè đúng ô đó, không nhân bản. **Thay** claim per-turn phức tạp hôm nay (`interview.service.ts:1092` + fix #288 buộc write theo `answeredAt:now`).
- `masteryScore` **không phải một lần ghi tranh chấp** — nó là **phép suy tất định lúc đóng concept** từ bảng evidence. Không còn write-race ⇒ lớp lỗi #288 biến mất theo cấu trúc.
- Rớt connection giữa chừng: evidence đã ở server, concept mở lại tiếp tục từ các checkpoint chưa có evidence.

### 2.3 Công thức coverage→điểm (NHÁP — mời lane 5 soi khớp rubric)

Ký hiệu: `C` = số checkpoint chốt của concept; `ev_covered`, `ev_contradicted` = số có evidence tương ứng; `resolved = ev_covered + ev_contradicted`.

```
coverage = resolved / C
if coverage < MIN_COVERAGE:           masteryScore = null      # "chưa kiểm", KHÔNG phải điểm thấp
else:                                  masteryScore = round2(ev_covered / resolved)
```

**Một câu cho giám khảo:** _"Giải được ≥ 70% (`MIN_COVERAGE`) số checkpoint thì điểm = tỉ lệ đúng trong đó; dưới thì để `null` (chưa kiểm), không phải điểm thấp."_ Đúng một hằng số (`MIN_COVERAGE`) đặt đúng một chỗ (`utils/mastery.ts`) — cùng kiểu repo giữ 0.6 và `max_depth=2`.

- **`MIN_COVERAGE = 0.7` (KHÔNG phải 0.5 — có lý do, ĐỪNG HẠ):** vì conductor giờ chỉ đóng-sớm qua **budget**, cách duy nhất coverage rơi vào khoảng `(MIN_COVERAGE, 1.0)` là **sinh viên đơ giữa chừng** — ca thiết kế phải có (INV-2), không hiếm. Với ngưỡng thấp 0.5: `C=4`, giải đúng 2 rồi **đơ** 2 ⇒ `coverage = 2/4 = 0.5` **qua cổng** ⇒ `masteryScore = 2/2 = 1.0` — làm **nửa** concept rồi tắc được **mastery tuyệt đối, không traceback**. Đúng chỗ giám khảo chọc _("2/4 sao 1.0?")_. **Cái sai KHÔNG phải mẫu số** (đổi `covered/C` thì phạt `not_discussed` như sai → vi phạm INV-2), mà là **ngưỡng quá thấp**. `0.7`: giải < 70% → `null` (quay lại hàng đợi — "chưa demo được thạo thì phải ôn lại"); giải ≥ 70% rồi đơ phần nhỏ (< 30%) → chấm trên phần đã giải, hợp lý. Trade-off: 0.7 chặt hơn ⇒ concept dở-dang rơi `null` nhiều hơn ⇒ hàng đợi dài hơn — nhưng đó là đúng, không phải bug. Bảo vệ INV-2 ở tầng concept.
- Điểm = tỉ lệ **covered / đã-ngã-ngũ** (contradicted kéo xuống, not_discussed không tính vào mẫu số). Thuần, không DB/API-key ⇒ nằm `utils/` (R05), unit-test bằng fixture evidence.
- **Thay** `TURN_WEIGHTS=[0.2,0.3,0.5]` + `calculateMasteryScore`. Engine hạ nguồn (traceback/`reviewIntervalDays`/`reviewPriority`) **không đổi** — vẫn nhận `number|null`.
- **KHÔNG weight checkpoint theo độ khó** (chốt với lane 5): thêm bảng trọng số + đoạn biện minh ⇒ phá "một câu, một hằng số". Cần phân biệt độ khó thì để checkpoint khó **đếm nhiều dòng hơn** lúc extract — vẫn một công thức.
- ⚠️ **Thuộc tính đã biết — lượng tử hoá khi `C` nhỏ:** `covered/resolved` rời rạc khi ít checkpoint. `C=1` ⇒ {0, 1}; `C=2` ⇒ {0, 0.5, 1} mà 0.5 < 0.6 ⇒ concept 2-checkpoint đúng-một-sai-một **tự traceback**. Nhất quán với hệ cũ (0.5 cũng < 0.6) nên không sai, nhưng **concept quá ít checkpoint = pass/fail thực tế** ⇒ thêm lý do route concept mỏng về **đường text** (guard §2.4). `MIN_COVERAGE` (sàn coverage) ≠ `0.6` (ngưỡng mastery ở engine) — **hai đại lượng khác tầng**, mỗi cái một chỗ.

### 2.4 Guard tiền-điều-kiện: concept KHÔNG checkpoint → đường text (R17/R18)

Concept thiếu checkpoint (plan cũ chưa backfill, hoặc ~6,2% concept không có `concept_source` ref) **không voice-assessable** — coverage không định nghĩa được. **Guard tất định** route concept đó sang **đường text** (generate_question/grade_answer→evidence), model Live **KHÔNG được ứng biến** checkpoint trong ca này (vi phạm INV-1). Cờ đếm được để đo tần suất. Đây là **nhánh bắt buộc tồn tại**, không phải ngoại lệ hiếm — viết vào DoD.

---

## 3. Fallback 2 trục (thay 1 boolean latch một chiều)

Hôm nay `fallbackMode` (`interview.service.ts:560-568`, `:661`) là **một boolean một chiều** gộp mọi sự cố thành "AI grade hỏng → flashcard cả phiên". Voice cần tách:

| Trục             | Trạng thái           | Kích hoạt        | Hồi phục?                                                                                                                                                            |
| ---------------- | -------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kênh nhập**    | `voice` ↔ `text`     | mic/STT hỏng     | **Có**, per-utterance. Rớt xuống gõ, hội thoại tiếp. KHÔNG phải flashcard. Tái dùng ngữ nghĩa `gradingUnavailable()` (`:1114`, giữ answerText/verdict null).         |
| **Động cơ chấm** | `live` → `flashcard` | Live/Gemini chết | Transient (1 connection rớt) → reconnect concept sau. **Persistent** (rớt lặp quá biên) → latch flashcard cả phiên (giữ latch một chiều HIỆN CÓ, chỉ cho nhánh này). |

⇒ Latch một chiều còn sống, nhưng chỉ là **nhánh cuối cùng** (persistent engine-down), không phải phản ứng đầu tiên.

---

## 4. Connection-per-concept + 3 ranh giới (không cái nào của model)

**"1 connection Live = 1 concept"** (ý Co-Plan): backend mở connection cho concept X (grounded chỉ bằng lát tài liệu của X qua system instruction — bất biến giữa phiên trở thành _tính năng_: model không có đường ra khỏi lát đó), đóng, mở concept kế.

| Ranh giới          | Thang | Ai quyết                    | Cơ chế                                                                    |
| ------------------ | ----- | --------------------------- | ------------------------------------------------------------------------- |
| hết lượt nói       | ~1s   | **client** (VAD ta tự cầm)  | `activityStart/End` → proxy → Live                                        |
| checkpoint ngã ngũ | ~10s  | **model BÁO** (không quyết) | `record_evidence`                                                         |
| hết concept        | ~phút | **backend tất định**        | **tất cả checkpoint đã ngã ngũ** ∨ hết budget thời gian → đóng connection |

⚠️ **Conductor KHÔNG có ngưỡng coverage riêng** (chốt với lane 5). Nó nhắm **giải HẾT** checkpoint; dừng khi _tất cả đã ngã ngũ_ **hoặc** _hết budget thời gian/lượt-nói_ của concept — cả hai là trục **thời-gian/tiến-độ**, không phải trục coverage. `MIN_COVERAGE` (§2.3) chỉ là **sàn từ-chối-chấm**, KHÔNG phải mục tiêu dẫn phiên. Nếu conductor mọc một ngưỡng coverage riêng: (a) mọi concept đóng ngay ở sàn ⇒ **over-credit thành thường lệ** (2/4 đúng = 1.0, không traceback — sai), (b) sinh **hằng-số-coverage-thứ-hai** ⇒ gãy mệnh đề rubric "một hằng số, một chỗ". Vì conductor nhắm 100%, thực tế concept đóng ở coverage cao ⇒ mẫu số ≈ `C` ⇒ hai triết lý điểm hội tụ, over-credit gần như biến mất.

Model **không được hỏi "có tiếp không"** ở cả ba → đó là câu trả lời C4. `automaticActivityDetection.disabled: true` + client tự gửi `activityStart/End` ⇒ ta cầm endpointing (né bug `silenceDurationMs` vendor — UNVERIFIED, Co-Plan theo dõi).

**Thay gì trong code hiện tại:**

- `POST /interviews/:id/answers` (đường text) **giữ nguyên** làm kênh backup + fallback.
- `decideNextStep()`/`resolveFallbackStep()` (2 state machine text) **giữ** cho đường text; voice **không dùng** — routing voice = mở/đóng connection.
- Kênh voice cần **WS proxy backend** (lane D2 Co-Plan): repo hôm nay 0 dòng WebSocket/audio, `GoogleGenAI({apiKey})` kiểu AI-Studio, chưa có Vertex.

---

## 5. Bề mặt gọi AI & câu sửa C4

| #   | Bề mặt                              | Schema    | Routing/Score?    | Đường         |
| --- | ----------------------------------- | --------- | ----------------- | ------------- |
| 1   | `extract_concepts` (+`checkpoints`) | fixed     | không             | chung         |
| 2   | `generate_question`                 | fixed     | không             | text/fallback |
| 3   | `grade_answer` → evidence           | fixed     | không (code chấm) | text/fallback |
| 4   | `summarize_session`                 | fixed     | không             | chung         |
| 5   | `record_evidence`                   | fixed     | không             | voice         |
| 6   | **Hội thoại Live**                  | **KHÔNG** | **không**         | voice         |

(#3+#5 có thể gom → 4 fixed-schema; xem 2.1.)

**Câu sửa C4 (cho lane 5):** C4 cũ _"AI called ONLY for [...] with fixed JSON schemas"_ → mở **#6 (hội thoại tự do, không schema)** — đây là thay đổi hạng mục, không phải thêm 1 call. Rào bằng **3 bảo đảm tất định**: (a) routing = code (mở/đóng/chuyển/kết); (b) scoring = code (coverage→mastery); (c) `record_evidence`/`assess_checkpoints` = **đầu ra có cấu trúc DUY NHẤT** feed chấm. Lõi C4 _(AI không sở hữu assess→graph→schedule)_ **giữ nguyên** — thứ đổi là _AI conduct không còn bị trói vào fixed-schema calls_.

**C5 — đo được, YÊU CẦU KIẾN TRÚC NGÀY-1 (không phải QA cuối sprint):** proxy (D2) bật `inputAudioTranscription` + `outputAudioTranscription` **từ đầu**, persist transcript **cả hai chiều** kèm **lát tài liệu đã phục vụ cho concept này**. Có bộ ba đó, một hàm thuần **LEXICAL** ở `utils/` (lane 2, test bằng fixture) đo chỉ số C5 = **tỉ lệ câu hỏi model có ≥1 thuật ngữ khoá KHÔNG xuất hiện trong lát đã phục vụ**. 🔴 **KHÔNG dùng AI-judge:** một call phân xử ngữ nghĩa "trong/ngoài lát" sẽ là **bề mặt AI thứ 7** (phá con số "≤5 fixed + 1 hội thoại" vừa chốt cho C4) và **không thuần ⇒ gãy R05**. Lexical có nhiễu (đồng nghĩa/diễn đạt lại), nhưng rubric cần **một số tất định, giải-thích-được**, không cần độ chính xác ngữ nghĩa hoàn hảo. ⇒ C5 chuyển từ "đã viết prompt" sang "**đã đo, có số**" (bằng chứng mạnh nhất cho mệnh đề rubric lane 5 + khối 20đ testing). **Không có móc transcript này thì không đo được C5** — nên nó là điều kiện kiến trúc, không phải việc làm sau. C6: `3-lượt/[0.2,0.3,0.5]` → thay bằng coverage-formula (§2.3); grain đổi, không xoá.

---

## 6. Quyết định mở (cần chốt trước khi build)

1. **Nguồn checkpoint:** (b) thêm `checkpoints` vào `extract_concepts` — **đã chốt** (đo DB giết (a)). Spike thì **hardcode từ 1 PDF fixture**, không đụng DB/pipeline.
2. **Gom `grade_answer` + `record_evidence` → `assess_checkpoints`?** Nghiêng có.
3. ~~MIN_COVERAGE / weight độ khó~~ — **ĐÃ CHỐT (lane 5):** `MIN_COVERAGE = 0.7` (lý do over-credit ở §2.3, **đừng hạ về 0.5**); **KHÔNG** weight checkpoint theo độ khó (checkpoint khó đếm nhiều dòng lúc extract).
4. **Pipeline trích-text + chunk-theo-concept** (lane D2/1 Co-Plan): repo chưa có (grounding hôm nay chỉ nhờ Gemini tự đọc file; Live KHÔNG nhận file). Chi phí lớn nhất của B; trả nợ luôn `gemini.service.ts:409`.
5. **Biên guard concept mỏng:** §2.4 guard bắn ở `C=0` (không checkpoint); §2.3 nói `C=1,2` là pass/fail thực tế. Chốt biên **`C < N` → route đường text** (N đặt cạnh `MIN_COVERAGE`), để người dựng guard khỏi đoán "voice-assess một concept 1 điểm hay đẩy sang text". Chưa cần chốt số bây giờ.

---

## 7. Coexistence & migration (lane 4)

**Đường text giữ nguyên làm backup/fallback** (`POST /interviews/:id/answers`, `generate_question`, `grade_answer`→evidence). Không thay hẳn.

### 7.1 Migration hợp đồng `/summary` (R20) — đổi grain đụng PR đang mở

`GET /interviews/:id/summary` hôm nay trả `concepts[].turns[{turnIndex, score, verdict}]`. Grain v2 là **per-checkpoint** ⇒ per-turn `score/verdict` mất nghĩa. Consumer: **#305** (masteryScore từ turns, merged) · **#310** (id+sourceConceptId, merged, = HEAD nhánh đang đứng) · **PR #307** (màn kết quả FE, `ScoreBreakdown` per-turn, **CHƯA merge, của @baonguyen1776, còn blocker `.items.find`**).

- **Không xoá cứng `turns[]`:** giữ nó làm **transcript** (`turnIndex` + `answerText`), **deprecate** `score/verdict` per-turn (null ở v2); **thêm** `checkpoints[]`/coverage vào response. Migration mềm, không đập hợp đồng dưới chân consumer đang chạy.
- **Thứ tự bắt buộc (đúng "báo tác giả trước"):** ① merge #307 (vá `.items.find` bằng `id` của #310, gỡ workaround) → ② **báo @baonguyen1776 trước khi đổi schema** → ③ mới đổi `grade_answer`→evidence.
- ⚠️ **#307 bị chạm HAI LẦN:** now (fix theo #310, grain v1) + **S1** (đổi `ScoreBreakdown` per-turn → per-checkpoint). ⇒ **màn kết quả là HẠNG MỤC FE trong S1, không phải "đã xong".** (Cũng chính là chỗ workaround seam `WeightedFormula` — nó vốn đã tới số phải viết lại.)

### 7.2 Neo nguồn C5 trong voice (đừng đánh rơi tính năng Sprint 4)

Sprint 4 đã ship neo nguồn C5 cho text (#237/#241/#242): mỗi câu hỏi **chụp** `sourceDocumentId/pageFrom/pageTo` lên `InterviewTurn` lúc hỏi, client render _"tệp · trang N"_. **Voice không có "câu hỏi" được lưu để gắn neo** — model chỉ nói.

- **Lời giải (tất định hơn text):** backend là bên **chọn + phục vụ lát tài liệu** cho concept ⇒ backend **biết chắc** nguồn, không cần AI khai. UI voice neo ở **mức concept đang hỏi**, lấy thẳng từ lát đã phục vụ.
- text: AI khai → code chụp. **voice: code sở hữu hoàn toàn** ⇒ thêm một luận cứ "bề mặt tất định to ra". Giữ **feature-parity C5** giữa 2 kênh; không để kênh chính Sprint 5 ship thiếu thứ Sprint 4 đã có.
