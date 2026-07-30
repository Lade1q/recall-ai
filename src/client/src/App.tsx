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
import FocusPage from '@/pages/focus/FocusPage';
import InterviewPage from '@/pages/verify/InterviewPage';

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
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/interview" element={<InterviewPage />} />
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
