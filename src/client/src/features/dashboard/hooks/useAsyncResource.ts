import { useCallback, useEffect, useState } from 'react';

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Nạp một nguồn dữ liệu độc lập cho Dashboard: mỗi khối tự quản `loading`/`error` của riêng nó.
 * Đây là ràng buộc của #169 — `/plans`, `/review-queue/today`, `/dashboard/stats` là ba nguồn
 * độc lập, một cái hỏng thì chỉ khối đó báo lỗi, không có trang lỗi toàn màn.
 *
 * `loader` được gọi trong effect và effect chỉ chạy lại khi `nonce` đổi (mount + mỗi lần
 * `reload()`), nên một arrow inline mới ở mỗi lần render không kích hoạt request mới. Cờ
 * `loading` được bật trong chính `reload()` (event handler) chứ không phải trong thân effect, và
 * `data` cũ được giữ lại khi tải lại lỗi để nội dung đang hiển thị không biến mất.
 *
 * `error` đọc là **"lần thử gần nhất đã hỏng"**, KHÔNG phải "đang hỏng ngay lúc này". Nó chỉ đổi
 * khi có kết quả mới về, nên nó sống qua `reload()` — xem lý do tại chính `reload()` bên dưới.
 * Kèm theo đó: nơi tiêu thụ muốn phân biệt *tải lần đầu* với *tải lại sau lỗi* thì đọc cặp
 * `loading && error`, chứ đừng suy từ `data === null` (cả hai ca đều `null`).
 */
export function useAsyncResource<T>(loader: () => Promise<T>): AsyncResource<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({
    data: null,
    loading: true,
    error: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    loader()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState((prev) => ({ data: prev.data, loading: false, error: true }));
      });
    return () => {
      alive = false;
    };
    // `loader` cố tình không nằm trong deps: nó là arrow mới mỗi render nhưng luôn gọi cùng một
    // endpoint cho mỗi instance hook. Effect chạy lại theo `nonce` và luôn dùng closure mới nhất.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const reload = useCallback(() => {
    // `error` cố ý KHÔNG bị hạ về `false` ở đây. Hạ sớm làm ca "tải lại sau lỗi" trùng khít ca
    // "tải lần đầu" — cả hai đều `{data: null, loading: true, error: false}` — và người tiêu thụ
    // mất mọi cách phân biệt. Hậu quả đo được ở #445 cơ chế ②: cổng `todayFailed` của
    // `DashboardPage` tắt ngay lúc bấm, cả `<section>` unmount, nên **nút "Thử lại" vừa bấm biến
    // mất** và chỉ quay lại khi request hỏng LẦN NỮA.
    //
    // Effect luôn ghi đè `error` bằng kết quả thật (`false` khi resolve, `true` khi reject), nên
    // giữ giá trị cũ ở đây chỉ kéo dài nó đúng khoảng request đang bay, không tạo trạng thái kẹt.
    setState((prev) => ({ data: prev.data, loading: true, error: prev.error }));
    setNonce((n) => n + 1);
  }, []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
