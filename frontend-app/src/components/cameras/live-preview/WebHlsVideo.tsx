import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { PreviewErrorOverlay, PreviewLoadingOverlay, livePreviewStyles as styles } from './shared';
import { useWebHlsPlayback } from './useWebHlsPlayback';

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
    retryKey,
    retryNow,
    markLive,
    markError,
    handleFatalError,
    resetForSourceChange,
    clearRetryTimer,
  } = useWebHlsPlayback(src);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey intentionally retriggers player setup for explicit retries
  useEffect(() => {
    clearRetryTimer();
    resetForSourceChange();

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onPlaying = () => {
      if (!cancelled) markLive();
    };
    video.addEventListener('playing', onPlaying);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.crossOrigin = withCredentials ? 'use-credentials' : 'anonymous';
      video.src = src;
      video.play().catch(() => {});
      const onError = () => {
        if (cancelled) return;
        handleFatalError('HLS playback failed');
      };
      video.addEventListener('error', onError);
      cleanup = () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
      };
    } else {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            markError('Live preview is not supported in this browser.');
            return;
          }
          const hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 4,
            maxBufferLength: 4,
            xhrSetup: withCredentials
              ? (xhr) => {
                  xhr.withCredentials = true;
                }
              : undefined,
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && !cancelled) {
              handleFatalError(data.details ?? 'HLS playback failed');
            }
          });
          cleanup = () => {
            video.removeEventListener('playing', onPlaying);
            hls.destroy();
          };
        })
        .catch(() => {
          if (!cancelled) {
            markError('Live preview unavailable');
          }
        })
        .finally(() => {
          if (cleanup || cancelled) {
            return;
          }
          cleanup = () => {
            video.removeEventListener('playing', onPlaying);
          };
        });
    }

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
    retryKey,
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
