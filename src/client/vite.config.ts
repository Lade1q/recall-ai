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
    // thêm được: +2723 B gzip, tức +10,6% CSS, cho một subset mà app tiếng Việt
    // không vẽ ký tự nào. Tệ hơn, khi đã inline thì `unicode-range` mất tác dụng
    // trì hoãn — byte đó tải vô điều kiện.
    //
    // Đây là hiện tượng MỚI: mọi woff2 trước đó đều > 4096 (tệp nhỏ nhất 5,24 kB)
    // nên chưa có font nào từng bị inline.
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
