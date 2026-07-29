# Sprint 4 — Đối chiếu Spec ⇄ Issue (Audit)

> **Ngày:** 25/07/2026 · **Phạm vi:** 5 file `docs/requirements/use-case_specification/*.md` đối chiếu với toàn bộ issue Sprint 4 (#108–#130), UC-diagram (`UC-03/04/05`, `UC-Overview`), `schema.prisma`, `graph.service.ts`, cấu hình test/CI.
> **Mục đích:** chốt các điểm lệch _trước khi sprint mở (27/07)_ để không phải sửa giữa đường găng. Đây là đầu vào cho #128 (sửa tài liệu) và #113 (schema).
>
> **Nguyên tắc đọc:** ở hầu hết các điểm lệch, **issue đúng — spec sai** (issue được viết sau, đã tự rà 4 điểm lệch tài liệu). Các mục dưới đây chỉ ra _chỗ chưa nhất quán giữa các issue với nhau_ và _chỗ spec không khả thi_. Mục E liệt kê những chỗ issue đúng để **không ai vô tình "đồng bộ" ngược lại theo spec**.

> **✅ Trạng thái áp dụng (25/07):** các fix đã được đưa **thẳng vào body issue** trên GitHub (sprint chưa mở nên an toàn sửa):
>
> - **Body edited:** #113 (A1, A2) · #115 (A4, A5) · #123 (A4, A5, B5) · #124 (A3, B4) · #125 (B6, B7) · #128 (mục D — bổ sung 5 file SPEC).
> - **Comment (chờ team quyết định, không tự chốt):** #130 (A6 — #79/đồ thị) · #117 (B1 — dải màu) · #116 (B2, B3).
> - **Chưa động tới (thuộc quyền owner #128/#87):** sửa câu chữ trong chính các file `.md` spec (mục C) — đã liệt kê trong #128 để owner thực hiện trong sprint.
> - File audit này hiện **chưa commit** vào git; các body issue có trỏ tới đường dẫn này nên cân nhắc commit vào một branch.

---

## A. Blocker — cần xử lý trước 27/07

### A1. `ReviewQueueItem` thiếu liên kết phiên → #117 và #123 không làm được như mô tả

`ReviewQueueItem` trong #113 có `planId`, `conceptId`, `sourceConceptId` nhưng **không có tham chiếu phiên Interview**. Trong khi:

- **#123** yêu cầu _"chống trùng: chạy lại cùng một `(sessionId, conceptId)` không tạo item trùng"_ — khoá này không tồn tại.
- **#117** yêu cầu lọc traceback _"tạo trong phiên này"_ → không query được, chỉ còn cách lọc mờ theo `createdAt`. Chính #117 đã tự ghi _"thống nhất với @Lade1q ở I7.2 về cách lọc"_.

**Fix (thêm vào #113):**

```prisma
sourceSessionId String? @map("source_session_id") @db.Uuid  // phiên Interview kích hoạt traceback
@@unique([sourceSessionId, conceptId])                       // chống trùng cho #123
```

### A2. `@@unique([sessionId, conceptId, turnIndex])` đang bị comment trong #113

Trong code block của #113, dòng này nằm sau `//`. Nhưng #115 dùng nó làm _cơ chế_ idempotency (_"gọi POST /answers 2 lần → chỉ 1 turn"_, đây là một mục DoD của #115). **Fix:** bỏ comment, để constraint thật.

### A3. Không có gì seed hàng đợi ôn tập → "Gợi ý hôm nay" luôn rỗng với plan mới

`ReviewQueueItem` chỉ được ghi trong #123 — tức **sau khi đã có phiên Interview được chấm**. Với plan vừa tạo, chưa có phiên nào:

- `POST /interviews` không truyền `conceptIds` (#115) → lấy top-K từ #124 → rỗng → **không tạo được phiên**.
- #124 trả _"Bạn đã hoàn thành kế hoạch hôm nay 🎉"_ cho user chưa học gì — sai ngữ nghĩa (UC-19 E1 là dành cho người đã ôn hết).
- Tab "Gợi ý hôm nay" (#118, #127) rỗng.

SP-01 bước 10 (`SPEC_SP-01:28`) _có_ mô tả SRE tạo lịch ban đầu, nhưng đó là Sprint 3 khi bảng `ReviewQueueItem` chưa tồn tại; **không issue nào trong #108–#130 nhận việc seed này**.

**Fix (AC mới cho #124):** khi hàng đợi rỗng cho một plan `active`, fallback lấy concept của plan sắp xếp theo `(masteryScore NULL trước, rồi difficulty giảm dần)`. Đây là "gợi ý hợp lý cho người mới", không cần traceback.

### A4. Concept đạt `mastery ≥ 0.6` không bao giờ được hẹn ôn lại (spaced repetition biến mất)

Trong #123, bước tạo item `spaced_repetition` nằm **bên trong** nhánh `mastery < 0.6` (nhánh "traceback không tìm được prereq"). Hệ quả: **trả lời tốt = concept rơi khỏi mọi lịch ôn tập**. Điều này phá đúng nhánh "CÓ" của vòng lặp học tập trong `UC-Overview` §4:

> `mastery_score(C) >= 0.6?` → CÓ → SRS: schedule review C after X days

`SPEC_AE-07` AF2 (`:41`) cũng chỉ đặt spaced repetition trên nhánh "không có prereq yếu" → **spec và issue hở giống nhau**.

**Fix:** `finalizeConceptResult` **luôn** tạo/ cập nhật một item spaced-repetition cho `C` (bất kể điểm), traceback là phần _cộng thêm_ khi `mastery < 0.6`. Xử lý riêng khi `traceback_enabled = false`: vẫn phải ghi mastery + lịch SRS, chỉ bỏ phần prereq.

### A5. #115 và #123 dùng hai điều kiện kích hoạt traceback khác nhau

| Issue                                | Điều kiện kích hoạt traceback                     |
| ------------------------------------ | ------------------------------------------------- |
| #115 (bảng quyết định state machine) | `verdict == 'wrong'` **và** concept có tiên quyết |
| #123 (`finalizeConceptResult`)       | `mastery_score < 0.6` **và** `traceback_enabled`  |

Hai điều kiện lệch nhau ở ca thật: `deep(1.0) → deep(1.0) → wrong(0.3)` cho weighted mastery `0.2·1 + 0.3·1 + 0.5·0.3 = 0.65 ≥ 0.6` → #115 chạy traceback, #123 không. `SPEC_AE-07:16` và `UC-13` đều dùng **ngưỡng mastery**.

**Fix:** chốt theo #123 (ngưỡng mastery, per-concept). Sửa bảng ở #115: `wrong` chỉ có nghĩa "kết thúc khái niệm ngay + lưu partial score"; việc _có traceback hay không_ do `finalizeConceptResult` quyết định dựa trên mastery cuối cùng.

### A6. Demo PA4 (#130) phụ thuộc đồ thị khái niệm — nhưng không nằm trong Sprint 4

Kịch bản demo #130 bước 2: _"Xem plan có sẵn + đồ thị khái niệm"_. Nhưng:

- `SPEC_DB-02` (DB-02/05/06 — tương tác đồ thị) **không có issue nào trong #108–#130**.
- Issue tương ứng là **#79 (I3.5 Concept Graph Viewer)** — #129 ghi rõ _"chưa bắt đầu, trang vẫn là placeholder"_, vẫn treo ở milestone Sprint 3.
- #109 đẩy _"trực quan hoá đồ thị tô màu trên Dashboard"_ sang Sprint 5.
- `Blocked by` của #130 chỉ có #108 và #109.

Trớ trêu: Sprint 4 là sprint **đầu tiên `mastery_score` có dữ liệu thật** → đồ thị tô màu lần đầu có ý nghĩa để demo.

**Quyết định cần chốt (một trong hai):** (a) kéo #79 vào Sprint 4 như một dependency của #130; hoặc (b) bỏ bước 2 khỏi kịch bản demo và chỉ demo luồng Interview → Traceback bằng danh sách/bảng. Đừng để phát hiện vào 08/08.

---

## B. Lỗi cụ thể, mức trung bình

| #   | Vấn đề                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Vị trí                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| B1  | **Khoảng màu `(0.6, 0.7]` không có màu.** UC-05 định nghĩa Đỏ `<0.4` / Cam `0.4–0.6` / Xanh `>0.7` — hở dải `(0.6, 0.7]`, đúng là "vừa thoát traceback nhưng chưa vững", rất phổ biến. Prompt #117 hở đúng chỗ này: `strengths ≥ 0.7`, `weaknesses < 0.6` → concept 0.65 không vào danh sách nào. #112/#119 copy nguyên bảng kèm lệnh "đừng chọn màu mới" → lỗi lan sang cả 3 chỗ. **Fix:** đổi mốc thành liền mạch, ví dụ Cam `0.4–0.7`, Xanh `> 0.7`; đồng bộ prompt #117. | `UC-05:44`, #112, #117, #119 |
| B2  | **`answer_hint` không có nguồn.** #116 bắt ghi `answerHint` vào `question_cache`, nhưng `generateQuestionResponseSchema` (#114) chỉ trả `{question_text, question_type}`. **Fix:** thêm field vào schema, hoặc bỏ yêu cầu `answerHint`.                                                                                                                                                                                                                                      | #114 ↔ #116                  |
| B3  | **Cache 2 câu/khái niệm vs C6 = 3 lượt.** #116 giới hạn cache 2 câu (đúng, tiết kiệm quota) và fallback "lấy câu tiếp theo từ cache" → lượt 3 fallback lấy gì? **Fix:** chốt fallback = tối đa 2 lượt/khái niệm, ghi rõ.                                                                                                                                                                                                                                                     | #116                         |
| B4  | **#124 tự mâu thuẫn:** ràng buộc nói _"không phải cộng thêm điểm ưu tiên, phải thực sự đứng trước"_, AC ngay dưới lại dùng `+1.0` bonus. Hiện chỉ _tình cờ_ đúng vì `max(deadline−today,1)` chặn priority phi-traceback ở 1.0. **Fix:** sort 2 cấp — `reason='traceback'` DESC rồi `priority` DESC — thay vì bonus cộng điểm.                                                                                                                                                | #124                         |
| B5  | **Công thức `X = clamp(round(3·mastery·7), 1, 14)`** bão hoà ở 14 với mọi `mastery ≥ 0.67` → phần lớn miền giá trị vô nghĩa. **Fix:** nếu sửa theo A4 (SRS cho mọi điểm) thì thiết kế lại thang; nếu chỉ dùng cho nhánh `<0.6` thì hệ số 3 dư.                                                                                                                                                                                                                               | #123                         |
| B6  | **`npm test --workspace=src/server` (snippet trong #125) sẽ fail** — root `package.json` không khai báo `workspaces`. CI hiện dùng đúng `npm test --prefix src/server` (`.github/workflows/ci.yml:51`). Ai copy snippet này vào CI sẽ làm hỏng CI. **Fix:** sửa snippet #125 thành `--prefix`.                                                                                                                                                                               | #125                         |
| B7  | **Todo "Setup Jest + ts-jest" đã xong.** Đã có `src/server/jest.config.js`, `"test": "jest"`, bước test trong CI, và `__tests__/dag.test.ts` (7 case). Phần _test biên_ #125 liệt kê (self-loop, cycle 2-node, nhiều thành phần liên thông, ~100 node) thì chưa có — giữ lại, bỏ phần setup.                                                                                                                                                                                 | #122, #125                   |
| B8  | Thư mục `docs/test/fixtures/`, `docs/management/weekly-reports/`, `docs/management/sprint-reviews/` **chưa tồn tại** (chỉ cần `mkdir`, nhưng đang được viết như thể đã có).                                                                                                                                                                                                                                                                                                  | #120, #129                   |

---

## C. Vấn đề trong bản thân các file SPEC (không khả thi / mơ hồ / không test được)

### C1. `SPEC_AE-02_PhienKiemTra.md`

- **Bước 3 (`:22`)** — _"AI Service… đồng thời tạo dữ liệu âm thanh giọng đọc (TTS)"_ đặt TTS lên Gemini, nhưng `UC-Overview` §5.1 chỉ cho 4 schema, không có schema audio. #121 giải đúng (dùng `speechSynthesis` trình duyệt, miễn phí). → **Sửa spec.**
- **Bước 4 (`:23`)** — _"tự động hiển thị nếu câu hỏi có cấu trúc phức tạp"_: tiêu chí không định nghĩa, không có field nào trong `generate_question` để phán đoán, QA không viết được test case. → **Xoá clause**, không phải "làm rõ".
- **Bước 9 (`:31`), nhánh sai** — _"AI giải thích nhanh lỗi sai"_: không có lời gọi AI nào cho việc này; thực tế `feedback` từ `grade_answer` đã đảm nhiệm. Ghi rõ kẻo ai đề xuất schema thứ 5.
- **Bước 9, "lập tức include AE-07"** = per-turn. #123 chốt **per-concept** (đúng). Nhưng `UC-13` bước 1 ("sau mỗi lượt chấm") và `SPEC_AE-07` §6.1 ("ngay sau khi chấm điểm") **cùng sai per-turn** → cả 3 tài liệu cần đồng bộ về per-concept.
- **Pre-condition micro là điều kiện cứng** → luồng text-only Sprint 4 "vi phạm" pre-condition. Sửa thành tùy chọn (chỉ cần khi bật voice — I6.9).
- **§3 Actors thiếu SRE**, dù bước 9 + post-condition đều gọi Concept Graph Engine.

### C2. `SPEC_SP-01_TaoKeHoach.md`

- **AF2 (`:39`)** — _"chia nhỏ tài liệu theo heading/đoạn văn"_ che một khối việc lớn (chunking + merge nhiều graph + dedupe concept + suy cạnh liên-chunk). Không sprint nào nhận. Nếu chưa làm → rút AF2 về "retry N lần rồi cho nhập thủ công". AF2 cũng "Continue step #8" (sửa đồ thị đã hiển thị) trong khi nhập tay từ số 0 là UI khác hẳn.
- **AF5 (`:54`)** — "từ bất kỳ bước nào **trước bước #8**" loại trừ đúng bước 8 (bước người dùng ngồi lâu và dễ hủy nhất). Mở rộng phạm vi hủy.
- **Pre-condition quota** không kiểm được trước khi bắt đầu và đã bị AF4 xử lý → trùng lặp, nên gỡ.
- ✅ **Điểm khớp:** hai chính sách DAG (auto-fix cho đồ thị AI ở AF3, reject cho sửa tay ở bước 8) **đã implement đúng** trong `graph.service.ts` (commit `ef2e38a`). Đừng "thống nhất" lại.

### C3. `SPEC_FS-01_ThucHienPhienHoc.md`

- Bước 4 & 7 (PDF side-by-side, ghi chú) là **basic flow** nhưng #110 đẩy FS-04/FS-05 sang Sprint 5 (thừa nhận thẳng thắn). Kéo theo **post-condition (`:19`)** _"ghi chú được lưu trữ"_ thành điều kiện không đạt được ở Sprint 4 → đánh dấu deferred trong spec.
- **Bước 11 (`:33`)** _"SRE cập nhật mastery"_ → #110/#126 chốt là "thống kê học tập" (đúng). Nhưng #128 chỉ định sửa _"PDF mục 2.2"_, **không nhắc file markdown này**.

### C4. `SPEC_DB-02_TuongTacDoThi.md`

- **AF1 bước 2 (`:29`)** — _"trở lại hiển thị mặc định **hoặc** làm mờ toàn bộ node"_: hai hành vi loại trừ nhau nối bằng "hoặc" → QA không test được. Chốt một.
- **Post-condition** khẳng định read-only, nhưng `UC-17` bước 3 có nút _"Bắt đầu Interview cho khái niệm này"_ trong đúng panel đó → mâu thuẫn nhẹ, làm rõ ranh giới "read-only trên dữ liệu đồ thị, nút là điều hướng".

### C5. `SPEC_AE-07_TruyNguocLoHong.md` — điểm sáng, một chỗ cần chốt

- Ngược với `UC-13`, file này **viết đúng pruning** (§6.6 + AF1: enqueue con nằm trong nhánh "yếu"). Đây mới là nguồn chuẩn cho #122, **không phải `UC-04`**.
- Cần chốt: item ghi ở bước 6 (`pending`) _trước_ khi sinh viên xác nhận (bước 8). Item `pending` **có xuất hiện trong `GET /review-queue/today` không?** Nếu có → bước xác nhận chỉ trang trí; nếu không → #115 (auto top-K) bỏ qua đúng prereq vừa tìm. #124 không nói → phải chốt.

---

## D. Phạm vi #128 (I9.2) đang thiếu — không chạm file SPEC

#128 là issue chịu trách nhiệm sửa tài liệu lệch, nhưng Phần 2 chỉ liệt kê `UC-Overview.md` và `UC-04_AIExaminer.md`. **Không mục nào chạm `docs/requirements/use-case_specification/*.md`** — nơi chứa toàn bộ C1–C4. Hết Sprint 4, 5 file spec vẫn mô tả một hệ thống khác hệ thống được build.

**Bổ sung vào Phần 2 của #128:**

- `SPEC_AE-02`: TTS-do-AI, "cấu trúc phức tạp", "AI giải thích lỗi sai", traceback per-turn, pre-condition micro, thiếu actor SRE (C1).
- `SPEC_FS-01`: bước 4/7 + post-condition ghi chú → deferred; câu chữ mastery (C3).
- `SPEC_DB-02`: AF1 chốt một hành vi; post-condition read-only (C4).
- `SPEC_AE-07` + `UC-13`: đồng bộ traceback là **per-concept** (C1/C5).
- `UC-Overview` §1: ghi _"3 calls cố định"_ rồi liệt kê 4 (§5.1 đã đúng 4) → sửa §1.
- `generate_question`: `UC-Overview` §5.1 và header `UC-04` trả `concept_id`; #114 bỏ đi (đúng — caller đã biết) → chốt một bản.

---

## E. Những chỗ ISSUE đúng hơn SPEC — KHÔNG revert theo spec

Liệt kê để tránh "đồng bộ ngược":

1. Queue traceback dùng tuple `(id, depth)`, depth tăng khi enqueue con — **không** `depth += 1` trong `while` (UC-04 pseudocode sai).
2. Pruning: gặp prereq đã vững thì **không** duyệt tiếp con của nó (`SPEC_AE-07` đúng, #122 đúng).
3. Traceback chạy **per-concept**, không per-turn.
4. Text-first, voice (I6.9) là tầng I/O phủ lên trên — không viết lại state machine.
5. Focus Session **không** ghi `mastery_score` (chỉ AI Examiner ghi).
6. Timer Pomodoro tính bằng hiệu `Date.now()`, `setInterval` chỉ để render (chống throttling tab nền).
7. `mastery_score IS NULL` ≠ `0.0` — phân biệt "chưa test" vs "đã test và sai".
8. Hai chính sách DAG khác nhau (auto-fix đồ thị AI vs reject sửa tay) là **cố ý**, đã implement.

---

## Bảng hành động đề xuất (theo thứ tự làm)

| Ưu tiên | Việc                                                                | Issue cần sửa             | Người                 |
| ------- | ------------------------------------------------------------------- | ------------------------- | --------------------- |
| P0      | A1 (thêm `sourceSessionId` + unique), A2 (bỏ comment unique)        | #113                      | @Lade1q               |
| P0      | A4 (SRS cho mọi điểm), A5 (thống nhất điều kiện traceback với #115) | #123, #115                | @Lade1q               |
| P0      | A3 (fallback hàng đợi rỗng), B4 (sort thay bonus)                   | #124                      | @phong0801            |
| P1      | A6 — quyết định #79 vào Sprint 4 hay cắt bước 2 demo                | #130, #79                 | @tkiet24 + @phong0801 |
| P1      | B1 (dải màu hở), B2 (`answer_hint`), B3 (fallback 2 lượt)           | #112/#117/#119, #114/#116 | owners tương ứng      |
| P2      | Mở rộng Phần 2 #128 với C1–C4 (5 file SPEC)                         | #128                      | @Lade1q + @NMP039     |
| P2      | B6/B7 (sửa snippet CI, bỏ phần setup đã xong)                       | #125                      | @NMP039               |

> Các mục C (sửa câu chữ spec) thuộc quyền quyết định của owner #128/#87 — audit này chỉ nêu, không tự sửa file spec.
