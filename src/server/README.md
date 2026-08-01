# Recall AI - Backend Developer Guide

Tài liệu này hướng dẫn cách thiết lập môi trường phát triển (Development Setup) cho Backend của dự án **Recall AI**.

---

## 1. Yêu cầu hệ thống (Prerequisites)

Đảm bảo máy của bạn đã cài đặt:

- **Node.js** (Phiên bản v18 trở lên)
- **npm** (đi kèm Node.js)
- **Docker** (Khuyên dùng) hoặc **PostgreSQL** (cài đặt trực tiếp)

---

## 2. Thiết lập Database (PostgreSQL)

### Cách A: Sử dụng Docker (Khuyên dùng)

Chạy lệnh sau để khởi tạo PostgreSQL container:

```bash
docker run --name recall-postgres \
  -e POSTGRES_PASSWORD=postgrespassword \
  -e POSTGRES_DB=recall_ai_dev \
  -p 5432:5432 \
  -d postgres
```

### Cách B: Cài đặt trực tiếp (Native)

Nếu cài trực tiếp PostgreSQL trên hệ điều hành, hãy tạo một user với mật khẩu `postgrespassword` và tạo database có tên `recall_ai_dev`.

---

## 3. Thiết lập biến môi trường (Environment Variables)

Copy file cấu hình mẫu và điền thông tin:

```bash
cp .env.example .env
```

Kiểm tra file `.env` đảm bảo các biến sau chính xác:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/recall_ai_dev?schema=public"
JWT_SECRET="tối_thiểu_32_ký_tự_ngẫu_nhiên_ở_đây"
JWT_REFRESH_SECRET="tối_thiểu_32_ký_tự_ngẫu_nhiên_khác_ở_đây"
```

### Biến môi trường cho AI (Gemini)

```env
GEMINI_API_KEY="khoá_thật_của_bạn"
USE_MOCK_AI=false
GEMINI_MODEL_EXTRACT="gemini-flash-latest"
GEMINI_MODEL_INTERVIEW="gemini-flash-latest"
```

- `GEMINI_API_KEY` **chỉ tồn tại ở backend**, tuyệt đối không đưa sang client (bundle Vite là công khai).
- **Luôn dùng alias `-latest`**, không ghim tên model có ngày tháng. Google khai tử model ID cũ rất nhanh — đã xác nhận 25/07/2026: `gemini-2.5-flash` trả HTTP 404 với API key mới.
- `GEMINI_MODEL_EXTRACT` dùng cho `extract_concepts`; `GEMINI_MODEL_INTERVIEW` dùng cho `generate_question` + `grade_answer`.

### Phát triển không tốn quota (`USE_MOCK_AI`)

Đặt `USE_MOCK_AI=true` để toàn bộ lời gọi AI trả dữ liệu mẫu cố định, **không gọi Gemini và không tốn quota**:

```env
USE_MOCK_AI=true
```

- `extract_concepts` trả một DAG mẫu cố định (Variable → Loop → Array → …).
- `grade_answer` chấm theo **độ dài câu trả lời**, không phải chất lượng: dưới 20 ký tự → `wrong`, từ 20 → `shallow`, từ 120 → `deep`. Quy tắc này chỉ nhằm giúp bạn chạm được cả ba nhánh verdict khi phát triển; đừng dùng nó để đánh giá chất lượng chấm điểm thật.
- Khi cần kiểm chứng chất lượng AI thật, phải đặt lại `USE_MOCK_AI=false` và dùng khoá thật.

---

## 4. Khởi chạy dự án

Từ thư mục `src/server`, thực hiện các lệnh sau:

### Bước 1: Cài đặt thư viện

```bash
npm install
```

### Bước 2: Đồng bộ Database và Generate Prisma Client

Mỗi khi setup mới hoặc kéo (pull) code có sự thay đổi về Database Schema, bạn cần chạy:

```bash
# Tạo/cập nhật bảng trong DB
npx prisma migrate dev

# Sinh ra các kiểu dữ liệu TypeScript mới nhất cho Prisma Client
npx prisma generate
```

> ⚠️ **Phải chạy đủ cả hai lệnh.** `migrate dev` không phải lúc nào cũng tự chạy `generate` — nếu bỏ qua bước sau, `tsc` sẽ báo lỗi kiểu dữ liệu cho cột vừa thêm (ví dụ `'languageDetected' does not exist in type ...`) dù DB đã đúng.

Kiểm tra DB đã khớp schema chưa:

```bash
npx prisma migrate status
```

### Bước 3: Chạy server ở chế độ Development

```bash
npm run dev
```

Server sẽ khởi động tại địa chỉ: `http://localhost:3001`

---

## 5. Kiểm thử & chất lượng code

```bash
npm test        # Jest — unit test cho logic thuần (DAG, chấm điểm, schema AI)
npm run lint    # ESLint
npm run format  # Prettier
```

Bộ test cố tình **không cần DB và không cần API key**: phần logic quyết định của hệ thống (Concept Graph Engine, điều phối phiên vấn đáp) là code thuần định trước theo ràng buộc **C4**, nên phải chứng minh được độc lập với Gemini và Postgres. Lời gọi Gemini được test bằng cách mock `@google/genai`.
