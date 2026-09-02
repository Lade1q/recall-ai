/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Một subset của JetBrains Mono (`cyrillic-ext`, 2028 B) lọt dưới ngưỡng
    // `assetsInlineLimit` mặc định 4096 của Vite, nên nó bị base64 hoá thẳng vào
    // stylesheet CHẶN RENDER. Base64 của woff2 (đã nén sẵn) gần như không gzip
    // thêm được, cho một subset mà app tiếng Việt không vẽ ký tự nào. Tệ hơn, khi
    // đã inline thì `unicode-range` mất tác dụng trì hoãn — byte đó tải vô điều kiện.
    //
    // Đo hai nhánh trong CÙNG một lượt (chỉ khác khối `build` này):
    //   có khối  → CSS raw 138 140, gzip 22 831, data-URI font 0
    //   bỏ khối  → CSS raw 140 805, gzip 25 502, data-URI font 1
    // ⇒ −2 671 B gzip (−10,5%).
    //
    // Đây là hiện tượng MỚI: mọi woff2 trước đó đều > 4096 (tệp nhỏ nhất 5,24 kB)
    // nên chưa có font nào từng bị inline.
    //
    // Hàm trả `undefined` cho asset khác ⇒ Vite rơi về heuristic mặc định, KHÔNG
    // phải "không inline": `shouldInline` kiểm `userShouldInline != null`, và
    // `undefined != null` là false. Đo lại bằng mồi SVG 517 B: inline ở CẢ hai
    // nhánh. Chỉ woff2 đổi hành vi.
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
});
