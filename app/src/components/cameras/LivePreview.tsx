import type { ReactNode } from 'react';
import { Component } from 'react';
import { View } from 'react-native';
import { PreviewPlayer } from '@/components/cameras/live-preview/PreviewPlayer';
import {
  PreviewErrorOverlay,
  PreviewShell,
} from '@/components/cameras/live-preview/previewOverlays';
import type { CameraConnectionInfo } from '@/features/cameras/local-connection/useLocalConnection';
import { useCameraLivePreview } from '@/features/cameras/rpi/hooks';
import type { CameraRead } from '@/services/api/rpiCamera';

/**
 * LL-HLS live preview for one camera. Web uses a ``<video>`` element with
 * hls.js (Safari uses native HLS); native uses ``expo-video``. In local mode
 * the URL goes through the Pi's HLS proxy (``/preview/hls/`` on port 8018),
 * which adds CORS and Private Network Access headers; otherwise the backend
 * relay proxy.
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

  const caption = isLocalStream ? 'Live preview · Direct · <1s' : 'Live preview · LL-HLS';

  return (
    <PreviewShell caption={caption}>
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
  state: { hasError: boolean } = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <PreviewErrorState onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

export function PreviewErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="relative aspect-[4/3] w-full">
      <PreviewErrorOverlay message="Live preview unavailable" onRetry={onRetry} />
    </View>
  );
}
