# Báo Cáo Nghiên Cứu Google Gemini API cho Recall AI

> **Dự án**: Recall AI – Proactive Study Assistant (Team CAGT)
> **Mục đích**: Tài liệu tham chiếu kỹ thuật Gemini API, làm nền cho issue **I3.2 – `extract_concepts`** (Sprint 3) và dự trù cho **AI Examiner** (Sprint 4-5).
> **Nguồn**: Xác minh trực tiếp từ `ai.google.dev/gemini-api/docs` và từ thực nghiệm API thật, tại thời điểm 07/2026 (xem mục Nguồn tham khảo cuối bài).

> **⚠️ Lưu ý về vòng đời model**: Model Gemini **hết hạn/bị thay thế rất nhanh** — ngay trong dòng 3.x, `gemini-2.0-flash` và `gemini-3-pro-preview` đã từng bị shut down. Model ID **luôn để trong biến môi trường/config**, không hardcode; và bọc Gemini sau một **lớp abstraction** (khớp risk R10 & ràng buộc C4-C6 của SDP). Trước khi dùng lại tài liệu này ở Sprint sau, kiểm tra lại danh mục model còn hiệu lực trong AI Studio.

> **📌 Luật model ID của dự án: luôn dùng alias `-latest`, không bao giờ ghim tên có phiên bản/ngày tháng.**
>
> - Mặc định của Recall AI là **`gemini-flash-latest`** và **`gemini-flash-lite-latest`**. Alias rolling tự trỏ sang bản GA hiện hành ⇒ model bị khai tử không làm gãy hệ thống.
> - Tên có số phiên bản (`gemini-2.5-flash`, `gemini-3.5-flash`…) là **tên ghim**. Khi Google khai tử, lời gọi **fail cứng HTTP 404**, không degrade — đo trên chính API key của dự án: `gemini-2.5-flash` + `gemini-2.5-flash-lite` trả 404 ngày **25/07/2026**, `gemini-2.5-flash` đo lại vẫn 404 ngày **13/08/2026** (`"This model models/gemini-2.5-flash is no longer available to new users"`), trong khi `gemini-flash-latest` route bình thường.
> - ⚠️ **Bẫy khi kiểm chứng**: `ai.models.list()` và `ai.models.get()` **vẫn báo model đã khai tử là PRESENT/OK** ⇒ false pass. Chỉ **bề mặt gọi thật** (`ai.interactions.create`) mới lộ 404. Muốn xác nhận một model ID còn sống thì phải gọi thật, đừng tra danh mục.
> - Các model ID có số phiên bản trong tài liệu này (§3.1b) là **ảnh chụp danh mục & bảng giá tại 07/2026**, giữ lại để tham chiếu lịch sử — **không** phải giá trị đem đi hardcode.
>
> Cùng luật này đã ghi ở `src/server/README.md` và `src/server/.env.example`.

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
  model: 'gemini-flash-latest',
  input: 'Explain how AI works in a few words',
});
console.log(interaction.output_text);
```

- Method: **`ai.interactions.create({ model, input })`**, kết quả đọc ở **`interaction.output_text`**.
- `input` nhận **string** (đơn giản) hoặc **mảng content object** (đa phương tiện – xem 2.7).

### 2.4. System Instruction (đặt vai trò/luật cố định)

```typescript
const interaction = await ai.interactions.create({
  model: 'gemini-flash-latest',
  input: 'Hello there',
  system_instruction: 'You are a cat. Your name is Neko.',
});
```

> Dùng để enforce ràng buộc **C5** (AI Examiner không bịa kiến thức ngoài tài liệu). `system_instruction` là **interaction-scoped** — phải truyền lại ở mỗi lượt (không được lưu qua `previous_interaction_id`).

### 2.5. Multi-turn hội thoại – `previous_interaction_id` ⭐ (quan trọng cho AI Examiner)

```typescript
const t1 = await ai.interactions.create({
  model: 'gemini-flash-latest',
  input: 'I have 2 dogs in my house.',
});

const t2 = await ai.interactions.create({
  model: 'gemini-flash-latest',
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
  model: 'gemini-flash-latest',
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
  model: 'gemini-flash-latest',
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
  model: 'gemini-flash-latest',
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

### 3.1. Alias `-latest` — thứ duy nhất được đem đi cấu hình

| Alias (chuỗi truyền vào `model`)  | Trỏ tới                     | Free tier | Giá                              |
| --------------------------------- | --------------------------- | --------- | -------------------------------- |
| **`gemini-flash-latest`** ⭐      | Bản Flash GA hiện hành      | ✅        | Theo model mà alias đang trỏ tới |
| **`gemini-flash-lite-latest`** ⭐ | Bản Flash-Lite GA hiện hành | ✅        | Theo model mà alias đang trỏ tới |

Alias là giá trị **duy nhất** được ghi vào `.env` / config. Đánh đổi: không biết trước chính xác giá và hành vi của bản mà alias trỏ tới ⇒ khi cần con số chi phí cho báo cáo thì tra AI Studio tại thời điểm đó, đừng chép lại bảng bên dưới.

### 3.1b. Ảnh chụp danh mục model tại 07/2026 (tham chiếu lịch sử — **không hardcode**)

> Bảng này giữ nguyên để đối chiếu giá/năng lực khi chọn alias. Cột "Trạng thái" đã cập nhật theo đo đạc mới nhất; **các ID có số phiên bản đều là tên ghim**, không được đưa vào code hay `.env`.

| Model ID (chuỗi truyền vào `model`)                                 | Trạng thái                                         | Free tier | Giá paid tại 07/2026 (input / output, /1M token) |
| ------------------------------------------------------------------- | -------------------------------------------------- | --------- | ------------------------------------------------ |
| `gemini-3.6-flash`                                                  | GA (flagship flash) tại 07/2026                    | ✅        | $1.50 / $7.50                                    |
| `gemini-3.5-flash`                                                  | GA tại 07/2026                                     | ✅        | $1.50 / $9.00                                    |
| `gemini-3.5-flash-lite`                                             | GA tại 07/2026                                     | ✅        | $0.30 / $2.50                                    |
| `gemini-3.1-flash-lite`                                             | GA tại 07/2026                                     | ✅        | $0.25 (text/img/video), $0.50 (audio) / $1.50    |
| `gemini-2.5-pro`                                                    | GA tại 07/2026 (chưa đo lại)                       | ✅        | $1.25 (≤200k) → $2.50 / $10 (≤200k) → $15        |
| `gemini-2.5-flash`                                                  | ⛔ **404 với key mới** — đo 25/07 & lại 13/08/2026 | –         | $0.30 / $2.50                                    |
| `gemini-2.5-flash-lite`                                             | ⛔ **404 với key mới** — đo 25/07/2026             | –         | $0.10 / $0.40                                    |
| `gemini-3.1-pro-preview`                                            | Preview tại 07/2026                                | ❌        | $2.00 (≤200k) → $4.00 / $12 (≤200k) → $18        |
| `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-3-pro-preview` | ⛔ **Shut down**                                   | –         | –                                                |
| **Embedding**: Gemini Embedding / Gemini Embedding 2                | GA tại 07/2026                                     | ✅        | (RAG/semantic search – **không cần cho MVP**)    |

> Hai dòng ⛔ 404 chính là minh hoạ cho luật ở đầu tài liệu: tại 07/2026 chúng còn là "GA ✅" trong bảng này. Trạng thái GA của các dòng còn lại là ảnh chụp 07/2026 và **có thể đã hết hiệu lực** — dùng alias thì không phải quan tâm.

> Context window & max output không được liệt kê ở trang tổng quan — tra ở trang chi tiết của từng model nếu cần con số chính xác. (Dòng Flash truyền thống ~1M token input, nhưng hãy **xác nhận lại** trước khi cam kết trong tài liệu.)

### 3.2. Khuyến nghị model theo từng call của Recall AI

| AI call (schema)           | UC               | Model đề xuất                  | Lý do                                                                                                                     |
| -------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `extract_concepts`         | SP-01 (**I3.2**) | **`gemini-flash-latest`**      | Multimodal PDF/ảnh, structured JSON, free tier, suy luận đủ tốt để tìm quan hệ tiên quyết. Chạy nền nên độ trễ không gắt. |
| `generate_question`        | AE-02            | **`gemini-flash-latest`**      | Cần chất lượng hội thoại + độ trễ thấp; `thinking_level: low`.                                                            |
| `grade_answer`             | AE-02            | **`gemini-flash-latest`**      | Chấm theo rubric cố định, cần nhanh & rẻ; gọi **stateless**.                                                              |
| `summarize_session`        | AE-09            | **`gemini-flash-lite-latest`** | Tóm tắt 1 phát từ điểm đã lưu; rẻ.                                                                                        |
| Pre-generate cache câu hỏi | AE-06            | **`gemini-flash-lite-latest`** | Chạy nền số lượng lớn → ưu tiên chi phí thấp nhất.                                                                        |

> ⚠️ Cột "Model đề xuất" **chỉ được chứa alias `-latest`**. Bảng này trước đây ghi `gemini-2.5-flash` làm mặc định và đó chính là nguồn đã seed bug hardcode fallback trong `gemini.service.ts` — khi model bị khai tử, mọi lời gọi extract fail 404. Muốn so sánh năng lực/giá giữa các thế hệ thì xem §3.1b, nhưng **đừng chép ID có số phiên bản ra khỏi bảng đó**.

> **Đặt trong config/env**: hiện dự án dùng **`GEMINI_MODEL_EXTRACT`** (cho `extract_concepts`) và **`GEMINI_MODEL_INTERVIEW`** (dùng chung cho `generate_question` + `grade_answer`) — xem `src/server/.env.example`. Khi model bị deprecate chỉ cần đổi env, không sửa code. Giá trị fallback trong code cũng phải là alias `-latest`, không phải tên ghim.

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
// Không có `concept_id`: caller đã biết đang hỏi khái niệm nào (chốt 2026-08-11, xem §5.1).
{ "question_text": "...", "question_type": "recall|application|why" }

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

1. **Lớp abstraction AI** (`ai.service.ts` / interface `AIProvider`): tách SDK Gemini khỏi business logic ⇒ đổi provider/model không lan tỏa (R10). Model ID lấy từ env, và **giá trị fallback trong code cũng phải là alias `-latest`** — env thiếu/rỗng mà rơi về một tên ghim thì đúng lúc cần degrade lại fail 404 (xem luật ở đầu tài liệu).
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
