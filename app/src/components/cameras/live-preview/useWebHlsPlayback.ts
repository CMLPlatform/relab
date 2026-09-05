import { useCallback, useState } from 'react';

/**
 * Playback state for the web HLS player. Transient failures are recovered by
 * hls.js itself (see `setupWebHlsVideo`); this hook only tracks what the user
 * sees and, via `retryKey`, lets them force a full re-attach after a failure
 * hls.js could not recover from.
 */
export function useWebHlsPlayback(src: string) {
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState(src);

  // Render-phase reset: a new source starts a fresh load, so drop any error
  // left over from the previous one rather than flashing it over the new stream.
  if (loadedSrc !== src) {
    setLoadedSrc(src);
    setState('loading');
    setErrorMessage(null);
  }

  const markLive = useCallback(() => {
    setState('live');
    setErrorMessage(null);
  }, []);

  const markError = useCallback((message: string) => {
    setState('error');
    setErrorMessage(message);
  }, []);

  const retryNow = useCallback(() => {
    setErrorMessage(null);
    setState('loading');
    setRetryKey((key) => key + 1);
  }, []);

  return { state, errorMessage, retryKey, retryNow, markLive, markError };
}
