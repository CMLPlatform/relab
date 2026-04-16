import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CaptureAllResult,
  captureFromMultipleCameras,
  clearOptimisticStreamStatus,
  invalidateCameraDetailQuery,
  invalidateCameraListQuery,
  invalidateCameraStreamStatusQuery,
  invalidateProductQuery,
  resolveCaptureImageRequest,
  restoreOptimisticStreamStatus,
} from '@/hooks/camera-data/mutations';
import {
  type CameraLivePreviewResult,
  resolveCameraLivePreview,
} from '@/hooks/camera-data/previews';
import {
  cameraQueryOptions,
  cameraSnapshotQueryOptions,
  camerasQueryOptions,
  cameraTelemetryQueryOptions,
  streamStatusQueryOptions,
} from '@/hooks/camera-data/queries';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import type {
  CameraUpdate,
  PairingClaimRequest,
  StartYouTubeStreamParams,
} from '@/services/api/rpiCamera';
import {
  claimPairingCode,
  deleteCamera,
  startYouTubeStream,
  stopYouTubeStream,
  updateCamera,
} from '@/services/api/rpiCamera';

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
  return useQuery(cameraTelemetryQueryOptions(cameraId, { enabled, refetchInterval }));
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
  return useQuery(
    cameraSnapshotQueryOptions(cameraId, { enabled, connectionInfo, refetchInterval }),
  );
}

export function useUpdateCameraMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CameraUpdate) => updateCamera(id, data),
    onSuccess: () => {
      invalidateCameraDetailQuery(queryClient, id);
      invalidateCameraListQuery(queryClient);
    },
  });
}

export function useDeleteCameraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSuccess: () => {
      invalidateCameraListQuery(queryClient);
    },
  });
}

export function useClaimPairingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PairingClaimRequest) => claimPairingCode(data),
    onSuccess: () => {
      invalidateCameraListQuery(queryClient);
    },
  });
}

export function useCameraLivePreview(
  camera: { id: string } | null,
  {
    enabled = true,
    connectionInfo,
  }: { enabled?: boolean; connectionInfo?: CameraConnectionInfo } = {},
): CameraLivePreviewResult {
  return resolveCameraLivePreview(camera?.id ?? null, { enabled, connectionInfo });
}

export function useCaptureImageMutation(connectionInfo?: CameraConnectionInfo) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { cameraId: string; productId: number }) =>
      resolveCaptureImageRequest(params, connectionInfo),
    onSuccess: (_data, { productId }) => {
      invalidateProductQuery(queryClient, productId);
    },
  });
}

export function useStreamStatusQuery(
  cameraId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery(streamStatusQueryOptions(cameraId, { enabled }));
}

export function useStartYouTubeStreamMutation(cameraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: StartYouTubeStreamParams) => startYouTubeStream(cameraId, params),
    onSuccess: () => {
      invalidateCameraStreamStatusQuery(queryClient, cameraId);
    },
  });
}

export function useStopYouTubeStreamMutation(cameraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopYouTubeStream(cameraId),
    onMutate: async () => clearOptimisticStreamStatus(queryClient, cameraId),
    onError: (_err, _vars, context) => {
      restoreOptimisticStreamStatus(queryClient, cameraId, context?.previous);
    },
    onSuccess: () => {
      invalidateCameraStreamStatusQuery(queryClient, cameraId);
    },
  });
}

export function useCaptureAllMutation(connectionInfoMap?: Record<string, CameraConnectionInfo>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { cameraIds: string[]; productId: number }): Promise<CaptureAllResult> =>
      captureFromMultipleCameras(params, connectionInfoMap),
    onSuccess: (_data, { productId }) => {
      invalidateProductQuery(queryClient, productId);
    },
  });
}

export type { CaptureAllResult } from '@/hooks/camera-data/mutations';
export {
  cameraQueryOptions,
  camerasQueryOptions,
} from '@/hooks/camera-data/queries';
