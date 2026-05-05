import { v4 as uuidv4 } from 'uuid';
import { client } from './client';

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
  day_type: string;
  day_type_reason: string | null;
  strategy_note: string | null;
  tasks: TaskDetail[];
  parked_tasks: TaskDetail[];
  unassigned_parked_tasks: TaskDetail[];
  total_tasks: number;
  total_study_mins: number;
  day_capacity_hrs: number;
  recovery_mode: boolean;
  is_paused: boolean;
  is_stale: boolean;
  schedule_status: string;
  solver_latency_ms: number | null;
}

export interface ParkedTasksResponse {
  tasks: TaskDetail[];
  total: number;
  stale_count: number;
}

export interface QuickAddPayload {
  title: string;
  duration_mins: number;
  goal_id?: string | null;
}

export interface AdHocTaskPayload extends QuickAddPayload {
  energy_required: string;
  priority?: number;
  description?: string | null;
  task_type?: string;
}

interface RequestConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

type RawTask = Partial<TaskDetail> & Record<string, unknown>;

const withIdempotency = (config: RequestConfig = {}) => ({
  ...config,
  headers: {
    ...config.headers,
    'Idempotency-Key': uuidv4(),
  },
});

const getPriorityLabel = (priority: number) => {
  if (priority === 1) return 'Core';
  if (priority === 3) return 'Bonus';
  return 'Normal';
};

const normalizeTask = (raw: RawTask): TaskDetail => ({
  id: String(raw.id ?? crypto.randomUUID()),
  title: String(raw.title ?? 'Untitled task'),
  description: raw.description ? String(raw.description) : null,
  task_type: String(raw.task_type ?? 'general'),
  scheduled_start: raw.scheduled_start ? String(raw.scheduled_start) : null,
  scheduled_end: raw.scheduled_end ? String(raw.scheduled_end) : null,
  duration_mins: Number(raw.duration_mins ?? 0),
  energy_required: String(raw.energy_required ?? 'medium'),
  priority: Number(raw.priority ?? 2),
  priority_label: String(raw.priority_label ?? getPriorityLabel(Number(raw.priority ?? 2))),
  is_mvp_task: Boolean(raw.is_mvp_task),
  sequence_order: Number(raw.sequence_order ?? 0),
  task_status: String(raw.task_status ?? 'active'),
  previous_status: raw.previous_status ? String(raw.previous_status) : null,
  slot_reasons: Array.isArray(raw.slot_reasons)
    ? raw.slot_reasons.map((item) => String(item))
    : null,
  goal_id: raw.goal_id ? String(raw.goal_id) : null,
  goal_rank_snapshot:
    raw.goal_rank_snapshot === null || raw.goal_rank_snapshot === undefined
      ? null
      : Number(raw.goal_rank_snapshot),
});

const normalizeSchedule = (raw: Record<string, unknown>): ScheduleResponse => {
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.map((task) => normalizeTask(task as RawTask)) : [];
  const parkedSource = Array.isArray(raw.unassigned_parked_tasks)
    ? raw.unassigned_parked_tasks
    : Array.isArray(raw.parked_tasks)
      ? raw.parked_tasks
      : [];
  const parkedTasks = parkedSource.map((task) => normalizeTask(task as RawTask));

  return {
    id: String(raw.id ?? ''),
    user_id: String(raw.user_id ?? ''),
    schedule_date: String(raw.schedule_date ?? ''),
    day_type: String(raw.day_type ?? 'standard'),
    day_type_reason: raw.day_type_reason ? String(raw.day_type_reason) : null,
    strategy_note: raw.strategy_note ? String(raw.strategy_note) : null,
    tasks,
    parked_tasks: parkedTasks,
    unassigned_parked_tasks: parkedTasks,
    total_tasks: Number(raw.total_tasks ?? tasks.length),
    total_study_mins: Number(raw.total_study_mins ?? tasks.reduce((sum, task) => sum + task.duration_mins, 0)),
    day_capacity_hrs: Number(raw.day_capacity_hrs ?? 0),
    recovery_mode: Boolean(raw.recovery_mode),
    is_paused: Boolean(raw.is_paused),
    is_stale: Boolean(raw.is_stale),
    schedule_status: String(raw.schedule_status ?? 'ready'),
    solver_latency_ms:
      raw.solver_latency_ms === null || raw.solver_latency_ms === undefined
        ? null
        : Number(raw.solver_latency_ms),
  };
};

const normalizeParkedTasks = (raw: Record<string, unknown>): ParkedTasksResponse => ({
  tasks: Array.isArray(raw.tasks) ? raw.tasks.map((task) => normalizeTask(task as RawTask)) : [],
  total: Number(raw.total ?? 0),
  stale_count: Number(raw.stale_count ?? 0),
});

const isToday = (dateStr?: string) => {
  if (!dateStr) return true;
  return dateStr === new Date().toISOString().split('T')[0];
};

export const scheduleApi = {
  getTodaySchedule: async (dateStr?: string, signal?: AbortSignal): Promise<ScheduleResponse> => {
    if (!isToday(dateStr) && dateStr) {
      const response = await client.post(
        '/schedule/generate',
        { target_date: dateStr, use_llm: false },
        { signal },
      );
      return normalizeSchedule(response.data as Record<string, unknown>);
    }

    const response = await client.get('/schedule/today', { signal });
    return normalizeSchedule(response.data as Record<string, unknown>);
  },

  getParkedTasks: async (stale = false, signal?: AbortSignal): Promise<ParkedTasksResponse> => {
    const response = await client.get('/tasks/parked', { params: stale ? { stale: true } : undefined, signal });
    return normalizeParkedTasks(response.data as Record<string, unknown>);
  },

  completeTask: async (
    taskId: string,
    data: { actual_duration_mins?: number; quality_rating?: number },
    signal?: AbortSignal,
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/complete`,
      data,
      withIdempotency({ signal }),
    );
    return {
      ...response.data,
      task: normalizeTask(response.data.task as RawTask),
    } as TaskMutationResponse;
  },

  parkTask: async (
    taskId: string,
    reason: string | null,
    signal?: AbortSignal,
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/park`,
      { reason },
      withIdempotency({ signal }),
    );
    return {
      ...response.data,
      task: normalizeTask(response.data.task as RawTask),
    } as TaskMutationResponse;
  },

  undoTask: async (
    taskId: string,
    signal?: AbortSignal,
  ): Promise<TaskMutationResponse> => {
    const response = await client.post(
      `/tasks/${taskId}/undo`,
      {},
      withIdempotency({ signal }),
    );
    return {
      ...response.data,
      task: normalizeTask(response.data.task as RawTask),
    } as TaskMutationResponse;
  },

  quickAddTask: async (
    data: QuickAddPayload,
    signal?: AbortSignal,
  ): Promise<TaskDetail> => {
    const response = await client.post(
      '/tasks/quick-add',
      data,
      withIdempotency({ signal }),
    );
    return normalizeTask(response.data as RawTask);
  },

  createAdHocTask: async (
    data: AdHocTaskPayload,
    signal?: AbortSignal,
  ): Promise<TaskDetail> => {
    const response = await client.post(
      '/tasks/ad-hoc',
      data,
      withIdempotency({ signal }),
    );
    return normalizeTask(response.data as RawTask);
  },

  rescheduleTask: async (
    data: { task_id: string; target_date: string },
    signal?: AbortSignal,
  ): Promise<TaskDetail> => {
    const response = await client.post(
      '/tasks/reschedule',
      data,
      withIdempotency({ signal }),
    );
    return normalizeTask(response.data as RawTask);
  },

  /** GET today's tasks as a flat array (wraps getTodaySchedule) */
  getTasks: async (dateStr?: string): Promise<TaskDetail[]> => {
    const schedule = await scheduleApi.getTodaySchedule(dateStr);
    return schedule.tasks;
  },

  /** Get unfinished (non-completed) tasks for a given date */
  getUnfinishedTasks: async (dateStr?: string): Promise<TaskDetail[]> => {
    const schedule = await scheduleApi.getTodaySchedule(dateStr);
    return schedule.tasks.filter(
      (t) => t.task_status !== 'completed' && t.task_status !== 'done',
    );
  },

  /** Aggregated stats for the day (computed from schedule) */
  getTodayStats: async (dateStr?: string) => {
    const schedule = await scheduleApi.getTodaySchedule(dateStr);
    const total = schedule.tasks.length;
    const done = schedule.tasks.filter(
      (t) => t.task_status === 'completed' || t.task_status === 'done',
    ).length;
    return {
      tasksTotal: total,
      tasksDone: done,
      tasksDelta: '',
      energyScore: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  },

  /** POST /checkin/morning — submit morning check-in */
  saveMorningCheckin: async (data: Record<string, unknown>) => {
    // Map numeric energy_level (1-5) to backend enum string
    const energyNum = Number(data.energy_level ?? 3);
    const morningEnergy = energyNum <= 1 ? 'exhausted' : energyNum <= 2 ? 'low' : energyNum <= 4 ? 'medium' : 'high';
    const response = await client.post('/checkin/morning', {
      morning_energy: morningEnergy,
      yesterday_rating: String(data.yesterday_rating || 'decent'),
      surprise_event: String(data.surprise_event || 'none'),
      surprise_note: data.surprise_note ? String(data.surprise_note) : undefined,
    });
    return response.data;
  },

  /** POST /checkin/evening — submit evening review */
  saveEveningReview: async (data: Record<string, unknown>) => {
    const response = await client.post('/checkin/evening', {
      mood_score: Number(data.day_rating ?? 3),
      task_completions: Array.isArray(data.task_completions) ? data.task_completions : [],
      evening_note: String(data.biggest_win || data.reflection || ''),
    });
    return response.data;
  },

  /** Get morning check-in for a date (stub — returns null if not available) */
  getMorningCheckin: async (_dateStr?: string) => {
    // Backend doesn't have a GET endpoint for check-in yet
    return null as { priorities: Array<{ id: string; text: string; completed: boolean }> } | null;
  },

  /** Update priority completion status (stub — local only) */
  updatePriorityStatus: async (_id: string, _completed: boolean) => {
    // Will be wired to task complete/undo when priorities are stored as tasks
    return { ok: true };
  },

  /** Set sleep reminder (stub — notification engine) */
  setSleepReminder: async (_time: string) => {
    console.info('[Momentum] Sleep reminder set for', _time);
    return { ok: true };
  },

  /** Block focus time window (stub — notification engine) */
  blockFocusTime: async (_start: string, _end: string) => {
    console.info('[Momentum] Focus block set:', _start, '-', _end);
    return { ok: true };
  },
};

// ─── Standalone named exports for screen imports ─────────────────
// screen-evening-review.tsx uses `import * as scheduleApi` so these
// are accessible as scheduleApi.getTodayStats etc.

export const { getTodayStats, getTasks, getUnfinishedTasks } = scheduleApi;
export const { saveMorningCheckin, saveEveningReview, getMorningCheckin } = scheduleApi;
export const { updatePriorityStatus, setSleepReminder, blockFocusTime } = scheduleApi;

/** Standalone rescheduleTask for evening review (taskId, date) signature */
export async function rescheduleTask(taskId: string, targetDate: string) {
  return scheduleApi.rescheduleTask({ task_id: taskId, target_date: targetDate });
}

// ─── GoalDetail type + getGoalById for screen-goal-detail.tsx ────

export interface GoalDetail {
  id: string;
  name: string;
  subtitle: string;
  status: 'On Track' | 'Slightly Behind' | 'Behind' | 'Achieved';
  progress: number;
  color: string;
  trajectory: number[];
  milestones: Array<{ id: string; name: string; dueDate: string; completed: boolean }>;
  linkedTasks: Array<{ id: string; name: string; duration: string; color?: string }>;
}

export async function getGoalById(goalId: string): Promise<GoalDetail> {
  const response = await client.get(`/goals/${goalId}`);
  const raw = response.data as Record<string, unknown>;
  return {
    id: String(raw.id ?? goalId),
    name: String(raw.title ?? 'Untitled Goal'),
    subtitle: String(raw.description ?? ''),
    status: mapGoalStatus(raw.status as string),
    progress: Number(raw.progress_pct ?? 0),
    color: '#B8472A',
    trajectory: [],
    milestones: Array.isArray(raw.milestones)
      ? (raw.milestones as Array<Record<string, unknown>>).map((m) => ({
          id: String(m.id ?? ''),
          name: String(m.title ?? ''),
          dueDate: String(m.target_date ?? ''),
          completed: Boolean(m.completed),
        }))
      : [],
    linkedTasks: [],
  };
}

function mapGoalStatus(status?: string): GoalDetail['status'] {
  if (!status) return 'On Track';
  const s = status.toLowerCase();
  if (s === 'achieved') return 'Achieved';
  if (s.includes('behind')) return 'Behind';
  if (s.includes('slightly')) return 'Slightly Behind';
  return 'On Track';
}
