import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Flag, Sparkles, X } from 'lucide-react';
import { useGoalStore } from '../../stores/goalStore';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useUIStore } from '../../stores/uiStore';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitMode = 'save' | 'park' | 'reschedule';

const durationOptions = [15, 30, 45, 60, 90];
const energyOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
] as const;
const priorityOptions = [
  { label: 'Normal', value: 2 },
  { label: 'Bonus', value: 3 },
];

export function QuickAddModal({ isOpen, onClose }: QuickAddModalProps) {
  const { goals, fetchGoals } = useGoalStore();
  const { createAdHocTask, quickAddTask, rescheduleTask } = useScheduleStore();
  const { addToast } = useUIStore();

  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [energy, setEnergy] = useState<'low' | 'medium' | 'high'>('medium');
  const [priority, setPriority] = useState<2 | 3>(2);
  const [goalId, setGoalId] = useState('');
  const [targetDate, setTargetDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState<SubmitMode | null>(null);

  const activeGoals = useMemo(
    () => goals.filter((goal) => goal.status === 'active'),
    [goals],
  );

  useEffect(() => {
    if (isOpen) {
      void fetchGoals('active');
    }
  }, [fetchGoals, isOpen]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setTitle('');
    setDuration(30);
    setEnergy('medium');
    setPriority(2);
    setGoalId('');
    setTargetDate(tomorrow);
    onClose();
  };

  const handleSubmit = async (mode: SubmitMode) => {
    if (title.trim().length < 2) {
      addToast({ type: 'warning', message: 'Add a short, clear task title first.' });
      return;
    }

    setIsSubmitting(mode);

    try {
      if (mode === 'save') {
        await createAdHocTask({
          title: title.trim(),
          duration_mins: duration,
          energy_required: energy,
          priority,
          goal_id: goalId || null,
          description: null,
          task_type: 'general',
        });
        addToast({ type: 'success', message: 'Task added to today.' });
      }

      if (mode === 'park') {
        await quickAddTask({
          title: title.trim(),
          duration_mins: duration,
          goal_id: goalId || null,
        });
        addToast({ type: 'success', message: 'Task added to Later.' });
      }

      if (mode === 'reschedule') {
        const parkedTask = await quickAddTask({
          title: title.trim(),
          duration_mins: duration,
          goal_id: goalId || null,
        });
        await rescheduleTask(parkedTask.id, targetDate);
        addToast({ type: 'success', message: `Task moved to ${targetDate}.` });
      }

      resetAndClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not save that task.';
      addToast({ type: 'error', message });
    } finally {
      setIsSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-md sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-[34px] border border-white/55 bg-[rgba(255,255,255,0.92)] shadow-[0_34px_90px_rgba(15,23,42,0.28)] backdrop-blur-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Quick add</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Capture the next task</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Save it into today, park it for later, or send it straight to a future date.
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            aria-label="Close Quick Add"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-[28px] bg-[linear-gradient(135deg,rgba(196,181,253,0.35),rgba(186,230,253,0.3),rgba(253,230,138,0.24))] p-[1px]">
            <div className="rounded-[27px] bg-white/80 px-4 py-4">
              <label className="text-sm font-medium text-slate-600">Task title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Deep work session, call back mentor, strength workout..."
                className="mt-3 w-full border-0 bg-transparent text-lg font-medium text-slate-950 outline-none placeholder:text-slate-300"
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="light-surface rounded-[28px] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Clock3 size={16} className="text-violet-500" />
                Duration
              </div>
              <div className="flex flex-wrap gap-2">
                {durationOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDuration(option)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      duration === option
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {option}m
                  </button>
                ))}
              </div>
            </div>

            <div className="light-surface rounded-[28px] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Sparkles size={16} className="text-sky-500" />
                Energy
              </div>
              <div className="flex flex-wrap gap-2">
                {energyOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEnergy(option.value)}
                    className={`rounded-full px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      energy === option.value
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="light-surface rounded-[28px] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Flag size={16} className="text-amber-500" />
                Priority
              </div>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriority(option.value as 2 | 3)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      priority === option.value
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="light-surface rounded-[28px] p-4">
              <label className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <CalendarDays size={16} className="text-emerald-500" />
                Reschedule date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none"
              />
            </div>
          </div>

          <div className="light-surface rounded-[28px] p-4">
            <label className="text-sm font-medium text-slate-700">Goal link</label>
            <select
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none"
            >
              <option value="">No linked goal</option>
              {activeGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <footer className="grid grid-cols-1 gap-3 border-t border-slate-200 px-5 py-5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleSubmit('save')}
            disabled={isSubmitting !== null}
            className="rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSubmitting === 'save' ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit('park')}
            disabled={isSubmitting !== null}
            className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {isSubmitting === 'park' ? 'Parking...' : 'Park'}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit('reschedule')}
            disabled={isSubmitting !== null}
            className="rounded-full bg-[linear-gradient(135deg,#c4b5fd,#93c5fd)] px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-50"
          >
            {isSubmitting === 'reschedule' ? 'Rescheduling...' : 'Reschedule'}
          </button>
        </footer>
      </div>
    </div>
  );
}
