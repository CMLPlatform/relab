import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CameraRead, CameraUpdate, PairingClaimRequest } from '@/services/api/rpiCamera';
import {
  buildCameraHlsUrl,
  captureImageFromCamera,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameras,
  fetchCameraTelemetry,
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
}

/**
 * Build the LL-HLS playlist URL for a camera's always-on lores preview.
 *
 * The URL points at the backend's HLS proxy, which forwards segment fetches
 * through the WebSocket relay to the Pi's local MediaMTX. Pass this URL to
 * ``hls.js`` on web or ``expo-video`` on native — both players handle the
 * playlist walk, segment fetching, and buffering on their own. Typical
 * glass-to-glass latency is ~1.5-3s on LL-HLS, good enough for "frame a
 * product in front of the camera" which is the dominant use case.
 *
 * Returns ``{ hlsUrl: null }`` when disabled or when there's no camera id, so
 * consumers can render a spinner / offline badge without guarding every use.
 */
export function useCameraLivePreview(
  camera: Pick<CameraRead, 'id'> | null,
  { enabled = true }: { enabled?: boolean } = {},
): UseCameraLivePreviewResult {
  if (!enabled || !camera) {
    return { hlsUrl: null };
  }
  return { hlsUrl: buildCameraHlsUrl(camera.id) };
}

export function useCaptureImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cameraId, productId }: { cameraId: string; productId: number }) =>
      captureImageFromCamera(cameraId, productId),
    onSuccess: (_data, { productId }) => {
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}

export interface CaptureAllResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ cameraId: string; error: Error }>;
}

export function useCaptureAllMutation() {
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
        cameraIds.map((id) => captureImageFromCamera(id, productId)),
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
