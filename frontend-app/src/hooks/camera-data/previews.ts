import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import { buildCameraHlsUrl, buildLocalHlsUrl } from '@/services/api/rpiCamera';

export interface CameraLivePreviewResult {
  hlsUrl: string | null;
  isLocalStream: boolean;
}

export function resolveCameraLivePreview(
  cameraId: string | null,
  {
    enabled = true,
    connectionInfo,
  }: { enabled?: boolean; connectionInfo?: CameraConnectionInfo } = {},
): CameraLivePreviewResult {
  if (!enabled || !cameraId) {
    return { hlsUrl: null, isLocalStream: false };
  }

  if (connectionInfo?.mode === 'local' && connectionInfo.localBaseUrl) {
    return {
      hlsUrl: buildLocalHlsUrl(connectionInfo.localBaseUrl),
      isLocalStream: true,
    };
  }

  return {
    hlsUrl: buildCameraHlsUrl(cameraId),
    isLocalStream: false,
  };
}
