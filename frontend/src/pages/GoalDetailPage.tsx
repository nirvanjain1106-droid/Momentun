import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { client } from '../api/client';
import { ArrowLeft, Target, TrendingUp, Pause, Check } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import type { Goal } from '../stores/goalStore';
// Recharts will be added in Sprint 4 
// import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function GoalDetailPage() {
  const { goalId } = useParams();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const goalRes = await client.get(`/goals/${goalId}`);
        setGoal(goalRes.data);
      } catch (err) {
        useUIStore.getState().addToast({ type: 'error', message: 'Failed to load goal details' });
      } finally {
        setIsLoading(false);
      }
    }
    if (goalId) loadData();
  }, [goalId]);

  if (isLoading) return <div className="p-8 animate-pulse text-text-muted">Loading goal details...</div>;
  if (!goal) return <div className="p-8 text-center text-text-muted">Goal not found.</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <Link to="/goals" className="inline-flex items-center text-text-muted hover:text-primary-400 mb-2 transition-colors">
        <ArrowLeft size={16} className="mr-1" /> Back to Goals
      </Link>
      
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-primary-500/20 text-primary-400 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              Rank #{goal.priority_rank}
            </span>
            <span className="text-text-muted text-sm capitalize">{goal.status}</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary">{goal.title}</h1>
          <p className="text-text-secondary mt-2 max-w-2xl">{goal.description}</p>
        </div>
        
        <div className="flex gap-2">
           {goal.status === 'active' && (
             <button className="bg-bg-elevated hover:bg-bg-hover text-warning p-2 rounded-lg transition-colors" title="Pause">
               <Pause size={20} />
             </button>
           )}
           {goal.status === 'active' && (
             <button className="bg-success text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-600 transition-colors">
               <Check size={18} /> Achieve
             </button>
           )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 col-span-1 flex flex-col items-center justify-center min-h-[300px]">
          <Target size={48} className="text-primary-500 mb-4" />
          <h3 className="text-5xl font-bold text-text-primary mb-2">{goal.progress_percentage}%</h3>
          <p className="text-text-secondary text-sm uppercase tracking-wide">Completion Progress</p>
        </div>
        
        <div className="glass-panel p-6 col-span-1 lg:col-span-2 min-h-[300px] flex items-center justify-center">
          <div className="text-center text-text-muted w-full">
            <TrendingUp size={32} className="mx-auto mb-3 opacity-50" />
            <p>Trajectory chart implementation planned for Sprint 4</p>
            <p className="text-xs uppercase mt-2 opacity-70">Recharts integration pending</p>
          </div>
        </div>
      </div>
      
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="p-5 bg-bg-surface border border-border-subtle rounded-xl">
            <h3 className="font-semibold text-text-primary mb-2">Motivation</h3>
            <p className="text-text-secondary leading-relaxed">{goal.motivation || "No motivation defined."}</p>
         </div>
         <div className="p-5 bg-bg-surface border border-border-subtle rounded-xl">
            <h3 className="font-semibold text-warning mb-2">Consequence</h3>
            <p className="text-text-secondary leading-relaxed">{goal.consequence || "No consequence defined."}</p>
         </div>
      </section>
    </div>
  );
}
