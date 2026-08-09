import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock ResizeObserver for @xyflow/react
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserver;

// jsdom (opaque origin) không cấp localStorage — dựng bản in-memory để test dùng snapshot/token.
const localStorageStore = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key)! : null),
  setItem: (key, value) => {
    localStorageStore.set(key, String(value));
  },
  removeItem: (key) => {
    localStorageStore.delete(key);
  },
  clear: () => {
    localStorageStore.clear();
  },
  key: (index) => Array.from(localStorageStore.keys())[index] ?? null,
  get length() {
    return localStorageStore.size;
  },
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// Mock matchMedia since jsdom doesn't support it (needed by UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
