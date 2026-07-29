import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    // Bỏ qua các thư mục build output và auto-generated files
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
  },
  // JS recommended rules
  js.configs.recommended,
  // TypeScript rules (spread vì đây là array)
  ...tseslint.configs.recommended,
  // Tắt ESLint format rules để tránh conflict với Prettier
  prettier,
  // Config files ở root của server chạy dưới CommonJS (module, require)
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  // Custom rules áp dụng riêng cho .ts files
  {
    files: ['src/**/*.ts'],
    rules: {
      // Bắt biến/param không dùng; cho phép prefix _ để skip (convention)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Cảnh báo khi dùng `any` — backend cần type safety hơn FE
      '@typescript-eslint/no-explicit-any': 'warn',
      // Backend không nên console.log tùy tiện; dùng logger thay thế
      // Vẫn cho phép console.warn và console.error cho critical messages
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
