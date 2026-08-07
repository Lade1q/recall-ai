# Hướng dẫn Kiểm thử E2E (Playwright)

Thư mục này chứa cấu hình và các kịch bản kiểm thử giao diện tự động (End-to-End) bằng Playwright.

## Cài đặt ban đầu (Chỉ chạy 1 lần)

Mở terminal ở thư mục gốc của dự án (`planning-ai`) và chạy:

```bash
npm ci
npm run test:e2e:install
```

_(Lưu ý trên hệ điều hành Arch Linux: Nếu hiện cảnh báo tải bản cài đặt "Ubuntu fallback", hãy bỏ qua vì đó là điều bình thường, các bài test vẫn sẽ chạy tốt)._

## Các lệnh thường dùng

_(Tất cả lệnh đều chạy ở thư mục gốc của dự án /planning-ai)_

### 1. Ghi lại thao tác tự động (Codegen)

Mở trình duyệt để bạn thao tác bằng chuột/bàn phím, Playwright sẽ tự sinh ra code test:

```bash
# Ghi bình thường (copy code thủ công)
npm run test:e2e:codegen

# Ghi và tự động lưu thẳng vào file (thay đổi tên file tùy ý)
npx playwright codegen http://localhost:5173 -o e2e/tests/<ten-file>.spec.ts
```

👉 **Lưu ý:** Phải chạy sẵn frontend (`npm run dev` ở thư mục `src/client`) trước khi dùng lệnh này và chạy backend (`npm run dev` ở thư mục `src/server`) để thao tác với hệ thống.

### 2. Chạy các bài test

Playwright sẽ tự động bật frontend (nếu chưa bật) và test các kịch bản bạn đã lưu:

```bash
# Chạy ngầm tất cả các test (nhanh nhất)
npm run test:e2e

# Chạy test nhưng hiển thị giao diện trực quan để dễ theo dõi
npm run test:e2e:ui
```

### 3. Xem báo cáo (Report)

Nếu test thất bại, chạy lệnh này để mở một trang báo cáo chi tiết nguyên nhân lỗi, xem lại màn hình (screenshot) lúc lỗi:

```bash
npm run test:e2e:report
```
