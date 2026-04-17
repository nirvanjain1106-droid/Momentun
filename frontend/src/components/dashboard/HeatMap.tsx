import { useState } from 'react';
import { Flame, Smile } from 'lucide-react';

interface HeatmapEntry {
  date: string;
  completion_rate: number | null;
  intensity: 'none' | 'low' | 'medium' | 'high';
  tasks_completed: number;
  tasks_scheduled: number;
  mood_score: number | null;
}

interface HeatmapResponse {
  entries: HeatmapEntry[];
  total_days: number;
  active_days: number;
  average_completion_rate: number | null;
}

interface HeatmapProps {
  data: HeatmapResponse;
}

export function Heatmap({ data }: HeatmapProps) {
  const [showMood, setShowMood] = useState(false);
  const [showStreak, setShowStreak] = useState(true);

  // Group by weeks
  const weeks: HeatmapEntry[][] = [];
  let currentWeek: HeatmapEntry[] = [];

  const sorted = [...data.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sorted.forEach((entry, i) => {
    currentWeek.push(entry);
    if (new Date(entry.date).getDay() === 0 || i === sorted.length - 1) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });

  const getIntensityClass = (intensity: string) => {
    switch (intensity) {
      case 'high': return 'bg-accent-primary shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.4)]';
      case 'medium': return 'bg-accent-primary/60';
      case 'low': return 'bg-accent-primary/30';
      case 'none': return 'bg-bg-secondary/50';
      default: return 'bg-bg-secondary/50';
    }
  };

  const getMoodColor = (mood: number | null) => {
    if (mood === null) return null;
    if (mood >= 4) return 'bg-success shadow-[0_0_4px_rgba(var(--success-rgb),0.6)]';
    if (mood === 3) return 'bg-accent-tertiary shadow-[0_0_4px_rgba(var(--accent-tertiary-rgb),0.6)]';
    return 'bg-error shadow-[0_0_4px_rgba(var(--error-rgb),0.6)]';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-text-primary tracking-tight">Consistency Matrix</h3>
          <p className="text-sm text-text-tertiary">Visualizing your study velocity and emotional state.</p>
        </div>
        <div className="flex gap-3 bg-bg-secondary/30 p-1.5 rounded-2xl border border-border-subtle backdrop-blur-sm">
          <button 
            onClick={() => setShowStreak(!showStreak)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${showStreak ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20' : 'text-text-muted hover:text-text-secondary'}`}
          >
            <Flame size={14} /> Streak
          </button>
          <button 
            onClick={() => setShowMood(!showMood)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${showMood ? 'bg-accent-tertiary text-white shadow-lg shadow-accent-tertiary/20' : 'text-text-muted hover:text-text-secondary'}`}
          >
            <Smile size={14} /> Mood
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto pb-4 custom-scrollbar rounded-xl">
        <div className="flex gap-2 min-w-max p-1">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-2">
              {week.map((day, dIdx) => {
                const isStreakActive = showStreak && (day.completion_rate || 0) >= 0.7;
                const moodClass = showMood ? getMoodColor(day.mood_score) : null;
                const dateStr = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                return (
                  <div 
                    key={dIdx} 
                    className={`group w-5 h-5 rounded-[4px] cursor-help transition-all duration-300 hover:scale-125 hover:z-10 relative flex items-center justify-center ${getIntensityClass(day.intensity)}`}
                  >
                    {isStreakActive && (
                      <div className="absolute inset-[-2px] rounded-[6px] border border-accent-secondary/50 animate-pulse shadow-[0_0_10px_rgba(var(--accent-secondary-rgb),0.3)] pointer-events-none" />
                    )}
                    
                    {moodClass && (
                      <div className={`w-2 h-2 rounded-full ${moodClass} transition-all duration-500`} />
                    )}

                    {/* Rich Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-bg-surface border border-border-color rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 pointer-events-none">
                      <p className="text-[10px] font-bold text-text-muted mb-1">{dateStr}</p>
                      <p className="text-xs font-bold text-text-primary">{day.tasks_completed}/{day.tasks_scheduled} Tasks</p>
                      {day.mood_score && (
                        <p className="text-[10px] text-text-secondary flex items-center gap-1 mt-1">
                          Mood: <span className={day.mood_score >= 4 ? 'text-success' : day.mood_score === 3 ? 'text-accent-tertiary' : 'text-error'}>{day.mood_score}/5</span>
                        </p>
                      )}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-bg-surface" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 pt-2 border-t border-border-subtle/50 mt-4">
        <div className="flex items-center gap-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
          Intensity
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-bg-secondary/50" />
            <div className="w-3 h-3 rounded-sm bg-accent-primary/30" />
            <div className="w-3 h-3 rounded-sm bg-accent-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-accent-primary" />
          </div>
        </div>
        
        {showMood && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
            Mood
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-full bg-error" />
              <div className="w-3 h-3 rounded-full bg-accent-tertiary" />
              <div className="w-3 h-3 rounded-full bg-success" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
