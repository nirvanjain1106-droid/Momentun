import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthGate } from './components/layout/AuthGate';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ChunkLoadError } from './components/ui/ChunkLoadError';
import { PageSkeleton } from './components/ui/PageSkeleton';
import { SyncFailedBanner } from './components/ui/SyncFailedBanner';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useSSE } from './hooks/useSSE';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RequestPasswordPage from './pages/RequestPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useUIStore } from './stores/uiStore';

type LazyImport = () => Promise<{ default: ComponentType<Record<string, unknown>> }>;

const lazyWithFallback = (importFn: LazyImport) =>
  lazy(() => importFn().catch(() => ({
    default: () => <ChunkLoadError onRetry={() => window.location.reload()} />,
  })));

const HomePage = lazyWithFallback(() => import('./pages/HomePage'));
const TasksPage = lazyWithFallback(() => import('./pages/TasksPage'));
const GoalsPage = lazyWithFallback(() => import('./pages/GoalsPage'));
const GoalDetailPage = lazyWithFallback(() => import('./pages/GoalDetailPage'));
const InsightsPage = lazyWithFallback(() => import('./pages/InsightsPage'));
const ProfilePage = lazyWithFallback(() => import('./pages/SettingsPage'));
const OnboardingPage = lazyWithFallback(() => import('./pages/OnboardingPage'));
const MorningCheckinPage = lazyWithFallback(() => import('./pages/MorningCheckinPage'));
const EveningReviewPage = lazyWithFallback(() => import('./pages/EveningReviewPage'));

function App() {
  const { setOffline } = useUIStore();

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  useOfflineSync();
  const { status: sseStatus } = useSSE();

  return (
    <BrowserRouter>
      <AuthGate>
        <AppShell>
          <SyncFailedBanner />
          {sseStatus === 'evicted' && (
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-500">
              Real-time updates paused: too many tabs are open. Close others to reconnect.
            </div>
          )}

          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/request-password" element={<RequestPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route path="/home" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
              <Route path="/tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/goals/:goalId" element={<GoalDetailPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/checkin/morning" element={<MorningCheckinPage />} />
              <Route path="/checkin/evening" element={<EveningReviewPage />} />

              <Route path="/dashboard" element={<Navigate to="/home" replace />} />
              <Route path="/schedule" element={<Navigate to="/tasks" replace />} />
              <Route path="/settings" element={<Navigate to="/profile" replace />} />
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
