import type { TaskDetail } from '../../api/scheduleApi';
import { useScheduleStore } from '../../stores/scheduleStore';
import { Check, Pause } from 'lucide-react';

export function TaskCard({ task }: { task: TaskDetail }) {
  // Isolate the state selection to strictly prevent globally induced render storms
  const pendingAction = useScheduleStore(
    (state) => state.taskPendingActions[task.id]
  );
  
  const completeTask = useScheduleStore((state) => state.completeTask);
  const parkTask = useScheduleStore((state) => state.parkTask);
  const undoTask = useScheduleStore((state) => state.undoTask);

  const isBusy = !!pendingAction;
  const isCompleting = pendingAction === 'COMPLETING';
  const isParking = pendingAction === 'PARKING';
  const isUndoing = pendingAction === 'UNDOING';

  const now = Date.now();
  const startTime = task.scheduled_start ? new Date(task.scheduled_start).getTime() : null;
  const endTime = task.scheduled_end ? new Date(task.scheduled_end).getTime() : null;
  
  const isPast = endTime ? endTime < now : false;
  const isActive = startTime && endTime ? (startTime <= now && endTime >= now) : false;

  const isCompleted = task.task_status === 'completed';
  const isParked = task.task_status === 'parked';

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const statusStyles = isCompleted
    ? 'bg-green-50 dark:bg-green-900 border-gray-200 dark:border-gray-700'
    : isParked
    ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    : isActive
    ? 'ring-2 ring-brand-500 bg-white dark:bg-gray-800 border-transparent shadow-md'
    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm';

  const getLeftBorderColor = () => {
    if (isCompleted) return 'var(--status-success)';
    if (isParked) return 'var(--text-muted)';
    if (isActive) return 'var(--accent-primary)';
    return 'transparent';
  };

  return (
    <div className={`relative z-10 flex gap-4 transition-all duration-300 ${isBusy ? 'opacity-70 scale-[0.98]' : ''}`}>
      {/* Time column */}
      <div className="w-16 flex-shrink-0 text-right pt-3">
        {task.scheduled_start ? (
          <div className={`text-sm font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : isPast ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
            {formatTime(task.scheduled_start)}
          </div>
        ) : null}
      </div>

      {/* Node on timeline */}
      <div className="absolute left-[3.25rem] top-4 w-3 h-3 rounded-full bg-white border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 z-10 
        shadow-[0_0_0_4px_var(--bg-color)]" 
        style={{ '--bg-color': 'rgb(249 250 251)' } as any} 
      />

      {/* Card Content */}
      <div 
        className={`flex-1 border rounded-lg p-4 flex flex-col gap-2 ${statusStyles} border-l-4`}
        style={{ borderLeftColor: getLeftBorderColor() }}
      >
        <div className="flex justify-between items-start">
          <div>
            <h3 className={`font-semibold flex items-center gap-2 ${isCompleted ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
              {isCompleted && <><Check size={16} className="text-[color:var(--status-success)]" /><span className="sr-only">Completed</span></>}
              {isParked && <><Pause size={16} className="text-[color:var(--text-muted)]" /><span className="sr-only">Parked</span></>}
              {task.title}
            </h3>
            {task.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            {!isCompleted && !isParked && (
              <>
                <button 
                  onClick={() => parkTask(task.id, 'Parked from UI')}
                  disabled={isBusy}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  {isParking ? '...' : 'Park'}
                </button>
                <button 
                  onClick={() => completeTask(task.id)}
                  disabled={isBusy}
                  className="px-2 py-1 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded disabled:opacity-50"
                >
                  {isCompleting ? '...' : 'Done'}
                </button>
              </>
            )}
            {(isCompleted || isParked) && (
              <button 
                onClick={() => undoTask(task.id)}
                disabled={isBusy}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {isUndoing ? '...' : 'Undo'}
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2">
          {task.duration_mins > 0 && <span>⏱ {task.duration_mins}m</span>}
          {task.energy_required && <span className="capitalize">⚡ {task.energy_required}</span>}
          {task.priority_label && <span className="capitalize">🏷️ {task.priority_label}</span>}
          {task.goal_id && <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">Goal</span>}
        </div>
      </div>
    </div>
  );
}
