/**
 * Type guard for TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return (
    error instanceof TimeoutError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as any).name === 'TimeoutError' &&
      typeof (error as any).timeoutMs === 'number')
  );
}
export const DEFAULT_API_TIMEOUT_MS = 15_000;

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export type TimedRequestInit = RequestInit & {
  timeoutMs?: number;
};

export async function fetchWithTimeout(url: string | URL, options: TimedRequestInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal, ...requestOptions } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(url, { ...requestOptions, signal });
  }

  const controller = new AbortController();
  let didTimeout = false;
  const onAbort = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  }

  signal?.addEventListener('abort', onAbort, { once: true });

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  // If we're in a Node.js environment (like Jest), unref the timer so it doesn't
  // keep the process alive if the request is still pending during teardown.
  if (timeoutId && typeof timeoutId === 'object' && 'unref' in timeoutId) {
    (timeoutId as any).unref();
  }

  try {
    return await fetch(url, { ...requestOptions, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      throw new TimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}
