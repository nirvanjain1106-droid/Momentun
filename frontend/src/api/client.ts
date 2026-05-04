import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { debugLog, pushRequestEntry } from '../lib/debug';

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Token management ──────────────────────────────────────────
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, _newToken?: string) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
    metadata?: { startTime: number };
  }
}

// ── Request interceptor — auth + debug timing ──────────────────────────────
client.interceptors.request.use((config) => {
  const token = accessToken ||
    client.defaults.headers.common['Authorization']
      ?.toString().replace('Bearer ', '');

  if (token && config.url !== '/auth/refresh') {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (import.meta.env.DEV) {
    debugLog('API', `→ ${config.method?.toUpperCase()} ${config.url}`);
  }
  config.metadata = { startTime: Date.now() };
  return config;
});

// ── Response interceptors — debug logging + token refresh ───────────────────
client.interceptors.response.use(
  (response) => {
    // Debug logging
    if (import.meta.env.DEV) {
      const duration = Date.now() - (response.config.metadata?.startTime ?? Date.now());
      debugLog('API', `← ${response.status} ${response.config.url} (${duration}ms)`);
      pushRequestEntry({
        method: response.config.method?.toUpperCase() ?? '?',
        url: response.config.url ?? '?',
        status: response.status,
        durationMs: duration,
        timestamp: Date.now(),
      });
    }
    if (useUIStore.getState().isOffline) {
      useUIStore.getState().setOffline(false);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig | undefined;
    
    // Detect offline state — only trust navigator.onLine to avoid
    // false positives from CORS errors or server restarts during dev
    if (!error.response && !navigator.onLine) {
      useUIStore.getState().setOffline(true);
    }

    // Ignore network errors or manually canceled requests directly here
    if (!originalRequest) return Promise.reject(error);

    // Prevent deadlock: auth endpoints must not queue for refresh
    if (originalRequest.url === '/auth/refresh' || originalRequest.url === '/auth/logout') {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            originalRequest._retry = true;
            return client(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await client.post('/auth/refresh');
        const newToken = refreshResponse.data.access_token;

        // Set token in memory
        setAccessToken(newToken);

        // CRITICAL FIX 1:
        // Also set on axios instance default headers
        // so ALL future requests use the new token
        client.defaults.headers.common['Authorization'] =
          `Bearer ${newToken}`;

        // CRITICAL FIX 2:
        // Also set on the specific retry request
        // so THIS retry uses the new token immediately
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] =
            `Bearer ${newToken}`;
        }

        // Now process queued requests with new token
        processQueue(null, newToken);

        // Retry original request (now has token)
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);

        // Clear tokens locally WITHOUT calling API
        // (API logout would fail with 401 anyway)
        setAccessToken(null);
        delete client.defaults.headers.common['Authorization'];

        // Clear any stored tokens
        try {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        } catch {}

        // Clear auth store state directly
        try {
          useAuthStore.getState().clearUser();
        } catch {}

        // Dispatch event so App.tsx can redirect
        window.dispatchEvent(
          new CustomEvent('auth:session-expired')
        );

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
