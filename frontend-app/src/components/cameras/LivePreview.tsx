import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import {
  getLivePreviewCaption,
  PreviewPlayer,
} from '@/components/cameras/live-preview/PreviewPlayer';
import {
  PreviewShell,
  livePreviewStyles as styles,
} from '@/components/cameras/live-preview/shared';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import { useCameraLivePreview } from '@/hooks/useRpiCameras';
import type { CameraRead } from '@/services/api/rpiCamera';
// spell-checker: ignore mpegurl

/**
 * LL-HLS live preview for a single camera.
 *
 * Web: renders a ``<video>`` element with [hls.js](https://github.com/video-dev/hls.js/)
 * attached to the playlist URL. When ``connectionInfo.mode`` is ``"local"``, the
 * URL routes through the Pi's FastAPI HLS proxy (``/hls/`` on port 8018) which
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
      return (
        <View style={styles.videoFrame}>
          <View style={styles.overlay}>
            <MaterialCommunityIcons name="video-off" size={32} color="#999" />
            <Text style={styles.overlayText}>Live preview unavailable</Text>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}
