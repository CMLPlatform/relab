import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { PreviewErrorOverlay, PreviewLoadingOverlay } from './shared';
import { livePreviewStyles as styles } from './styles';
import { useWebHlsPlayback } from './useWebHlsPlayback';
import { setupWebHlsVideo } from './webHlsVideoHelpers';

export function WebHlsVideo({
  src,
  withCredentials = true,
}: {
  src: string;
  withCredentials?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const {
    state,
    errorMessage,
    retryNow,
    markLive,
    markError,
    handleFatalError,
    resetForSourceChange,
    clearRetryTimer,
  } = useWebHlsPlayback(src);

  useEffect(() => {
    clearRetryTimer();
    resetForSourceChange();

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    setupWebHlsVideo({
      video,
      src,
      withCredentials,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => cancelled,
    })
      .then((nextCleanup) => {
        if (cancelled) {
          nextCleanup();
          return;
        }
        cleanup = nextCleanup;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearRetryTimer();
      if (cleanup) cleanup();
    };
  }, [
    clearRetryTimer,
    handleFatalError,
    markError,
    markLive,
    resetForSourceChange,
    src,
    withCredentials,
  ]);

  return (
    <View style={styles.videoFrame}>
      {createElement('video', {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: {
          width: '100%',
          height: '100%',
          borderRadius: 8,
          objectFit: 'contain',
          backgroundColor: '#000',
        },
      })}
      {state === 'loading' ? <PreviewLoadingOverlay /> : null}
      {state === 'error' ? (
        <PreviewErrorOverlay
          message={errorMessage ?? 'Live preview unavailable'}
          onRetry={retryNow}
        />
      ) : null}
    </View>
  );
}
