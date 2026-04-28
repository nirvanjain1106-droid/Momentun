import { useEffect, useMemo, useState } from 'react';
import { Activity, Flame, Sparkles, TrendingUp, Zap } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Heatmap } from '../components/dashboard/HeatMap';
import { insightsApi, type HeatmapData, type StreakData, type WeeklyInsightsData } from '../api/insightsApi';
import { settleRequests } from '../lib/settleRequests';

function InsightChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/72">
      <span className="text-white/42">{label}: </span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

export default function InsightsPage() {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyInsightsData | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      const { data, errors } = await settleRequests({
        streak: () => insightsApi.getStreak(),
        weekly: () => insightsApi.getWeekly(),
        heatmap: () => insightsApi.getHeatmap(),
      });

      if (ignore) return;

      setStreak((data.streak as StreakData | undefined) ?? null);
      setWeekly((data.weekly as WeeklyInsightsData | undefined) ?? null);
      setHeatmapData((data.heatmap as HeatmapData | undefined) ?? null);
      setPartialErrors(Object.values(errors).filter((item): item is string => Boolean(item)));
      setIsLoading(false);
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  const chartData = useMemo(() => {
    return weekly?.day_breakdown?.map((day) => ({
      label: day.weekday.slice(0, 3),
      rate: Math.round((day.completion_rate ?? 0) * 100),
      mood: day.mood_score ?? 0,
    })) ?? [];
  }, [weekly?.day_breakdown]);

  return (
    <div className="page-shell-dark min-h-full rounded-[32px] p-4 text-white sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="glass-panel rounded-[28px] px-5 py-5">
          <p className="text-sm uppercase tracking-[0.24em] text-white/45">Insights</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Energy, consistency, and trajectory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Momentum looks across your recent behavior so you can see the streaks worth protecting and the patterns worth redesigning.
          </p>
        </header>

        {partialErrors.length > 0 && (
          <div className="glass-panel rounded-[24px] px-4 py-3 text-sm text-white/70">
            A few analytics endpoints did not respond, so this screen is showing the freshest partial data available.
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="glass-panel rounded-[28px] p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-white/10 p-3 text-amber-300">
                <Flame size={18} />
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/42">Streak</span>
            </div>
            <p className="mt-5 text-4xl font-semibold text-white">{streak?.current_streak ?? 0}</p>
            <p className="mt-2 text-sm text-white/58">Best run: {streak?.best_streak ?? 0} days</p>
          </div>

          <div className="glass-panel rounded-[28px] p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-white/10 p-3 text-sky-300">
                <TrendingUp size={18} />
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/42">Completion</span>
            </div>
            <p className="mt-5 text-4xl font-semibold text-white">
              {Math.round((weekly?.completion_rate ?? 0) * 100)}%
            </p>
            <p className="mt-2 text-sm text-white/58">
              {weekly?.tasks_completed ?? 0}/{weekly?.tasks_scheduled ?? 0} tasks this week
            </p>
          </div>

          <div className="glass-panel rounded-[28px] p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-white/10 p-3 text-violet-300">
                <Zap size={18} />
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/42">Mood</span>
            </div>
            <p className="mt-5 text-4xl font-semibold text-white">
              {weekly?.average_mood ? weekly.average_mood.toFixed(1) : '—'}
            </p>
            <p className="mt-2 text-sm text-white/58">Average energy across logged days</p>
          </div>
        </section>

        <section className="glass-panel rounded-[30px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Weekly performance curve</h2>
              <p className="text-sm text-white/55">Completion rate by day, with enough room to spot the wobble.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <InsightChip label="Best day" value={weekly?.best_day ?? 'Calibrating'} />
              <InsightChip label="Toughest day" value={weekly?.toughest_day ?? 'Calibrating'} />
              <InsightChip label="Focus window" value="10:00 AM - 12:00 PM" />
            </div>
          </div>

          <div className="mt-5 h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.48)', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 12 }}
                    domain={[0, 100]}
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
                    activeDot={{ r: 6, stroke: '#fde68a', strokeWidth: 2, fill: '#f8fafc' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/45">
                {isLoading ? 'Loading your weekly curve...' : 'Complete a few days to unlock the weekly curve.'}
              </div>
            )}
          </div>
        </section>

        {heatmapData && (
          <section className="glass-panel rounded-[30px] p-5">
            <Heatmap data={heatmapData} />
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-2">
          <div className="glass-panel rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-sky-300">
                <Activity size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Behavior patterns</h2>
                <p className="text-sm text-white/55">The signals most worth acting on this week.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {weekly?.patterns?.length ? weekly.patterns.slice(0, 3).map((pattern) => (
                <div key={pattern.pattern_type} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold capitalize text-white">
                      {pattern.pattern_type.replace(/_/g, ' ')}
                    </p>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                      {pattern.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/62">{pattern.insight}</p>
                  <p className="mt-2 text-xs leading-5 text-cyan-200/80">{pattern.fix}</p>
                </div>
              )) : (
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                  {isLoading ? 'Loading behavior patterns...' : 'Keep logging your days to surface repeatable patterns.'}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-violet-300">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Trajectory</h2>
                <p className="text-sm text-white/55">A quick read on whether the current pace is sustainable.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-white/42">Projection</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {weekly?.trajectory?.projection ?? 'Momentum is still calibrating your long-range pace.'}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {weekly?.motivational_nudge ?? 'Stay steady. A calm week with reliable follow-through is often stronger than a dramatic sprint.'}
              </p>
              {weekly?.coaching_note && (
                <div className="mt-4 rounded-[20px] border border-white/8 bg-slate-950/25 px-4 py-3 text-sm text-white/64">
                  {weekly.coaching_note}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
