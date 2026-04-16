import { useEffect, useState } from 'react';
import { client } from '../api/client';
import { Flame, Activity, CheckCircle, TrendingUp, LineChart as ChartIcon } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface StreakData {
  current_streak: number;
  best_streak: number;
  streak_protected: boolean;
  last_active_date: string | null;
}

interface DayBreakdown {
  log_date: string;
  weekday: string;
  completion_rate: number;
}

interface Pattern {
  pattern_type: string;
  insight: string;
  fix: string;
}

interface WeeklyData {
  completion_rate: number;
  total_tasks: number;
  completed_tasks: number;
  tasks_completed: number;
  tasks_scheduled: number;
  top_category: string | null;
  best_day: string | null;
  day_breakdown: DayBreakdown[];
  patterns: Pattern[];
  recommendation: string | null;
  trajectory: { projection: string } | null;
  motivational_nudge: string | null;
  coaching_note: string | null;
}

export default function InsightsPage() {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const [streakRes, weeklyRes] = await Promise.all([
          client.get('/insights/streak'),
          client.get('/insights/weekly')
        ]);
        if (!ignore) {
          setStreak(streakRes.data);
          setWeekly(weeklyRes.data);
        }
      } catch {
        if (!ignore) {
          useUIStore.getState().addToast({ type: 'error', message: 'Failed to load insights.' });
        }
      } finally {
         if (!ignore) setIsLoading(false);
      }
    }
    loadData();
    return () => { ignore = true; };
  }, []);

  if (isLoading) return <div className="p-8 animate-pulse text-text-muted text-center h-full flex items-center justify-center">Crunching your data...</div>;

  const barData = weekly?.day_breakdown?.map((day: DayBreakdown) => ({
    name: day.weekday.substring(0, 3),
    rate: day.completion_rate || 0,
    fullDate: day.log_date
  })) || [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Insights</h1>
        <p className="text-text-secondary mt-1">Harnessing pattern recognition to optimize your trajectory.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Streak Hero Card */}
        <section className="lg:col-span-2 surface-card p-8 overflow-hidden relative border-none bg-gradient-to-br from-bg-surface to-bg-primary">
          <div className="absolute -right-8 -top-8 opacity-10">
             <Flame size={200} className="text-accent-primary" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-accent-primary mb-2 flex items-center gap-2">
            <Flame size={14} /> Performance Momentum
          </h2>
          <div className="flex items-baseline gap-3">
             <span className="text-7xl font-black text-text-primary tabular-nums tracking-tighter">{streak?.current_streak || 0}</span>
             <span className="text-xl font-medium text-text-secondary">Day Streak</span>
          </div>
          <div className="mt-8 flex gap-6 text-sm">
             <div className="bg-bg-elevated/50 backdrop-blur-sm px-4 py-2 rounded-xl text-text-muted border border-border-subtle">
               Peak Velocity: <span className="text-text-primary font-bold">{streak?.best_streak || 0} days</span>
             </div>
             {streak?.streak_protected && (
               <div className="bg-accent-primary/10 text-accent-primary border border-accent-primary/20 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold">
                 <CheckCircle size={16} /> Shield Active
               </div>
             )}
          </div>
        </section>

        {/* Weekly Mini Summary */}
        <section className="surface-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-tertiary mb-4">Weekly Snapshot</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Completion Rate</span>
                <span className="text-xl font-bold text-text-primary">{Math.round(weekly?.completion_rate || 0)}%</span>
              </div>
              <div className="w-full bg-bg-secondary h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-accent-primary h-full transition-all duration-1000" 
                  style={{ width: `${weekly?.completion_rate || 0}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-text-tertiary">Tasks</p>
                  <p className="text-lg font-bold text-text-primary italic">{weekly?.tasks_completed}/{weekly?.tasks_scheduled}</p>
                </div>
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-text-tertiary">Best Day</p>
                  <p className="text-lg font-bold text-text-primary capitalize">{weekly?.best_day?.substring(0, 3) || '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Completion Chart */}
      <section className="surface-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <TrendingUp size={20} className="text-accent-primary" /> Velocity Distribution
            </h3>
            <p className="text-xs text-text-tertiary italic mt-0.5">Completion percentages across the current week.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-success/10 text-success rounded-full">
            <TrendingUp size={14} /> +12% from last week
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ 
                  backgroundColor: 'var(--bg-surface)', 
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                }}
                itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
              />
              <Bar dataKey="rate" radius={[6, 6, 0, 0]} barSize={40}>
                {barData.map((entry: { rate: number; name: string; fullDate: string }, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.rate >= 80 ? 'var(--accent-primary)' : entry.rate >= 50 ? 'rgba(var(--accent-primary-rgb), 0.6)' : 'rgba(var(--accent-primary-rgb), 0.3)'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Trajectory & Patterns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="surface-card p-6">
           <h3 className="font-bold text-text-primary flex items-center gap-2 mb-6">
             <Activity size={18} className="text-accent-primary" /> Behavioral Patterns
           </h3>
           <div className="space-y-4">
              {weekly?.patterns && weekly.patterns.length > 0 ? (
                weekly.patterns.map((p: Pattern, i: number) => (
                  <div key={i} className="p-4 bg-bg-secondary/50 rounded-2xl border-l-4 border-accent-primary">
                    <p className="text-sm font-bold text-text-primary capitalize">{p.pattern_type.replace('_', ' ')}</p>
                    <p className="text-xs text-text-secondary mt-1">{p.insight}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-accent-primary bg-accent-primary/10 w-fit px-2 py-0.5 rounded-full uppercase tracking-tighter">
                      Recommendation: {p.fix}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-text-tertiary italic text-sm">
                  Insufficient data to map patterns. Keep logging your days!
                </div>
              )}
           </div>
        </section>

        <section className="surface-card p-6">
           <h3 className="font-bold text-text-primary flex items-center gap-2 mb-6">
             <ChartIcon size={18} className="text-success" /> Goal Trajectory
           </h3>
           <div className="bg-bg-secondary/50 p-6 rounded-2xl border border-border-subtle">
             <div className="flex items-center gap-4 mb-4">
               <div className="p-3 bg-success/10 rounded-xl text-success">
                 <TrendingUp size={24} />
               </div>
               <div>
                 <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">Projection</p>
                 <p className="text-lg font-bold text-text-primary italic">"{weekly?.trajectory?.projection || 'Calibrating trajectory...'}"</p>
               </div>
             </div>
             <p className="text-sm text-text-secondary leading-relaxed border-t border-border-subtle pt-4 mt-4 italic truncate">
                {weekly?.motivational_nudge || "Keep momentum high to hit your next milestone."}
             </p>
           </div>
        </section>
      </div>

      {/* Synthesis Note */}
      <section className="bg-accent-primary p-1 rounded-3xl">
        <div className="bg-bg-primary p-8 rounded-[1.4rem]">
           <h3 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-4">
              <MessageSquare size={22} className="text-accent-primary" /> Weekly Synthesis
           </h3>
           <p className="text-lg text-text-primary font-medium italic leading-relaxed">
             "{weekly?.coaching_note || "Your energy distribution is stabilizing. Focus on protecting your morning deep work blocks to prevent afternoon task decay."}"
           </p>
        </div>
      </section>
    </div>
  );
}

// Helper icons missing from imports
function MessageSquare({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
