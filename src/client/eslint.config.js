import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier, // Tắt ESLint format rules để tránh conflict với Prettier
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Bắt biến/param không dùng; cho phép prefix _ để skip (convention)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Warn khi dùng `any` thay vì error (đôi khi cần thiết trong React)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Relax thành warn (không phải error) vì shadcn/ui export cả component lẫn variants (pattern hợp lệ)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]);
