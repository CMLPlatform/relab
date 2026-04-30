import type { QueryClient } from '@tanstack/react-query';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import type { StreamView } from '@/services/api/rpiCamera';
import { captureImageFromCamera, captureImageLocally } from '@/services/api/rpiCamera';

export interface CaptureImageParams {
  cameraId: string;
  productId: number;
}

export interface CaptureAllParams {
  cameraIds: string[];
  productId: number;
}

export interface CaptureAllResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ cameraId: string; error: Error }>;
}

export function invalidateProductQuery(queryClient: QueryClient, productId: number) {
  queryClient.invalidateQueries({ queryKey: ['product', productId] }).catch(() => {});
}

export function invalidateCameraListQuery(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['rpiCameras'] }).catch(() => {});
}

export function invalidateCameraDetailQuery(queryClient: QueryClient, cameraId: string) {
  queryClient.invalidateQueries({ queryKey: ['rpiCamera', cameraId] }).catch(() => {});
}

export function invalidateCameraStreamStatusQuery(queryClient: QueryClient, cameraId: string) {
  queryClient.invalidateQueries({ queryKey: ['rpiCameraStreamStatus', cameraId] }).catch(() => {});
}

export function resolveCaptureImageRequest(
  params: CaptureImageParams,
  connectionInfo?: CameraConnectionInfo,
) {
  if (
    connectionInfo?.mode === 'local' &&
    connectionInfo.localBaseUrl &&
    connectionInfo.localApiKey
  ) {
    return captureImageLocally(
      connectionInfo.localBaseUrl,
      connectionInfo.localApiKey,
      params.productId,
    );
  }

  return captureImageFromCamera(params.cameraId, params.productId);
}

export async function captureFromMultipleCameras(
  params: CaptureAllParams,
  connectionInfoMap?: Record<string, CameraConnectionInfo>,
): Promise<CaptureAllResult> {
  const settled = await Promise.allSettled(
    params.cameraIds.map((cameraId) =>
      resolveCaptureImageRequest(
        { cameraId, productId: params.productId },
        connectionInfoMap?.[cameraId],
      ),
    ),
  );

  const errors = settled.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          {
            cameraId: params.cameraIds[index],
            error:
              result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          },
        ]
      : [],
  );

  return {
    total: params.cameraIds.length,
    succeeded: params.cameraIds.length - errors.length,
    failed: errors.length,
    errors,
  };
}

export async function clearOptimisticStreamStatus(
  queryClient: QueryClient,
  cameraId: string,
): Promise<{ previous: StreamView | null | undefined }> {
  await queryClient.cancelQueries({ queryKey: ['rpiCameraStreamStatus', cameraId] });
  const previous = queryClient.getQueryData<StreamView | null>(['rpiCameraStreamStatus', cameraId]);
  queryClient.setQueryData(['rpiCameraStreamStatus', cameraId], null);
  return { previous };
}

export function restoreOptimisticStreamStatus(
  queryClient: QueryClient,
  cameraId: string,
  previous: StreamView | null | undefined,
) {
  if (previous !== undefined) {
    queryClient.setQueryData(['rpiCameraStreamStatus', cameraId], previous);
  }
}
