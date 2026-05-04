// ── Structured Error Handling ────────────────────────────────────────────────
// Provides a typed error pipeline: catch → classify → log → surface to user.
// In production, the handleError() sink can be wired to Sentry / Datadog / etc.

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface AppError {
  message: string
  code?: string
  severity: ErrorSeverity
  context?: Record<string, unknown>
  originalError?: unknown
}

/**
 * Central error sink — logs in dev, forwards to external tracker in prod.
 */
export function handleError(error: AppError) {
  if (import.meta.env.DEV) {
    console.group(`[Error] ${error.severity.toUpperCase()}`)
    console.error('Message:', error.message)
    if (error.code) console.error('Code:', error.code)
    if (error.context) console.error('Context:', error.context)
    if (error.originalError) console.error('Original:', error.originalError)
    console.groupEnd()
  }

  // Production: forward to Sentry / external error tracker
  // if (!import.meta.env.DEV && typeof Sentry !== 'undefined') {
  //   Sentry.captureException(error.originalError ?? new Error(error.message), {
  //     tags: { code: error.code, severity: error.severity },
  //     extra: error.context,
  //   })
  // }
}

/**
 * Classify an unknown caught error into a structured AppError.
 * Maps HTTP status codes to user-friendly messages + severity levels.
 */
export function handleApiError(
  error: unknown,
  context: string
): AppError {
  if (error instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (error as any)?.response?.status as number | undefined

    if (status === 401) {
      return {
        message: 'Session expired. Please log in again.',
        code: 'UNAUTHORIZED',
        severity: 'medium',
        context: { location: context },
        originalError: error,
      }
    }

    if (status === 403) {
      return {
        message: "You don't have permission to do that.",
        code: 'FORBIDDEN',
        severity: 'medium',
        context: { location: context },
        originalError: error,
      }
    }

    if (status === 404) {
      return {
        message: 'Resource not found.',
        code: 'NOT_FOUND',
        severity: 'low',
        context: { location: context },
        originalError: error,
      }
    }

    if (status === 409) {
      return {
        message: 'This action conflicts with existing data.',
        code: 'CONFLICT',
        severity: 'low',
        context: { location: context },
        originalError: error,
      }
    }

    if (status === 422) {
      return {
        message: 'Validation failed. Please check your input.',
        code: 'VALIDATION_ERROR',
        severity: 'low',
        context: { location: context },
        originalError: error,
      }
    }

    if (status === 429) {
      return {
        message: 'Too many requests. Please slow down.',
        code: 'RATE_LIMITED',
        severity: 'medium',
        context: { location: context },
        originalError: error,
      }
    }

    if (status && status >= 500) {
      return {
        message: 'Server error. Please try again.',
        code: 'SERVER_ERROR',
        severity: 'high',
        context: { location: context },
        originalError: error,
      }
    }

    // Network error (no response at all)
    if (!status) {
      return {
        message: 'Network error. Check your connection.',
        code: 'NETWORK_ERROR',
        severity: 'high',
        context: { location: context },
        originalError: error,
      }
    }
  }

  return {
    message: 'An unexpected error occurred.',
    code: 'UNKNOWN',
    severity: 'medium',
    context: { location: context },
    originalError: error,
  }
}

/* ──────────────────────────────────────────────────────────────────────────────
 *  getApiErrorMessage — context-aware user-friendly messages
 *
 *  Usage:  setError(getApiErrorMessage(err, 'register'))
 *  The `screen` param lets us tailor the wording per feature area.
 * ────────────────────────────────────────────────────────────────────────────── */

type ScreenContext =
  | 'register'
  | 'login'
  | 'checkin'
  | 'evening-review'
  | 'profile'
  | 'goals'
  | 'tasks'
  | 'ai-coach'
  | 'general'

/** Extract the HTTP status code from an Axios-shaped error. */
function getStatus(error: unknown): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error as any)?.response?.status as number | undefined
}

/** Extract the detail message the backend sent (FastAPI format). */
function getServerDetail(error: unknown): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error as any)?.response?.data?.detail as string | undefined
}

/**
 * Return a short, human-friendly error string for display in the UI.
 * The message is tailored to both the HTTP status and the screen context.
 */
export function getApiErrorMessage(
  error: unknown,
  screen: ScreenContext = 'general'
): string {
  const status = getStatus(error)

  // ── No response at all → network issue ─────────────────────────────────
  if (!status) {
    if (!navigator.onLine) {
      return 'You appear to be offline. Please check your internet connection and try again.'
    }
    return 'Unable to reach the server. Please check your connection or try again in a moment.'
  }

  // ── Context-specific messages per status ────────────────────────────────
  switch (status) {
    // 400 Bad Request
    case 400:
      return 'Something was wrong with that request. Please double-check your input and try again.'

    // 401 Unauthorized
    case 401:
      if (screen === 'login') {
        return 'Incorrect email or password. Please try again.'
      }
      return 'Your session has expired. Please sign in again to continue.'

    // 403 Forbidden
    case 403:
      return "You don't have permission to perform this action."

    // 404 Not Found
    case 404:
      if (screen === 'goals') return 'This goal could not be found. It may have been deleted.'
      if (screen === 'tasks') return 'This task could not be found. It may have been deleted.'
      if (screen === 'profile') return 'Your profile could not be loaded. Please try signing in again.'
      return 'The requested resource could not be found.'

    // 409 Conflict
    case 409:
      if (screen === 'register') {
        return 'An account with this email already exists. Try signing in instead.'
      }
      if (screen === 'checkin') {
        return "You've already completed today's check-in. Come back tomorrow!"
      }
      if (screen === 'evening-review') {
        return "You've already submitted tonight's evening review."
      }
      if (screen === 'tasks') {
        return 'This task conflicts with an existing entry. Please refresh and try again.'
      }
      if (screen === 'goals') {
        return 'This goal conflicts with an existing one. Please refresh and try again.'
      }
      return getServerDetail(error) || 'This action conflicts with existing data. Please refresh and try again.'

    // 422 Validation Error
    case 422: {
      const detail = getServerDetail(error)
      if (detail) return detail
      if (screen === 'register') return 'Please check that all fields are filled in correctly.'
      if (screen === 'login') return 'Please enter a valid email address and password.'
      return 'Please check your input and try again.'
    }

    // 429 Rate Limited
    case 429:
      if (screen === 'ai-coach') {
        return "You've reached the AI Coach limit for now. Please wait a few minutes before trying again."
      }
      return 'Too many requests. Please wait a moment before trying again.'

    // 500+ Server Error
    default:
      if (status >= 500) {
        return "Something went wrong on our end. We're looking into it — please try again shortly."
      }
      return 'An unexpected error occurred. Please try again.'
  }
}
