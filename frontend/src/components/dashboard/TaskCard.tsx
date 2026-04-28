import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  Dumbbell,
  HeartPulse,
  Pause,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { TaskDetail } from '../../api/scheduleApi';
import { useScheduleStore } from '../../stores/scheduleStore';

const categoryThemes = {
  study: {
    shell: 'from-sky-100 via-sky-50 to-white',
    badge: 'bg-sky-100 text-sky-700',
    icon: BookOpen,
  },
  work: {
    shell: 'from-violet-100 via-fuchsia-50 to-white',
    badge: 'bg-violet-100 text-violet-700',
    icon: BriefcaseBusiness,
  },
  health: {
    shell: 'from-emerald-100 via-emerald-50 to-white',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: HeartPulse,
  },
  movement: {
    shell: 'from-amber-100 via-orange-50 to-white',
    badge: 'bg-amber-100 text-amber-700',
    icon: Dumbbell,
  },
  general: {
    shell: 'from-slate-100 via-white to-white',
    badge: 'bg-slate-100 text-slate-700',
    icon: Sparkles,
  },
};

const getTaskTheme = (task: TaskDetail) => {
  const title = task.title.toLowerCase();
  const type = task.task_type.toLowerCase();

  if (type.includes('study') || title.includes('study') || title.includes('review') || title.includes('research')) {
    return categoryThemes.study;
  }
  if (type.includes('health') || title.includes('health') || title.includes('meditation')) {
    return categoryThemes.health;
  }
  if (type.includes('fitness') || type.includes('workout') || title.includes('workout') || title.includes('run')) {
    return categoryThemes.movement;
  }
  if (type.includes('work') || title.includes('sync') || title.includes('deck') || title.includes('call')) {
    return categoryThemes.work;
  }
  return categoryThemes.general;
};

const formatTime = (isoString: string | null) => {
  if (!isoString) return '--';
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export function TaskCard({ task }: { task: TaskDetail }) {
  const pendingAction = useScheduleStore((state) => state.taskPendingActions[task.id]);
  const completeTask = useScheduleStore((state) => state.completeTask);
  const parkTask = useScheduleStore((state) => state.parkTask);
  const undoTask = useScheduleStore((state) => state.undoTask);

  const isBusy = Boolean(pendingAction);
  const isCompleting = pendingAction === 'COMPLETING';
  const isParking = pendingAction === 'PARKING';
  const isUndoing = pendingAction === 'UNDOING';

  const now = Date.now();
  const startTime = task.scheduled_start ? new Date(task.scheduled_start).getTime() : null;
  const endTime = task.scheduled_end ? new Date(task.scheduled_end).getTime() : null;
  const isPast = endTime ? endTime < now : false;
  const isActive = startTime && endTime ? startTime <= now && endTime >= now : false;
  const isCompleted = task.task_status === 'completed';
  const isParked = task.task_status === 'parked';
  const theme = getTaskTheme(task);
  const Icon = theme.icon;

  const cardStateClasses = isCompleted
    ? 'opacity-75'
    : isParked
      ? 'ring-1 ring-slate-200/90'
      : isActive
        ? 'ring-2 ring-violet-300 shadow-[0_24px_55px_rgba(124,58,237,0.18)]'
        : 'shadow-[0_20px_45px_rgba(15,23,42,0.08)]';

  return (
    <div className={`relative flex gap-4 transition-all duration-300 ${isBusy ? 'scale-[0.99] opacity-80' : ''}`}>
      <div className="w-[72px] flex-shrink-0 pt-2 text-right">
        <div className={`text-sm font-semibold ${isActive ? 'text-violet-600' : 'text-slate-500'}`}>
          {formatTime(task.scheduled_start)}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {task.duration_mins > 0 ? `${task.duration_mins}m` : ''}
        </div>
      </div>

      <div className="absolute left-[4.45rem] top-6 z-10 h-3 w-3 rounded-full border-[3px] border-white bg-violet-300 shadow-[0_0_0_6px_rgba(255,255,255,0.9)]" />

      <div className={`flex-1 overflow-hidden rounded-[26px] bg-gradient-to-br ${theme.shell} p-[1px] ${cardStateClasses}`}>
        <div className="rounded-[25px] bg-white/88 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${theme.badge}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-base font-semibold text-slate-950 ${isCompleted ? 'line-through opacity-70' : ''}`}>
                      {task.title}
                    </h3>
                    {isActive && (
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-700">
                        Now
                      </span>
                    )}
                    {isParked && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                        Later
                      </span>
                    )}
                    {isPast && !isCompleted && !isParked && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700">
                        Needs review
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {task.description ?? 'A focused block designed to keep the day moving.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${theme.badge}`}>
                  {task.task_type}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  {task.priority_label}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium capitalize text-slate-600">
                  {task.energy_required} energy
                </span>
                {task.goal_id && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                    Linked goal
                  </span>
                )}
              </div>

              {task.slot_reasons && task.slot_reasons.length > 0 && !isParked && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {task.slot_reasons[0]}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              {!isCompleted && !isParked && (
                <>
                  <button
                    type="button"
                    onClick={() => completeTask(task.id)}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-3.5 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    <Check size={14} />
                    {isCompleting ? 'Saving...' : 'Done'}
                  </button>
                  <button
                    type="button"
                    onClick={() => parkTask(task.id, 'reschedule_later')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    <Pause size={14} />
                    {isParking ? 'Parking...' : 'Park'}
                  </button>
                </>
              )}

              {(isCompleted || isParked) && (
                <button
                  type="button"
                  onClick={() => undoTask(task.id)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {isUndoing ? 'Undoing...' : 'Undo'}
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>{formatTime(task.scheduled_start)} - {formatTime(task.scheduled_end)}</span>
            {task.is_mvp_task && <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium uppercase tracking-[0.18em] text-rose-700">MVP</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
