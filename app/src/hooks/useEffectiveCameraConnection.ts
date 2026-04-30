import { useMemo } from 'react';
import {
  type CameraConnectionInfo,
  type UseLocalConnectionResult,
  useLocalConnection,
} from '@/hooks/useLocalConnection';
import type { CameraConnectionStatus, CameraReadWithStatus } from '@/services/api/rpiCamera';

export type EffectiveCameraTransport = 'direct' | 'relay' | 'unreachable';

export interface EffectiveCameraConnection {
  /** Raw backend/relay status. This says whether the backend can reach the Pi via relay. */
  relayStatus: CameraConnectionStatus;
  /** Local direct-connection probe result. */
  localConnection: CameraConnectionInfo;
  /** User-facing status after merging relay and local direct reachability. */
  status: CameraConnectionStatus;
  /** Which path should be used for live preview/capture when reachable. */
  transport: EffectiveCameraTransport;
  /** True when either relay or direct-local transport can reach the camera. */
  isReachable: boolean;
  /** True when backend relay endpoints should be used. */
  canUseRelay: boolean;
  /** True when direct Pi endpoints should be used. */
  canUseDirect: boolean;
  /** Secondary card/status text, if the effective status needs an explanation. */
  detailLabel: string | null;
}

const EMPTY_LOCAL_CONNECTION: CameraConnectionInfo = {
  mode: 'relay',
  localBaseUrl: null,
  localMediaUrl: null,
  localApiKey: null,
};

export function resolveEffectiveCameraConnection(
  camera: Pick<CameraReadWithStatus, 'status'> | null | undefined,
  localConnection: CameraConnectionInfo = EMPTY_LOCAL_CONNECTION,
): EffectiveCameraConnection {
  const relayStatus = camera?.status?.connection ?? 'offline';
  const relayOnline = relayStatus === 'online';
  const directOnline = localConnection.mode === 'local';

  if (directOnline) {
    return {
      relayStatus,
      localConnection,
      status: 'online',
      transport: 'direct',
      isReachable: true,
      canUseRelay: relayOnline,
      canUseDirect: true,
      detailLabel: 'Direct connection',
    };
  }

  if (relayOnline) {
    return {
      relayStatus,
      localConnection,
      status: 'online',
      transport: 'relay',
      isReachable: true,
      canUseRelay: true,
      canUseDirect: false,
      detailLabel: null,
    };
  }

  return {
    relayStatus,
    localConnection,
    status: relayStatus,
    transport: 'unreachable',
    isReachable: false,
    canUseRelay: false,
    canUseDirect: false,
    detailLabel: null,
  };
}

export function useEffectiveCameraConnection(
  camera: Pick<CameraReadWithStatus, 'id' | 'status'> | null | undefined,
  cameraIdFallback = '',
): EffectiveCameraConnection & { localConnection: UseLocalConnectionResult } {
  const cameraId = camera?.id ?? cameraIdFallback;
  const relayOnline = camera?.status?.connection === 'online';
  const localConnection = useLocalConnection(cameraId, { isOnline: relayOnline });

  return useMemo(
    () => resolveEffectiveCameraConnection(camera, localConnection),
    [camera, localConnection],
  ) as EffectiveCameraConnection & { localConnection: UseLocalConnectionResult };
}
