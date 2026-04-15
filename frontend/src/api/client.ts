import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

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
  reject: (reason?: any) => void;
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
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig;
    
    // Ignore network errors or manually canceled requests directly here
    if (!originalRequest) return Promise.reject(error);

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
        
        // Final fallback block: trigger logout flow
        // The store handles the actual UI redirect or state clear if we throw,
        // but as per plan, we hard-redirect to /login on dead refresh.
        // Wait, the plan says:
        // "Calls POST /auth/logout before hard redirect to clear httpOnly cookie"
        try {
          await client.post('/auth/logout');
        } catch (e) {
          // ignore logout errors if any
        }
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
