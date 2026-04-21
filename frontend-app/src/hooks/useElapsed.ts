import { useEffect, useMemo, useState } from 'react';

/**
 * Returns a formatted elapsed time string (M:SS) for the given ISO start
 * timestamp, updated every second. Returns an empty string when startedAt is
 * null (not yet started / stream inactive).
 */
export function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return useMemo(() => {
    if (!startedAt) {
      return '';
    }

    const seconds = Math.floor((now - new Date(startedAt).getTime()) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }, [now, startedAt]);
}
