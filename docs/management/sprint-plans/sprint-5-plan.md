# Sprint 5 – Kế hoạch & Phân công

> **Sprint 5:** 10/08 – 23/08/2026 · Kết sprint bằng **final demo + PA5**
> **Chủ đề:** Tái kiến trúc module Interview — đổi grain chấm điểm và đưa voice-to-voice thành kênh chính.
>
> Tài liệu này giữ phần **phạm vi · lịch · ràng buộc · rủi ro**.
> Phần **kiến trúc chi tiết** (bất biến chấm điểm, schema checkpoint, vòng đời connection, fallback 2 trục) nằm ở `docs/analysis and design/interview-voice-architecture.md` — không chép lại ở đây.

---

## 1. Mục tiêu Sprint

Ba vế, theo đúng thứ tự ưu tiên:

1. **Đổi grain chấm điểm** từ 3-lượt-có-điểm sang **đánh giá theo checkpoint per-concept**, để "chưa trả lời xong" không còn bị ghi thành "sai" vào Concept Graph Engine.
2. **Đưa voice-to-voice (Gemini Live) thành kênh dẫn phiên chính**, text còn lại làm đường lui.
3. **Giữ nguyên Concept Graph Engine tất định** (traceback BFS · mastery · spaced repetition · scheduling). Đây là điểm khác biệt được chấm nặng nhất — voice chỉ thay **tầng dẫn phiên**, không được lan vào tầng quyết định.

**Điều kiện cần của cả ba:** bề mặt tất định phải **to ra**, không được co lại. Xem mục 3.

---

## 2. Quyết định đã chốt

| #   | Quyết định                                                                                                                                       | Ai chốt        | Ngày  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----- |
| Q1  | Voice-to-voice là **kênh chính**; text là đường lui khi mic hỏng / nội dung phức tạp                                                             | Quân           | 10/08 |
| Q2  | Grain chấm **đổi**: bỏ 3-lượt-có-điểm, sang đánh giá per-concept từ hội thoại                                                                    | Quân           | 10/08 |
| Q3  | Làm **ngay trong Sprint 5** — deliverable thật, không phải ghi hướng cho sau này                                                                 | Quân           | 10/08 |
| Q4  | Budget **không còn là ràng buộc**; vendor = **Gemini Live API**                                                                                  | Quân           | 10/08 |
| Q5  | Tham vọng nhánh B = **tính năng voice tích hợp đầy đủ** (không phải lát dọc demo) — chọn sau khi đã nghe ước lượng 3–4 tuần và rủi ro trượt demo | Quân           | 10/08 |
| Q6  | **Hoãn** #245 #246 #247 #248 #211 #172 sang sau demo để lấy năng lực                                                                             | Quân           | 10/08 |
| Q7  | **AI phát bằng chứng, code chấm điểm** — model không được phát thẳng `masteryScore`                                                              | Plan + co-Plan | 10/08 |
| Q8  | Checkpoint sinh lúc **phân tích** (mở rộng schema `extract_concepts`), **không** suy từ `concept_sources.excerpt` lúc chạy                       | Plan + co-Plan | 10/08 |
| Q9  | **1 connection = 1 concept**; backend mở/đóng, model không quyết chuyển khái niệm                                                                | Plan + co-Plan | 10/08 |
| Q10 | Evidence ghi **tăng dần** trong phiên, không dồn một lần cuối                                                                                    | Plan + co-Plan | 10/08 |
| Q11 | `fallbackMode` tách **2 trục**: kênh-nhập (voice↔text, hồi phục được) và động-cơ-chấm (Live↔flashcard, latch một chiều)                          | Plan + co-Plan | 10/08 |
| Q12 | **#121 không đóng** — tái định nghĩa thành phương án lui nếu cổng 13/08 ra no-go                                                                 | Plan + co-Plan | 10/08 |

---

## 3. Ràng buộc kiến trúc — bản đã xác minh

### 3.1 Ràng buộc cứng, nguyên văn

Trích thẳng SDP v1.2 §2.2 _Assumptions and Constraints_ (`pa/pa2/Project plan/Software Development Plan v1.2.pdf`, tr.5). **C4 có hai mệnh đề — mệnh đề thứ hai hay bị nhớ thiếu:**

> **C4:** AI must not be used as an orchestrator - all routing decisions (when to stop, when to switch concepts, when to trigger trace-back) are deterministic software logic, not AI decisions. **AI is called only for `generate_question` and `grade_answer` with fixed JSON output schemas.**
>
> **C5:** The AI Examiner must never generate questions outside the user's uploaded material - no external knowledge fabrication.
>
> **C6:** The maximum number of question-answer turns per concept is fixed at 3 turns to control API cost and response time.

Ba ràng buộc cùng mục nhưng **không đánh số** (hay bị bỏ quên): lịch cứng 10 tuần · team cố định 5 người · **"Zero budget - all tools and services must use free tiers (Gemini API free tier, …)"**.

**Không tồn tại C1/C2/C3.** (`C1.`–`C5.` trong `docs/management/sprint-4-spec-audit.md` là số hiệu _mục tài liệu_, không liên quan.)

Lệch giữa hai bản: SDP đếm **2** call (`generate_question`, `grade_answer`); bản tiếng Việt team dùng (`sprint-4-plan.md` mục 6) đếm **4** (thêm `extract_concepts`, `summarize_session`). Bản sửa ở mục 5 phải giải quyết dứt điểm lệch này.

### 3.2 Cái gì đổi, cái gì giữ

| Ràng buộc                                         | Sprint 5                                        | Lý do                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **C4 mệnh đề 1** (AI không điều phối)             | **GIỮ NGUYÊN, siết hơn**                        | Backend mở/đóng connection ⇒ "when to switch concepts" đúng nghĩa đen là quyết định của code. Model không bao giờ được hỏi "có tiếp không". |
| **C4 mệnh đề 2** (đếm bề mặt gọi AI)              | **SỬA**                                         | Voice thêm một bề mặt mới (`record_evidence`). Xem mục 5.                                                                                   |
| **C5**                                            | **GIỮ NGUYÊN — ràng buộc cứng nhất của sprint** | Hội thoại voice tự do là môi trường dễ trôi khỏi tài liệu nhất mà sản phẩm từng có. Xem 3.3.                                                |
| **C6** (3 lượt)                                   | **THAY, không xoá**                             | `TURN_WEIGHTS [0.2,0.3,0.5]` thay bằng công thức coverage + budget thời gian/lượt nói per-concept. Trần chi phí vẫn còn, chỉ đổi đơn vị.    |
| **Zero budget**                                   | **BỎ** (Q4)                                     | Và không còn là lựa chọn: Live API bắt buộc bật billing. Xem R11.                                                                           |
| DAG · `max_depth = 2` · ngưỡng 0.6 · `null ≠ 0.0` | **GIỮ NGUYÊN**                                  | Concept Graph Engine không bị đụng tới. `null ≠ 0.0` còn được dùng nhiều hơn trước — xem 3.4.                                               |

### 3.3 C5 trong voice — không có cơ chế chính thức nào

Đây là rủi ro số 1 của sprint, và nó **không giải được bằng prompt engineering đơn thuần**:

- Live **không nhận PDF/document** — chỉ inline image ≤ 7MB. Không có File API.
- **File Search bị loại trừ tường minh** khỏi Live API.
- Vertex RAG Engine dùng được như tool trong Live nhưng launch stage = **Experimental**.
- System instruction **không sửa được giữa phiên**; giới hạn kích thước không công bố.
- Trang best-practices chính thức của Live **không có một dòng nào** về grounding hay chống bịa.

Và một tiền đề bị bỏ sót khi lập kế hoạch: **backend hiện không có text của tài liệu.** PDF chỉ được đẩy lên Gemini File API rồi truyền URI; `pdf-lib` trong repo chỉ dùng để kiểm mã hoá và đếm trang, nó không trích được text. Không có chunking, không embedding. Toàn bộ grounding hôm nay chạy được **chỉ nhờ Gemini tự đọc file** — mà Live thì không nhận file.

⇒ **Pipeline trích text + chunk theo concept là hạng mục bắt buộc của nhánh B** (chặng S2), và là chi phí lớn nhất chưa từng được đếm trong bất kỳ ước lượng nào trước đó. Nó trả luôn món nợ ghi sẵn ở `src/server/src/services/gemini.service.ts:409` (_"Tech debt for Sprint 5: send per-concept excerpts instead of the whole file"_), nên đường text cũng hưởng.

**Không dùng `concept_sources.excerpt` làm vật liệu hội thoại.** Đo DB dev 10/08: độ dài excerpt **min 51 · trung vị 81 · max 175 ký tự** (schema cho phép 2000 nhưng model thực tế trả một câu). 81 ký tự nuôi được khoảng 20 giây hội thoại. Excerpt là **cái neo trích dẫn**, không phải tài liệu.

### 3.4 Bề mặt tất định phải to ra — đây là mệnh đề rubric

Ranh giới **hôm nay**: AI trả `{score, feedback, verdict}` mỗi lượt (`src/server/src/schemas/ai-interview.schema.ts`), code làm phần tổng hợp (`reconcileVerdict` → `calculateMasteryScore` → traceback → scheduling). Tức **AI vốn đã là bên sinh ra con số**.

Nếu đổi grain mà để model phát thẳng `masteryScore` holistic thì tầng tổng hợp **biến mất** — bề mặt tất định co lại, ngược đúng hướng thứ rubric thưởng.

Thiết kế đã chốt làm ngược lại:

|                       | Hôm nay                | Sprint 5                                                                                    |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| AI phát               | `score` (con số)       | `covered` / `contradicted` + trích dẫn transcript                                           |
| Code tính             | trung bình có trọng số | **điểm, từ coverage**                                                                       |
| `not_discussed`       | không tồn tại          | **code suy** (`checkpoint đã chốt − checkpoint có evidence`)                                |
| Thước đo (checkpoint) | không có               | **chốt trước khi connection mở, bất biến**                                                  |
| Guard bất định        | không có               | **code hạ evidence bất-định / enum-rác → `not_discussed`** (backstop INV-2, §2.5 kiến trúc) |

Câu tóm cho báo cáo và cho PA5 (sửa sau spike S0): **"AI chứng kiến; CODE bảo đảm — không chỉ chấm (coverage) mà còn chặn phạt-oan điều chưa rõ (guard bất định §2.5). Spike S0 chứng minh model một mình sẽ dán 'không nhớ' = hiểu-sai; nên 'không phạt điều chưa rõ' là bảo đảm của code, không phải kỳ vọng ở prompt."**

Hai bất biến chống âm-tính-giả (chi tiết ở tài liệu kiến trúc):

- Model phát `contradicted` **chỉ khi** sinh viên thể hiện rõ một hiểu-sai đã chốt. Mọi thứ chưa ngã ngũ — dở dang, mơ hồ, bị ngắt — **không phát gì** ⇒ rơi về `not_discussed` ⇒ không bị phạt.
- Coverage dưới ngưỡng ⇒ `masteryScore = null` (**"chưa kiểm"**), không phải điểm thấp.

Cả hai là hệ quả trực tiếp của luật `null ≠ 0.0` đã có sẵn trong repo — không phải luật mới.

> ⚠️ **Đính chính sau spike S0 (11/08):** bất biến thứ nhất KHÔNG tự thực thi được bằng prompt — đo LIVE, model **probe đúng rồi vẫn dán `contradicted`** lên câu "không nhớ/không chắc". Vế "chưa ngã ngũ → không phát gì" là _kỳ vọng ở model_, và model **phá** nó. INV-2 giữ được là nhờ **guard tất định `sanitizeEvidence`** ở `utils/` (§2.5 kiến trúc: hạ evidence bất-định → `not_discussed`), **không** nhờ model tự im.

### 3.5 Trích dẫn nguồn C5 chưa có bản voice — đừng đánh rơi tính năng đã ship

Sprint 4 đã ship trích dẫn nguồn C5 cho đường text (PR #237/#241/#242): mỗi câu hỏi **chụp lại neo nguồn tại thời điểm hỏi** (`sourceDocumentId` · `sourcePageFrom` · `sourcePageTo` trên `InterviewTurn`), và client render `tên tệp · trang N`.

Trong hội thoại voice **không có "câu hỏi" nào được lưu để mà gắn neo**. Model chỉ nói. Nếu không thiết kế thay thế, ta sẽ ship kênh chính của Sprint 5 mà **mất một tính năng C5 đã hoàn thành ở Sprint 4** — đúng thứ rubric dễ soi nhất.

Lời giải sẵn có, và nó **tất định hơn bản text**: backend là bên chọn và phục vụ lát tài liệu cho từng concept, nên nó **biết chắc** nguồn đang được dùng mà không cần AI khai báo. Voice UI hiển thị neo nguồn ở mức concept đang hỏi ("đang hỏi về _X_ — nguồn: `tệp · trang N`"), lấy thẳng từ lát đã phục vụ.

⇒ Bản text: neo nguồn do AI khai, code chụp lại. Bản voice: **neo nguồn do code sở hữu hoàn toàn**. Đây là một luận cứ nữa cho mệnh đề "bề mặt tất định to ra", nên viết vào SDP cùng mục 5.

---

## 4. Nhánh A / Nhánh B và cổng 13/08

Quân đã chọn mức tham vọng **"tích hợp đầy đủ"** (Q5). Điều đó chỉ an toàn nếu **mỗi chặng đều tự demo được**, để chặng sau trượt thì chặng trước vẫn là sản phẩm giao được.

|        | Chặng    | Nội dung                                                                                                                                                          | Tự demo được?                                  |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **S0** | 11–12/08 | **Spike** — chạy song song PA4, code vứt đi, không đụng production                                                                                                | cổng, không demo                               |
| **S1** | 13–15/08 | **Nhánh A trọn vẹn** — checkpoint vào `extract_concepts` · bảng evidence · công thức coverage→điểm trong `utils/` · suy `not_discussed`. Chạy trên **đường text** | ✅ **và đây là thứ sửa lời chê gốc**           |
| **S2** | 15–17/08 | Pipeline trích text + chunk theo concept                                                                                                                          | ✅ đường text ăn ké: ít token hơn, C5 chặt hơn |
| **S3** | 17–19/08 | WS proxy + pipeline audio — **1 concept, hội thoại thật, evidence ghi được**                                                                                      | ✅ lát dọc voice                               |
| **S4** | 19–21/08 | **Tích hợp đầy đủ** — concept-queue · vòng đời phiên · fallback 2 trục · FE màn voice                                                                             | ✅ mức Q5                                      |
| **S5** | 22–23/08 | Làm cứng demo — tai nghe · đường lui · bản ghi dự phòng                                                                                                           |                                                |

> **Luật bánh cóc: S1 phải xong trước S3, dù cổng ra GO hay no-go.** Đó là điều kiện để "đầy đủ" là tham vọng chứ không phải canh bạc. Nhánh A không phụ thuộc vendor, không phụ thuộc S2, và tự nó đã là cải tiến thật.

### Cổng 13/08 — tiêu chí đạt/không đạt

Spike đo đúng 5 thứ. Số liệu, không cảm tính:

| #   | Đo                                                | Đạt khi                                                                    |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| ①   | **Độ trễ từ VN** (mic dừng → byte audio đầu tiên) | p50 < 1,5s · p95 < 3s. Cold start ≤ 3s, chấp nhận 1 lần/connection         |
| ②   | **Chất lượng vi-VN** trên PDF fixture thật        | ≥ 9/10 câu hỏi tiếng Việt tự nhiên, không trôi sang tiếng Anh              |
| ③   | **`record_evidence` async + `SILENT`**            | ≥ 8 lần trong 1 connection 5 phút · **0 lỗi 1008** · không cắt lời         |
| ④   | **Vertex proxy + service account**                | 3 phiên × 5 phút, 0 lần rơi 1011                                           |
| ⑤   | **Echo/barge-in**                                 | tai nghe: 0 lần model tự ngắt lời mình. Loa laptop: ghi số, được phép fail |

**GO** = ①②③④ đạt. ⑤ fail thì vẫn GO nhưng demo **bắt buộc đeo tai nghe**.
**NO-GO** ⇒ giữ S1+S2, thay S3/S4 bằng [#121](https://github.com/Lade1q/planning-ai/issues/121) (vỏ Web Speech STT/TTS trùm lên đường text). Vẫn demo ra tiếng nói, và nhánh A vẫn nguyên giá trị.

---

## 5. Sửa SDP — ba mệnh đề sửa + một backstop mới (④)

Đây là điều kiện để bảo toàn claim "deterministic differentiator" chứ không phải thủ tục. Cả ba đều **bắt buộc, kể cả khi nhánh B bị huỷ** — vì nhánh A một mình đã đụng C6 và bề mặt gọi AI.

**① C4 — mệnh đề đếm call.** Bề mặt gọi AI sau khi đổi:

| #   | Bề mặt                                                                                                   | Có schema?                            | Sở hữu điều phối / chấm điểm?      | Đường               |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- | ------------------- |
| 1   | `extract_concepts` — mở rộng thêm `checkpoints`                                                          | fixed                                 | không                              | chung               |
| 2   | `generate_question`                                                                                      | fixed                                 | không                              | chỉ text / fallback |
| 3   | `grade_answer` — **đổi schema**: phát evidence per-checkpoint thay cho `{score, verdict}`                | fixed                                 | không — code tính điểm             | text / fallback     |
| 4   | `summarize_session`                                                                                      | fixed                                 | không — viết prose trên số đã tính | chung               |
| 5   | `record_evidence`                                                                                        | fixed (schema ở param của tool)       | không — chỉ báo bằng chứng         | voice               |
| 6   | 🔴 **Model dẫn hội thoại trong phiên Live** — tự sinh câu hỏi và probe bằng giọng, tự định nhịp lượt nói | **KHÔNG** — audio tự do, không schema | không — xem ba thanh chắn dưới     | voice               |

**Bề mặt #6 mới là cái C4 phải mở, không phải #5.** `record_evidence` chỉ nới số schema cố định từ 4 lên 5 — thay đổi về **lượng**. Bề mặt #6 **không có schema nào cả** — thay đổi về **hạng mục**. Và trong phiên voice, model phát **hai** thứ, dễ nhầm là một: (a) **giọng hội thoại** — câu hỏi và probe, không schema; (b) `record_evidence` — báo cáo có cấu trúc. Câu sửa C4 chỉ chạm (b) là **hiểu nhẹ thay đổi**: giám khảo nghe model rõ ràng đang _nói chuyện dẫn phỏng vấn_ mà tài liệu bảo "chỉ thêm một schema" thì hớ ngay.

Câu sửa C4 phải **gọi tên bề mặt #6 (a)** và rào nó bằng **ba thanh chắn tất định**:

1. **Điều phối = code.** Mở/đóng connection, chuyển khái niệm, kết phiên — không cái nào hỏi model.
2. **Chấm điểm = code.** Coverage → mastery, bằng công thức trong `utils/`.
3. **`record_evidence` là đầu ra có cấu trúc DUY NHẤT** được phép nuôi việc chấm. Không có đường nào khác từ hội thoại vào Concept Graph Engine.

**Then chốt câu chữ: model _dẫn hội thoại trong một concept_ ≠ model _orchestrate hệ thống_.** Nó conduct bên trong một khái niệm; nó không định tuyến hệ thống. Câu phòng thủ này chỉ đứng được nếu SDP **thừa nhận bề mặt hội thoại rồi rào nó**, chứ không giả vờ nó không tồn tại. Bảng ba ranh giới ở tài liệu kiến trúc (hết-lượt-nói = client · checkpoint-giải-quyết = model _báo_ · hết-concept = backend) là bằng chứng: không ranh giới nào model sở hữu.

Nếu `grade_answer` (text) và `record_evidence` (voice) được hợp nhất thành một schema evidence dùng chung — quyết định thuộc tài liệu kiến trúc — thì con số tụt về 4. Vì vậy câu SDP viết an toàn theo cả hai hướng: **"≤ 5 fixed JSON schema (có thể gom còn 4) + đúng 1 bề mặt hội thoại được rào bằng ba thanh chắn trên"**.

**② C6 — trần 3 lượt.** Thay bằng: trần **coverage + budget thời gian/lượt nói mỗi concept**, cộng luật coverage-dưới-ngưỡng ⇒ `null`. Ghi rõ mục đích gốc của C6 (chặn chi phí và thời gian đáp) **vẫn được phục vụ**, chỉ đổi đơn vị đo.

**③ Zero budget.** Ghi thành sửa đổi có chủ đích, kèm con số: ~$0,023/phút hội thoại. Không được để dạng "im lặng bỏ qua" — nó là ràng buộc có viết trong SDP đã nộp.

**④ Backstop tất định `sanitizeEvidence` (BỔ SUNG, không sửa constraint cũ) — bằng chứng "đã đo" từ spike S0 (11/08).** Ràng buộc khai trong **schema** (enum) lẫn kỷ luật trong **prompt** đều **KHÔNG phải ràng buộc đáng tin trên Live async**, đo LIVE trên Vertex native-audio:

- model đẻ `status:"Running"` ngoài enum `{covered,contradicted}` dưới `WHEN_IDLE` **dù enum đã khai trong schema** (SILENT giữ enum 10/10 run này — nhưng **không tựa vào**: n=1 không chứng minh SILENT mãi sạch);
- model dán `contradicted` lên câu "không nhớ/không chắc" **dù prompt cấm** và đã **probe đúng**.

⇒ Một **guard tất định** ở `utils/` (`sanitizeEvidence`: drop-ngoài-enum + hạ-bất-định → `not_discussed`; xem §2.5 kiến trúc) là **bảo đảm DUY NHẤT** — cùng họ "dời safety từ AI-schema/prompt-trust sang code tất định". Chuyển INV-2 + fidelity từ "đã viết prompt" sang **"đã đo, có bằng chứng"** (fixture before/after hạ đúng quote spike). Đây là mệnh đề rubric mạnh nhất: **hai lần độc lập chứng minh không tin được model kể cả khi đã ràng buộc (schema + prompt) ⇒ code là bảo đảm.**

Kèm theo: cập nhật `sprint-4-plan.md` mục 6 và `UC-Overview.md` §5.1 cho khớp, và ghi vào [#128](https://github.com/Lade1q/planning-ai/issues/128) / [#249](https://github.com/Lade1q/planning-ai/issues/249).

---

## 6. Hoãn để lấy năng lực

Trước khi hoãn: Sprint 5 milestone **13 issue mở**, Sprint 4 tồn **13 issue**, PA4 hạn 14/08, và **không một issue nào là voice**. `@phong0801` và `@baonguyen1776` mỗi người gánh 8 issue.

**Hoãn sang sau demo (Q6):**

| Issue                                                                                                                                                                      | Nội dung                      | Vì sao hoãn được                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| [#245](https://github.com/Lade1q/planning-ai/issues/245) [#246](https://github.com/Lade1q/planning-ai/issues/246) [#247](https://github.com/Lade1q/planning-ai/issues/247) | DB-03/DB-08 Lịch sử & Tiến độ | Lịch sử phiên không phải điểm khác biệt — demo không cần    |
| [#248](https://github.com/Lade1q/planning-ai/issues/248)                                                                                                                   | AE-10 Phản hồi điểm chấm      | Grain chấm đang bị thay; làm bây giờ là làm lên nền sắp đổi |
| [#211](https://github.com/Lade1q/planning-ai/issues/211)                                                                                                                   | Đặt độ khó khái niệm          | Ảnh hưởng thứ tự hàng đợi, không ảnh hưởng demo             |
| [#172](https://github.com/Lade1q/planning-ai/issues/172)                                                                                                                   | Nhập khái niệm thủ công       | SP-01 AF2/A3, ngoài đường găng                              |

Sau khi hoãn, còn lại: `@phong0801` → #171 #130 #250 · `@baonguyen1776` → #271 #166 #119 (PR [#307](https://github.com/Lade1q/planning-ai/pull/307) còn blocker). Tức **cả hai gần như rảnh sau 14/08** — đó chính là năng lực cho nhánh B.

> ⚠️ Sáu issue trên đang **assign cho người khác**. Việc re-milestone phải do Quân công bố trong buổi planning, không ai tự đổi lịch của người khác.

**Đề xuất phân công nhánh B** (chờ Quân chốt): backend/infra (S2, S3 proxy + audio) và assessment layer (S1, S4) là hai luồng tách được, hợp với đúng hai người vừa giải phóng. QA (`@NMP039`) vào từ S1 vì tầng chấm là thứ **unit-test được không cần DB/API key**.

---

## 7. Lịch trong sprint

| Mốc                     | Ngày       | Nội dung                                                                                                                                                                                                                                |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint Planning         | 10/08 (CN) | Chốt phạm vi, công bố danh sách hoãn, chốt phân công                                                                                                                                                                                    |
| **Spike S0**            | 11–12/08   | Song song PA4 — không chặn ai                                                                                                                                                                                                           |
| **CỔNG GO/NO-GO**       | **13/08**  | 5 tiêu chí mục 4. Quyết định trước khi ai viết dòng production nào cho voice                                                                                                                                                            |
| **PA4 phải nộp**        | **14/08**  | [#249](https://github.com/Lade1q/planning-ai/issues/249)–[#253](https://github.com/Lade1q/planning-ai/issues/253) · [#128](https://github.com/Lade1q/planning-ai/issues/128) · [#130](https://github.com/Lade1q/planning-ai/issues/130) |
| **S1 phải xong**        | 15/08      | Nhánh A chạy trên đường text — mốc không được trượt                                                                                                                                                                                     |
| S2                      | 15–17/08   | Pipeline trích text                                                                                                                                                                                                                     |
| S3                      | 17–19/08   | Lát dọc voice 1 concept                                                                                                                                                                                                                 |
| **Code freeze nhánh B** | **21/08**  | Sau mốc này chỉ sửa lỗi, không thêm tính năng                                                                                                                                                                                           |
| Làm cứng demo           | 22/08      | Tai nghe, đường lui, bản ghi dự phòng                                                                                                                                                                                                   |
| **Final demo + PA5**    | **23/08**  |                                                                                                                                                                                                                                         |

---

## 8. Rủi ro mới cần theo dõi

SDP đã dùng tới R10 nên đánh số tiếp từ **R11**.

| Risk    | Mô tả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Xử lý                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R11** | **Độ trễ Live từ VN chưa ai đo.** Live chỉ có US + EU multi-region; APAC không xác nhận được. Có báo cáo 5–8s qua SIP chưa được giải quyết                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Tiêu chí ① của cổng 13/08. Đây là lý do cổng tồn tại                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **R12** | **Pipeline trích text bị ước lượng thiếu.** Repo chưa có dòng nào; nó là điều kiện cần của C5-trong-voice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Tách thành chặng S2 riêng, không giấu trong S3. Nhánh A không phụ thuộc nó                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **R13** | **`SILENT` lặp gây lỗi 1008** khi tool call chạy lâu (có báo cáo trên 2.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Tiêu chí ③ của cổng, đo ≥8 lần chứ không phải 1 lần                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **R14** | **`silenceDurationMs` có thể vô dụng** — bug OPEN: đặt 6000ms turn vẫn đóng sau ~2000ms. Tức vendor có thể không cho ta sửa đúng cái "chưa nói xong" bằng config                                                                                                                                                                                                                                                                                                                                                                                                                                 | Tự cầm endpointing: `automaticActivityDetection.disabled: true` + client gửi `activityStart`/`activityEnd`. Tiện thể lại là quyết định do code tất định cầm                                                                                                                                                                                                                                                                                                                                                              |
| **R15** | **Tự ngắt lời trên loa.** Tự cầm VAD nghĩa là tự cầm barge-in; client VAD sẽ nghe chính giọng model phát qua loa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Demo **bắt buộc tai nghe**. Tiêu chí ⑤ đo cả hai cấu hình                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **R16** | [#292](https://github.com/Lade1q/planning-ai/issues/292) **gọi Gemini không có AbortSignal.** Với connection-per-concept, bệnh treo-không-dọn **nhân theo số concept**                                                                                                                                                                                                                                                                                                                                                                                                                           | **Merge-gate của nhánh B**, không phải entry-gate của spike (đừng lùi cổng 13/08 vì nó)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **R17** | **Backfill checkpoint đá plan về `draft`** (re-analyze, #170/#291). Plan cũ không có checkpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Demo dùng plan tạo mới. Concept không có checkpoint ⇒ **không voice-assessable**, định tuyến về đường text bằng guard tất định — không để model ứng biến                                                                                                                                                                                                                                                                                                                                                                 |
| **R18** | **6,2% concept không có source ref nào** (đo 10/08: 81 concept / 76 ref) ⇒ 0 checkpoint ⇒ `masteryScore` mãi `null`, im lặng                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Guard của R17 xử lý. Cần log đếm được, không im lặng                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **R19** | **Hai người gánh toàn bộ nhánh B.** Biến thể của R07, nhưng nặng hơn vì hạ tầng mới hoàn toàn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Luật bánh cóc mục 4: mỗi chặng tự demo được, vắng người thì lùi mức chứ không mất trắng                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **R20** | 🟡 **S1 đụng hợp đồng API mà PR [#307](https://github.com/Lade1q/planning-ai/pull/307) đang xây trên đó** — nhưng **không phải hard-break** (đã kiểm code nhánh PR). Đổi `grade_answer` sang evidence per-checkpoint làm `turns[{score, verdict}]` mất nghĩa, song `ScoreBreakdown.tsx` của #307 **tự degrade**: `WeightedFormula` gác `allScored = turns.every(score !== null)` → per-turn null thì thu về `"N lượt"`; `TurnDetail` hiện `"Chưa chấm"` / `"--"`. Không crash. Điểm ở mức concept lấy từ công thức coverage mới, không từ per-turn. #305/#310 chỉ **đọc** điểm đã lưu ⇒ không vỡ | **Migration mềm** (do lane kiến trúc điều phối): giữ `turns[]` làm transcript (`turnIndex`+`answerText`), deprecate `score`/`verdict` per-turn → null ở v2, **thêm** `checkpoints[]`/coverage. Vẫn **báo `@baonguyen1776` trước khi đổi schema** (đồng nghiệp đang coordinate #307). Hệ quả: màn kết quả **degrade thành rỗng** ở phần per-turn cho tới khi **S1 vẽ lại breakdown theo checkpoint** — nên FE màn kết quả là **hạng mục bắt buộc trong S1**, không phải polish tuỳ chọn. Không còn chặn cứng mốc S1-15/08 |

---

## 9. Definition of Done cho cả Sprint

**Bắt buộc (không đạt = sprint fail):**

- [ ] **Nhánh A là deliverable độc lập, không phải "một nửa của voice".** Nếu cổng 13/08 ra no-go, A vẫn là một cải tiến giao được và demo được **trên đường text**, không cần một dòng voice nào. Điều kiện đạt, đo được:
  - Chạy một phiên **text** thật: một concept mà sinh viên trả lời **dở dang / bị ngắt** cho ra `masteryScore = null` ("chưa kiểm"), **không** phải điểm thấp — kèm ảnh chụp before (hành vi cũ: bị chấm `wrong`) / after.
  - `not_discussed` không bao giờ bị tính là sai; coverage dưới ngưỡng ⇒ `null`.
  - Đây chính là câu trả lời đo được cho lời chê gốc ("stateful mà như stateless, chưa nói xong bị chấm sai").
- [ ] Tầng chấm nằm trong `src/server/src/utils/`, **unit test xanh khi tước `DATABASE_URL` và `GEMINI_API_KEY`** (bất biến R05). Nếu logic chấm dính vào client Live thì R05 gãy.
- [ ] Concept Graph Engine **không đổi hành vi**: traceback BFS, ngưỡng 0.6, `max_depth = 2`, `null ≠ 0.0` — có test chứng minh không hồi quy.
- [ ] SDP sửa xong ba mệnh đề mục 5, kèm biện minh viết thành văn.
- [ ] Cổng 13/08 có **kết quả đo bằng số**, ghi vào issue — kể cả khi ra no-go.

**Nếu cổng ra GO:**

- [ ] Một phiên voice thật, tiếng Việt, trên tài liệu người dùng upload, chạy hết một concept và ghi được evidence.
- [ ] **Số đo tuân thủ C5**: vì backend là bên phục vụ lát tài liệu, đo được tỉ lệ câu hỏi rơi ra ngoài lát đã phục vụ. C5 phải là **"đã đo, có số"**, không phải "đã viết trong prompt". Yêu cầu kiến trúc kèm theo: **transcript hai chiều bật từ ngày đầu ở tầng proxy** — không móc sẵn thì cuối sprint không đo được.
- [ ] **Trích dẫn nguồn hiển thị được trong phiên voice** (mục 3.5) — không đánh rơi tính năng C5 đã ship ở Sprint 4.
- [ ] Fallback 2 trục chạy được: rút mic → rơi xuống gõ, hội thoại tiếp; giết Live → flashcard, phiên không sập.
- [ ] Demo có **đường lui đã diễn tập**: tai nghe, bản ghi dự phòng, và nút chuyển sang đường text.

---

## 10. Điểm cần làm rõ khi lập kế hoạch

| #   | Điểm                                                                                                                                           | Hướng xử lý                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **C4 bị nhớ thiếu mệnh đề 2** ở mọi tài liệu nội bộ; và SDP đếm 2 call còn bản Việt đếm 4                                                      | Mục 5 ① giải quyết dứt điểm, đồng bộ cả hai bản                                       |
| 2   | **"Zero budget" là ràng buộc có viết nhưng không đánh số** nên bị đối xử như lời khuyên                                                        | Mục 5 ③                                                                               |
| 3   | **`concept_sources.excerpt` bị tưởng là vật liệu**, thực tế trung vị 81 ký tự                                                                  | Mục 3.3. Liên quan [#296](https://github.com/Lade1q/planning-ai/issues/296) đang OPEN |
| 4   | **Backend không có text tài liệu** — không ai từng cần, nên không ai từng phát hiện                                                            | Chặng S2                                                                              |
| 5   | [#121](https://github.com/Lade1q/planning-ai/issues/121) đang stale ở milestone Sprint 4                                                       | Re-milestone sang Sprint 5, đổi mô tả thành "phương án lui khi cổng no-go" (Q12)      |
| 6   | **Trích dẫn nguồn C5 chỉ có bản text.** Không ai nhận ra vì voice chưa tồn tại                                                                 | Mục 3.5 + một mục DoD                                                                 |
| 7   | **Bề mặt gọi AI thứ 6 (hội thoại tự do) không có schema** nên không xuất hiện trong bất kỳ bảng đếm nào — kể cả bảng đầu tiên của kế hoạch này | Mục 5 ① đã gọi tên và rào                                                             |
