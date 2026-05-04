import { create } from 'zustand';
import { idbCache } from '../lib/idbCache';
import { getApiErrorMessage } from '../lib/errorHandler';
import {
  scheduleApi,
  type AdHocTaskPayload,
  type DayScore,
  type QuickAddPayload,
  type ScheduleResponse,
  type StreakInfo,
  type TaskDetail,
} from '../api/scheduleApi';

type PendingAction = 'COMPLETING' | 'PARKING' | 'UNDOING';

interface InversePatch {
  type: PendingAction;
  taskSnapshot: TaskDetail;
  sourceList: 'tasks' | 'unassigned_parked_tasks';
}

interface ScheduleState {
  schedule: ScheduleResponse | null;
  parkedTasks: TaskDetail[];
  dayScore: DayScore | null;
  streak: StreakInfo | null;
  isLoading: boolean;
  isParkedLoading: boolean;
  error: string | null;
  taskPendingActions: Record<string, PendingAction>;
  inversePatches: Record<string, InversePatch>;
  fetchSchedule: (dateStr?: string) => Promise<void>;
  fetchParkedTasks: (staleOnly?: boolean) => Promise<void>;
  completeTask: (taskId: string, actual_duration_mins?: number, quality_rating?: number) => Promise<void>;
  parkTask: (taskId: string, reason: string | null) => Promise<void>;
  undoTask: (taskId: string) => Promise<void>;
  createAdHocTask: (data: AdHocTaskPayload) => Promise<TaskDetail>;
  quickAddTask: (data: QuickAddPayload) => Promise<TaskDetail>;
  rescheduleTask: (taskId: string, targetDate: string) => Promise<TaskDetail>;
  rollbackPatch: (taskId: string) => void;
  removePatch: (taskId: string) => void;
}

type QueueableError = {
  code?: string;
  response?: {
    status?: number;
  };
  message?: string;
};

function asQueueableError(error: unknown): QueueableError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  return error as QueueableError;
}

function shouldQueueOptimisticError(error: QueueableError | null): boolean {
  return !navigator.onLine || error?.code === 'ERR_NETWORK' || error?.response?.status === 409;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Axios sets error.message to "Network Error" for failed requests with
    // no response — surface a friendlier message instead.
    if (error.message === 'Network Error') {
      return 'Unable to connect to the server. Please check your connection and try again.';
    }
    return error.message;
  }

  const queueableError = asQueueableError(error);
  return queueableError?.message || fallback;
}
void getErrorMessage;

const TODAY_CACHE_KEY = 'today_schedule';

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedule: null,
  parkedTasks: [],
  dayScore: null,
  streak: null,
  isLoading: false,
  isParkedLoading: false,
  error: null,
  taskPendingActions: {},
  inversePatches: {},

  fetchSchedule: async (dateStr) => {
    set({ isLoading: true, error: null });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const data = await scheduleApi.getTodaySchedule(dateStr, controller.signal);
      clearTimeout(timeoutId);

      if (!dateStr || dateStr === new Date().toISOString().split('T')[0]) {
        await idbCache.setItem(TODAY_CACHE_KEY, data);
      }

      set({
        schedule: data,
        parkedTasks: data.unassigned_parked_tasks,
        isLoading: false,
        error: null,
      });
    } catch (error: unknown) {
      const cached = await idbCache.getItem<ScheduleResponse>(TODAY_CACHE_KEY);

      if (cached) {
        set({
          schedule: cached,
          parkedTasks: cached.unassigned_parked_tasks,
          isLoading: false,
          error: 'Offline mode: showing cached schedule.',
        });
        return;
      }

      const msg = error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : getApiErrorMessage(error, 'tasks');

      set({ isLoading: false, error: msg });
    }
  },

  fetchParkedTasks: async (staleOnly = false) => {
    set({ isParkedLoading: true });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const data = await scheduleApi.getParkedTasks(staleOnly, controller.signal);
      clearTimeout(timeoutId);
      set({ parkedTasks: data.tasks, isParkedLoading: false });
    } catch (error: unknown) {
      set({
        isParkedLoading: false,
        error: getApiErrorMessage(error, 'tasks'),
      });
    }
  },

  rollbackPatch: (taskId) => {
    set((state) => {
      const patch = state.inversePatches[taskId];
      if (!patch || !state.schedule) return state;

      const newSchedule = { ...state.schedule };
      newSchedule.tasks = newSchedule.tasks.filter((task) => task.id !== taskId);
      newSchedule.unassigned_parked_tasks = newSchedule.unassigned_parked_tasks.filter((task) => task.id !== taskId);

      if (patch.sourceList === 'tasks') {
        newSchedule.tasks = [...newSchedule.tasks, patch.taskSnapshot];
      } else {
        newSchedule.unassigned_parked_tasks = [...newSchedule.unassigned_parked_tasks, patch.taskSnapshot];
      }

      const newPendingActions = { ...state.taskPendingActions };
      delete newPendingActions[taskId];

      const newPatches = { ...state.inversePatches };
      delete newPatches[taskId];

      return {
        schedule: newSchedule,
        taskPendingActions: newPendingActions,
        inversePatches: newPatches,
      };
    });
  },

  removePatch: (taskId) => {
    set((state) => {
      const newPendingActions = { ...state.taskPendingActions };
      delete newPendingActions[taskId];

      const newPatches = { ...state.inversePatches };
      delete newPatches[taskId];

      return {
        taskPendingActions: newPendingActions,
        inversePatches: newPatches,
      };
    });
  },

  completeTask: async (taskId, actual_duration_mins, quality_rating) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find((item) => item.id === taskId);
    if (!task) return;

    set((current) => {
      if (!current.schedule) return current;

      const patch: InversePatch = {
        type: 'COMPLETING',
        taskSnapshot: { ...task },
        sourceList: 'tasks',
      };

      const newSchedule = { ...current.schedule };
      const taskIndex = newSchedule.tasks.findIndex((item) => item.id === taskId);
      if (taskIndex !== -1) {
        newSchedule.tasks[taskIndex] = { ...newSchedule.tasks[taskIndex], task_status: 'completed' };
      }

      return {
        taskPendingActions: { ...current.taskPendingActions, [taskId]: 'COMPLETING' },
        inversePatches: { ...current.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null,
      };
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await scheduleApi.completeTask(taskId, { actual_duration_mins, quality_rating }, controller.signal);
      clearTimeout(timeoutId);

      set((current) => {
        if (!current.schedule) return current;
        const newSchedule = { ...current.schedule };
        const taskIndex = newSchedule.tasks.findIndex((item) => item.id === taskId);
        if (taskIndex !== -1) {
          newSchedule.tasks[taskIndex] = response.task;
        }

        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak,
        };
      });

      get().removePatch(taskId);
    } catch (error: unknown) {
      const queueableError = asQueueableError(error);

      if (shouldQueueOptimisticError(queueableError)) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'complete',
            task_id: taskId,
            payload: { actual_duration_mins, quality_rating },
          });
        });
        get().removePatch(taskId);
        return;
      }

      get().rollbackPatch(taskId);
      set({ error: `Failed to complete task: ${getApiErrorMessage(error, 'tasks')}` });
    }
  },

  parkTask: async (taskId, reason) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find((item) => item.id === taskId)
      || state.schedule.unassigned_parked_tasks.find((item) => item.id === taskId);
    if (!task) return;

    const sourceList = state.schedule.tasks.some((item) => item.id === taskId)
      ? 'tasks'
      : 'unassigned_parked_tasks';

    set((current) => {
      if (!current.schedule) return current;

      const patch: InversePatch = {
        type: 'PARKING',
        taskSnapshot: { ...task },
        sourceList,
      };

      const newSchedule = { ...current.schedule };
      if (sourceList === 'tasks') {
        newSchedule.tasks = newSchedule.tasks.filter((item) => item.id !== taskId);
        newSchedule.unassigned_parked_tasks = [
          { ...task, task_status: 'parked' },
          ...newSchedule.unassigned_parked_tasks.filter((item) => item.id !== taskId),
        ];
      }

      return {
        taskPendingActions: { ...current.taskPendingActions, [taskId]: 'PARKING' },
        inversePatches: { ...current.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null,
      };
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await scheduleApi.parkTask(taskId, reason, controller.signal);
      clearTimeout(timeoutId);

      set((current) => {
        if (!current.schedule) return current;
        const newSchedule = { ...current.schedule };
        const parkedIndex = newSchedule.unassigned_parked_tasks.findIndex((item) => item.id === taskId);
        if (parkedIndex !== -1) {
          newSchedule.unassigned_parked_tasks[parkedIndex] = response.task;
        }

        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak,
        };
      });

      get().removePatch(taskId);
      void get().fetchParkedTasks();
    } catch (error: unknown) {
      const queueableError = asQueueableError(error);

      if (shouldQueueOptimisticError(queueableError)) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'park',
            task_id: taskId,
            payload: { reason },
          });
        });
        get().removePatch(taskId);
        return;
      }

      get().rollbackPatch(taskId);
      set({ error: `Failed to park task: ${getApiErrorMessage(error, 'tasks')}` });
    }
  },

  undoTask: async (taskId) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find((item) => item.id === taskId)
      || state.schedule.unassigned_parked_tasks.find((item) => item.id === taskId);
    if (!task) return;

    const sourceList = state.schedule.tasks.some((item) => item.id === taskId)
      ? 'tasks'
      : 'unassigned_parked_tasks';

    set((current) => {
      if (!current.schedule) return current;

      const patch: InversePatch = {
        type: 'UNDOING',
        taskSnapshot: { ...task },
        sourceList,
      };

      const newSchedule = { ...current.schedule };
      const previousStatus = task.previous_status || 'active';
      newSchedule.tasks = newSchedule.tasks.filter((item) => item.id !== taskId);
      newSchedule.unassigned_parked_tasks = newSchedule.unassigned_parked_tasks.filter((item) => item.id !== taskId);

      if (previousStatus === 'parked') {
        newSchedule.unassigned_parked_tasks.push({ ...task, task_status: previousStatus });
      } else {
        newSchedule.tasks.push({ ...task, task_status: previousStatus });
      }

      return {
        taskPendingActions: { ...current.taskPendingActions, [taskId]: 'UNDOING' },
        inversePatches: { ...current.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null,
      };
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await scheduleApi.undoTask(taskId, controller.signal);
      clearTimeout(timeoutId);

      set((current) => {
        if (!current.schedule) return current;

        const newSchedule = { ...current.schedule };
        const taskIndex = newSchedule.tasks.findIndex((item) => item.id === taskId);
        if (taskIndex !== -1) {
          newSchedule.tasks[taskIndex] = response.task;
        } else {
          const parkedIndex = newSchedule.unassigned_parked_tasks.findIndex((item) => item.id === taskId);
          if (parkedIndex !== -1) {
            newSchedule.unassigned_parked_tasks[parkedIndex] = response.task;
          }
        }

        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak,
        };
      });

      get().removePatch(taskId);
      void get().fetchParkedTasks();
    } catch (error: unknown) {
      const queueableError = asQueueableError(error);

      if (shouldQueueOptimisticError(queueableError)) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'undo',
            task_id: taskId,
          });
        });
        get().removePatch(taskId);
        return;
      }

      get().rollbackPatch(taskId);
      set({ error: `Failed to undo task action: ${getApiErrorMessage(error, 'tasks')}` });
    }
  },

  createAdHocTask: async (data) => {
    set({ error: null });
    try {
      const createdTask = await scheduleApi.createAdHocTask(data);
      await Promise.allSettled([get().fetchSchedule(), get().fetchParkedTasks()]);
      return createdTask;
    } catch (error: unknown) {
      set({ error: getApiErrorMessage(error, 'tasks') });
      throw error;
    }
  },

  quickAddTask: async (data) => {
    set({ error: null });
    try {
      const task = await scheduleApi.quickAddTask(data);
      await Promise.allSettled([get().fetchSchedule(), get().fetchParkedTasks()]);
      return task;
    } catch (error: unknown) {
      set({ error: getApiErrorMessage(error, 'tasks') });
      throw error;
    }
  },

  rescheduleTask: async (taskId, targetDate) => {
    set({ error: null });
    try {
      const task = await scheduleApi.rescheduleTask({ task_id: taskId, target_date: targetDate });
      await Promise.allSettled([get().fetchSchedule(), get().fetchParkedTasks()]);
      return task;
    } catch (error: unknown) {
      set({ error: getApiErrorMessage(error, 'tasks') });
      throw error;
    }
  },
}));
