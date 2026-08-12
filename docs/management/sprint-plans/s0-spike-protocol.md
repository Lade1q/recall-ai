# Spike S0 — Giao thức đo · 11–12/08

> **Đi kèm:** `sprint-5-plan.md` §4 (5 tiêu chí cổng 13/08) · `docs/analysis and design/interview-voice-architecture.md` (INV-1/INV-2, grain, connection-per-concept).
> **Nguyên tắc (§4):** code **vứt đi**, standalone, **không đụng production**. Mọi kết quả là **số ghi vào issue cổng**, feed thẳng quyết định GO/NO-GO 13/08.
> **Lane:** hạ tầng/đo (④①②⑤) — Plan · AI-surface (③ `record_evidence`) — Co-Plan (đã chốt 10/08).

---

## 0. Hạ tầng chung (harness) — dựng 1 lần, mọi probe dùng lại

Một Node client tối giản `@google/genai` cấu hình **Vertex / us-central1 / service account (ADC)**, mở WS Live tới `gemini-live-2.5-flash-native-audio`. Bốn năng lực dùng chung:

- **Audio I/O** — feeder đẩy audio-in (file WAV hoặc mic), sink nhận audio-out.
- **Client VAD** — `automaticActivityDetection.disabled: true`, client tự gửi `activityStart` / `activityEnd`. **Bắt buộc** (R14: `silenceDurationMs` không đáng tin — đặt 6000ms turn vẫn đóng ~2000ms).
- **Tool registration** — đăng ký `record_evidence` (shape ở §③).
- **Transcript hook hai chiều** — log audio-in-transcript + model-out + mọi tool-call, timestamp ms. **Bật từ dòng đầu** — DoD §9 yêu cầu, và là cách duy nhất lấy "số" cho ③/②/①.

**Prereq dữ liệu:** ✅ **`s0-fixture-ipv4-classful.json`** (concept `ipv4-classful` từ `abc/CTT105-2-IP&subnetting_2.0.pdf` tr.13–18: materialSlice + 10 checkpoint + 3 probe) — dùng cho ②/③. Backend chưa trích được text (đó là S2) → spike chép tay 1 lát là đủ.

**Quy tắc auth (g):** backend giữ SA, tự nối thẳng Vertex Live; **không** mint token client rồi passthrough (gây 1011 + nuốt `system_instruction` trên GA).

---

## Thứ tự chạy (theo phụ thuộc): ④ → ① → ③ → ② → ⑤

④ chặn tất cả — không auth được WS thì không đo được gì.

| Đo                            | Cách chạy                                                                                                                                                                  | Ghi số                                   | Đạt khi                                            | Chủ trì                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | --------------------------- |
| **④** Auth Vertex + SA        | 3 phiên × 5′ WS Live qua SA/ADC, giữ phiên bằng keep-alive                                                                                                                 | số lần **1011** / tổng                   | **0 lần 1011**                                     | Plan                        |
| **①** Độ trễ VN (R11)         | phiên mở → feeder đẩy 1 câu VN ngắn cố định, đánh dấu `activityEnd` → đo tới **byte audio-out đầu**; lặp 20–30×/connection; cold-start = lượt đầu connection mới, đo riêng | mẫu latency → **p50 · p95** + cold-start | **p50 < 1,5s · p95 < 3s** · cold ≤ 3s (1 lần/conn) | Plan                        |
| **③** `record_evidence` async | xem §③ (liveness + tính-đúng)                                                                                                                                              | xem §③                                   | xem §③                                             | **Co-Plan**                 |
| **②** Chất lượng vi-VN        | nạp lát VN làm context → model sinh ~10 câu trong phiên Live → người đọc chấm từng câu: tự nhiên? trôi English? trong lát?                                                 | transcript 10 câu + điểm → **X/10**      | **≥9/10**, không trôi English                      | người đọc VN (Quân/QA) chấm |
| **⑤** Echo/barge-in (R15)     | client VAD bật → phát audio-out qua **(a) tai nghe (b) loa laptop** → đếm model **tự ngắt lời mình**                                                                       | tự-ngắt tai nghe · tự-ngắt loa           | **tai nghe = 0**; loa chỉ ghi số, **fail vẫn GO**  | Plan                        |

---

## ③ `record_evidence` async — liveness + tính-đúng (lane Co-Plan, chốt 10/08)

**Shape spike:** `record_evidence(checkpointId, status: 'covered' | 'contradicted', quote)` — **per-checkpoint, gọi tăng-dần**. KHÔNG test dạng gộp `assess_checkpoints`: gộp = 1 tool-call báo cả cụm ⇒ spike thấy "1 call, 0 lỗi" và **không học được gì về R13**.

> **Ghi chú đồng-quyết ① (merge):** nếu sau này gộp, "gộp" **chỉ được** nghĩa là _cùng shape schema, vẫn gọi tăng-dần từng checkpoint_ — **KHÔNG phải batch-at-end**. Batch-at-end phá atomicity upsert per-checkpoint + làm backend **mù tiến độ** ⇒ "hết concept" chỉ còn đóng theo đồng hồ = **C6 đội lốt**. (Text có thể trả **mảng** 0..n evidence/lượt vì lượt text là request rời; voice bắn một-checkpoint-một-lần ⇒ merge có thể **không** sạch. Chốt sau spike.)

### Liveness — cây quyết định (không nhị phân)

Mỗi nhánh dẫn tới một thiết kế grain khác:

| Kết quả spike                                                                                                      | Thiết kế grain                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SILENT incremental chạy** (≥8×, 0×1008, không cắt lời)                                                           | **Tốt nhất** — evidence tăng dần, backend thấy tiến độ, reconnect không mất                                                                                                                                                 |
| SILENT hỏng (1008 / buộc phải nói), nhưng **non-silent incremental** chạy (model nói câu chuyển ngắn rồi bắn tool) | **Chấp nhận được** — model kể lể bookkeeping, kém tự nhiên hơn chút, vẫn tăng-dần                                                                                                                                           |
| **Cả hai hỏng**                                                                                                    | **Suy biến** → buộc về `assess_checkpoints` một-lần-cuối ⇒ mất reconnect-resilience + backend mù tiến độ (C6 đội lốt). Chỉ lúc này mới nghiêng về gộp — và phải ghi rõ đây là **suy biến**, không phải phương án ngang hàng |

**Harness bắt buộc:** khi SILENT rơi 1008, **không dừng** — thử ngay **non-silent incremental** (FunctionResponse không SILENT, hoặc để model phát transition ngắn) trước khi kết luận. Báo cáo 1008 gốc (Pipecat) là về tool-call **chạy lâu**, chưa tách bạch có do SILENT hay không — spike phải phân biệt thì cây trên mới dùng được.

### Tính-đúng (quan trọng ngang 1008, chưa ai đo)

Một cơ chế bắn đều mà **bắn sai** thì vô dụng — thà biết grain-hỏng ở cổng hơn ở S3:

1. **Độ đúng `checkpointId`** — seed fixture có checkpoint được bàn theo **thứ tự đã biết**; verify mỗi tool-call mang **đúng** checkpointId của thứ vừa bàn. Bắn `record_evidence(cp_3)` khi đang nói về `cp_1` ⇒ cả grain là rác. **Rủi ro cao hơn 1008.**
2. **Stress INV-2** — nhét 1 câu trả lời **mơ hồ/dở dang có chủ đích**; verify model **KHÔNG** bắn `contradicted` (phải im → `not_discussed`). Kiểm bất biến chống-âm-tính-giả — đúng lời chê gốc của Quân — ở **tầng cơ chế**, không chỉ tầng công thức. Nếu native-audio cứ thấy ngập ngừng là phát `contradicted` thì INV-2 không thực thi được bằng prompt ⇒ phải biết sớm.

**Phụ (ghi kèm nếu tiện):** độ trễ checkpoint-được-nhắc → tool-fire; model có bao giờ **nhét số điểm** vào tool-call không (phải **KHÔNG** — chỉ `covered`/`contradicted`); có double-fire cùng checkpoint không (upsert đỡ được, đo baseline).

### "≥8 checkpoint" = worst-case, không phải điển hình

Ép ≥8 để stress 1008 là đúng — nhưng concept thật thường **3–5 checkpoint** (đo DB: excerpt median 81 ký tự ⇒ ít điểm/concept). 8× chạy ⇒ nhịp thật (3–5) an toàn. Đừng để ai đọc "≥8" tưởng đó là điển hình.

### Nếu spike ra nhánh "suy biến"

Lật thẳng **đồng-quyết ① (merge)** + một phần **mệnh đề rubric §2.3** → **ping Co-Plan vào lại** trước khi khoá thiết kế grain.

---

## Kết luận cổng

**GO = ①②③④ đạt.** ⑤ fail → **vẫn GO**, demo **bắt buộc tai nghe**. **NO-GO** ⇒ giữ S1+S2, thay S3/S4 bằng [#121](https://github.com/Lade1q/planning-ai/issues/121). Mọi số ghi vào issue cổng 13/08 (kể cả no-go).

Ngoài liveness ③, hai đo tính-đúng (checkpointId, INV-2) không nằm trong 5 tiêu chí GO/NO-GO chính thức của §4, nhưng **kết quả feed thẳng thiết kế grain** và có thể lật đồng-quyết ① — Co-Plan chủ trì diễn giải.

## Ngoài phạm vi S0 (đừng lôi vào)

- **[#292](https://github.com/Lade1q/planning-ai/issues/292) / R16** (Gemini call không AbortSignal) = **merge-gate nhánh B**, _không_ phải entry-gate — đừng lùi cổng vì nó.
- **Pipeline trích text** = **S2**, không đo ở S0.
- **Độ trung thực `status` (covered↔contradicted)** — model bắn ĐÚNG checkpoint nhưng SAI nhãn (vd cp_3 đúng mà bắn contradicted) = câu hỏi _chất lượng grain_, cần multi-turn thật để phân biệt "sai" với "chưa rõ". Đo ở **S1** bằng fixture transcript thuần (R05), **KHÔNG** ở ③ (đo cơ chế). ③ phủ đúng: liveness · SILENT-sạch · id-ảo · misattribution-future-cp · INV-2 · contradicted-control. (Quyết định phạm vi Plan+Co-Plan, 11/08.)

## Prep trước 11/08 (không phải code)

- [x] Chọn **1 PDF tiếng Việt thật** — `abc/CTT105-2-IP&subnetting_2.0.pdf` (Mạng máy tính, ĐH KHTN).
- [x] Trích tay **1 lát concept ≥8 checkpoint** → **`s0-fixture-ipv4-classful.json`** (concept `ipv4-classful`, 10 checkpoint, materialSlice ~1150 ký tự, 3 probe: covered/contradicted control + INV-2 dở dang). Validate bởi Quân 10/08.
- [x] Xác nhận **billing Vertex + budget cấp project** đã bật (10/08).
