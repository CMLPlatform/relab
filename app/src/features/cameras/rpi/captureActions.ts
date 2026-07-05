import { useCallback, useMemo, useState } from 'react';
import type { CameraConnectionInfo } from '@/features/cameras/local-connection/useLocalConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

type EffectiveConnectionSnapshot = {
  isReachable: boolean;
  transport: string;
  localConnection: CameraConnectionInfo;
};

export function useCameraConnectionSnapshots() {
  const [effectiveConnectionByCameraId, setEffectiveConnectionByCameraId] = useState<
    Record<string, EffectiveConnectionSnapshot>
  >({});

  const handleEffectiveConnectionChange = useCallback(
    (cameraId: string, connection: EffectiveConnectionSnapshot) => {
      setEffectiveConnectionByCameraId((prev) => {
        const current = prev[cameraId];
        if (
          current?.isReachable === connection.isReachable &&
          current.transport === connection.transport &&
          current.localConnection === connection.localConnection
        ) {
          return prev;
        }
        return { ...prev, [cameraId]: connection };
      });
    },
    [],
  );

  // Map of cameraId → direct-connection info, for routing capture to the local
  // endpoint when a camera is only reachable directly (relay offline).
  const connectionInfoByCameraId = useMemo(() => {
    const map: Record<string, CameraConnectionInfo> = {};
    for (const [cameraId, snapshot] of Object.entries(effectiveConnectionByCameraId)) {
      map[cameraId] = snapshot.localConnection;
    }
    return map;
  }, [effectiveConnectionByCameraId]);

  return {
    effectiveConnectionByCameraId,
    connectionInfoByCameraId,
    handleEffectiveConnectionChange,
  };
}

export function useCameraCaptureActions({
  captureAll,
  captureAllProductId,
  clearSelection,
  selectedIds,
  captureModeEnabled,
  selectionMode,
  enterSelectionMode,
  toggleSelected,
  isCameraReachable,
  setSnackbar,
}: {
  captureAll: {
    mutate: (
      params: { cameraIds: string[]; productId: number },
      options: {
        onSuccess: (result: { total: number; succeeded: number; failed: number }) => void;
        onError: (err: unknown) => void;
      },
    ) => void;
  };
  captureAllProductId: number | null;
  clearSelection: () => void;
  selectedIds: Set<string>;
  captureModeEnabled: boolean;
  selectionMode: boolean;
  enterSelectionMode: (initialId?: string) => void;
  toggleSelected: (cameraId: string) => void;
  isCameraReachable: (camera: CameraReadWithStatus) => boolean;
  setSnackbar: (message: string | null) => void;
}) {
  const runCapture = useCallback(
    (cameraIds: string[]) => {
      if (captureAllProductId === null || cameraIds.length === 0) return;
      captureAll.mutate(
        { cameraIds, productId: captureAllProductId },
        {
          onSuccess: ({ total, succeeded, failed }) => {
            setSnackbar(
              failed === 0
                ? `Captured ${succeeded}/${total} cameras`
                : `Captured ${succeeded}/${total} · ${failed} failed`,
            );
            clearSelection();
          },
          onError: (err) => setSnackbar(`Capture failed: ${String(err)}`),
        },
      );
    },
    [captureAll, captureAllProductId, clearSelection, setSnackbar],
  );

  const handleCaptureSelected = useCallback(() => {
    runCapture([...selectedIds]);
  }, [runCapture, selectedIds]);

  const handleCardLongPress = useCallback(
    (camera: CameraReadWithStatus) => {
      if (!captureModeEnabled) return;
      if (!isCameraReachable(camera)) {
        setSnackbar(`${camera.name} is offline — can't capture.`);
        return;
      }
      if (!selectionMode) {
        enterSelectionMode(camera.id);
      } else {
        toggleSelected(camera.id);
      }
    },
    [
      captureModeEnabled,
      enterSelectionMode,
      isCameraReachable,
      selectionMode,
      setSnackbar,
      toggleSelected,
    ],
  );

  return {
    handleCaptureSelected,
    handleCardLongPress,
    runCapture,
  };
}
