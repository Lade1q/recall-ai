# AI E2E Testing Rules & Best Practices

Tài liệu này đóng vai trò là "Context / System Prompt" dành cho các AI Agent hoặc lập trình viên khi viết kịch bản kiểm thử E2E (Playwright) trong dự án này, nhằm đảm bảo tính ổn định và tránh lặp lại các lỗi đã từng gặp.

## 1. Thiết lập Database & Seed Data (Không Mocking)

Dự án ưu tiên việc **Seed dữ liệu thật** vào Database trước khi chạy test thay vì dùng Mock API, nhằm đảm bảo bài test chạy qua toàn bộ luồng (Frontend -> Backend -> Database).

- **Đường dẫn import:**
  Vì `prisma`, `dotenv`, và `bcryptjs` không được cài ở thư mục gốc của repo, bắt buộc phải require chúng từ `src/server/node_modules/`:
  ```typescript
  import * as path from 'path';
  require('../../../src/server/node_modules/dotenv').config({
    path: path.join(__dirname, '../../../src/server/.env'),
  });
  const { PrismaClient } = require('../../../src/server/node_modules/@prisma/client');
  const { PrismaPg } = require('../../../src/server/node_modules/@prisma/adapter-pg');
  const bcrypt = require('../../../src/server/node_modules/bcryptjs');
  ```
- **Khởi tạo Prisma với Adapter (Bắt buộc cho Prisma 7+):**
  ```typescript
  const databaseUrl = process.env.DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await prisma.$connect();
  ```

## 2. Quản lý vòng đời dữ liệu (Cleanup)

Luôn dọn dẹp dữ liệu rác sau khi test chạy xong để không ảnh hưởng tới các test case khác.

- Dùng `try ... finally` bao bọc các bước chạy UI test.
- Đặt lệnh xoá trong `finally`.
- Nhờ `onDelete: Cascade` trong Prisma Schema, chỉ cần xoá Entity gốc (ví dụ `User`), các thực thể con (như `StudyPlan`, `Concept`, `ReviewQueueItem`) sẽ tự động biến mất.
  ```typescript
  try {
    // Các thao tác await page.goto(...)
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
  ```

## 3. Tránh lỗi Strict Mode của Playwright (Lỗi Selector)

Playwright mặc định sử dụng cơ chế tìm kiếm chuỗi con (substring match). Điều này rất dễ gây lỗi `strict mode violation` khi giao diện có các phần tử trùng tên.

- **Ví dụ điển hình:** `page.getByLabel('Mật khẩu')` sẽ bắt trúng cả thẻ `<input label="Mật khẩu">` và nút `<button aria-label="Hiện mật khẩu">`.
- **Cách khắc phục:**
  Luôn sử dụng tham số `{ exact: true }` cho các label ngắn hoặc dễ trùng lắp:
  `page.getByLabel('Mật khẩu', { exact: true })`.
- Ưu tiên dùng `getByRole` để lấy phần tử chính xác hơn (VD: `getByRole('heading', { name: 'Concept C1' })`).

## 4. Xử lý logic Thời gian (Date) khi Seed dữ liệu

Các API backend thường sử dụng `now()` của máy chủ hoặc CSDL làm mốc lọc (VD: Lấy hàng đợi ôn tập `scheduledFor <= NOW()`).

- Khi seed các Entity có điều kiện thời gian (như `ReviewQueueItem.scheduledFor`), nên đặt thời gian lùi về quá khứ một chút để đề phòng độ trễ mili-giây giữa lúc seed và lúc API được gọi:
  ```typescript
  // Nên trừ đi vài phút thay vì dùng thẳng new Date()
  const pastDate = new Date();
  pastDate.setMinutes(pastDate.getMinutes() - 5);
  ```

## 5. Môi trường Trình duyệt (Browser OS Compatibility)

Hệ thống CI hoặc máy dev (Arch Linux) có thể không được hỗ trợ để cài đặt trình duyệt **Edge** (`msedge`) bằng lệnh mặc định của Playwright. Do đó, các kịch bản test **bắt buộc phải pass trên Firefox và Chrome (Chromium)**.

- **Chromium (Chrome)** là trình duyệt được ưu tiên nhất. Khi chạy test cục bộ để chẩn đoán nhanh, luôn ưu tiên sử dụng cờ `--project=chromium`.
- Đảm bảo kịch bản test cũng chạy thành công (pass) trên Firefox trước khi xem như hoàn tất.
- Tránh config bắt buộc chạy `msedge` trong `playwright.config.ts`.
- Nếu test bị kẹt hoặc treo (timeout), hãy kiểm tra xem có phải do thiếu engine trình duyệt hay không.

## 6. Cập nhật kết quả về file Test Case (TC)

Sau khi kịch bản test được viết xong và chạy thử, AI (hoặc kỹ sư) có trách nhiệm cập nhật trực tiếp kết quả (PASS / FAIL) vào file Markdown chứa Test Case (ví dụ: `docs/test/test-cases/TC-FS-FocusSession.md`).

- **Ghi kết quả chi tiết cho Sub-test**: Nếu TC có chia trường hợp (ví dụ: a, b, c), phải ghi rõ kết quả `Kết quả thực tế` và `Trạng thái` cho từng sub-test vào cùng một ô, dùng tiền tố `a)`, `b)` và ngăn cách bằng thẻ `<br>` (VD: `a) PASS <br> b) FAIL`).
- **PASS**: Khi test chạy xanh hoàn toàn và thực sự phản ánh đúng yêu cầu của Test Case.
- **FAIL**: Chỉ đánh dấu FAIL khi xác định chắc chắn đó là **lỗi của tính năng (bug)**, ứng dụng hoạt động không đúng yêu cầu của TC.
- **TUYỆT ĐỐI KHÔNG ép test pass theo code lỗi:** Không được tự ý thay đổi kịch bản test hoặc assertion để cố tình cho khớp với hành vi sai của ứng dụng hiện tại, việc này sẽ làm mất đi hoàn toàn ý nghĩa của testing.
- **Kiểm tra kỹ trước khi kết luận:** Khi gặp lỗi, cần double-check cẩn thận để xác định lỗi xuất phát từ script test (sai selector, thiếu setup dữ liệu, lỗi môi trường) hay do lỗi của chính mã nguồn (bug). Nếu là lỗi do script test, hãy sửa test; nếu do tính năng lỗi, hãy đánh dấu FAIL và báo cáo.

## 7. Chú thích (Comments) tiếng Việt trong Test Script

Khi viết hoặc cập nhật kịch bản E2E, AI (và lập trình viên) bắt buộc phải thêm các comment (chú thích) bằng **tiếng Việt** cho từng bước cụ thể (step-by-step).

- Việc comment bằng tiếng Việt giúp đội ngũ kiểm thử, QA và developer khác trong dự án dễ dàng đọc hiểu luồng test và đối chiếu với Test Case.
- Viết comment theo dạng đánh số hoặc gạch đầu dòng rõ ràng trước các khối logic chính.
- Ví dụ: `// 1. Thực hiện đăng nhập`, `// 2. Kiểm tra điều hướng tới Dashboard`, `// 3. Xác minh nút Bắt đầu hiển thị`.

## 8. Tuân thủ Coding Conventions

Toàn bộ code test (TypeScript) phải tuân thủ chặt chẽ các quy tắc viết code của dự án được quy định tại `docs/guidelines/coding-conventions.md`.

- **Naming Conventions**: Tên biến, hàm dùng `camelCase`.
- **TypeScript Strict Mode**: Khai báo kiểu (type annotation) rõ ràng khi cần thiết, không sử dụng `any` tùy tiện.
- **Import/Export**: Áp dụng đúng thứ tự import và ưu tiên dùng alias `@/` nếu có.
- Tránh trùng lặp code (DRY), sử dụng lại các hàm tiện ích chung nếu phù hợp.

## 9. Kiểm tra Local trước khi Push (Tránh lỗi CI)

Để không làm hỏng pipeline CI/CD, bắt buộc thực hiện kiểm tra code ở local trước:

- Luôn chạy thử file test cục bộ thông qua Playwright UI hoặc Terminal (`npm run test:e2e` hoặc `playwright test --project=chromium`) để đảm bảo logic chạy đúng và ổn định (không flaky).
- Xác minh không có lỗi cú pháp, vi phạm linter (ví dụ ESLint, Prettier) hay lỗi biên dịch TypeScript (tsc) từ đoạn code test vừa được thêm vào.
- **TUYỆT ĐỐI KHÔNG được tự ý commit và push code lên repository.** AI chỉ hỗ trợ viết và xác minh code test thành công ở local. Mọi thao tác commit hoặc push phải do người dùng tự thực hiện, hoặc AI phải xin phép và được người dùng đồng ý mới được làm.
