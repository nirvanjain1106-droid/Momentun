import { addDays, format, startOfWeek } from 'date-fns';
import { useEffect, useMemo } from 'react';
import { CalendarDays, Clock3, Plus, Sparkles, TimerReset } from 'lucide-react';
import { Timeline } from '../components/dashboard/Timeline';
import { useScheduleStore } from '../stores/scheduleStore';
import { useUIStore } from '../stores/uiStore';

const formatRange = (start?: string | null, end?: string | null) => {
  if (!start || !end) return 'Flexible timing';

  const startLabel = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endLabel = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${startLabel} - ${endLabel}`;
};

export default function TasksPage() {
  const {
    schedule,
    parkedTasks,
    isLoading,
    error,
    fetchSchedule,
    fetchParkedTasks,
  } = useScheduleStore();
  const { openModal } = useUIStore();

  useEffect(() => {
    void Promise.allSettled([fetchSchedule(), fetchParkedTasks()]);
  }, [fetchParkedTasks, fetchSchedule]);

  const tasks = schedule?.tasks ?? [];
  const today = useMemo(() => new Date(schedule?.schedule_date ?? Date.now()), [schedule?.schedule_date]);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const currentTask = useMemo(() => {
    const now = Date.now();
    return tasks.find((task) => {
      if (!task.scheduled_start || !task.scheduled_end || task.task_status === 'completed') return false;
      const start = new Date(task.scheduled_start).getTime();
      const end = new Date(task.scheduled_end).getTime();
      return start <= now && end >= now;
    }) ?? tasks.find((task) => task.task_status !== 'completed') ?? null;
  }, [tasks]);

  return (
    <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="light-surface rounded-[28px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Today</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {format(today, 'EEEE, MMMM d')}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                A calm, realistic planner for the day. Keep momentum by finishing what matters and parking what does not fit.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openModal({ name: 'quick-add', data: null })}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_35px_rgba(15,23,42,0.12)]"
              >
                <Plus size={16} />
                Add Task
              </button>
              <button
                type="button"
                onClick={() => openModal({ name: 'parking-lot', data: null })}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                <TimerReset size={16} />
                Later ({parkedTasks.length})
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, index) => {
              const date = addDays(weekStart, index);
              const isSelected = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

              return (
                <div
                  key={date.toISOString()}
                  className={`rounded-[22px] px-2 py-3 text-center transition-all ${
                    isSelected
                      ? 'bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.14)]'
                      : 'bg-white/75 text-slate-500'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.18em]">{format(date, 'EEE')}</p>
                  <p className="mt-2 text-lg font-semibold">{format(date, 'd')}</p>
                </div>
              );
            })}
          </div>
        </header>

        {currentTask && (
          <div className="light-surface overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,rgba(196,181,253,0.35),rgba(186,230,253,0.35),rgba(253,230,138,0.28))] p-[1px]">
            <div className="rounded-[27px] bg-white/88 px-5 py-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-violet-500">Current focus</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {currentTask.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {currentTask.description ?? 'Stay with this block until it lands cleanly, then keep the planner moving.'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/85 p-3 text-violet-500 shadow-[0_16px_34px_rgba(124,58,237,0.14)]">
                  <Sparkles size={18} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-medium text-white">
                  <Clock3 size={14} />
                  {formatRange(currentTask.scheduled_start, currentTask.scheduled_end)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                  <CalendarDays size={14} />
                  {currentTask.priority_label} priority
                </span>
              </div>
            </div>
          </div>
        )}

        <section className="light-surface rounded-[30px] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Daily planner</h2>
              <p className="text-sm text-slate-500">
                {schedule?.strategy_note ?? 'Task cards are color-coded so the day stays easy to scan.'}
              </p>
            </div>
            {schedule?.day_type && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {schedule.day_type}
              </span>
            )}
          </div>

          {error && !schedule && (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-2">
            {isLoading && !schedule ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-400">
                Loading your planner...
              </div>
            ) : (
              <Timeline tasks={tasks} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
