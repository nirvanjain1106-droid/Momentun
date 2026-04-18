import { client } from './client';
import { v4 as uuidv4 } from 'uuid';

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_mins: number;
  energy_required: string;
  priority: number;
  priority_label: string;
  is_mvp_task: boolean;
  sequence_order: number;
  task_status: string;
  previous_status: string | null;
  slot_reasons: string[] | null;
  goal_id: string | null;
  goal_rank_snapshot: number | null;
}

export interface DayScore {
  date: string;
  total_score: number;
  completion_score: number;
  timing_score: number;
  core_tasks_score: number;
  streak_bonus: number;
  breakdown: Record<string, unknown>;
}

export interface StreakInfo {
  current_streak: number;
  best_streak: number;
  streak_protected: boolean;
  last_active_date: string | null;
}

export interface TaskMutationResponse {
  task: TaskDetail;
  day_score: DayScore;
  streak: StreakInfo;
}

export interface ScheduleResponse {
  id: string;
  user_id: string;
  schedule_date: string;
  generation_status: string;
  tasks: TaskDetail[];
  unassigned_parked_tasks: TaskDetail[];
}

interface RequestConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const withIdempotency = (config: RequestConfig = {}) => ({
  ...config,
  headers: {
    ...config.headers,
    'Idempotency-Key': uuidv4(),
  },
});

export const scheduleApi = {
  getTodaySchedule: async (dateStr?: string, signal?: AbortSignal): Promise<ScheduleResponse> => {
    const params = dateStr ? { date: dateStr } : undefined;
    const response = await client.get('/schedule/generate', { params, signal }); // or whatever endpoint is
    return response.data;
  },

  completeTask: async (
    taskId: string,
    data: { actual_duration_mins?: number; quality_rating?: number },
    signal?: AbortSignal
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/complete`,
      data,
      withIdempotency({ signal })
    );
    return response.data;
  },

  parkTask: async (
    taskId: string,
    reason: string | null,
    signal?: AbortSignal
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/park`,
      { reason },
      withIdempotency({ signal })
    );
    return response.data;
  },

  undoTask: async (
    taskId: string,
    signal?: AbortSignal
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/undo`,
      {},
      withIdempotency({ signal })
    );
    return response.data;
  },
  
  createAdHocTask: async (
    data: { 
      title: string; 
      duration_mins: number; 
      energy_required: string; 
      priority?: number;
      goal_id?: string | null;
    },
    signal?: AbortSignal
  ): Promise<ScheduleResponse> => {
    const response = await client.post(
      '/tasks/adhoc',
      data,
      withIdempotency({ signal })
    );
    return response.data;
  },
};
