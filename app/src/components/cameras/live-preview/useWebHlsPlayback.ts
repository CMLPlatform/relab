import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RETRIES = 5;

export function useWebHlsPlayback(src: string) {
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSrc = useRef(src);

  const clearRetryTimer = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  const resetForSourceChange = useCallback(() => {
    if (previousSrc.current !== src) {
      previousSrc.current = src;
      retryCount.current = 0;
    }
  }, [src]);

  const markLive = useCallback(() => {
    setState('live');
    setErrorMessage(null);
  }, []);

  const markError = useCallback((message: string) => {
    setState('error');
    setErrorMessage(message);
  }, []);

  const scheduleRetry = useCallback(() => {
    const delay = Math.min(3000 * 2 ** retryCount.current, 30_000);
    retryCount.current += 1;
    setState('loading');
    retryTimer.current = setTimeout(() => setRetryKey((key) => key + 1), delay);
  }, []);

  const handleFatalError = useCallback(
    (message: string) => {
      if (retryCount.current < MAX_RETRIES) {
        scheduleRetry();
        return;
      }
      markError(message);
    },
    [markError, scheduleRetry],
  );

  const retryNow = useCallback(() => {
    retryCount.current = 0;
    setErrorMessage(null);
    setState('loading');
    setRetryKey((key) => key + 1);
  }, []);

  return {
    state,
    errorMessage,
    retryKey,
    retryNow,
    markLive,
    markError,
    handleFatalError,
    resetForSourceChange,
    clearRetryTimer,
  };
}
