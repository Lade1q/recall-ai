# Hướng Dẫn Sử Dụng Playwright Dành Cho QA/Tester

Tài liệu này tổng hợp các kiến thức và mẹo sử dụng Playwright (E2E Testing) cơ bản, được đúc kết lại để các thành viên (đặc biệt là QA không chuyên code) có thể dễ dàng tiếp cận và tổ chức test case.

---

## 1. Bí kíp viết Assert (Kỳ vọng) bằng giao diện không cần gõ code

Khi chạy công cụ Codegen (`npm run test:e2e:codegen`), Playwright Inspector sẽ mở ra. Trên thanh công cụ của nó có các nút bấm giúp tự sinh ra code kiểm tra (Assert):

- 👁️ **Assert visibility (Con mắt):** Kiểm tra xem một đối tượng (nút bấm, dòng chữ, bảng...) có hiện lên màn hình hay không.
- 🔤 **Assert text (Chữ ab):** Kiểm tra xem một đối tượng có chứa đúng dòng chữ mình mong đợi hay không.
- 📋 **Assert value:** Kiểm tra giá trị đang được nhập vào một ô input.

**Cách dùng:**

1. Click vào một trong các biểu tượng trên (ví dụ: con mắt 👁️).
2. Rê chuột sang cửa sổ trình duyệt và click vào vị trí dòng chữ/nút bấm bạn muốn kiểm tra.
3. Code `expect` sẽ tự động được viết vào file.

👉 _Mẹo: Không có nút kiểm tra chuyển trang (URL), nhưng bạn có thể dùng nút con mắt 👁️ click vào một tiêu đề chỉ có ở trang mới để chứng minh việc chuyển trang đã thành công._

---

## 2. Kiểm tra URL thủ công

Nếu bạn bắt buộc muốn test chính xác đường dẫn (URL), hãy mở file code ra và thêm 1 dòng này vào cuối hàm test:

```typescript
// Test Đăng nhập thành công (Chuyển sang trang Dashboard)
await expect(page).toHaveURL(/.*\/dashboard/);

// Test Đăng nhập thất bại (Vẫn đứng yên ở trang Login)
await expect(page).toHaveURL('http://localhost:5173/login');
```

---

## 3. Cách tổ chức file Test gọn gàng

Mặc định Codegen sẽ sinh 1 test ra 1 file độc lập. Tuy nhiên, bạn nên copy code từ nhiều lần sinh ra và **gộp chung vào 1 file** theo từng nhóm chức năng (ví dụ: `login.spec.ts`).

Để kết quả báo cáo hiển thị đẹp và rành mạch, hãy dùng khối `test.describe` để gom nhóm các test case lại với nhau:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Tính năng Xác thực (Authentication)', () => {
  test('Đăng nhập thành công', async ({ page }) => {
    // thao tác & kiểm tra
  });

  test('Đăng nhập thất bại do sai mật khẩu', async ({ page }) => {
    // thao tác & kiểm tra
  });
});
```

---

## 4. Kiểm thử Backend sập / Lỗi API (Đánh chặn mạng - Mocking)

Trong kiểm thử E2E, chúng ta **không nên đập phá Backend thật**. Thay vào đó, dùng `page.route()` để Playwright tự động chặn request gửi đi và giả lập lỗi 500 (hoặc bất kỳ lỗi gì). Backend thật không hề bị ảnh hưởng.

```typescript
test('Hiển thị thông báo lỗi khi Backend sập (Lỗi 500)', async ({ page }) => {
  // 👉 ĐÁNH CHẶN API
  // Bất cứ khi nào gọi API có chữ '/api/login', chặn lại và trả về lỗi 500
  await page.route('**/api/login', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Lỗi máy chủ nội bộ' }),
    });
  });

  // Sau khi thiết lập chặn, tiến hành thao tác trên UI như bình thường
  await page.goto('http://localhost:5173/login');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // 👉 KIỂM TRA
  // Đảm bảo giao diện hiện thông báo hệ thống lỗi thay vì crash trắng trang
  await expect(page.getByText('Hệ thống đang bảo trì')).toBeVisible();
});
```

---

## 5. Chạy nhiều trình duyệt cùng lúc

Mặc định Playwright trong dự án này được cấu hình chạy đồng thời trên 3 trình duyệt (Chrome, Firefox, Edge).
Khi bạn chạy lệnh `npm run test:e2e`, 1 bài test sẽ được chạy 3 lần.

Nếu bạn muốn tiết kiệm thời gian và chỉ chạy trên 1 trình duyệt nhất định (VD: chỉ chạy trên Chrome), bạn có thể chạy:

```bash
npx playwright test --project=chromium
```
