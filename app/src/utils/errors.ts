import { ApiError } from '@/services/api/errors';

/**
 * User-facing text for a failure. Network failures (fetch throws a TypeError) and 5xx
 * responses get fixed plain-language copy; every other Error keeps its own message, which
 * is deliberate user-facing copy or a 4xx detail from the server.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return "Can't reach Relab. Check your connection and try again.";
  if (error instanceof ApiError && error.status >= 500) {
    return 'Relab had a problem on its side. Try again in a moment.';
  }
  return (error instanceof Error && error.message) || fallback;
}
