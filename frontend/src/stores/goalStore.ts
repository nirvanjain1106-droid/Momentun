import { create } from 'zustand';
import { client } from '../api/client';
import { useUIStore } from './uiStore';

type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  description: string;
  type: string;
  status: GoalStatus;
  target_date: string;
  motivation?: string;
  consequence?: string;
  success_metric?: string;
  priority_rank: number;
  pre_pause_rank?: number | null;
  progress_percentage: number;
}

interface GoalState {
  goals: Goal[];
  isLoading: boolean;
  
  fetchGoals: (status?: GoalStatus) => Promise<void>;
  createGoal: (data: Omit<Goal, 'id' | 'status' | 'priority_rank' | 'progress_percentage'>) => Promise<void>;
  updateGoal: (goalId: string, data: Partial<Goal>) => Promise<void>;
  pauseGoal: (goalId: string) => Promise<void>;
  resumeGoal: (goalId: string) => Promise<void>;
  achieveGoal: (goalId: string) => Promise<void>;
  abandonGoal: (goalId: string) => Promise<void>;
  reorderActiveGoals: (goalIds: string[]) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  isLoading: false,

  fetchGoals: async (status) => {
    set({ isLoading: true });
    try {
      const url = status ? `/goals?status=${status}` : '/goals';
      const response = await client.get(url);
      set({ goals: response.data.items });
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to load goals.' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  createGoal: async (data) => {
    try {
      const response = await client.post('/goals', data);
      set((state) => ({ goals: [...state.goals, response.data] }));
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to create goal.' });
      throw error;
    }
  },

  updateGoal: async (goalId, data) => {
    const previousTarget = get().goals.find((g) => g.id === goalId);
    
    // Optimistically update
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, ...data } : g)),
    }));

    try {
      await client.put(`/goals/${goalId}`, data);
    } catch (error) {
      // Rollback
      if (previousTarget) {
         set((state) => ({
           goals: state.goals.map((g) => (g.id === goalId ? previousTarget : g))
         }));
      }
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to update goal.' });
      throw error;
    }
  },

  pauseGoal: async (goalId) => {
    const previousGoals = [...get().goals];
    
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, status: 'paused' } : g)),
    }));

    try {
      await client.post(`/goals/${goalId}/pause`);
    } catch (error) {
      set({ goals: previousGoals });
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to pause goal.' });
      throw error;
    }
  },

  resumeGoal: async (goalId) => {
    const previousGoals = [...get().goals];
    
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, status: 'active' } : g)),
    }));

    try {
      await client.post(`/goals/${goalId}/resume`);
    } catch (error) {
      set({ goals: previousGoals });
      useUIStore.getState().addToast({ type: 'error', message: 'Check if you already have 3 active goals.' });
      throw error;
    }
  },

  achieveGoal: async (goalId) => {
    const previousGoals = [...get().goals];
    
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, status: 'achieved' } : g)),
    }));

    try {
      await client.patch(`/goals/${goalId}/status`, { status: "achieved" });
    } catch (error) {
       set({ goals: previousGoals });
       useUIStore.getState().addToast({ type: 'error', message: 'Failed to update goal status.' });
       throw error;
    }
  },

  abandonGoal: async (goalId) => {
    const previousGoals = [...get().goals];
    
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, status: 'abandoned' } : g)),
    }));

    try {
       await client.patch(`/goals/${goalId}/status`, { status: "abandoned" });
    } catch (error) {
       set({ goals: previousGoals });
       useUIStore.getState().addToast({ type: 'error', message: 'Failed to abandon goal.' });
       throw error;
    }
  },

  reorderActiveGoals: async (goalIds) => {
    const previousGoals = [...get().goals];
    
    set((state) => {
       const mapped = state.goals.map(g => {
          const newIdx = goalIds.indexOf(g.id);
          if (newIdx !== -1) {
             return { ...g, priority_rank: newIdx + 1 };
          }
          return g;
       });
       return { goals: mapped };
    });

    try {
      await client.put(`/goals/reorder`, { goal_ids: goalIds });
    } catch (error) {
      set({ goals: previousGoals });
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to save new custom order.' });
      throw error;
    }
  }

}));
