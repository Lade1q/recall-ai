import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/context/AuthContext';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';

// Layouts
import { AuthLayout } from '@/components/shared/layouts/AuthLayout';
import { InterviewLayout } from '@/components/shared/layouts/InterviewLayout';
import { MainLayout } from '@/components/shared/layouts/MainLayout';

// Pages — Auth
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

// Pages — Public
import LandingPage from '@/pages/landing/LandingPage';

// Pages — App
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PlansPage from '@/pages/planning/PlansPage';
import CreatePlanPage from '@/pages/planning/CreatePlanPage';
import PlanDetailPage from '@/pages/planning/PlanDetailPage';
import PlanReviewQueuePage from '@/pages/planning/PlanReviewQueuePage';
import GraphIndexPage from '@/pages/planning/GraphIndexPage';
import FocusPage from '@/pages/focus/FocusPage';
import InterviewPage from '@/pages/verify/InterviewPage';
import InterviewSessionPage from '@/pages/verify/InterviewSessionPage';
import HistoryPage from '@/pages/history/HistoryPage';
import ProfilePage from '@/pages/profile/ProfilePage';

// Fallback
import NotFoundPage from '@/pages/NotFoundPage';

/**
 * Route công khai `/` (issue #388) — không bọc `ProtectedRoute`/layout nào, độc
 * lập như `NotFoundPage`. Trong lúc chưa xác định phiên đăng nhập, dùng lại
 * đúng loading UI của `ProtectedRoute` để không nháy landing rồi mới redirect.
 */
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          {/* Root — landing công khai, redirect /dashboard nếu đã đăng nhập */}
          <Route path="/" element={<RootRoute />} />

          {/* Auth routes — wrapped by AuthLayout (Outlet) */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/plan/new" element={<CreatePlanPage />} />
              <Route path="/plan/:id" element={<PlanDetailPage />} />
              {/* Bước kiểm chứng đồ thị AI đề xuất (SP-01) là route riêng chứ không phải
                  một giá trị của `?mode`: sidebar chỉ đọc `location.pathname` để biết trang
                  đang mở thuộc mục nav nào, nên "trang này LÀ trang nào" phải nằm trong
                  đường dẫn (Issue #274). */}
              <Route path="/plan/:id/verify" element={<PlanDetailPage routeMode="verify" />} />
              {/* SP-07/SP-08 (#225) — màn con của "Kế hoạch ôn tập", xem sửa hàng đợi ôn của
                  một plan. Không có mục sidebar riêng (xem MainLayout.tsx isPlanCreationStep). */}
              <Route path="/plan/:id/review-queue" element={<PlanReviewQueuePage />} />
              <Route path="/graph" element={<GraphIndexPage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            {/* Phiên vấn đáp là màn toàn khung nhìn, không có sidebar/nav của app
                (mockup `.ex-shell`) — vẫn nằm trong ProtectedRoute như mọi route sau
                đăng nhập, chỉ đổi layout. */}
            <Route element={<InterviewLayout />}>
              <Route path="/interview/:sessionId" element={<InterviewSessionPage />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
