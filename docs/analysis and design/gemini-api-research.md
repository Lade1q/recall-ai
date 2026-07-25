# Báo Cáo Nghiên Cứu Google Gemini API cho Recall AI

> **Dự án**: Recall AI – Proactive Study Assistant (Team CAGT)
> **Mục đích**: Tài liệu tham chiếu kỹ thuật Gemini API, làm nền cho issue **I3.2 – `extract_concepts`** (Sprint 3) và dự trù cho **AI Examiner** (Sprint 4-5).
> **Nguồn**: Xác minh trực tiếp từ `ai.google.dev/gemini-api/docs` và từ thực nghiệm API thật, tại thời điểm 07/2026 (xem mục Nguồn tham khảo cuối bài).

> **⚠️ Lưu ý về vòng đời model**: Model Gemini **hết hạn/bị thay thế rất nhanh** — ngay trong dòng 3.x, `gemini-2.0-flash` và `gemini-3-pro-preview` đã từng bị shut down. Model ID **luôn để trong biến môi trường/config**, không hardcode; và bọc Gemini sau một **lớp abstraction** (khớp risk R10 & ràng buộc C4-C6 của SDP). Trước khi dùng lại tài liệu này ở Sprint sau, kiểm tra lại danh mục model còn hiệu lực trong AI Studio.

---

## 1. Tổng quan kiến trúc tích hợp

```
┌──────────────┐   HTTPS    ┌───────────────────────┐   @google/genai   ┌──────────────┐
│  Client (SPA)│ ─────────▶ │  Backend (Express/TS) │ ────────────────▶ │  Gemini API  │
│ React + Vite │            │  ai-service (wrapper) │   Interactions    │  (Google)    │
└──────────────┘            └───────────────────────┘                   └──────────────┘
        ▲                              │
        │  không bao giờ giữ API key   │  4 schema cố định:
        └──────────────────────────────┘  extract_concepts, generate_question,
                                           grade_answer, summarize_session
```

**Nguyên tắc bất di bất dịch (bảo mật):** `GEMINI_API_KEY` **chỉ nằm ở backend**. Mọi lời gọi Gemini đi qua Express. **Tuyệt đối không** để key ở phía React/Vite (client bundle công khai).

---

## 2. SDK & Interactions API (chuẩn hiện hành 07/2026)

### 2.1. Cài đặt

```bash
# Trong src/server — SDK chính thức thế hệ mới (Unified Google Gen AI SDK)
npm install @google/genai
```

- Package đúng: **`@google/genai`** (Interactions API cần **v2.3.0+**).
- ❌ **Không** dùng `@google/generative-ai` (legacy). Google khuyến nghị migrate; toàn bộ tính năng mới chỉ có ở `@google/genai`.

### 2.2. Khởi tạo

```typescript
import { GoogleGenAI } from '@google/genai';

// Đọc GEMINI_API_KEY từ process.env (đã có trong .env.example của dự án)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

### 2.3. Gọi cơ bản – Interactions API

```typescript
const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: 'Explain how AI works in a few words',
});
console.log(interaction.output_text);
```

- Method: **`ai.interactions.create({ model, input })`**, kết quả đọc ở **`interaction.output_text`**.
- `input` nhận **string** (đơn giản) hoặc **mảng content object** (đa phương tiện – xem 2.7).

### 2.4. System Instruction (đặt vai trò/luật cố định)

```typescript
const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: 'Hello there',
  system_instruction: 'You are a cat. Your name is Neko.',
});
```

> Dùng để enforce ràng buộc **C5** (AI Examiner không bịa kiến thức ngoài tài liệu). `system_instruction` là **interaction-scoped** — phải truyền lại ở mỗi lượt (không được lưu qua `previous_interaction_id`).

### 2.5. Multi-turn hội thoại – `previous_interaction_id` ⭐ (quan trọng cho AI Examiner)

```typescript
const t1 = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: 'I have 2 dogs in my house.',
});

const t2 = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: 'How many paws are in my house?',
  previous_interaction_id: t1.id, // ← server tự nối lịch sử, KHÔNG cần gửi lại history
});
```

- Server **lưu trạng thái mặc định** (`store=true`) ⇒ chỉ cần truyền `previous_interaction_id`, không phải tự quản lý mảng history ⇒ **tiết kiệm token** cho phiên phỏng vấn nhiều lượt.
- `previous_interaction_id` **chỉ mang theo lịch sử input/output**; các tham số khác (`system_instruction`, `response_format`, `generation_config`...) là interaction-scoped, phải truyền lại mỗi lượt.
- ⚠️ **Lưu ý quyền riêng tư & C4**: `store=true` nghĩa là Google **giữ nội dung hội thoại phía server**. Có thể tắt bằng `store: false` khi cần. Với Recall AI: **grade_answer / extract_concepts / summarize_session** nên gọi **stateless** (không dùng `previous_interaction_id`) để đảm bảo chấm điểm tất định & test được; chỉ **generate_question** (câu hỏi đào sâu tiếp theo trong cùng 1 concept) mới dùng chuỗi `previous_interaction_id`.

### 2.6. Structured Output (ép JSON theo schema) ⭐ (quan trọng cho `extract_concepts`)

```typescript
import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1) Zod schema dùng để validate runtime (dự án đã có zod@4)
const schema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  summary: z.string(),
});

// 2) JSON Schema truyền cho Gemini. Zod 4 có z.toJSONSchema() → không phải viết tay 2 lần
const jsonSchema = z.toJSONSchema(schema);

const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: 'Analyze this feedback...',
  response_format: {
    type: 'text',
    mime_type: 'application/json',
    schema: jsonSchema,
  },
});

// 3) Parse + validate lại (không tin tuyệt đối output của AI)
const result = schema.parse(JSON.parse(interaction.output_text));
```

- Cấu hình structured output nằm ở **`response_format`** (`type: 'text'`, `mime_type: 'application/json'`, `schema: <JSON Schema>`).
- **Tận dụng nền tảng (Platform Leverage Ladder)**: dự án đã có `zod@4.4.3` ⇒ dùng **`z.toJSONSchema()`** để sinh JSON Schema từ Zod, tránh maintain 2 bản schema.
- ⚠️ Tên tham số của Interactions API còn mới; nếu bản SDK cài đặt khác biệt, kiểm tra lại typings. **Phương án fallback ổn định**: `ai.models.generateContent({ model, contents, config: { responseMimeType: 'application/json', responseSchema } })` vẫn được hỗ trợ trong cùng package `@google/genai`.

### 2.7. Multimodal input (ảnh/PDF) ⭐ (dùng cho tài liệu PDF/PNG/JPG)

```typescript
// Cách A – dùng File API (khuyến nghị cho file, kể cả nhỏ; ổn định, có URI)
const uploaded = await ai.files.upload({
  file: 'uploads/plans/<planId>/<file>.pdf',
  config: { mimeType: 'application/pdf' },
});

const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: [
    { type: 'text', text: 'Trích xuất các khái niệm chính và quan hệ tiên quyết.' },
    { type: 'image', uri: uploaded.uri, mime_type: uploaded.mimeType },
  ],
});
```

- File nhỏ có thể truyền base64 inline; nhưng dùng `ai.files.upload()` gọn hơn và tránh phình payload.
- Gemini xử lý native PDF/ảnh ⇒ **không cần pipeline OCR riêng** (đúng như rationale trong Proposal).
- Với file `.txt`: đọc text rồi truyền thẳng vào `input` (string) — không cần upload.

### 2.8. Thinking level (kiểm soát suy luận / độ trễ / chi phí)

```typescript
const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash',
  input: '...',
  generation_config: {
    thinking_level: 'low', // giảm suy luận → nhanh hơn, rẻ hơn
    // max_output_tokens, temperature ... cũng đặt tại đây
  },
});
```

- Dòng Gemini 3.x có **thinking** bật theo mặc định ⇒ tăng độ trễ & token. Với **grade_answer** và **generate_question** (yêu cầu NFR "độ trễ trong giới hạn hội thoại") nên đặt `thinking_level: 'low'`.
- Với **extract_concepts** (chạy nền, async) có thể để mức cao hơn nếu cần chất lượng trích xuất tốt hơn.

### 2.9. Streaming & đếm token (tùy chọn)

- Streaming: dùng biến thể stream của SDK để trả chữ theo luồng (hiệu ứng typing cho AI Examiner). Không bắt buộc cho MVP.
- Đếm/đo token: dùng `usage` trả về trong `interaction` (hoặc API count tokens) để giám sát quota — hữu ích cho R01.

---

## 3. Danh mục Model (07/2026) & khuyến nghị cho Recall AI

### 3.1. Bảng model text/multimodal hiện hành

| Model ID (chuỗi truyền vào `model`)                                 | Trạng thái          | Free tier | Giá paid (input / output, /1M token)          |
| ------------------------------------------------------------------- | ------------------- | --------- | --------------------------------------------- |
| `gemini-3.6-flash`                                                  | GA (flagship flash) | ✅        | $1.50 / $7.50                                 |
| `gemini-3.5-flash`                                                  | GA                  | ✅        | $1.50 / $9.00                                 |
| `gemini-3.5-flash-lite`                                             | GA                  | ✅        | $0.30 / $2.50                                 |
| `gemini-3.1-flash-lite`                                             | GA                  | ✅        | $0.25 (text/img/video), $0.50 (audio) / $1.50 |
| `gemini-2.5-pro`                                                    | GA                  | ✅        | $1.25 (≤200k) → $2.50 / $10 (≤200k) → $15     |
| `gemini-2.5-flash`                                                  | GA                  | ✅        | $0.30 / $2.50                                 |
| `gemini-2.5-flash-lite`                                             | GA                  | ✅        | $0.10 / $0.40                                 |
| `gemini-3.1-pro-preview`                                            | Preview             | ❌        | $2.00 (≤200k) → $4.00 / $12 (≤200k) → $18     |
| `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-3-pro-preview` | ⛔ **Shut down**    | –         | –                                             |
| **Embedding**: Gemini Embedding / Gemini Embedding 2                | GA                  | ✅        | (RAG/semantic search – **không cần cho MVP**) |

> Context window & max output không được liệt kê ở trang tổng quan — tra ở trang chi tiết của từng model nếu cần con số chính xác. (Dòng Flash truyền thống ~1M token input, nhưng hãy **xác nhận lại** trước khi cam kết trong tài liệu.)

### 3.2. Khuyến nghị model theo từng call của Recall AI

| AI call (schema)           | UC               | Model đề xuất                                                  | Lý do                                                                                                                     |
| -------------------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `extract_concepts`         | SP-01 (**I3.2**) | **`gemini-2.5-flash`** (mặc định) hoặc `gemini-3.5-flash-lite` | Multimodal PDF/ảnh, structured JSON, free tier, suy luận đủ tốt để tìm quan hệ tiên quyết. Chạy nền nên độ trễ không gắt. |
| `generate_question`        | AE-02            | `gemini-2.5-flash` / `gemini-3.5-flash`                        | Cần chất lượng hội thoại + độ trễ thấp; `thinking_level: low`.                                                            |
| `grade_answer`             | AE-02            | `gemini-2.5-flash-lite` / `gemini-3.5-flash-lite`              | Chấm theo rubric cố định, cần nhanh & rẻ; gọi **stateless**.                                                              |
| `summarize_session`        | AE-09            | `gemini-2.5-flash-lite`                                        | Tóm tắt 1 phát từ điểm đã lưu; rẻ.                                                                                        |
| Pre-generate cache câu hỏi | AE-06            | `*-flash-lite`                                                 | Chạy nền số lượng lớn → ưu tiên chi phí thấp nhất.                                                                        |

> **Đặt trong config/env**, ví dụ: `GEMINI_MODEL_EXTRACT`, `GEMINI_MODEL_QUESTION`, `GEMINI_MODEL_GRADE`, `GEMINI_MODEL_SUMMARY`. Khi model bị deprecate chỉ cần đổi env, không sửa code.

---

## 4. Rate limits, Quota, Chi phí & Quyền riêng tư

### 4.1. Rate limits (RPM/TPM/RPD)

- Trang docs **không còn công bố bảng số cố định**. Hạn mức phụ thuộc **usage tier** và xem trực tiếp tại **Google AI Studio** (`aistudio.google.com/rate-limit`).
- Tier: **Free** (project chưa bật billing) → **Tier 1** (bật billing, cap ~$250) → **Tier 2** ($100+ & 3 ngày) → **Tier 3** ($1,000+ & 30 ngày). Tier càng cao, hạn mức càng lớn.
- ⇒ **Không** hardcode con số "15 RPM/1500 RPD" như trước. Trong demo, **kiểm tra hạn mức thực tế của project trong AI Studio**.

### 4.2. Chi phí & ngân sách dự án

- Ngân sách SDP = **0đ** ⇒ bắt buộc bám **Free tier** cho phát triển & demo.
- Chiến lược kiểm soát chi phí (khớp **R01**): (1) **mock mode** khi dev; (2) **cache** kết quả (concept đã trích, câu hỏi pre-generated – AE-06); (3) **giới hạn số request/user/ngày**; (4) **hard-cap 3 lượt/concept** (C6); (5) chọn model **flash-lite** cho tác vụ tần suất cao.

### 4.3. ⚠️ Quyền riêng tư dữ liệu

- Trên **Free tier**, prompt/nội dung **CÓ THỂ được Google dùng để cải thiện sản phẩm**. Tài liệu sinh viên upload sẽ gửi lên Google.
- Với đồ án MVP/demo: chấp nhận được, nhưng **nên ghi rõ trong tài liệu & lưu ý người dùng**. Nếu cần bảo mật tuyệt đối → dùng paid tier và/hoặc `store: false`.

---

## 5. Ánh xạ sang 4 schema AI cố định của Recall AI (ràng buộc C4-C6)

Theo `UC-Overview.md §5.1`, AI **chỉ** được gọi qua 4 schema; mọi điều phối là **phần mềm tất định**.

```jsonc
// 1. extract_concepts  (SP-01 / I3.2)
{ "concepts": [{ "name": "...", "difficulty": 1, "description": "..." }],
  "edges":    [{ "from": "concept_name_A", "to": "concept_name_B" }],
  "language_detected": "en" }

// 2. generate_question (AE-02)
{ "question_text": "...", "question_type": "...", "concept_id": "..." }

// 3. grade_answer (AE-02)
{ "score": 0.0, "feedback": "...", "verdict": "deep|shallow|wrong" }

// 4. summarize_session (AE-09)
{ "summary_text": "...", "strengths": [], "weaknesses": [], "recommendations": [] }
```

- **C4** (AI không điều phối): mỗi call là structured output **1 nhiệm vụ hẹp**. Khi nào dừng/traceback/fallback = code (BFS ngược, priority queue). ⇒ Với `grade_answer` gọi **stateless** để tái lập được, unit-test được.
- **C5** (không bịa ngoài tài liệu): dùng `system_instruction` + rubric trích từ tài liệu; với `generate_question`/`grade_answer` neo vào nội dung upload (multimodal hoặc text đã lưu).
- **C6** (tối đa 3 lượt/concept): **state machine phía app** đếm lượt, không để AI tự quyết.

---

## 6. Vận hành & Rủi ro (khuyến nghị triển khai)

1. **Lớp abstraction AI** (`ai.service.ts` / interface `AIProvider`): tách SDK Gemini khỏi business logic ⇒ đổi provider/model không lan tỏa (R10). Model ID lấy từ env.
2. **Xử lý lỗi 429 `RESOURCE_EXHAUSTED`**: **exponential backoff** (2s → 4s → 8s), sau đó fail mềm. Không retry vô hạn.
3. **JSON sai định dạng**: dù đã bật structured output vẫn phải `try/catch JSON.parse` + `zod.safeParse`; retry tối đa 2 lần (SP-01 Alt Flow 2) → nếu vẫn hỏng thì cho nhập thủ công / `failed`.
4. **Fallback AI (AE-05)**: khi Gemini fail/hết quota → chuyển sang **flashcard tĩnh** từ `question_cache`, self-grading, lịch ôn vẫn chạy.
5. **Mock mode** (`USE_MOCK_AI=true`): trả data mẫu cố định ⇒ FE dev & test không tốn quota, và **thuật toán DAG/BFS unit-test độc lập với AI** (đúng tinh thần "trace-back test được với mock data").
6. **Không tin AI tuyệt đối**: DAG validation (Kahn), human-in-the-loop review đồ thị (SP-02) là **bắt buộc** (R02).

---

## 7. Nguồn tham khảo (đã xác minh 07/2026)

- [Gemini API – Models](https://ai.google.dev/gemini-api/docs/models)
- [Migrate to the Google GenAI SDK](https://ai.google.dev/gemini-api/docs/migrate)
- [Interactions API – Overview](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Migrating to the Interactions API](https://ai.google.dev/gemini-api/docs/migrate-to-interactions)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Text generation (Interactions)](https://ai.google.dev/gemini-api/docs/text-generation)
- [Quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [@google/genai – npm](https://www.npmjs.com/package/@google/genai)

> Tài liệu Gemini thay đổi nhanh — trước mỗi sprint có gọi AI, mở lại trang **Models** & **Pricing** để xác nhận model ID và giá còn hiệu lực.
