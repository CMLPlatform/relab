import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { CameraRead, CameraUpdate, PairingClaimRequest } from '@/services/api/rpiCamera';
import {
  CameraSnapshotError,
  captureImageFromCamera,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameras,
  updateCamera,
} from '@/services/api/rpiCamera';

export const camerasQueryOptions = (includeStatus = false) =>
  queryOptions({
    queryKey: ['rpiCameras', includeStatus] as const,
    queryFn: () => fetchCameras(includeStatus),
    staleTime: includeStatus ? 15_000 : 60_000,
  });

export const cameraQueryOptions = (id: string, includeStatus = false) =>
  queryOptions({
    queryKey: ['rpiCamera', id, includeStatus] as const,
    queryFn: () => fetchCamera(id, includeStatus),
    enabled: !!id,
    staleTime: includeStatus ? 15_000 : 60_000,
  });

export function useCamerasQuery(
  includeStatus = false,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({ ...camerasQueryOptions(includeStatus), enabled });
}

export function useCameraQuery(id: string, includeStatus = false) {
  return useQuery(cameraQueryOptions(id, includeStatus));
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

export function useCameraPreview(
  camera: Pick<CameraRead, 'id'> | null,
  { enabled = false, intervalMs = 1000 }: { enabled?: boolean; intervalMs?: number } = {},
) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const cameraId = camera?.id ?? null;

  useEffect(() => {
    if (!enabled || !cameraId) {
      setSnapshotUrl(null);
      setError(null);
      return;
    }

    const revokePrev = () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
        previousUrlRef.current = null;
      }
    };

    const setFrame = (url: string) => {
      const toRevoke = previousUrlRef.current;
      previousUrlRef.current = url;
      setSnapshotUrl(url);
      setError(null);
      if (toRevoke) requestAnimationFrame(() => URL.revokeObjectURL(toRevoke));
    };

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let consecutiveFailures = 0;

    const clearTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const getNextDelayMs = (nextError: Error | null) => {
      if (!(nextError instanceof CameraSnapshotError)) return intervalMs;
      if (nextError.status === 409) return Math.max(intervalMs, 5_000);
      if (nextError.status >= 500) {
        const backoffMultiplier = 2 ** Math.min(consecutiveFailures, 3);
        return Math.min(intervalMs * backoffMultiplier, 10_000);
      }
      return intervalMs;
    };

    const scheduleNextPoll = (delayMs: number) => {
      clearTimer();
      if (cancelled) return;
      timerId = setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        const nextFrameUrl = await fetchCameraSnapshot(cameraId);
        if (cancelled) {
          URL.revokeObjectURL(nextFrameUrl);
          return;
        }
        consecutiveFailures = 0;
        setFrame(nextFrameUrl);
        scheduleNextPoll(intervalMs);
      } catch (err) {
        const nextError =
          err instanceof CameraSnapshotError
            ? err
            : err instanceof Error
              ? err
              : new Error(String(err));
        consecutiveFailures += 1;
        if (!cancelled) {
          setError(nextError);
          scheduleNextPoll(getNextDelayMs(nextError));
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimer();
      setSnapshotUrl(null);
      setError(null);
      revokePrev();
    };
  }, [enabled, cameraId, intervalMs]);

  return { snapshotUrl, error };
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
