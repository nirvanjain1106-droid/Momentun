import { useEffect, useState } from 'react';
import type { TaskDetail } from '../../api/scheduleApi';
import { TaskCard } from './TaskCard';

export function Timeline({ tasks }: { tasks: TaskDetail[] }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    // Calculates the next time a task crosses from Future -> Now -> Past
    // For timeline progress and active state calculation.
    const scheduleNextUpdate = () => {
      const now = Date.now();
      let nextEventTimestamp = Infinity;

      tasks.forEach(task => {
        if (task.scheduled_start) {
          const start = new Date(task.scheduled_start).getTime();
          if (start > now && start < nextEventTimestamp) nextEventTimestamp = start;
        }
        if (task.scheduled_end) {
          const end = new Date(task.scheduled_end).getTime();
          if (end > now && end < nextEventTimestamp) nextEventTimestamp = end;
        }
      });

      if (nextEventTimestamp !== Infinity) {
        // Add 100ms safety buffer
        const timeToWait = Math.max(0, nextEventTimestamp - now) + 100;
        timeoutId = setTimeout(() => {
          setTick(t => t + 1);
          scheduleNextUpdate();
        }, timeToWait);
      }
    };

    scheduleNextUpdate();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTick(t => t + 1);
        clearTimeout(timeoutId);
        scheduleNextUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tasks]);

  return (
    <div className="flex flex-col gap-4 relative">
      {/* Visual Timeline Line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 pointer-events-none" />
      
      {tasks.length === 0 ? (
        <div className="text-center text-gray-500 my-8">No tasks scheduled for today.</div>
      ) : (
        tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))
      )}
    </div>
  );
}
