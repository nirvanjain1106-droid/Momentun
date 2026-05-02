import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Pause, Play, Target, TrendingUp } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { client } from '../api/client';
import type { Goal } from '../stores/goalStore';
import { useUIStore } from '../stores/uiStore';

export default function GoalDetailPage() {
  const { goalId } = useParams();
  const { addToast } = useUIStore();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    motivation: '',
    consequence: '',
  });

  useEffect(() => {
    let ignore = false;

    async function loadGoal() {
      setIsLoading(true);
      try {
        const response = await client.get(`/goals/${goalId}`);
        if (ignore) return;
        setGoal(response.data);
        setEditForm({
          title: response.data.title ?? '',
          description: response.data.description ?? '',
          motivation: response.data.motivation ?? '',
          consequence: response.data.consequence ?? '',
        });
      } catch {
        addToast({ type: 'error', message: 'Failed to load goal details.' });
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    if (goalId) {
      void loadGoal();
    }

    return () => {
      ignore = true;
    };
  }, [addToast, goalId]);

  const handlePause = async () => {
    if (!goal) return;
    try {
      const response = await client.post(`/goals/${goal.id}/pause`);
      setGoal({ ...goal, ...response.data, status: 'paused' });
      addToast({ type: 'success', message: 'Goal paused.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to pause goal';
      addToast({ type: 'error', message });
    }
  };

  const handleResume = async () => {
    if (!goal) return;
    try {
      const response = await client.post(`/goals/${goal.id}/resume`);
      setGoal({ ...goal, ...response.data, status: 'active' });
      addToast({ type: 'success', message: 'Goal resumed.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to resume goal';
      addToast({ type: 'error', message });
    }
  };

  const handleAchieve = async () => {
    if (!goal) return;
    try {
      await client.patch(`/goals/${goal.id}/status`, { status: 'achieved' });
      setGoal({ ...goal, status: 'achieved' });
      addToast({ type: 'success', message: 'Goal marked achieved.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update goal status';
      addToast({ type: 'error', message });
    }
  };

  const handleEditSave = async () => {
    if (!goal) return;
    try {
      const response = await client.put(`/goals/${goal.id}`, editForm);
      setGoal({ ...goal, ...response.data });
      setIsEditing(false);
      addToast({ type: 'success', message: 'Goal updated.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update goal';
      addToast({ type: 'error', message });
    }
  };

  if (isLoading) {
    return (
      <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
        <div className="mx-auto flex min-h-[360px] max-w-5xl items-center justify-center text-sm text-slate-400">
          Loading goal details...
        </div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
        <div className="mx-auto flex min-h-[360px] max-w-5xl items-center justify-center text-sm text-slate-500">
          Goal not found.
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <Link to="/goals" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
          <ArrowLeft size={16} />
          Back to goals
        </Link>

        <header className="light-surface rounded-[30px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white">
                  Rank #{goal.priority_rank}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {goal.status}
                </span>
              </div>

              {isEditing ? (
                <input
                  value={editForm.title}
                  onChange={(event) => setEditForm((state) => ({ ...state, title: event.target.value }))}
                  className="mt-4 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-3xl font-semibold text-slate-950 outline-none"
                />
              ) : (
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{goal.title}</h1>
              )}

              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={(event) => setEditForm((state) => ({ ...state, description: event.target.value }))}
                  className="mt-3 min-h-[96px] w-full rounded-[24px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600 outline-none"
                />
              ) : (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                  {goal.description || 'A clear target with just enough emotional context to keep the effort honest.'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsEditing((value) => !value)}
                className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => void handleEditSave()}
                  className="rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white"
                >
                  Save changes
                </button>
              ) : (
                <>
                  {goal.status === 'active' && (
                    <button type="button" onClick={handlePause} className="rounded-full border border-slate-200 bg-white p-3 text-slate-700">
                      <Pause size={16} />
                    </button>
                  )}
                  {goal.status === 'paused' && (
                    <button type="button" onClick={handleResume} className="rounded-full border border-slate-200 bg-white p-3 text-slate-700">
                      <Play size={16} />
                    </button>
                  )}
                  {goal.status === 'active' && (
                    <button type="button" onClick={handleAchieve} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white">
                      <Check size={16} />
                      Achieve
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="light-surface flex min-h-[260px] flex-col items-center justify-center rounded-[30px] p-5">
            <div className="rounded-[26px] bg-[linear-gradient(135deg,rgba(196,181,253,0.28),rgba(186,230,253,0.2),rgba(253,230,138,0.16))] p-[1px]">
              <div className="flex h-36 w-36 items-center justify-center rounded-[25px] bg-white/88">
                <div className="text-center">
                  <Target size={30} className="mx-auto text-violet-500" />
                  <p className="mt-3 text-4xl font-semibold text-slate-950">{goal.progress_percentage}%</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Progress</p>
                </div>
              </div>
            </div>
          </div>

          <div className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <TrendingUp size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Trajectory</h2>
                <p className="text-sm text-slate-500">Detail analytics will deepen here as the goal progresses.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
              This goal detail surface stays intentionally simple in this phase: edit the core narrative, pause or resume cleanly, and keep the progress visible without hiding it behind dense analytics.
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="light-surface rounded-[30px] p-5">
            <h2 className="text-xl font-semibold text-slate-950">Motivation</h2>
            {isEditing ? (
              <textarea
                value={editForm.motivation}
                onChange={(event) => setEditForm((state) => ({ ...state, motivation: event.target.value }))}
                className="mt-4 min-h-[140px] w-full rounded-[24px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600 outline-none"
              />
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">
                {goal.motivation || 'No explicit motivation saved for this goal yet.'}
              </p>
            )}
          </div>

          <div className="light-surface rounded-[30px] p-5">
            <h2 className="text-xl font-semibold text-slate-950">Stakes</h2>
            {isEditing ? (
              <textarea
                value={editForm.consequence}
                onChange={(event) => setEditForm((state) => ({ ...state, consequence: event.target.value }))}
                className="mt-4 min-h-[140px] w-full rounded-[24px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600 outline-none"
              />
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">
                {goal.consequence || 'No consequence has been written down for this goal yet.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
