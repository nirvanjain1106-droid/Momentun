import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './components/layout/AuthGate';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ChunkLoadError } from './components/ui/ChunkLoadError';
import { PageSkeleton } from './components/ui/PageSkeleton';
import { SyncFailedBanner } from './components/ui/SyncFailedBanner';
import { useUIStore } from './stores/uiStore';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useSSE } from './hooks/useSSE';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RequestPasswordPage from './pages/RequestPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

type LazyImport = () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>;

const lazyWithFallback = (importFn: LazyImport) =>
  lazy(() => importFn().catch(() => ({
    default: () => <ChunkLoadError onRetry={() => window.location.reload()} />,
  })));

const DashboardPage = lazyWithFallback(() => import('./pages/DashboardPage'));
const GoalsPage = lazyWithFallback(() => import('./pages/GoalsPage'));
const GoalDetailPage = lazyWithFallback(() => import('./pages/GoalDetailPage'));
const InsightsPage = lazyWithFallback(() => import('./pages/InsightsPage'));
const SettingsPage = lazyWithFallback(() => import('./pages/SettingsPage'));
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
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-500 text-center">
              Real-time updates paused: Too many tabs open. Close others to reconnect.
            </div>
          )}
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/request-password" element={<RequestPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              
              <Route path="/dashboard" element={
                <ErrorBoundary>
                  <DashboardPage view="dashboard" />
                </ErrorBoundary>
              } />
              <Route path="/schedule" element={
                <ErrorBoundary>
                  <DashboardPage view="schedule" />
                </ErrorBoundary>
              } />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/goals/:goalId" element={<GoalDetailPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/checkin/morning" element={<MorningCheckinPage />} />
              <Route path="/checkin/evening" element={<EveningReviewPage />} />
              
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
