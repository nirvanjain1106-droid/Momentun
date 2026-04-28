import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

client.interceptors.request.use((config) => {
  if (accessToken && config.url !== '/auth/refresh') {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => {
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
        setAccessToken(newToken);
        
        processQueue(null);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        
        try { await useAuthStore.getState().logout(); } catch { /* best-effort logout API clearing */ }
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
