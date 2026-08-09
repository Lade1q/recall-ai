import { Outlet } from 'react-router-dom';

/**
 * Layout cho phiên vấn đáp đang diễn ra (`/interview/:sessionId`).
 *
 * Mockup `screen-interview.html` (`.ex-shell`) là một màn chiếm trọn khung nhìn, cố ý KHÔNG
 * có sidebar / nav của app: đang làm bài kiểm tra thì mọi đường điều hướng khác đều là thứ
 * gây mất tập trung, và lối ra duy nhất là nút "Tạm dừng & thoát" của chính màn hình đó.
 * Vì vậy route này nằm ngoài `MainLayout` (nhưng vẫn trong `ProtectedRoute`) và layout ở đây
 * chỉ khoá đúng một viewport rồi nhường toàn bộ không gian cho trang con.
 *
 * `min-h-[560px]` là `min-height` của `.ex-shell` trong mockup: dưới ngưỡng đó (cửa sổ thấp,
 * devtools cắm cạnh dưới) ba hàng bị bóp tới mức khu trả lời không còn bấm được. Giữ ngưỡng
 * rồi để trang cuộn là lối thoát duy nhất đúng — nếu `overflow-hidden` thì không cuộn tới
 * được nút "Gửi".
 */
export function InterviewLayout() {
  return (
    <div className="bg-background text-foreground h-dvh min-h-[560px]">
      <Outlet />
    </div>
  );
}
