import { useEffect } from 'react';
import { useGoalStore } from '../stores/goalStore';
import { ChevronRight, Plus, Pause, Play, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

export default function GoalsPage() {
  const { goals, isLoading, fetchGoals, pauseGoal, resumeGoal } = useGoalStore();
  const { openModal } = useUIStore();

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const activeGoals = goals.filter(g => g.status === 'active').sort((a, b) => a.priority_rank - b.priority_rank);
  const pausedGoals = goals.filter(g => g.status === 'paused');
  const historyGoals = goals.filter(g => g.status === 'achieved' || g.status === 'abandoned');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Goals Portfolio</h1>
          <p className="text-text-secondary mt-1">Manage your active priorities and track your history.</p>
        </div>
        <button 
          disabled={activeGoals.length >= 3}
          onClick={() => openModal({ name: 'new-goal', data: null })}
          className="flex items-center gap-2 bg-accent-primary hover:brightness-110 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Plus size={18} />
          <span>New Goal</span>
        </button>
      </header>

      {/* Active Goals section */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-text-primary">Active Goals ({activeGoals.length}/3)</h2>
        {isLoading && activeGoals.length === 0 ? (
          <div className="animate-pulse space-y-4">
             <div className="h-24 bg-bg-surface rounded-lg"></div>
             <div className="h-24 bg-bg-surface rounded-lg"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {activeGoals.map((goal, index) => (
              <div key={goal.id} className="surface-card p-5 flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                    ${index === 0 ? 'bg-rank-1/20 text-rank-1' : index === 1 ? 'bg-rank-2/20 text-rank-2' : 'bg-rank-3/20 text-rank-3'}
                  `}>
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-text-primary">{goal.title}</h3>
                    <p className="text-sm text-text-secondary capitalize">{goal.type} • {goal.progress_percentage}% completed</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => pauseGoal(goal.id)} className="p-2 text-text-muted hover:text-warning transition-colors" title="Pause target">
                    <Pause size={18} />
                  </button>
                  <Link to={`/goals/${goal.id}`} className="p-2 text-text-muted hover:text-primary-400 transition-colors">
                    <ChevronRight size={20} />
                  </Link>
                </div>
              </div>
            ))}
            {activeGoals.length === 0 && (
              <div className="text-center p-8 border border-dashed border-border-subtle rounded-lg text-text-muted">
                No active goals. Add one to get started!
              </div>
            )}
          </div>
        )}
      </section>

      {/* Paused Goals */}
      {pausedGoals.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-text-primary">Paused</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pausedGoals.map(goal => (
              <div key={goal.id} className="bg-bg-surface border border-border-subtle p-4 rounded-lg flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">{goal.title}</h3>
                  <p className="text-xs text-text-muted mt-1">Was rank #{goal.pre_pause_rank}</p>
                </div>
                <button 
                  onClick={() => resumeGoal(goal.id)}
                  className="p-2 bg-bg-elevated hover:bg-bg-hover text-success rounded transition-colors" title="Resume"
                >
                  <Play size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      {historyGoals.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-text-primary">History</h2>
          <div className="space-y-3">
             {historyGoals.map(goal => (
               <div key={goal.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-surface border border-border-subtle opacity-70">
                 <div className="flex items-center gap-3">
                   {goal.status === 'achieved' ? <CheckCircle className="text-success" size={18} /> : <XCircle className="text-danger" size={18} />}
                   <span className={goal.status === 'abandoned' ? 'line-through text-text-muted' : 'text-text-primary'}>{goal.title}</span>
                 </div>
                 <span className="text-xs text-text-muted capitalize">{goal.status}</span>
               </div>
             ))}
          </div>
        </section>
      )}
    </div>
  );
}
