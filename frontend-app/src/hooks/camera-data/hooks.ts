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

function useInvalidateOnSuccessMutation<TVariables, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn,
    onSuccess,
  });
}

function useCameraListInvalidationMutation<TVariables, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useInvalidateOnSuccessMutation(mutationFn, () => {
    invalidateCameraListQuery(queryClient);
  });
}

function useCameraDetailAndListInvalidationMutation<TVariables, TData = unknown>(
  cameraId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useInvalidateOnSuccessMutation(mutationFn, () => {
    invalidateCameraDetailQuery(queryClient, cameraId);
    invalidateCameraListQuery(queryClient);
  });
}

function useProductInvalidationMutation<TVariables, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      invalidateProductQuery(queryClient, (variables as { productId: number }).productId);
    },
  });
}

function useCameraStreamInvalidationMutation<TVariables, TData = unknown>(
  cameraId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useInvalidateOnSuccessMutation(mutationFn, () => {
    invalidateCameraStreamStatusQuery(queryClient, cameraId);
  });
}

function useOptimisticCameraStreamMutation<TData = unknown>(
  cameraId: string,
  mutationFn: () => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async () => clearOptimisticStreamStatus(queryClient, cameraId),
    onError: (_err, _vars, context) => {
      restoreOptimisticStreamStatus(queryClient, cameraId, context?.previous);
    },
    onSuccess: () => {
      invalidateCameraStreamStatusQuery(queryClient, cameraId);
    },
  });
}

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

export function useUpdateCameraMutation(id: string) {
  return useCameraDetailAndListInvalidationMutation(id, (data: CameraUpdate) =>
    updateCamera(id, data),
  );
}

export function useDeleteCameraMutation() {
  return useCameraListInvalidationMutation((id: string) => deleteCamera(id));
}

export function useClaimPairingMutation() {
  return useCameraListInvalidationMutation((data: PairingClaimRequest) => claimPairingCode(data));
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
  return useProductInvalidationMutation((params: { cameraId: string; productId: number }) =>
    resolveCaptureImageRequest(params, connectionInfo),
  );
}

export function useStreamStatusQuery(
  cameraId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery(streamStatusQueryOptions(cameraId, { enabled }));
}

export function useStartYouTubeStreamMutation(cameraId: string) {
  return useCameraStreamInvalidationMutation(cameraId, (params: StartYouTubeStreamParams) =>
    startYouTubeStream(cameraId, params),
  );
}

export function useStopYouTubeStreamMutation(cameraId: string) {
  return useOptimisticCameraStreamMutation(cameraId, () => stopYouTubeStream(cameraId));
}

export function useCaptureAllMutation(connectionInfoMap?: Record<string, CameraConnectionInfo>) {
  return useProductInvalidationMutation(
    (params: { cameraIds: string[]; productId: number }): Promise<CaptureAllResult> =>
      captureFromMultipleCameras(params, connectionInfoMap),
  );
}

export type { CaptureAllResult } from '@/hooks/camera-data/mutations';
// biome-ignore lint/performance/noBarrelFile: this module intentionally exposes the camera-data surface for hook consumers.
export {
  cameraQueryOptions,
  camerasQueryOptions,
} from '@/hooks/camera-data/queries';
