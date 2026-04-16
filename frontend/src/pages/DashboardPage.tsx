import React, { useEffect, useState } from 'react';
import { useScheduleStore } from '../stores/scheduleStore';
import { useExponentialBackoff } from '../hooks/useExponentialBackoff';

// Component Stubs (We will implement these later)
const Timeline = React.lazy(() => import('../components/dashboard/Timeline').then((m) => ({ default: m.Timeline })));
const ParkingLotPanel = React.lazy(() => import('../components/dashboard/ParkingLotPanel').then((m) => ({ default: m.ParkingLotPanel })));

export default function DashboardPage() {
  const { fetchSchedule, schedule, isLoading, error } = useScheduleStore();
  const [initialLoad, setInitialLoad] = useState(true);

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
      } catch (err) {
        throw err; // Send to ErrorBoundary if completely fatal and no IDB
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

  return (
    <div className="flex flex-col md:flex-row h-full w-full gap-4 p-4 overflow-hidden bg-gray-50 dark:bg-gray-900">
      
      {/* Main Timeline Column */}
      <div className="flex-[2] flex flex-col min-w-0 h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <header className="p-4 border-b border-gray-200 dark:border-gray-700 font-semibold text-lg text-gray-800 dark:text-gray-100 flex justify-between items-center">
          <h2>Today's Plan</h2>
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
      <aside className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border-l border-gray-200 dark:border-gray-700">
        <React.Suspense fallback={<div className="p-4">Loading Parking Lot...</div>}>
           <ParkingLotPanel />
        </React.Suspense>
      </aside>

    </div>
  );
}
