import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Returns a formatted elapsed time string (M:SS) for the given ISO start
 * timestamp, updated every second. Returns an empty string when startedAt is
 * null (not yet started / stream inactive).
 *
 * The ticker pauses while the app is backgrounded — its consumers (the
 * always-mounted ActiveStreamBanner among them) would otherwise re-render once
 * a second for a clock nobody can see.
 */
export function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) {
      return;
    }
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(Date.now());
    const start = () => {
      id ??= setInterval(tick, 1000);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };

    start(); // mounting means we're foregrounded; the listener handles the rest
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stop();
        return;
      }
      tick(); // catch up on the time that passed while paused
      start();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [startedAt]);

  if (!startedAt) {
    return '';
  }

  // Clamp: a startedAt ahead of the device clock (skew) would otherwise render "-1:-5".
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
