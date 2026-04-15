import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './components/layout/AuthGate';
import { AppShell } from './components/layout/AppShell';
import { ChunkLoadError } from './components/ui/ChunkLoadError';
import { PageSkeleton } from './components/ui/PageSkeleton';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RequestPasswordPage from './pages/RequestPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

type LazyImport = () => Promise<{ default: React.ComponentType<any> }>;

const lazyWithFallback = (importFn: LazyImport) =>
  lazy(() => importFn().catch(() => ({
    default: () => <ChunkLoadError onRetry={() => window.location.reload()} />,
  })));

const DashboardPage = lazyWithFallback(() => import('./pages/DashboardPage'));
// We will add more lazy pages as we build them

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AppShell>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/request-password" element={<RequestPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              
              <Route path="/dashboard" element={<DashboardPage />} />
              
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
