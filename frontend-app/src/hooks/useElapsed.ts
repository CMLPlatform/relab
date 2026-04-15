import { useEffect, useState } from 'react';

/**
 * Returns a formatted elapsed time string (M:SS) for the given ISO start
 * timestamp, updated every second. Returns an empty string when startedAt is
 * null (not yet started / stream inactive).
 */
export function useElapsed(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
