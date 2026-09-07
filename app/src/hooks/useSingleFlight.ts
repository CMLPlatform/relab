import { useCallback, useRef } from 'react';

/**
 * Ignores calls that arrive while the async action is still running. React
 * state cannot guard this: two events in one tick read the same stale `false`.
 */
export function useSingleFlight<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<void> {
  const inFlight = useRef(false);

  return useCallback(
    async (...args: A) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await fn(...args);
      } finally {
        inFlight.current = false;
      }
    },
    [fn],
  );
}
