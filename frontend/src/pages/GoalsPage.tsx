import { Pause, Play, Plus, Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGoalStore } from '../stores/goalStore';
import { useUIStore } from '../stores/uiStore';

function GoalProgress({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(6, percent)}%` }} />
    </div>
  );
}

export default function GoalsPage() {
  const { goals, isLoading, fetchGoals, pauseGoal, resumeGoal } = useGoalStore();
  const { openModal } = useUIStore();

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  const activeGoals = goals.filter((goal) => goal.status === 'active').sort((a, b) => a.priority_rank - b.priority_rank);
  const pausedGoals = goals.filter((goal) => goal.status === 'paused');
  const completedGoals = goals.filter((goal) => goal.status === 'achieved' || goal.status === 'abandoned');

  const gradientBars = [
    'bg-[linear-gradient(90deg,#fb7185,#f97316)]',
    'bg-[linear-gradient(90deg,#4ade80,#22d3ee)]',
    'bg-[linear-gradient(90deg,#60a5fa,#a78bfa)]',
  ];

  return (
    <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="light-surface rounded-[28px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Goals</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Active direction, clearly ranked</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Keep your important work visible, pause cleanly when life shifts, and preserve enough whitespace that the next decision feels obvious.
              </p>
            </div>

            <button
              type="button"
              disabled={activeGoals.length >= 3}
              onClick={() => openModal({ name: 'new-goal', data: null })}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_35px_rgba(15,23,42,0.12)] disabled:opacity-50"
            >
              <Plus size={16} />
              New Goal
            </button>
          </div>
        </header>

        <section className="light-surface rounded-[30px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Active</h2>
              <p className="text-sm text-slate-500">{activeGoals.length}/3 in motion</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Highest focus first
            </div>
          </div>

          {isLoading && activeGoals.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
              <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
            </div>
          ) : activeGoals.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <h3 className="text-lg font-semibold text-slate-950">No active goals yet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Create a goal to start shaping the planner around something meaningful.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activeGoals.map((goal, index) => (
                <div key={goal.id} className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,rgba(196,181,253,0.28),rgba(186,230,253,0.22),rgba(253,230,138,0.16))] p-[1px]">
                  <div className="flex h-full flex-col rounded-[29px] bg-white/88 p-5 backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white">
                            #{goal.priority_rank}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                            {goal.type}
                          </span>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold text-slate-950">{goal.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {goal.description || 'A concrete target with clear emotional stakes and a visible finish line.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => pauseGoal(goal.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
                        title="Pause goal"
                      >
                        <Pause size={16} />
                      </button>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Progress</span>
                        <span className="font-medium text-slate-900">{goal.progress_percentage}%</span>
                      </div>
                      <GoalProgress percent={goal.progress_percentage} color={gradientBars[index % gradientBars.length]} />
                    </div>

                    <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
                      <span>Target {new Date(goal.target_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      <Link to={`/goals/${goal.id}`} className="font-medium text-slate-900">
                        View details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="light-surface rounded-[30px] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Paused</h2>
                <p className="text-sm text-slate-500">Goals you intend to return to</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {pausedGoals.length}
              </span>
            </div>

            <div className="space-y-3">
              {pausedGoals.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No paused goals right now.
                </div>
              ) : pausedGoals.map((goal) => (
                <div key={goal.id} className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                  <div>
                    <p className="font-medium text-slate-950">{goal.title}</p>
                    <p className="mt-1 text-sm text-slate-500">Was rank #{goal.pre_pause_rank ?? goal.priority_rank}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resumeGoal(goal.id)}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-medium text-white"
                  >
                    <Play size={14} />
                    Resume
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="light-surface rounded-[30px] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Completed</h2>
                <p className="text-sm text-slate-500">Proof that momentum compounds</p>
              </div>
              <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
                <Trophy size={16} />
              </div>
            </div>

            <div className="space-y-3">
              {completedGoals.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Finished goals will appear here with their final status.
                </div>
              ) : completedGoals.map((goal) => (
                <div key={goal.id} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950">{goal.title}</p>
                      <p className="mt-1 text-sm capitalize text-slate-500">{goal.status}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                      {goal.progress_percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
