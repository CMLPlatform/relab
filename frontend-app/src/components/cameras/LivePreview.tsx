import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import { useCameraLivePreview } from '@/hooks/useRpiCameras';
import type { CameraRead } from '@/services/api/rpiCamera';
// spell-checker: ignore mpegurl

/**
 * LL-HLS live preview for a single camera.
 *
 * Web: renders a ``<video>`` element with [hls.js](https://github.com/video-dev/hls.js/)
 * attached to the playlist URL. When ``connectionInfo.mode`` is ``"local"``, the
 * URL points directly at the Pi's MediaMTX, reducing latency to ~0.4–0.8 s.
 * Otherwise the backend HLS proxy is used (~1.5–3 s via relay).
 * Safari/iOS-on-web uses the browser's native HLS playback path.
 *
 * Native (iOS/Android in the Expo app): uses ``expo-video`` which speaks HLS
 * out of the box. Same URL switching logic applies.
 *
 * Either way, the parent only needs to pass a camera; URL selection is handled
 * internally based on the connection mode.
 */

export function LivePreview({
  camera,
  enabled = true,
  connectionInfo,
}: {
  camera: Pick<CameraRead, 'id'> | null;
  enabled?: boolean;
  connectionInfo?: CameraConnectionInfo;
}) {
  const { hlsUrl, isLocalStream } = useCameraLivePreview(camera, { enabled, connectionInfo });

  if (!hlsUrl) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        {Platform.OS === 'web' ? (
          <WebHlsVideo src={hlsUrl} withCredentials={!isLocalStream} />
        ) : (
          <NativeHlsVideo src={hlsUrl} />
        )}
        <Text variant="bodySmall" style={styles.caption}>
          {isLocalStream ? 'Live preview · Direct · <1s' : 'Live preview · LL-HLS'}
        </Text>
      </Card.Content>
    </Card>
  );
}

// ─── Web player (hls.js + native Safari) ──────────────────────────────────────

function WebHlsVideo({ src, withCredentials = true }: { src: string; withCredentials?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onPlaying = () => {
      if (!cancelled) setState('live');
    };
    video.addEventListener('playing', onPlaying);

    // Safari and iOS-on-web ship native HLS — feed it the URL directly and
    // skip hls.js entirely. Everything else gets the JS-side MSE player.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // For relay mode: send the session cookie for cross-origin auth.
      // For local mode (MediaMTX direct): anonymous requests are fine.
      video.crossOrigin = withCredentials ? 'use-credentials' : 'anonymous';
      video.src = src;
      video.play().catch(() => {
        // Autoplay rejections are common; the browser shows its own UI.
      });
      cleanup = () => {
        video.removeEventListener('playing', onPlaying);
        video.removeAttribute('src');
        video.load();
      };
    } else {
      // Dynamic import keeps hls.js out of the native bundle.
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setState('error');
          setErrorMessage('Live preview is not supported in this browser.');
          return;
        }
        const hls = new Hls({
          // LL-HLS tuning — match the MediaMTX 200ms part duration so the
          // player asks for new parts as soon as MediaMTX produces them.
          lowLatencyMode: true,
          backBufferLength: 4,
          maxBufferLength: 4,
          // Relay mode: the backend HLS endpoint requires the user's session
          // cookie for cross-origin requests. Local (MediaMTX direct) mode:
          // no auth needed, omit credentials to avoid preflight rejections.
          xhrSetup: withCredentials
            ? (xhr) => {
                xhr.withCredentials = true;
              }
            : undefined,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setState('error');
            setErrorMessage(data.details ?? 'HLS playback failed');
          }
        });
        cleanup = () => {
          video.removeEventListener('playing', onPlaying);
          hls.destroy();
        };
      });
    }

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [src, withCredentials]);

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
      {state === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size={24} />
          <Text style={styles.overlayText}>Loading preview…</Text>
        </View>
      )}
      {state === 'error' && (
        <View style={styles.overlay}>
          <MaterialCommunityIcons name="video-off" size={32} color="#999" />
          <Text style={styles.overlayText}>{errorMessage ?? 'Live preview unavailable'}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Native player (expo-video) ───────────────────────────────────────────────

function NativeHlsVideo({ src }: { src: string }) {
  const player = useVideoPlayer(src, (instance) => {
    instance.muted = true;
    instance.loop = false;
    instance.play();
  });

  return (
    <View style={styles.videoFrame}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#000' }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  content: {
    alignItems: 'center',
    gap: 8,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  overlayText: {
    color: '#fff',
    textAlign: 'center',
  },
  caption: {
    color: '#999',
  },
});
