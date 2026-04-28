import { useEffect, useRef, useCallback, useState } from 'react';
import { useScheduleStore } from '../stores/scheduleStore';

const SSE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}/sse/events`;

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export type SSEStatus = 'connected' | 'reconnecting' | 'disconnected' | 'evicted';

/**
 * useSSE — connects to the server-sent events endpoint and refreshes
 * Zustand stores when the backend publishes mutations.
 *
 * Reconnects with exponential backoff on disconnect.
 * Only active when the browser is online.
 */
export function useSSE() {
  const [status, setStatus] = useState<SSEStatus>(() => 
    navigator.onLine ? 'reconnecting' : 'disconnected'
  );
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const { fetchSchedule, fetchParkedTasks } = useScheduleStore();
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // Use a stable secondary effect or callback for reconnection scheduling to avoid purity issues
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      setReconnectTrigger((p) => p + 1);
    }, delay);
  }, []);

  // Connection Lifecycle
  useEffect(() => {
    if (reconnectTrigger === 0 || status === 'evicted') return;

    if (!navigator.onLine) {
      return;
    }

    const source = new EventSource(SSE_URL, { withCredentials: true });
    sourceRef.current = source;

    source.onopen = () => {
      setStatus('connected');
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    };

    source.onerror = () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
      scheduleReconnect();
      setStatus('reconnecting');
    };

    source.addEventListener('schedule_updated', () => {
      void Promise.allSettled([fetchSchedule(), fetchParkedTasks()]);
    });

    source.addEventListener('evicted', () => {
      console.warn('[SSE] Connection evicted by server');
      setStatus('evicted');
      source.close();
    });

    source.addEventListener('goals_reordered', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.debug('[SSE] goals_reordered', data.goal_ids);
      } catch {
        // Ignore
      }
    });

    return () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
  }, [reconnectTrigger, fetchParkedTasks, fetchSchedule, status, scheduleReconnect]);

  // Event listeners for window connectivity
  useEffect(() => {
    const handleOnline = () => setReconnectTrigger((p) => p + 1);
    const handleOffline = () => disconnect();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial start - use a small delay to avoid "set-state-in-effect" sync warning
    const t = setTimeout(() => setReconnectTrigger((p) => p + 1), 0);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(t);
    };
  }, [disconnect]);

  return { status };
}
