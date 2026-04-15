import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import type {
  CameraRead,
  CameraUpdate,
  PairingClaimRequest,
  StartYouTubeStreamParams,
  StreamView,
} from '@/services/api/rpiCamera';
import {
  buildCameraHlsUrl,
  buildLocalHlsUrl,
  captureImageFromCamera,
  captureImageLocally,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameraSnapshotLocally,
  fetchCameras,
  fetchCameraTelemetry,
  getStreamStatus,
  startYouTubeStream,
  stopYouTubeStream,
  updateCamera,
} from '@/services/api/rpiCamera';

export const camerasQueryOptions = (
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['rpiCameras', includeStatus, includeTelemetry] as const,
    queryFn: () => fetchCameras(includeStatus, { includeTelemetry }),
    // Mosaic polling cadence: 5s when telemetry is on, otherwise the existing
    // 15s for status-only, 60s for plain camera list.
    staleTime: includeTelemetry ? 5_000 : includeStatus ? 15_000 : 60_000,
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
    staleTime: includeTelemetry ? 5_000 : includeStatus ? 15_000 : 60_000,
    refetchInterval: includeTelemetry ? 5_000 : false,
  });

export function useCamerasQuery(
  includeStatus = false,
  {
    enabled = true,
    includeTelemetry = false,
  }: { enabled?: boolean; includeTelemetry?: boolean } = {},
) {
  return useQuery({ ...camerasQueryOptions(includeStatus, { includeTelemetry }), enabled });
}

export function useCameraQuery(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) {
  return useQuery(cameraQueryOptions(id, includeStatus, { includeTelemetry }));
}

export function useCameraTelemetryQuery(
  cameraId: string | null,
  { enabled = true, refetchInterval = 5_000 }: { enabled?: boolean; refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['rpiCameraTelemetry', cameraId] as const,
    queryFn: () => {
      if (!cameraId) throw new Error('cameraId is required');
      return fetchCameraTelemetry(cameraId);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: refetchInterval,
  });
}

export function useCameraSnapshotQuery(
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
) {
  const localSnapshotBaseUrl =
    connectionInfo?.mode === 'local' ? connectionInfo.localBaseUrl : null;
  const localSnapshotApiKey = connectionInfo?.mode === 'local' ? connectionInfo.localApiKey : null;
  const isLocalSnapshot = !!localSnapshotBaseUrl && !!localSnapshotApiKey;

  return useQuery({
    queryKey: [
      'rpiCameraSnapshot',
      cameraId,
      isLocalSnapshot ? localSnapshotBaseUrl : 'relay',
    ] as const,
    queryFn: ({ signal }) => {
      if (!cameraId) throw new Error('cameraId is required');
      if (localSnapshotBaseUrl && localSnapshotApiKey) {
        return fetchCameraSnapshotLocally(localSnapshotBaseUrl, localSnapshotApiKey, signal);
      }
      return fetchCameraSnapshot(cameraId, signal);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? refetchInterval : false,
    staleTime: refetchInterval,
    retry: false,
  });
}

export function useUpdateCameraMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CameraUpdate) => updateCamera(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCamera', id] });
      void queryClient.invalidateQueries({ queryKey: ['rpiCameras'] });
    },
  });
}

export function useDeleteCameraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCameras'] });
    },
  });
}

export function useClaimPairingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PairingClaimRequest) => claimPairingCode(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCameras'] });
    },
  });
}

export interface UseCameraLivePreviewResult {
  hlsUrl: string | null;
  /** True when the URL points directly at the Pi's MediaMTX (local mode). */
  isLocalStream: boolean;
}

/**
 * Build the LL-HLS playlist URL for a camera's always-on lores preview.
 *
 * When ``connectionInfo`` is provided and its mode is ``"local"``, the URL
 * points directly at the Pi's MediaMTX (:8888), bypassing the backend relay.
 * This reduces glass-to-glass latency from ~1.5–3 s to ~0.4–0.8 s.
 *
 * Without ``connectionInfo`` (or when mode is ``"relay"``), the URL points at
 * the backend's HLS proxy which forwards segment fetches through the WebSocket
 * relay to the Pi's local MediaMTX.
 *
 * Returns ``{ hlsUrl: null }`` when disabled or when there's no camera id, so
 * consumers can render a spinner / offline badge without guarding every use.
 */
export function useCameraLivePreview(
  camera: Pick<CameraRead, 'id'> | null,
  {
    enabled = true,
    connectionInfo,
  }: { enabled?: boolean; connectionInfo?: CameraConnectionInfo } = {},
): UseCameraLivePreviewResult {
  if (!enabled || !camera) {
    return { hlsUrl: null, isLocalStream: false };
  }
  if (connectionInfo?.mode === 'local' && connectionInfo.localBaseUrl) {
    return { hlsUrl: buildLocalHlsUrl(connectionInfo.localBaseUrl), isLocalStream: true };
  }
  return { hlsUrl: buildCameraHlsUrl(camera.id), isLocalStream: false };
}

export function useCaptureImageMutation(connectionInfo?: CameraConnectionInfo) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cameraId, productId }: { cameraId: string; productId: number }) => {
      if (
        connectionInfo?.mode === 'local' &&
        connectionInfo.localBaseUrl &&
        connectionInfo.localApiKey
      ) {
        return captureImageLocally(
          connectionInfo.localBaseUrl,
          connectionInfo.localApiKey,
          productId,
        );
      }
      return captureImageFromCamera(cameraId, productId);
    },
    onSuccess: (_data, { productId }) => {
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}

export function useStreamStatusQuery(
  cameraId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['rpiCameraStreamStatus', cameraId] as const,
    queryFn: () => {
      if (!cameraId) throw new Error('cameraId is required');
      return getStreamStatus(cameraId);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 15_000,
  });
}

export function useStartYouTubeStreamMutation(cameraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: StartYouTubeStreamParams) => startYouTubeStream(cameraId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCameraStreamStatus', cameraId] });
    },
  });
}

export function useStopYouTubeStreamMutation(cameraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopYouTubeStream(cameraId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rpiCameraStreamStatus', cameraId] });
      const previous = queryClient.getQueryData<StreamView | null>([
        'rpiCameraStreamStatus',
        cameraId,
      ]);
      queryClient.setQueryData(['rpiCameraStreamStatus', cameraId], null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['rpiCameraStreamStatus', cameraId], context.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCameraStreamStatus', cameraId] });
    },
  });
}

export interface CaptureAllResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ cameraId: string; error: Error }>;
}

export function useCaptureAllMutation(connectionInfoMap?: Record<string, CameraConnectionInfo>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cameraIds,
      productId,
    }: {
      cameraIds: string[];
      productId: number;
    }): Promise<CaptureAllResult> => {
      const settled = await Promise.allSettled(
        cameraIds.map((id) => {
          const info = connectionInfoMap?.[id];
          if (info?.mode === 'local' && info.localBaseUrl && info.localApiKey) {
            return captureImageLocally(info.localBaseUrl, info.localApiKey, productId);
          }
          return captureImageFromCamera(id, productId);
        }),
      );
      const errors = settled.flatMap((res, i) =>
        res.status === 'rejected'
          ? [
              {
                cameraId: cameraIds[i],
                error: res.reason instanceof Error ? res.reason : new Error(String(res.reason)),
              },
            ]
          : [],
      );
      return {
        total: cameraIds.length,
        succeeded: cameraIds.length - errors.length,
        failed: errors.length,
        errors,
      };
    },
    onSuccess: (_data, { productId }) => {
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}
