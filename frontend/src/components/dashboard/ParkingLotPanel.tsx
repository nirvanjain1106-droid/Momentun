import { useScheduleStore } from '../../stores/scheduleStore';
import { TaskCard } from './TaskCard';

export function ParkingLotPanel() {
  const { schedule, isLoading } = useScheduleStore();

  const parkedTasks = schedule?.unassigned_parked_tasks || [];

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="font-semibold text-lg text-gray-800 dark:text-gray-100 mb-1">Parking Lot</h2>
        <p className="text-xs text-gray-500">Tasks shifted off today's immediate timeline.</p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading && !schedule ? (
          <div className="text-gray-500 text-center mt-4">Loading...</div>
        ) : parkedTasks.length === 0 ? (
          <div className="text-center text-gray-500 my-8">No parked tasks. You're fully focused!</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unassigned Tasks</div>
            {parkedTasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
