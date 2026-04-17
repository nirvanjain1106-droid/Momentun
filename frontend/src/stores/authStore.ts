import { create } from 'zustand';
import { client } from '../api/client';
import { analytics } from '../lib/analytics';

export interface AuthState {
  userId: string | null;
  userName: string | null;
  onboardingComplete: boolean;
  isHydrated: boolean;
  isBootRefreshing: boolean;

  hydrate: () => void;
  completeBootRefresh: () => void;
  setOnboardingComplete: (complete: boolean) => void;
  setUserName: (name: string) => void;
  login: (userId: string, userName: string, onboarding: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  userName: null,
  onboardingComplete: false,
  isHydrated: false,
  isBootRefreshing: false,

  hydrate: () => {
    // Only run on first load
    if (get().isHydrated) return;

    try {
      const storedLocal = localStorage.getItem('auth_state');
      if (storedLocal) {
        const parsed = JSON.parse(storedLocal);
        if (parsed.userId) {
          // Found user, kick off silent refresh
          set({
            userId: parsed.userId,
            userName: parsed.userName || null,
            onboardingComplete: !!parsed.onboardingComplete,
            isHydrated: true,
            isBootRefreshing: true,
          });
          analytics.identify(parsed.userId, { name: parsed.userName });
          
          client.post('/auth/refresh')
            .catch(() => {
              // Refresh failed (e.g. expired refresh token), clear local state
              get().logout();
            })
            .finally(() => {
              get().completeBootRefresh();
            });
          
          return;
        }
      }
    } catch {
      // Parse error — ignore corrupted localStorage
    }

    set({ isHydrated: true });
  },

  completeBootRefresh: () => {
    set({ isBootRefreshing: false });
  },

  setOnboardingComplete: (complete: boolean) => {
    set({ onboardingComplete: complete });
    const local = localStorage.getItem('auth_state');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        parsed.onboardingComplete = complete;
        localStorage.setItem('auth_state', JSON.stringify(parsed));
      } catch { /* ignore parse error */ }
    }
  },

  setUserName: (name: string) => {
    set({ userName: name });
    const local = localStorage.getItem('auth_state');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        parsed.userName = name;
        localStorage.setItem('auth_state', JSON.stringify(parsed));
      } catch { /* ignore parse error */ }
    }
  },

  login: (userId: string, userName: string, onboarding: boolean) => {
    set({
      userId,
      userName,
      onboardingComplete: onboarding,
      isHydrated: true,
      isBootRefreshing: false,
    });
    localStorage.setItem(
      'auth_state',
      JSON.stringify({ userId, userName, onboardingComplete: onboarding })
    );
    analytics.identify(userId, { name: userName });
  },

  logout: async () => {
    try {
      await client.post('/auth/logout');
    } catch {
      // Ignore network errors, proceed to clear local state
    }
    
    localStorage.removeItem('auth_state');
    set({
      userId: null,
      userName: null,
      onboardingComplete: false,
      isBootRefreshing: false,
      // CRITICAL: MUST NOT reset isHydrated to false!
      // This prevents permanent Suspense fallback on /login
    });
    analytics.reset();
  },
}));
