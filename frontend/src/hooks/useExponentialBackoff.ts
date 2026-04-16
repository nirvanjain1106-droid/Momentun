import { useEffect, useRef, useCallback } from 'react';

interface BackoffConfig {
  initialDelay: number;
  maxDelay: number;
  factor: number;
  jitterPct: number; // 0.2 for 20%
}

export function useExponentialBackoff(
  fetchFn: () => Promise<void>,
  isActive: boolean,
  config: BackoffConfig = { initialDelay: 2000, maxDelay: 60000, factor: 2, jitterPct: 0.2 }
) {
  const currentDelayRef = useRef(config.initialDelay);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFetchFn = useRef(fetchFn);

  useEffect(() => {
    savedFetchFn.current = fetchFn;
  }, [fetchFn]);

  const calculateNextDelay = useCallback(() => {
    // Current delay * factor
    let next = currentDelayRef.current * config.factor;
    if (next > config.maxDelay) next = config.maxDelay;

    // Apply strict jitter (±20% by default)
    const jitterMax = next * config.jitterPct;
    const jitter = (Math.random() * (jitterMax * 2)) - jitterMax;
    next = next + jitter;

    return Math.max(config.initialDelay, Math.min(next, config.maxDelay));
  }, [config.factor, config.initialDelay, config.jitterPct, config.maxDelay]);

  const scheduleNext = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    timeoutIdRef.current = setTimeout(() => {
      if (document.hidden) {
        // Paused if hidden, check again in a bit
        scheduleNext();
      } else {
        tick();
      }
    }, currentDelayRef.current);
  }, []);

  const tick = useCallback(async () => {
    try {
      await savedFetchFn.current();
      // On success, reset backoff
      currentDelayRef.current = config.initialDelay;
    } catch {
      // On failure, apply backoff
      currentDelayRef.current = calculateNextDelay();
    } finally {
      if (isActive) {
        scheduleNext();
      }
    }
  }, [isActive, calculateNextDelay, scheduleNext, config.initialDelay]);

  useEffect(() => {
    if (isActive) {
      currentDelayRef.current = config.initialDelay;
      scheduleNext();
    } else {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    }

    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, [isActive, scheduleNext, config.initialDelay]);

  // Expose manual trigger to reset loop (e.g., user clicked "retry")
  const forceRetry = useCallback(() => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    currentDelayRef.current = config.initialDelay;
    tick();
  }, [config.initialDelay, tick]);

  return { forceRetry };
}
