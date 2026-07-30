import { Outlet } from 'react-router-dom';

/**
 * Layout cho các trang xác thực (Login, Register).
 * Content được căn giữa màn hình với hiệu ứng nền trang trí.
 * Sử dụng Outlet để render page con qua React Router nested routes.
 */
export function AuthLayout() {
  return (
    <div className="bg-background relative flex min-h-screen w-full items-center justify-center p-4 md:p-8">
      <div className="relative z-10 flex w-full justify-center">
        <Outlet />
      </div>
    </div>
  );
}
