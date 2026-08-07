import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';

// Layouts
import { AuthLayout } from '@/components/shared/layouts/AuthLayout';
import { MainLayout } from '@/components/shared/layouts/MainLayout';

// Pages — Auth
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

// Pages — App
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PlansPage from '@/pages/planning/PlansPage';
import CreatePlanPage from '@/pages/planning/CreatePlanPage';
import PlanDetailPage from '@/pages/planning/PlanDetailPage';
import GraphIndexPage from '@/pages/planning/GraphIndexPage';
import FocusPage from '@/pages/focus/FocusPage';
import InterviewPage from '@/pages/verify/InterviewPage';
import InterviewSessionPage from '@/pages/verify/InterviewSessionPage';
import HistoryPage from '@/pages/history/HistoryPage';
import ProfilePage from '@/pages/profile/ProfilePage';

// Fallback
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <AuthProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

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
              <Route path="/graph" element={<GraphIndexPage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/interview/:sessionId" element={<InterviewSessionPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
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
