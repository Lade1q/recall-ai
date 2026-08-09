import { createContext, useContext } from 'react';

/**
 * Cho phép một màn con phủ-toàn-màn-hình (phiên Focus đang chạy) yêu cầu `MainLayout` khoá phần
 * khung — sidebar + header — khỏi tab order và cây trợ năng trong lúc nó che kín viewport.
 *
 * Vì sao phải qua context chứ không đặt `inert` trực tiếp: `RunningSession` render qua `<Outlet>`
 * nên nó là con của `<main>`, còn `<aside>`/`<header>` là ANH EM của `<main>` trong `MainLayout`.
 * Từ trong `RunningSession` không thể đặt `inert` lên anh em theo kiểu hậu duệ, và query-rồi-set
 * imperatively thì mong manh. Cờ dùng chung này để chính `MainLayout` tự `inert` phần của nó.
 */
export const FocusOverlayContext = createContext<(active: boolean) => void>(() => {});

export function useFocusOverlay(): (active: boolean) => void {
  return useContext(FocusOverlayContext);
}
