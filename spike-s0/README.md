# spike-s0 — harness đo tính khả thi Gemini Live (11–12/08)

> **Throwaway.** Code vứt đi, standalone, KHÔNG đụng `src/`. Giao thức đầy đủ:
> [`docs/management/sprint-plans/s0-spike-protocol.md`](../docs/management/sprint-plans/s0-spike-protocol.md).
> Kết quả mỗi run ghi JSONL vào `runs/`, kèm dòng "KẾT QUẢ" tóm tắt để dán vào issue cổng 13/08.

## Cài & cấu hình (1 lần)

```bash
cd spike-s0
npm install
cp .env.example .env
# sửa .env: GOOGLE_CLOUD_PROJECT, đường dẫn key, LIVE_MODEL nếu id khác
```

`.env` cần:

- `GOOGLE_CLOUD_PROJECT` — Project ID (không phải tên).
- `GOOGLE_CLOUD_LOCATION=us-central1` (native-audio chỉ US/EU).
- `GOOGLE_APPLICATION_CREDENTIALS` — trỏ tới service-account key (mặc định `../recall-live-proxy-key.json` ở gốc repo, đã gitignored). Auth bằng **ADC/service account**, KHÔNG mint token client (quy tắc g — tránh 1011).
- `LIVE_MODEL` — mặc định `gemini-live-2.5-flash-native-audio`. Đổi tại đây nếu Vertex đổi id lúc chạy.

**Luôn chạy từ trong `spike-s0/`** (đường dẫn key tương đối phụ thuộc CWD).

## Chạy 5 probe (thứ tự: ④ trước, nó chặn phần còn lại)

| Lệnh                   | Tiêu chí           | Đạt khi                                                          |
| ---------------------- | ------------------ | ---------------------------------------------------------------- |
| `npm run p4:auth`      | ④ Auth Vertex + SA | 3×5′, 0 lần 1011                                                 |
| `npm run p1:latency`   | ① Độ trễ VN        | p50<1,5s · p95<3s · cold≤3s                                      |
| `npm run p3:evidence`  | ③ record_evidence  | ≥8 fires · 0×1008 · +tính-đúng (checkpointId/INV-2/contradicted) |
| `npm run p2:viquality` | ② Chất lượng vi-VN | ≥9/10 (chấm tay)                                                 |
| `npm run p5:echo`      | ⑤ Echo/barge-in    | tai nghe=0 (bán thủ công)                                        |

`p4`/`p3`/`p2` chạy headless được ngay. `p1` cần 1 file WAV. `p5` cần loa+mic+tai người.

### p1 cần WAV 16kHz mono

Một câu tiếng Việt ngắn (~2–4s), 16kHz mono PCM. Ví dụ từ file ghi âm bất kỳ:

```bash
ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le fixtures/student-vi-16k.wav
```

Nội dung câu không quan trọng (đo độ trễ mạng, không đo nội dung). Đường dẫn set ở `P1_AUDIO_WAV`.

### p4 nhanh vs đầy đủ

Mặc định 3×5′ (đúng giao thức, ~15 phút). Smoke nhanh: `P4_SESSION_MS=30000 npm run p4:auth`.

## Ghi chú thiết kế (đọc trước khi diễn giải số)

- **③ async THẬT** (Co-Plan #1): tool declaration đặt `behavior: NON_BLOCKING`, tool-response đặt `scheduling`. Probe chạy **hai chế độ tường minh**: `SILENT` trước → nếu 1008 / interrupted / <8 fire thì chạy lại `WHEN_IDLE`. Tín hiệu "SILENT sạch" = ≥8 fire & không 1008 & **không interrupted** (KHÔNG suy từ `spokeBefore` — chế độ đồng bộ sẽ false-green). Dùng `scheduling`, tránh `willContinue` (Vertex không hỗ trợ).
- **③ cây quyết định** (Q2): A (SILENT sạch) / B (WHEN_IDLE chạy, không silent) / **C suy biến** (cả hai hỏng). Ra **C** ⇒ lật đồng-quyết ① (gộp `assess_checkpoints`) + rubric §2.3 ⇒ probe tự in **"PING CO-PLAN"**.
- **p3 dùng TEXT input** cho "sinh viên" (tất định) nhưng **output audio + tool** trên native-audio ⇒ test đường tool-call thật. Fire gom **toàn cục theo checkpointId** (async tách khỏi ranh giới turn — Co-Plan #2). Tổ hợp audio-in + bắn-tool đồng thời KHÔNG probe nào chạm ⇒ **residual, để S3** (Co-Plan #5).
- **③ tính-đúng** (checkpointId, INV-2, contradicted-control) KHÔNG nằm trong 5 tiêu chí GO/NO-GO §4, nhưng feed thẳng thiết kế grain — Co-Plan diễn giải.
- Fixture = `docs/management/sprint-plans/s0-fixture-ipv4-classful.json` (chép tay CHỈ cho spike).

## GO/NO-GO

**GO = ①②③④ đạt.** ⑤ fail → vẫn GO, demo bắt buộc tai nghe. Gom mọi dòng "KẾT QUẢ" + `runs/*.jsonl` vào issue cổng 13/08 (kể cả no-go).
