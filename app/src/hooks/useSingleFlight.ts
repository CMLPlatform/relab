import { useCallback, useRef } from 'react';

/**
 * Wraps an async action so calls that arrive while it is still running are
 * ignored. React state (`isPending`, `isSubmitting`, `busy`) cannot guard this:
 * two events in the same tick both read the stale `false` from their closure,
 * and buttons stay pressable while a request is in flight. A ref is the only
 * guard that actually single-flights a double tap — which otherwise stacks
 * dialogs, navigates twice, burns a single-use code, or duplicates a write.
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
