// ── Development-only Debug Utilities ────────────────────────────────────────
// All output is stripped in production builds (guarded by import.meta.env.DEV).

export const DEBUG = import.meta.env.DEV

/**
 * Namespaced console.log — only emits in development.
 */
export function debugLog(namespace: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`[${namespace}]`, ...args)
  }
}

/**
 * Namespaced console.warn — only emits in development.
 */
export function debugWarn(namespace: string, ...args: unknown[]) {
  if (DEBUG) {
    console.warn(`[${namespace}]`, ...args)
  }
}

/**
 * Grouped console output — only emits in development.
 */
export function debugGroup(namespace: string, fn: () => void) {
  if (DEBUG) {
    console.group(`[${namespace}]`)
    fn()
    console.groupEnd()
  }
}

/**
 * Timed operation — logs start/end with duration in ms.
 */
export function debugTime<T>(namespace: string, label: string, fn: () => T): T {
  if (!DEBUG) return fn()

  const start = performance.now()
  const result = fn()
  const duration = (performance.now() - start).toFixed(1)
  console.log(`[${namespace}] ${label}: ${duration}ms`)
  return result
}

// ── Request log for DebugPanel ──────────────────────────────────────────────
export interface DebugRequestEntry {
  method: string
  url: string
  status: number | null
  durationMs: number
  timestamp: number
}

const MAX_ENTRIES = 50
const requestLog: DebugRequestEntry[] = []

export function pushRequestEntry(entry: DebugRequestEntry) {
  requestLog.push(entry)
  if (requestLog.length > MAX_ENTRIES) requestLog.shift()
}

export function getRequestLog(): readonly DebugRequestEntry[] {
  return requestLog
}
