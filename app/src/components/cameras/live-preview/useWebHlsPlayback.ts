import { useCallback, useState } from 'react';

/** Web HLS playback state; `retryKey` forces a full re-attach after an unrecoverable failure. */
export function useWebHlsPlayback(src: string) {
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState(src);

  // A new source starts a fresh load; drop the previous error.
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
