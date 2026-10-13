import { queryOptions } from '@tanstack/react-query';
import { fetchCamera, fetchCameras } from '@/services/api/r9cam/cameras';
import { getStreamStatus } from '@/services/api/r9cam/streams';

export const cameraListStaleTime = (includeStatus: boolean, includeTelemetry: boolean) => {
  if (includeTelemetry) {
    return 5_000;
  }
  return includeStatus ? 15_000 : 60_000;
};

export const camerasQueryOptions = (
  includeStatus = false,
  { includeTelemetry = false }: { includeTelemetry?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['r9cams', includeStatus, includeTelemetry] as const,
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
    queryKey: ['r9cam', id, includeStatus, includeTelemetry] as const,
    queryFn: () => fetchCamera(id, includeStatus, { includeTelemetry }),
    enabled: !!id,
    staleTime: cameraListStaleTime(includeStatus, includeTelemetry),
    refetchInterval: includeTelemetry ? 5_000 : false,
  });

export const streamStatusQueryOptions = (
  cameraId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: ['r9camStreamStatus', cameraId] as const,
    queryFn: () => {
      if (!cameraId) throw new Error('cameraId is required');
      return getStreamStatus(cameraId);
    },
    enabled: enabled && !!cameraId,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 15_000,
  });
