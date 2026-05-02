import { client } from './client';
import { useAuthStore } from '../stores/authStore';
import type { DayScore } from './scheduleApi';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  user_type: string;
  timezone: string;
  onboarding_complete: boolean;
  onboarding_step: number;
  email_verified: boolean;
  is_paused: boolean;
  paused_reason: string | null;
  created_at: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface PauseAccountPayload {
  reason: 'sick' | 'vacation' | 'burnout' | 'personal' | 'other';
  days?: number;
}

export interface FeedbackPayload {
  feedback_type?: 'bug' | 'feature' | 'general' | 'schedule_quality';
  message: string;
  screen_state?: string;
  device_info?: string;
  request_ids?: string[];
}

const normalizeProfile = (raw: Record<string, unknown>): UserProfile => ({
  id: String(raw.id ?? ''),
  name: String(raw.name ?? 'Momentum user'),
  email: String(raw.email ?? ''),
  user_type: String(raw.user_type ?? 'student'),
  timezone: String(raw.timezone ?? 'UTC'),
  onboarding_complete: Boolean(raw.onboarding_complete),
  onboarding_step: Number(raw.onboarding_step ?? 0),
  email_verified: Boolean(raw.email_verified),
  is_paused: Boolean(raw.is_paused),
  paused_reason: raw.paused_reason ? String(raw.paused_reason) : null,
  created_at: String(raw.created_at ?? ''),
});

/* ──────────────────────────────────────────────────────────────────────────
 *  Auth convenience functions — named exports consumed by screen components
 * ────────────────────────────────────────────────────────────────────────── */

/** POST /auth/login — sets httpOnly cookies, updates authStore */
export async function login(email: string, password: string) {
  const res = await client.post('/auth/login', { email, password });
  const data = res.data as { access_token: string; user_id: string; name?: string; onboarding_complete?: boolean };
  // Store the access token for subsequent requests
  const { setAccessToken: setToken } = await import('./client');
  setToken(data.access_token);
  // Update auth store (userId, userName, onboardingComplete)
  useAuthStore.getState().login(data.user_id, data.name ?? '', !!data.onboarding_complete);
  return data;
}

/** POST /auth/register — creates account, sets cookies, updates authStore */
export async function register(payload: {
  name: string;
  email: string;
  password: string;
  user_type?: string;
  timezone?: string;
}) {
  const res = await client.post('/auth/register', payload);
  const data = res.data as { access_token: string; user_id: string; name?: string; onboarding_complete?: boolean };
  const { setAccessToken: setToken } = await import('./client');
  setToken(data.access_token);
  useAuthStore.getState().login(data.user_id, data.name ?? payload.name, !!data.onboarding_complete);
  return data;
}

/** POST /auth/logout — clears cookies + authStore */
export async function logout() {
  try {
    await client.post('/auth/logout');
  } catch {
    // If backend is unreachable, still clear local state
  }
  useAuthStore.getState().logout();
}

/** GET /users/me — returns normalised UserProfile */
export async function getMe(): Promise<UserProfile> {
  const res = await client.get('/users/me');
  return normalizeProfile(res.data as Record<string, unknown>);
}

/* ──────────────────────────────────────────────────────────────────────────
 *  userApi object — used by settings screen and other components
 * ────────────────────────────────────────────────────────────────────────── */

export const userApi = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await client.get('/users/me');
    return normalizeProfile(response.data as Record<string, unknown>);
  },

  updateProfile: async (payload: { name?: string; timezone?: string }): Promise<UserProfile> => {
    const response = await client.patch('/users/me', payload);
    return normalizeProfile(response.data as Record<string, unknown>);
  },

  changePassword: async (payload: ChangePasswordPayload): Promise<{ message: string }> => {
    const response = await client.post('/users/me/change-password', payload);
    return response.data as { message: string };
  },

  pauseAccount: async (payload: PauseAccountPayload): Promise<UserProfile> => {
    const response = await client.post('/users/me/pause', payload);
    return normalizeProfile(response.data as Record<string, unknown>);
  },

  resumeAccount: async (): Promise<UserProfile> => {
    const response = await client.post('/users/me/resume');
    return normalizeProfile(response.data as Record<string, unknown>);
  },

  submitFeedback: async (payload: FeedbackPayload): Promise<{ id: string; feedback_type: string; message: string; created_at: string }> => {
    const response = await client.post('/users/me/feedback', payload);
    return response.data as { id: string; feedback_type: string; message: string; created_at: string };
  },

  getDayScore: async (): Promise<DayScore> => {
    const response = await client.get('/users/me/day-score');
    return response.data as DayScore;
  },

  exportData: async (): Promise<Blob> => {
    const response = await client.get('/users/me/export', { responseType: 'blob' });
    return response.data as Blob;
  },

  deleteAccount: async (): Promise<{ message: string }> => {
    const response = await client.delete('/users/me');
    return response.data as { message: string };
  },
};

