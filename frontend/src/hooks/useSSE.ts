import { useEffect, useRef, useCallback } from 'react';
import { useScheduleStore } from '../stores/scheduleStore';

const SSE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}/sse/events`;

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/**
 * useSSE — connects to the server-sent events endpoint and refreshes
 * Zustand stores when the backend publishes mutations.
 *
 * Reconnects with exponential backoff on disconnect.
 * Only active when the browser is online.
 */
export function useSSE() {
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fetchSchedule } = useScheduleStore();

  const connect = useCallback(() => {
    // Don't connect if offline or already connected
    if (!navigator.onLine) return;
    if (sourceRef.current && sourceRef.current.readyState !== EventSource.CLOSED) return;

    const source = new EventSource(SSE_URL, { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener('schedule_updated', () => {
      // Re-fetch the current schedule from the server
      fetchSchedule();
    });

    source.addEventListener('goals_reordered', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.debug('[SSE] goals_reordered', data.goal_ids);
        // goalStore.reorder will be wired in Sprint 6 when the reorder endpoint ships
      } catch {
        // Malformed event — ignore
      }
    });

    source.addEventListener('ping', () => {
      // Keep-alive heartbeat from server — no action needed
    });

    source.onopen = () => {
      // Reset backoff on successful connection
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      scheduleReconnect();
    };
  }, [fetchSchedule]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return; // Already scheduled

    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();

    const handleOnline = () => connect();
    const handleOffline = () => disconnect();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      disconnect();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connect, disconnect]);
}
