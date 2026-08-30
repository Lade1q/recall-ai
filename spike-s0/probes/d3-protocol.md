# D3 — Giao thức probe dòng Live HIỆN HÀNH (16/08/2026)

> **Kỷ luật S0 giữ nguyên:** ngưỡng đạt/không-đạt dưới đây **viết và lưu TRƯỚC khi chạy probe D3 đầu tiên**
> (đối chiếu timestamp tệp này với `runs/d3-*.jsonl`). Mã vứt đi, ngoài `src/`, trần chi phí cứng ở tầng transport.
> Bối cảnh: S0 (10–11/08) đo GO trên `gemini-live-2.5-flash-native-audio` (Vertex); D2 (14/08) xác nhận
> `gemini-2.5-flash-native-audio-latest` sống qua Developer API. D3 trả lời: **dòng KẾ NHIỆM hôm nay còn giữ được
> cơ chế nào**, phục vụ ước lượng Interview v2 "tính từ 16/08".

## Hai câu hỏi — đúng thứ tự brief

**D3-FC (câu ①):** dòng Live hiện hành có cho phát dữ liệu có cấu trúc **giữa-lúc-đang-nói** không?
**D3-VAD (câu ③):** `silenceDurationMs` (server-VAD) trên dòng hiện hành có hoạt động không?

## Ứng viên model

- `gemini-3.1-flash-live-preview` — bản kế nhiệm vendor chỉ định (chưa từng được probe: D2 dừng ở ứng viên #1).
- _(bổ sung sau research 16/08 nếu có model live mới hơn — amendment ghi ở cuối tệp, KHÔNG đổi ngưỡng)_
- Control: `gemini-2.5-flash-native-audio-latest` — hành vi đã biết từ S0/D2, dùng làm đối chứng phép đo.

Bề mặt auth: Developer API (`GEMINI_API_KEY`) mặc định — D2 đã chứng minh sống; Vertex+SA là đường lui nếu
model chỉ có trên Vertex.

## D3-FC — thiết kế & ngưỡng

Kế thừa p3: "sinh viên" bằng TEXT (tất định), output AUDIO, tool `record_evidence` khai `behavior: NON_BLOCKING`,
scheduling `SILENT`. **Khác p3 một chỗ:** tool-response bị **trì hoãn 3000ms có chủ đích** — đây là phép đo phân
biệt async/sync: model NON_BLOCKING thật sẽ tiếp tục phát audio trong cửa sổ trì hoãn; model blocking sẽ im
cho tới khi có response. Kịch bản 4 bước (cp_1 covered · cp_2 contradicted-control · cp_3 covered · cp_4 covered)
lấy từ fixture `s0-fixture-ipv4-classful.json`.

**Kết luận đọc từ số đo (công bố trước):**

| Nhánh                            | Điều kiện (đo được, không suy diễn)                                                                                                                                                          | Nghĩa                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A — in-band mid-speech CÒN**   | connect + setupComplete OK với declaration NON_BLOCKING **và** ≥3/4 bước có fire in-enum **và** ≥1 fire có ≥1 audio-chunk đến trong cửa sổ 3000ms sau fire, TRƯỚC khi tool-response được gửi | cơ chế S0 sống trên dòng mới; kiến trúc in-band đi tiếp được                                            |
| **B — tool còn, mid-speech MẤT** | fire ≥3/4 bước nhưng 0 audio-chunk trong mọi cửa sổ trì hoãn (model đợi response), **hoặc** connect từ chối NON_BLOCKING nhưng bỏ `behavior` thì fire được                                   | chỉ còn FC đồng bộ theo lượt; in-band "vừa nói vừa ghi" chết ⇒ đường transcript out-of-band là bắt buộc |
| **C — tool MẤT hẳn trên Live**   | connect lỗi khi khai `tools`, hoặc 0 fire ở cả 4 bước, hoặc đóng 1007/1008 lặp ở cả 2 connection                                                                                             | mọi dữ liệu có cấu trúc phải đi out-of-band                                                             |

Liveness tính **chỉ fire in-enum** (`covered|contradicted`) — enum-rác đếm riêng, không tính (bài học p3).

**Trần cứng:** ≤2 connection/model · ≤120s/connection · watchdog 300s/model · ≤4 model. Tổng phiên D3-FC ≤ 8 connection.

## D3-VAD — thiết kế & ngưỡng

Audio realtime **pace theo thời gian thực** (server-VAD đo thời gian thực của stream): câu fixture
`student-vi-16k.wav` (~1,8s) → **2,5s im lặng PCM** (zeros 16kHz) → câu fixture lần 2 → im lặng đuôi.
Ba run mỗi model:

| Run                     | Config                                                                                      | Đạt khi                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1** server-VAD nới   | `automaticActivityDetection: { silenceDurationMs: 5000 }`                                   | **VAD-OK:** model KHÔNG phát audio trả lời và KHÔNG turnComplete trong khoảng im lặng 2,5s giữa hai câu; phản hồi chỉ đến sau câu 2. **VAD-BUG:** model bắt đầu trả lời trong khoảng im lặng giữa chừng (ngưỡng 5000ms bị bỏ qua) |
| **V2** control mặc định | không set `silenceDurationMs`                                                               | model CÓ trả lời trong pause 2,5s (xác nhận phép đo V1 có độ phân giải; nếu V2 cũng im ⇒ V1 **inconclusive**, ghi rõ, không tuyên)                                                                                                |
| **V3** manual           | `automaticActivityDetection: { disabled: true }` + `activityStart`/`activityEnd` bao cả cụm | model chỉ trả lời SAU `activityEnd` ⇒ đường "tự cầm endpointing" còn sống làm phương án lui                                                                                                                                       |

**Trần cứng:** ≤3 connection/model · ~35s audio-clock/connection · watchdog 120s/run.

**Hệ quả đọc số (công bố trước):** V1=VAD-OK trên dòng hiện hành ⇒ **không cần tự viết tầng dò biên lượt nói**
(bỏ được một mảng ước lượng lớn); V1=VAD-BUG & V3=OK ⇒ giữ thiết kế "tự cầm endpointing" (§4 kiến trúc), cộng
1–2 ngày-người client-VAD; V1=BUG & V3=BUG ⇒ đỏ kiến trúc, phải nghĩ lại tầng lượt nói từ đầu.

## Chi phí

Mỗi connection ≤2 phút, phần lớn <60s; tổng ≤~14 connection ngắn. Cùng cỡ chi phí D2 + p3 cộng lại (đã
được duyệt trần 15/08 cho D2; D3 giữ nguyên tinh thần trần-ở-transport).

---

## Amendment (16/08, sau research tài liệu sống — ngưỡng KHÔNG đổi)

Research docs (workflow 3-agent, nguồn ai.google.dev cập nhật 13–14/08/2026) chốt danh sách ứng viên:
**không có model live hội thoại nào mới hơn `gemini-3.1-flash-live-preview`** (26/03/2026);
`gemini-3.5-live-translate-preview` chỉ dịch speech-to-speech, không phải ứng viên. Danh sách ứng viên
mặc định của hai probe giữ nguyên. 3.1 chỉ có trên Developer API (không có bản Vertex).

## Kết quả (chạy 16/08, SAU khi ngưỡng công bố)

- **D3-FC:** cả `gemini-3.1-flash-live-preview` lẫn `gemini-2.5-flash-native-audio-latest` ra **nhánh A**
  (runs/d3-fc-2026-08-16T10-51-55-281Z.jsonl). Trên 3.1: fire trong lượt câm riêng; ở bước 4 model bắn tool rồi
  **nói 12 chunk và đóng turn TRƯỚC khi tool-response (trì hoãn 3s) được gửi** — trái nguyên văn docs
  live-tools (06/2026) _"The model will not start responding until you've sent the tool response"_.
  Transcript không kể lể bookkeeping (bệnh nhánh B của S0 không xuất hiện, n=1 run).
- **D3-VAD:** 3.1 **V1=VAD-OK** (silenceDurationMs=5000 được tôn trọng; input-transcript V1 chứa cả 2 câu
  trong MỘT turn = turn không cắt ở pause 2,5s) · V2 control cắt trong pause (phép đo có độ phân giải) ·
  V3 manual OK (runs/d3-vad-2026-08-16T10-56-04-247Z.jsonl). Trái js-genai#1467 / python-genai#2580 /
  cookbook#1263 — cả ba còn OPEN, Google đã repro 04/2026 nhưng chưa công bố fix ⇒ **server vá âm thầm**.
  2.5-latest: V1 OK, V3 inconclusive (không phản hồi sau activityEnd trong run này).
- ⚠️ **Hạn dùng của kết luận:** hành vi server 3.1 đã đổi âm thầm cả hai chiều trong 5 tháng qua
  (regression turn-thrashing 06/2026 vào không changelog; hai fix trên vào không changelog). Mọi kết luận
  D3 cần **đo lại sát ngày build/demo** bằng chính hai probe này.
