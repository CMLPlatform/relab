import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type {
  CameraCreate,
  CameraRead,
  CameraUpdate,
  PairingClaimRequest,
} from '@/services/api/rpiCamera';
import {
  CameraSnapshotError,
  captureImageFromCamera,
  claimPairingCode,
  createCamera,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameras,
  regenerateCameraApiKey,
  updateCamera,
} from '@/services/api/rpiCamera';

// ─── Query options factories ───────────────────────────────────────────────────

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

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCamerasQuery(
  includeStatus = false,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({ ...camerasQueryOptions(includeStatus), enabled });
}

export function useCameraQuery(id: string, includeStatus = false) {
  return useQuery(cameraQueryOptions(id, includeStatus));
}

export function useCreateCameraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CameraCreate) => createCamera(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCameras'] });
    },
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

export function useRegenerateApiKeyMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateCameraApiKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rpiCamera', id] });
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

// ─── Preview hook ──────────────────────────────────────────────────────────────

/**
 * Snapshot-based preview for an RPi camera via repeated JPEG polling.
 *
 * Returns a blob URL safe to use as an <Image> source, and an error when the
 * camera is unreachable. Blob URLs are revoked automatically to avoid memory leaks.
 */
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
      // Defer revocation so the browser finishes rendering the old frame
      // before its blob URL is invalidated — prevents flicker.
      const toRevoke = previousUrlRef.current;
      previousUrlRef.current = url;
      setSnapshotUrl(url);
      setError(null);
      if (toRevoke) requestAnimationFrame(() => URL.revokeObjectURL(toRevoke));
    };

    const poll = async () => {
      try {
        setFrame(await fetchCameraSnapshot(cameraId));
      } catch (err) {
        if (err instanceof CameraSnapshotError) {
          setError(err);
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void poll();
    const timerId = setInterval(() => void poll(), intervalMs);
    return () => {
      clearInterval(timerId);
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
      // Refetch the product so the new image appears in the gallery
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}
