import { useEffect, useState } from 'react';

/**
 * Người dùng có đang yêu cầu giảm chuyển động không — và CÓ THEO DÕI khi họ
 * đổi ý giữa chừng.
 *
 * Bản trước chỉ đọc `matchMedia` đúng một lần lúc mount rồi thôi. Khối
 * `@media (prefers-reduced-motion: reduce)` trong CSS thì phản ứng ngay khi
 * người dùng bật/tắt cài đặt của hệ điều hành, nên hai bên lệch nhau: CSS đã
 * tắt hoạt ảnh mà đồng hồ JS vẫn chạy, hoặc CSS đã bật lại mà cảnh vẫn đứng
 * hình. Đăng ký `change` để hai bên nói cùng một chuyện.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const doi = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', doi);
    /* Không đọc lại giá trị ở đây: initializer của `useState` đã đọc lúc mount,
       và từ đó trở đi mọi thay đổi đều đi qua `change`. Khe hở duy nhất là vài
       micro giây giữa render và effect — không đáng đánh đổi lấy một lần
       setState trong thân effect (`react-hooks/set-state-in-effect`). */
    return () => mql.removeEventListener('change', doi);
  }, []);

  return reduced;
}

/**
 * Đồng hồ nhịp cho các cảnh hoạt hoạ của landing.
 *
 * Trả về số nhịp đã trôi qua, tăng mỗi `intervalMs`. Khi người dùng bật
 * `prefers-reduced-motion` thì KHÔNG chạy đồng hồ và trả thẳng `frozenAt`.
 *
 * `frozenAt` là nhịp nào thì hoàn toàn do nơi gọi quyết định, và nơi gọi phải
 * chọn một nhịp mà cảnh còn NỘI DUNG. Đây không phải lời dặn thừa: bản trước
 * `ExtractScene` đóng băng ở nhịp cuối của vòng lặp, mà nhịp cuối lại đúng là
 * nhịp dọn sạch sân khấu để chuẩn bị lặp lại — nên người bật giảm chuyển động
 * nhận được một đồ thị trống không, mất sạch nội dung của cảnh.
 */
export function useSceneTicker(intervalMs: number, frozenAt: number): number {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [reduced, intervalMs]);

  return reduced ? frozenAt : tick;
}
