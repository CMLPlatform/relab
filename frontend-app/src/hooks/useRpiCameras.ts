import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type {
  CameraCreate,
  CameraRead,
  CameraUpdate,
  PairingClaimRequest,
} from '@/services/api/rpiCamera';
import {
  captureImageFromCamera,
  claimPairingCode,
  createCamera,
  deleteCamera,
  fetchCamera,
  fetchCameraMjpegStream,
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

// ─── MJPEG frame extraction ────────────────────────────────────────────────────

function findBytes(haystack: Uint8Array, needle: readonly number[], from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

async function* parseJpegFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const SOI = [0xff, 0xd8] as const;
  const EOI = [0xff, 0xd9] as const;
  let buffer = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const next = new Uint8Array(buffer.length + value.length);
    next.set(buffer);
    next.set(value, buffer.length);
    buffer = next;

    let searchFrom = 0;
    while (searchFrom < buffer.length - 1) {
      const soiIdx = findBytes(buffer, SOI, searchFrom);
      if (soiIdx === -1) {
        buffer = new Uint8Array(0);
        break;
      }
      const eoiIdx = findBytes(buffer, EOI, soiIdx + 2);
      if (eoiIdx === -1) {
        buffer = soiIdx > 0 ? buffer.slice(soiIdx) : buffer;
        break;
      }
      yield buffer.slice(soiIdx, eoiIdx + 2);
      searchFrom = eoiIdx + 2;
    }

    if (searchFrom > 0 && searchFrom < buffer.length) {
      buffer = buffer.slice(searchFrom);
    } else if (searchFrom >= buffer.length) {
      buffer = new Uint8Array(0);
    }
  }
}

// ─── Preview hook ──────────────────────────────────────────────────────────────

/**
 * Live viewfinder preview for an RPi camera.
 *
 * - Web + HTTP camera  → MJPEG stream via fetch + ReadableStream (~20fps)
 * - Everything else    → snapshot polling at `intervalMs` ms (~1.5fps default)
 *
 * Returns a blob URL safe to use as an <Image> source, and an error when the
 * camera is unreachable. Blob URLs are revoked automatically to avoid memory leaks.
 */
export function useCameraPreview(
  camera: Pick<CameraRead, 'id' | 'connection_mode'> | null,
  { enabled = false, intervalMs = 1500 }: { enabled?: boolean; intervalMs?: number } = {},
) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const cameraId = camera?.id ?? null;
  const connectionMode = camera?.connection_mode ?? null;

  useEffect(() => {
    if (!enabled || !cameraId || !connectionMode) {
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

    // Web + HTTP camera → MJPEG streaming via fetch + ReadableStream
    // Throttle to ~10fps to avoid flicker from rapid blob URL swaps.
    if (Platform.OS === 'web' && connectionMode === 'http') {
      const controller = new AbortController();
      const FRAME_INTERVAL_MS = 100; // ~10fps display rate

      void (async () => {
        try {
          const response = await fetchCameraMjpegStream(cameraId, controller.signal);
          if (!response.body) throw new Error('No response body for MJPEG stream');
          const reader = response.body.getReader();
          let lastFrameTime = 0;
          for await (const frame of parseJpegFrames(reader)) {
            if (controller.signal.aborted) break;
            const now = performance.now();
            if (now - lastFrameTime < FRAME_INTERVAL_MS) continue; // skip frame
            lastFrameTime = now;
            setFrame(
              URL.createObjectURL(new Blob([new Uint8Array(frame)], { type: 'image/jpeg' })),
            );
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })();

      return () => {
        controller.abort();
        setSnapshotUrl(null);
        setError(null);
        revokePrev();
      };
    }

    // Native or WebSocket camera → snapshot polling
    const poll = async () => {
      try {
        setFrame(await fetchCameraSnapshot(cameraId));
      } catch (err) {
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
  }, [enabled, cameraId, connectionMode, intervalMs]);

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
