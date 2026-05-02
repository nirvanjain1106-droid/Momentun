import { useEffect, useMemo, useState } from 'react';
import type { TaskDetail } from '../../api/scheduleApi';
import { TaskCard } from './TaskCard';

export function Timeline({ tasks }: { tasks: TaskDetail[] }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextUpdate = () => {
      const now = Date.now();
      let nextEventTimestamp = Infinity;

      tasks.forEach((task) => {
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
        const delay = Math.max(0, nextEventTimestamp - now) + 100;
        timeoutId = setTimeout(() => {
          setTick((value) => value + 1);
          scheduleNextUpdate();
        }, delay);
      }
    };

    scheduleNextUpdate();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTick((value) => value + 1);
        if (timeoutId) clearTimeout(timeoutId);
        scheduleNextUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tasks]);

  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.scheduled_start && !b.scheduled_start) return a.sequence_order - b.sequence_order;
      if (!a.scheduled_start) return 1;
      if (!b.scheduled_start) return -1;
      return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
    });
  }, [tasks]);

  if (orderedTasks.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <h3 className="text-lg font-semibold text-slate-900">Nothing is scheduled yet</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Add a task or generate today&apos;s plan to populate the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4 pb-3">
      <div className="absolute bottom-0 left-[4.8rem] top-0 w-px bg-[linear-gradient(180deg,rgba(196,181,253,0.2),rgba(148,163,184,0.35),rgba(196,181,253,0.08))]" />
      {orderedTasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
