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
