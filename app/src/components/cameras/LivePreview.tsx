import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { getLivePreviewCaption } from '@/components/cameras/live-preview/caption';
import { PreviewPlayer } from '@/components/cameras/live-preview/PreviewPlayer';
import { PreviewShell } from '@/components/cameras/live-preview/shared';
import { createLivePreviewStyles } from '@/components/cameras/live-preview/styles';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import { useCameraLivePreview } from '@/hooks/useRpiCameras';
import type { CameraRead } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

/**
 * LL-HLS live preview for a single camera.
 *
 * Web: renders a ``<video>`` element with [hls.js](https://github.com/video-dev/hls.js/)
 * attached to the playlist URL. When ``connectionInfo.mode`` is ``"local"``, the
 * URL routes through the Pi's FastAPI HLS proxy (``/preview/hls/`` on port 8018) which
 * forwards to MediaMTX internally — this lets FastAPI attach CORS and Private
 * Network Access headers to every response, including HLS segments. Latency is
 * ~0.4–0.8 s. Otherwise the backend HLS proxy is used (~1.5–3 s via relay).
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
    <PreviewShell caption={getLivePreviewCaption(isLocalStream)}>
      <PreviewErrorBoundary>
        <PreviewPlayer src={hlsUrl} isLocalStream={isLocalStream} />
      </PreviewErrorBoundary>
    </PreviewShell>
  );
}

// biome-ignore lint/style/useReactFunctionComponents: React error boundaries still require a class component to catch render errors.
export class PreviewErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <PreviewErrorState />;
    }
    return this.props.children;
  }
}

export function PreviewErrorState() {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);

  return (
    <View style={styles.videoFrame}>
      <View style={styles.overlay}>
        <MaterialCommunityIcons name="video-off" size={32} color={theme.tokens.text.muted} />
        <Text style={styles.overlayText}>Live preview unavailable</Text>
      </View>
    </View>
  );
}
