import { isAxiosError } from 'axios';

/**
 * Extract a user-friendly error message from an unknown caught error.
 * Handles Axios errors (with server `detail` field) and generic Error instances.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    return (error.response?.data as Record<string, string> | undefined)?.detail ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
