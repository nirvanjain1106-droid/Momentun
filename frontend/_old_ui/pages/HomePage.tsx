import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  Clock3,
  Flame,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useAuthStore } from '../stores/authStore';
import { useScheduleStore } from '../stores/scheduleStore';
import { insightsApi, type StreakData, type WeeklyInsightsData } from '../api/insightsApi';
import { userApi, type UserProfile } from '../api/userApi';
import type { DayScore, TaskDetail } from '../api/scheduleApi';
import { settleRequests } from '../lib/settleRequests';

const formatMinutes = (minutes: number) => {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${remainder.toString().padStart(2, '0')}m`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatTimeRange = (task: TaskDetail | null) => {
  if (!task?.scheduled_start || !task?.scheduled_end) return 'Flexible slot';

  const start = new Date(task.scheduled_start).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const end = new Date(task.scheduled_end).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${start} - ${end}`;
};

const getTaskAccent = (task: TaskDetail | null) => {
  if (!task) return 'from-sky-400/80 to-violet-400/80';
  if (task.energy_required === 'high') return 'from-violet-400/90 to-sky-400/80';
  if (task.task_type.toLowerCase().includes('health') || task.task_type.toLowerCase().includes('fitness')) {
    return 'from-emerald-400/80 to-cyan-400/70';
  }
  return 'from-amber-300/90 to-rose-300/80';
};

function ProgressRing({ percent }: { percent: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * percent) / 100;

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 140 140" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="14"
          fill="none"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="url(#momentumProgress)"
          strokeLinecap="round"
          strokeWidth="14"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="momentumProgress" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="55%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#fda4af" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-semibold tracking-tight text-white">{Math.round(percent)}%</span>
        <span className="mt-1 text-xs uppercase tracking-[0.24em] text-white/55">Completed</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="glass-panel min-w-0 rounded-[26px] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-white/10 p-2.5 text-white/90">{icon}</div>
        <span className="text-[11px] uppercase tracking-[0.22em] text-white/45">{label}</span>
      </div>
      <div className="mt-5">
        <p className="text-2xl font-semibold text-white">{value}</p>
        <p className="mt-1 text-sm text-white/58">{hint}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { userName, setUserName } = useAuthStore();
  const { schedule, parkedTasks, fetchSchedule } = useScheduleStore();
  const [dayScore, setDayScore] = useState<DayScore | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyInsightsData | null>(null);
  const [isScreenLoading, setIsScreenLoading] = useState(true);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsScreenLoading(true);
      const { data, errors } = await settleRequests({
        schedule: async () => {
          await fetchSchedule();
          return true;
        },
        dayScore: () => userApi.getDayScore(),
        streak: () => insightsApi.getStreak(),
        weekly: () => insightsApi.getWeekly(),
        profile: () => userApi.getProfile(),
      });

      if (ignore) return;

      setDayScore((data.dayScore as DayScore | undefined) ?? null);
      setStreak((data.streak as StreakData | undefined) ?? null);
      setWeekly((data.weekly as WeeklyInsightsData | undefined) ?? null);
      const profile = (data.profile as UserProfile | undefined) ?? null;
      if (profile?.name) {
        setUserName(profile.name);
      }
      setPartialErrors(Object.values(errors).filter((item): item is string => Boolean(item)));
      setIsScreenLoading(false);
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [fetchSchedule, setUserName]);

  const tasks = schedule?.tasks ?? [];
  const completedCount = tasks.filter((task) => task.task_status === 'completed').length;
  const completionPercent = tasks.length ? (completedCount / tasks.length) * 100 : 0;

  const focusTask = useMemo(() => {
    const now = Date.now();
    const activeTask = tasks.find((task) => {
      if (!task.scheduled_start || !task.scheduled_end) return false;
      const start = new Date(task.scheduled_start).getTime();
      const end = new Date(task.scheduled_end).getTime();
      return start <= now && end >= now && task.task_status !== 'completed';
    });

    if (activeTask) return activeTask;

    return tasks.find((task) => task.task_status !== 'completed') ?? null;
  }, [tasks]);

  const chartData = weekly?.day_breakdown?.map((day) => ({
    name: day.weekday.slice(0, 3),
    rate: Math.round((day.completion_rate ?? 0) * 100),
  })) ?? [];

  const taskHint = tasks.length
    ? `${completedCount} of ${tasks.length} closed`
    : 'Ready for a fresh plan';

  const focusHint = schedule?.total_study_mins
    ? `${formatMinutes(schedule.total_study_mins)} planned`
    : 'No focus blocks yet';

  const energyValue = dayScore?.total_score ?? (weekly?.average_mood ? Math.round(weekly.average_mood * 20) : 72);
  const energyHint = streak ? `${streak.current_streak}-day streak active` : 'Based on today and recent mood';

  const initials = (userName ?? 'Momentum User')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="page-shell-dark min-h-full rounded-[32px] p-4 text-white sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="glass-panel flex items-center justify-between rounded-[28px] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
              {initials}
            </div>
            <div>
              <p className="text-sm text-white/60">{getGreeting()}</p>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                {userName ? `${userName}` : 'Momentum User'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 sm:flex">
              {new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </div>
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80 shadow-[0_12px_24px_rgba(8,15,35,0.22)]"
            >
              <Bell size={18} />
              {parkedTasks.length > 0 && (
                <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-300 px-1 text-[10px] font-semibold text-slate-900">
                  {parkedTasks.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {partialErrors.length > 0 && (
          <div className="glass-panel rounded-[24px] px-4 py-3 text-sm text-white/70">
            Some live data could not be refreshed just now. Momentum is still showing everything that loaded cleanly.
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="glass-panel rounded-[30px] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-white/45">Daily completion</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  {schedule?.strategy_note ? 'Momentum is moving' : 'Start the day strong'}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/62">
                  {schedule?.strategy_note ?? 'Today is ready for focused work, gentle adjustments, and clean follow-through.'}
                </p>
              </div>

              <div className="hidden rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/50 sm:flex">
                {schedule?.schedule_status ?? 'ready'}
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
              <div className="glass-panel flex items-center justify-center rounded-[28px] p-4">
                <ProgressRing percent={completionPercent} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Tasks done"
                  value={`${completedCount}/${tasks.length || 0}`}
                  hint={taskHint}
                  icon={<Target size={18} />}
                />
                <MetricCard
                  label="Focus time"
                  value={formatMinutes(schedule?.total_study_mins ?? 0)}
                  hint={focusHint}
                  icon={<Clock3 size={18} />}
                />
                <MetricCard
                  label="Energy score"
                  value={`${energyValue}`}
                  hint={energyHint}
                  icon={<Zap size={18} />}
                />
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Daily performance</p>
                  <p className="text-xs text-white/45">Completion rate across the current week</p>
                </div>
                {streak && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">
                    <Flame size={14} className="text-amber-300" />
                    {streak.current_streak} day streak
                  </div>
                )}
              </div>

              <div className="mt-4 h-44 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.48)', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#081425',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '18px',
                          color: '#ffffff',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#7dd3fc"
                        strokeWidth={3}
                        dot={{ fill: '#c4b5fd', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, stroke: '#fde68a', strokeWidth: 2, fill: '#f9fafb' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/45">
                    {isScreenLoading ? 'Loading your trend...' : 'Complete a few tasks to unlock weekly momentum.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <Link
              to="/tasks"
              className={`overflow-hidden rounded-[30px] bg-gradient-to-br ${getTaskAccent(focusTask)} p-[1px] shadow-[0_24px_60px_rgba(15,23,42,0.35)]`}
            >
              <div className="flex h-full flex-col rounded-[29px] bg-slate-950/70 px-5 py-5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-white/45">Today&apos;s focus</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      {focusTask?.title ?? 'Clear the runway'}
                    </h2>
                  </div>
                  <div className="rounded-2xl bg-white/12 p-3 text-white">
                    <Sparkles size={18} />
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/68">
                  {focusTask?.description
                    ?? 'Open the planner to lock in your next decisive move.'}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs text-white/72">
                    {formatTimeRange(focusTask)}
                  </span>
                  {focusTask?.priority_label && (
                    <span className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs text-white/72">
                      {focusTask.priority_label} priority
                    </span>
                  )}
                  {focusTask?.energy_required && (
                    <span className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs capitalize text-white/72">
                      {focusTask.energy_required} energy
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between text-sm text-white/70">
                  <span>{parkedTasks.length} task{parkedTasks.length === 1 ? '' : 's'} in Later</span>
                  <span className="inline-flex items-center gap-2 font-medium text-white">
                    Open Tasks
                    <ChevronRight size={16} />
                  </span>
                </div>
              </div>
            </Link>

            <div className="glass-panel rounded-[30px] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-white/45">Momentum notes</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">What the week is saying</h3>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-white">
                  <Flame size={18} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/72">
                  Best day: {weekly?.best_day ?? 'Calibrating'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/72">
                  Completion: {Math.round((weekly?.completion_rate ?? 0) * 100)}%
                </span>
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/72">
                  Recovery mode: {schedule?.recovery_mode ? 'On' : 'Off'}
                </span>
              </div>

              <p className="mt-5 text-sm leading-6 text-white/65">
                {weekly?.coaching_note ?? 'As momentum grows, this card becomes your quick read on focus, consistency, and recovery.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
