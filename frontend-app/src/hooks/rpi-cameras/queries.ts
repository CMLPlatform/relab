import { queryOptions } from '@tanstack/react-query';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import {
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameraSnapshotLocally,
  fetchCameras,
  fetchCameraTelemetry,
  getStreamStatus,
} from '@/services/api/rpiCamera';

export const cameraListStaleTime = (includeStatus: boolean, includeTelemetry: boolean): number => {
  if (includeTelemetry) {
    return 5_000;
  }
  return includeStatus ? 15_000 : 60_000;
};

export function resolveSnapshotTransport(connectionInfo?: CameraConnectionInfo) {
  const localSnapshotBaseUrl =
    connectionInfo?.mode === 'local' ? connectionInfo.localBaseUrl : null;
  const localSnapshotApiKey = connectionInfo?.mode === 'local' ? connectionInfo.localApiKey : null;

  return {
    localSnapshotBaseUrl,
    localSnapshotApiKey,
    isLocalSnapshot: !!localSnapshotBaseUrl && !!localSnapshotApiKey,
  };
}

export async function fetchSnapshotForConnection(
  cameraId: string,
  signal: AbortSignal,
  connectionInfo?: CameraConnectionInfo,
) {
  const { localSnapshotBaseUrl, localSnapshotApiKey } = resolveSnapshotTransport(connectionInfo);

  if (localSnapshotBaseUrl && localSnapshotApiKey) {
    return fetchCameraSnapshotLocally(localSnapshotBaseUrl, localSnapshotApiKey, signal);
  }

  return fetchCameraSnapshot(cameraId, signal);
}

export const camerasQueryOptions = (
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['rpiCameras', includeStatus, includeTelemetry] as const,
    queryFn: () => fetchCameras(includeStatus, { includeTelemetry }),
    staleTime: cameraListStaleTime(includeStatus, includeTelemetry),
    refetchInterval: includeTelemetry ? 5_000 : false,
  });

export const cameraQueryOptions = (
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['rpiCamera', id, includeStatus, includeTelemetry] as const,
    queryFn: () => fetchCamera(id, includeStatus, { includeTelemetry }),
    enabled: !!id,
    staleTime: cameraListStaleTime(includeStatus, includeTelemetry),
    refetchInterval: includeTelemetry ? 5_000 : false,
  });

export const cameraTelemetryQueryOptions = (
  cameraId: string | null,
  { enabled = true, refetchInterval = 5_000 }: { enabled?: boolean; refetchInterval?: number } = {},
) =>
  queryOptions({
    queryKey: ['rpiCameraTelemetry', cameraId] as const,
    queryFn: () => {
      if (!cameraId) throw new Error('cameraId is required');
      return fetchCameraTelemetry(cameraId);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: refetchInterval,
  });

export const cameraSnapshotQueryOptions = (
  cameraId: string | null,
  {
    enabled = true,
    connectionInfo,
    refetchInterval = 30_000,
  }: {
    enabled?: boolean;
    connectionInfo?: CameraConnectionInfo;
    refetchInterval?: number;
  } = {},
) => {
  const { localSnapshotBaseUrl, isLocalSnapshot } = resolveSnapshotTransport(connectionInfo);

  return queryOptions({
    queryKey: [
      'rpiCameraSnapshot',
      cameraId,
      isLocalSnapshot ? localSnapshotBaseUrl : 'relay',
    ] as const,
    queryFn: ({ signal }) => {
      if (!cameraId) throw new Error('cameraId is required');
      return fetchSnapshotForConnection(cameraId, signal, connectionInfo);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: refetchInterval,
    retry: false as const,
  });
};

export const streamStatusQueryOptions = (
  cameraId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['rpiCameraStreamStatus', cameraId] as const,
    queryFn: () => {
      if (!cameraId) throw new Error('cameraId is required');
      return getStreamStatus(cameraId);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 15_000,
  });
