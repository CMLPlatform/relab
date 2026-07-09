import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { PreviewErrorOverlay, PreviewLoadingOverlay } from './previewOverlays';
import { createLivePreviewStyles, createWebVideoStyle } from './styles';
import { useWebHlsPlayback } from './useWebHlsPlayback';
import { setupWebHlsVideo } from './webHlsVideoHelpers';

export function WebHlsVideo({
  src,
  withCredentials = true,
}: {
  src: string;
  withCredentials?: boolean;
}) {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  const videoStyle = createWebVideoStyle(theme);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { state, errorMessage, retryKey, retryNow, markLive, markError } = useWebHlsPlayback(src);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey is a re-run trigger, not a value read here — bumping it tears down the player and re-attaches it.
  useEffect(() => {
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
      if (cleanup) cleanup();
    };
  }, [markError, markLive, retryKey, src, withCredentials]);

  return (
    <View style={styles.videoFrame}>
      {createElement('video', {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: videoStyle,
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
