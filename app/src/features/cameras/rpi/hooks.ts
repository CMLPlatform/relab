import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useMemo } from 'react';
import type { CameraConnectionInfo } from '@/features/cameras/local-connection/useLocalConnection';
import { invalidateProductQuery } from '@/features/products/queries';
import type { CameraUpdate, PairingClaimRequest } from '@/services/api/rpiCamera';
import {
  claimPairingCode,
  deleteCamera,
  stopYouTubeStream,
  updateCamera,
} from '@/services/api/rpiCamera';
import {
  type CaptureAllResult,
  captureFromMultipleCameras,
  clearOptimisticStreamStatus,
  invalidateCameraDetailQuery,
  invalidateCameraListQuery,
  invalidateCameraStreamStatusQuery,
  resolveCaptureImageRequest,
  restoreOptimisticStreamStatus,
} from './mutations';
import { type CameraLivePreviewResult, resolveCameraLivePreview } from './previews';
import {
  cameraQueryOptions,
  camerasQueryOptions,
  cameraTelemetryQueryOptions,
  streamStatusQueryOptions,
} from './queries';

// Shared by useDeleteCameraMutation and useClaimPairingMutation, which both
// just need the camera list invalidated on success.
function useCameraListInvalidationMutation<TVariables, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateCameraListQuery(queryClient),
  });
}

// Shared by useCaptureImageMutation and useCaptureAllMutation, which both
// need the owning product's query invalidated on success.
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

export function useCamerasQuery(
  includeStatus = false,
  {
    enabled = true,
    includeTelemetry = false,
  }: { enabled?: boolean; includeTelemetry?: boolean } = {},
) {
  // Stop polling (and live updates) while the screen is stacked behind another.
  const subscribed = useIsFocused();
  return useQuery({
    ...camerasQueryOptions(includeStatus, { includeTelemetry }),
    enabled,
    subscribed,
  });
}

export function useCameraQuery(
  id: string,
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) {
  const subscribed = useIsFocused();
  return useQuery({ ...cameraQueryOptions(id, includeStatus, { includeTelemetry }), subscribed });
}

export function useCameraTelemetryQuery(
  cameraId: string | null,
  { enabled = true, refetchInterval = 5_000 }: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const subscribed = useIsFocused();
  return useQuery({
    ...cameraTelemetryQueryOptions(cameraId, { enabled, refetchInterval }),
    subscribed,
  });
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
  const cameraId = camera?.id ?? null;
  // Stable identity: consumers pass this straight into the video player's source
  // and effect deps, so a fresh object each render restarts the live stream.
  return useMemo(
    () => resolveCameraLivePreview(cameraId, { enabled, connectionInfo }),
    [cameraId, enabled, connectionInfo],
  );
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
  const subscribed = useIsFocused();
  return useQuery({ ...streamStatusQueryOptions(cameraId, { enabled }), subscribed });
}

export function useStopYouTubeStreamMutation(cameraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopYouTubeStream(cameraId),
    onMutate: async () => clearOptimisticStreamStatus(queryClient, cameraId),
    onError: (_err, _vars, context) => {
      restoreOptimisticStreamStatus(queryClient, cameraId, context?.previous);
    },
    onSuccess: () => invalidateCameraStreamStatusQuery(queryClient, cameraId),
  });
}

export function useCaptureAllMutation(connectionInfoMap?: Record<string, CameraConnectionInfo>) {
  return useProductInvalidationMutation(
    (params: { cameraIds: string[]; productId: number }): Promise<CaptureAllResult> =>
      captureFromMultipleCameras(params, connectionInfoMap),
  );
}

export type { CaptureAllResult } from './mutations';
// biome-ignore lint/performance/noBarrelFile: this module intentionally exposes the camera-data surface for hook consumers.
export {
  cameraQueryOptions,
  camerasQueryOptions,
} from './queries';
