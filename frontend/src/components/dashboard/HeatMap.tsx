import type { HeatmapData } from '../../api/insightsApi';

export type HeatmapResponse = HeatmapData;

const intensityStyles: Record<string, string> = {
  none: 'bg-white/5',
  low: 'bg-sky-300/35',
  medium: 'bg-violet-300/45',
  high: 'bg-fuchsia-300/70',
};

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Heatmap({ data }: { data: HeatmapData }) {
  const entries = [...data.entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weeks: typeof entries[] = [];

  let currentWeek: typeof entries = [];
  entries.forEach((entry) => {
    currentWeek.push(entry);
    const weekday = new Date(entry.date).getDay();
    if (weekday === 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Focus heatmap</h3>
          <p className="text-sm text-white/55">Consistency across the last {data.total_days} days.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          {data.active_days} active days
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          <div className="flex flex-col gap-2 pt-7">
            {dayLabels.map((label) => (
              <div key={label} className="h-4 text-[11px] text-white/35">
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => (
            <div key={`week-${weekIndex}`} className="flex flex-col gap-2">
              <div className="h-5 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
                {weekIndex + 1}
              </div>
              {Array.from({ length: 7 }).map((_, dayIndex) => {
                const entry = week[dayIndex];
                const title = entry
                  ? `${entry.date}: ${entry.tasks_completed}/${entry.tasks_scheduled} tasks`
                  : 'No data';

                return (
                  <div
                    key={`cell-${weekIndex}-${dayIndex}`}
                    title={title}
                    className={`h-4 w-4 rounded-[5px] ${entry ? intensityStyles[entry.intensity] : 'bg-white/5'} transition-transform hover:scale-110`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-white/45">
        <span>Low</span>
        <div className="h-3 w-3 rounded-[4px] bg-white/5" />
        <div className="h-3 w-3 rounded-[4px] bg-sky-300/35" />
        <div className="h-3 w-3 rounded-[4px] bg-violet-300/45" />
        <div className="h-3 w-3 rounded-[4px] bg-fuchsia-300/70" />
        <span>High</span>
      </div>
    </div>
  );
}
