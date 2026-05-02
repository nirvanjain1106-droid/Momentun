import React, { useEffect, useState } from 'react';
import { useScheduleStore } from '../stores/scheduleStore';
import { useExponentialBackoff } from '../hooks/useExponentialBackoff';
import { useUIStore } from '../stores/uiStore';
import { Archive } from 'lucide-react';

// Component Stubs (We will implement these later)
const Timeline = React.lazy(() => import('../components/dashboard/Timeline').then((m) => ({ default: m.Timeline })));
const ParkingLotPanel = React.lazy(() => import('../components/dashboard/ParkingLotPanel').then((m) => ({ default: m.ParkingLotPanel })));

interface DashboardPageProps {
  view?: 'dashboard' | 'schedule';
}

export default function DashboardPage({ view = 'dashboard' }: DashboardPageProps) {
  const { fetchSchedule, schedule, isLoading, error } = useScheduleStore();
  const { activeModal, openModal } = useUIStore();
  const [initialLoad, setInitialLoad] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const isParkingLotOpen = activeModal?.name === 'parking-lot';

  // Initial Data Fetching via allSettled (for potential other async things like /me/day-score although 
  // the plan says store does this). In scheduleStore, fetchSchedule loads the schedule.
  useEffect(() => {
    async function loadData() {
      // If we had multiple endpoints on load (like day-score, insights), we would Promise.allSettled here.
      // Currently, we just fetch the schedule.
      try {
        await Promise.allSettled([
          fetchSchedule()
          // Optionally add insights / day-score fetch here if needed later
        ]);
      } finally {
        setInitialLoad(false);
      }
    }
    loadData();
  }, [fetchSchedule]);

  // If the schedule fails and has no IDB offline data, the store throws or sets error.
  if (error && !schedule && !initialLoad) {
    // If we have an error and absolutely no schedule data (not even offline), 
    // we throw to trigger the boundary explicitly as dictated by architecture.
    throw new Error(error);
  }

  // Polling loop for stale schedule detection or daily resets using backoff.
  useExponentialBackoff(async () => {
    // We only poll if we have successfully loaded once.
    if (!initialLoad) {
      await fetchSchedule();
    }
  }, !initialLoad);

  // Resize listener for mobile check
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Check on initial render
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Body scroll lock logic preserving scroll position
  useEffect(() => {
    if (!isParkingLotOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isParkingLotOpen]);

  return (
    <div className="flex flex-col md:flex-row h-full w-full gap-4 p-4 overflow-hidden bg-gray-50 dark:bg-gray-900">
      
      {/* Main Timeline Column */}
      <div className="flex-[2] flex flex-col min-w-0 h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <header className="p-4 border-b border-gray-200 dark:border-gray-700 font-semibold text-lg text-gray-800 dark:text-gray-100 flex justify-between items-center">
          <h2>{view === 'schedule' ? 'Schedule' : "Today's Plan"}</h2>
          {isLoading && !initialLoad && (
            <span className="text-xs text-brand-500 animate-pulse">Syncing...</span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {initialLoad ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-500">Loading Schedule...</span>
            </div>
          ) : schedule ? (
            <React.Suspense fallback={<div>Loading Timeline...</div>}>
              <Timeline tasks={schedule.tasks || []} />
            </React.Suspense>
          ) : (
            <div className="flex items-center justify-center h-full text-red-500">
              Failed to load schedule.
            </div>
          )}
        </main>
      </div>

      {/* Parking Lot / Insights Column */}
      {view === 'dashboard' && !isMobile && (
        <aside className="hidden md:flex flex-1 flex-col min-w-0 h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border-l border-gray-200 dark:border-gray-700">
          <React.Suspense fallback={<div className="p-4">Loading Parking Lot...</div>}>
            <ParkingLotPanel />
          </React.Suspense>
        </aside>
      )}

      {/* Mobile FAB */}
      {view === 'dashboard' && isMobile && (
        <button
          type="button"
          aria-label="Open Parking Lot"
          aria-expanded={isParkingLotOpen}
          aria-controls="parking-sheet"
          aria-haspopup="dialog"
          onClick={() => openModal({ name: 'parking-lot', data: null })}
          className="flex items-center justify-center w-14 h-14 bg-accent-primary text-white rounded-full shadow-lg hover:bg-accent-primary-hover transition-colors"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--nav-h) + var(--sab) + 16px)',
            right: '16px',
            zIndex: 'var(--z-fab)',
          }}
        >
          <Archive size={24} />
        </button>
      )}

    </div>
  );
}
