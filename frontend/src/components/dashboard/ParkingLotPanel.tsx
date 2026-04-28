import { useEffect } from 'react';
import { TimerReset } from 'lucide-react';
import { useScheduleStore } from '../../stores/scheduleStore';
import { TaskCard } from './TaskCard';

export function ParkingLotPanel() {
  const { parkedTasks, isParkedLoading, fetchParkedTasks } = useScheduleStore();

  useEffect(() => {
    void fetchParkedTasks();
  }, [fetchParkedTasks]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-1 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <TimerReset size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Later</h2>
            <p className="text-sm text-slate-500">Tasks that have been parked or captured for a better moment.</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-4">
        {isParkedLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading Later tasks...</div>
        ) : parkedTasks.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
            <h3 className="text-lg font-semibold text-slate-900">Later is clear</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Nothing is parked right now. That usually means your planner is clean and realistic.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {parkedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
