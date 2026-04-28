import { client } from './client';

export interface StreakData {
  current_streak: number;
  best_streak: number;
  streak_protected: boolean;
  last_active_date: string | null;
}

export interface WeeklyDayBreakdown {
  log_date: string;
  weekday: string;
  tasks_scheduled: number;
  tasks_completed: number;
  completion_rate: number | null;
  mood_score: number | null;
}

export interface PatternData {
  pattern_type: string;
  severity: string;
  insight: string;
  fix: string;
  supporting_data?: Record<string, unknown> | null;
}

export interface TrajectoryData {
  goal_id: string;
  goal_title: string;
  goal_type: string;
  status: string;
  projection: string;
  days_remaining: number;
  elapsed_days: number;
  completed_study_mins: number;
  expected_study_mins_by_now: number;
  projected_total_mins_by_deadline: number;
  target_total_mins_by_deadline: number;
  current_pace_mins_per_day: number;
  required_pace_mins_per_day: number;
  extra_mins_per_day_needed: number;
  subject_breakdown: Array<Record<string, unknown>>;
  motivational_nudge: string;
}

export interface WeeklyInsightsData {
  week_start_date: string;
  week_end_date: string;
  tasks_scheduled: number;
  tasks_completed: number;
  completion_rate: number;
  average_mood: number | null;
  best_day: string | null;
  toughest_day: string | null;
  coaching_note: string;
  motivational_nudge: string;
  patterns: PatternData[];
  day_breakdown: WeeklyDayBreakdown[];
  trajectory: TrajectoryData | null;
}

export interface HeatmapEntry {
  date: string;
  completion_rate: number | null;
  intensity: 'none' | 'low' | 'medium' | 'high';
  tasks_completed: number;
  tasks_scheduled: number;
  mood_score: number | null;
}

export interface HeatmapData {
  entries: HeatmapEntry[];
  total_days: number;
  active_days: number;
  average_completion_rate: number | null;
}

export const insightsApi = {
  getStreak: async (): Promise<StreakData> => {
    const response = await client.get('/insights/streak');
    return response.data as StreakData;
  },

  getWeekly: async (): Promise<WeeklyInsightsData> => {
    const response = await client.get('/insights/weekly');
    return response.data as WeeklyInsightsData;
  },

  getHeatmap: async (): Promise<HeatmapData> => {
    const response = await client.get('/insights/heatmap');
    return response.data as HeatmapData;
  },
};
