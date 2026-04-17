import { create } from 'zustand';
import { scheduleApi } from '../api/scheduleApi';
import type {
  ScheduleResponse,
  TaskDetail,
  DayScore,
  StreakInfo,
} from '../api/scheduleApi';
import { idbCache } from '../lib/idbCache';

type PendingAction = 'COMPLETING' | 'PARKING' | 'UNDOING';

interface InversePatch {
  type: PendingAction;
  taskSnapshot: TaskDetail;
  // We can track the previous arrays if tasks move between active/parked lists
  sourceList: 'tasks' | 'unassigned_parked_tasks';
}

interface ScheduleState {
  // Core state
  schedule: ScheduleResponse | null;
  dayScore: DayScore | null;
  streak: StreakInfo | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  taskPendingActions: Record<string, PendingAction>;
  inversePatches: Record<string, InversePatch>;

  // Actions
  fetchSchedule: (dateStr?: string) => Promise<void>;
  completeTask: (taskId: string, actual_duration_mins?: number, quality_rating?: number) => Promise<void>;
  parkTask: (taskId: string, reason: string | null) => Promise<void>;
  undoTask: (taskId: string) => Promise<void>;
  
  // Helpers
  rollbackPatch: (taskId: string) => void;
  removePatch: (taskId: string) => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedule: null,
  dayScore: null,
  streak: null,
  isLoading: false,
  error: null,
  taskPendingActions: {},
  inversePatches: {},

  fetchSchedule: async (dateStr?: string) => {
    set({ isLoading: true, error: null });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const data = await scheduleApi.getTodaySchedule(dateStr, controller.signal);
      clearTimeout(timeoutId);

      // Save to IDB for offline fallback
      if (!dateStr || dateStr === new Date().toISOString().split('T')[0]) {
        await idbCache.setItem('today_schedule', data);
      }

      set({ schedule: data, isLoading: false });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        set({ error: 'Request timed out. Please try again.', isLoading: false });
        throw error;
      }

      // Try fallback from cache if available
      const cached = await idbCache.getItem<ScheduleResponse>('today_schedule');
      if (cached) {
        set({ schedule: cached, isLoading: false, error: 'Offline mode: Showing cached data.' });
      } else {
        const msg = error instanceof Error ? error.message : 'Failed to fetch schedule';
        set({ error: msg, isLoading: false });
        throw error; // Let ErrorBoundary handle it if needed
      }
    }
  },

  rollbackPatch: (taskId: string) => {
    set((state) => {
      const patch = state.inversePatches[taskId];
      if (!patch || !state.schedule) return state;

      const newSchedule = { ...state.schedule };
      
      // Remove from everywhere just in case
      newSchedule.tasks = newSchedule.tasks.filter(t => t.id !== taskId);
      newSchedule.unassigned_parked_tasks = newSchedule.unassigned_parked_tasks.filter(t => t.id !== taskId);

      // Put back exactly where it was
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
        inversePatches: newPatches
      };
    });
  },

  removePatch: (taskId: string) => {
    set((state) => {
      const newPendingActions = { ...state.taskPendingActions };
      delete newPendingActions[taskId];

      const newPatches = { ...state.inversePatches };
      delete newPatches[taskId];

      return {
        taskPendingActions: newPendingActions,
        inversePatches: newPatches
      };
    });
  },

  completeTask: async (taskId, actual_duration_mins?, quality_rating?) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 1. Snapshot and Optimistic Update
    set((state) => {
      if (!state.schedule) return state;
      const patch: InversePatch = {
        type: 'COMPLETING',
        taskSnapshot: { ...task },
        sourceList: 'tasks'
      };

      const newSchedule = { ...state.schedule };
      const taskIndex = newSchedule.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        newSchedule.tasks[taskIndex] = { ...newSchedule.tasks[taskIndex], task_status: 'completed' };
      }

      return {
        taskPendingActions: { ...state.taskPendingActions, [taskId]: 'COMPLETING' },
        inversePatches: { ...state.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null
      };
    });

    // 2. Network Request
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await scheduleApi.completeTask(taskId, { actual_duration_mins, quality_rating }, controller.signal);
      clearTimeout(timeoutId);

      // 3. Commit Success
      set((state) => {
        if (!state.schedule) return state;
        const newSchedule = { ...state.schedule };
        const taskIndex = newSchedule.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          newSchedule.tasks[taskIndex] = response.task; // update with server truth
        }
        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak
        };
      });
      get().removePatch(taskId);
      
    } catch (error: any) {
      // Offline / Network Error or 409 Conflict => Handled by background queue later
      if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.response?.status === 409) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'complete',
            task_id: taskId,
            payload: { actual_duration_mins, quality_rating }
          });
        });
        get().removePatch(taskId); // Keep optimistic update!
        return;
      }

      // 4. Rollback Failure
      get().rollbackPatch(taskId);
      const msg = error.message || 'Network error';
      set({ error: `Failed to complete task: ${msg}` });
    }
  },

  parkTask: async (taskId, reason) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find(t => t.id === taskId) 
              || state.schedule.unassigned_parked_tasks.find(t => t.id === taskId);
    if (!task) return;

    const sourceList = state.schedule.tasks.some(t => t.id === taskId) ? 'tasks' : 'unassigned_parked_tasks';

    set((state) => {
      if (!state.schedule) return state;
      const patch: InversePatch = {
        type: 'PARKING',
        taskSnapshot: { ...task },
        sourceList
      };

      const newSchedule = { ...state.schedule };
      // Remove from active tasks, add to parked
      if (sourceList === 'tasks') {
        newSchedule.tasks = newSchedule.tasks.filter(t => t.id !== taskId);
        newSchedule.unassigned_parked_tasks = [...newSchedule.unassigned_parked_tasks, { ...task, task_status: 'parked' }];
      }

      return {
        taskPendingActions: { ...state.taskPendingActions, [taskId]: 'PARKING' },
        inversePatches: { ...state.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null
      };
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await scheduleApi.parkTask(taskId, reason, controller.signal);
      clearTimeout(timeoutId);

      set((state) => {
        if (!state.schedule) return state;
        const newSchedule = { ...state.schedule };
        const taskIndex = newSchedule.unassigned_parked_tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          newSchedule.unassigned_parked_tasks[taskIndex] = response.task; 
        }
        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak
        };
      });
      get().removePatch(taskId);
      
    } catch (error: any) {
      if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.response?.status === 409) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'park',
            task_id: taskId,
            payload: { reason }
          });
        });
        get().removePatch(taskId); // Keep optimistic
        return;
      }

      get().rollbackPatch(taskId);
      const msg = error.message || 'Network error';
      set({ error: `Failed to park task: ${msg}` });
    }
  },

  undoTask: async (taskId) => {
    const state = get();
    if (!state.schedule) return;

    const task = state.schedule.tasks.find(t => t.id === taskId) 
              || state.schedule.unassigned_parked_tasks.find(t => t.id === taskId);
    if (!task) return;

    const sourceList = state.schedule.tasks.some(t => t.id === taskId) ? 'tasks' : 'unassigned_parked_tasks';

    set((state) => {
      if (!state.schedule) return state;
      const patch: InversePatch = {
        type: 'UNDOING',
        taskSnapshot: { ...task },
        sourceList
      };

      const newSchedule = { ...state.schedule };
      const previousStatus = task.previous_status || 'active'; // guess if not fully known
      
      // Moving back logic optimistically
      newSchedule.tasks = newSchedule.tasks.filter(t => t.id !== taskId);
      newSchedule.unassigned_parked_tasks = newSchedule.unassigned_parked_tasks.filter(t => t.id !== taskId);

      if (previousStatus === 'parked') {
        newSchedule.unassigned_parked_tasks.push({ ...task, task_status: previousStatus });
      } else {
        newSchedule.tasks.push({ ...task, task_status: previousStatus });
      }

      return {
        taskPendingActions: { ...state.taskPendingActions, [taskId]: 'UNDOING' },
        inversePatches: { ...state.inversePatches, [taskId]: patch },
        schedule: newSchedule,
        error: null
      };
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await scheduleApi.undoTask(taskId, controller.signal);
      clearTimeout(timeoutId);

      set((state) => {
        if (!state.schedule) return state;
        const newSchedule = { ...state.schedule };
        
        // Find where it ended up and update it
        const tIndex = newSchedule.tasks.findIndex(t => t.id === taskId);
        if (tIndex !== -1) {
          newSchedule.tasks[tIndex] = response.task;
        } else {
          const ptIndex = newSchedule.unassigned_parked_tasks.findIndex(t => t.id === taskId);
          if (ptIndex !== -1) {
            newSchedule.unassigned_parked_tasks[ptIndex] = response.task;
          }
        }

        return {
          schedule: newSchedule,
          dayScore: response.day_score,
          streak: response.streak
        };
      });
      get().removePatch(taskId);
      
    } catch (error: any) {
      if (!navigator.onLine || error.code === 'ERR_NETWORK' || error.response?.status === 409) {
        import('../lib/offlineQueue').then(({ enqueueAction }) => {
          enqueueAction({
            type: 'undo',
            task_id: taskId
          });
        });
        get().removePatch(taskId); // Keep optimistic
        return;
      }

      get().rollbackPatch(taskId);
      const msg = error.message || 'Network error';
      set({ error: `Failed to undo task action: ${msg}` });
    }
  },
}));
