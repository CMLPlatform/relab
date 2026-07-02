import { useCallback, useState } from 'react';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

type EffectiveConnectionSnapshot = { isReachable: boolean; transport: string };

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
          current.transport === connection.transport
        ) {
          return prev;
        }
        return { ...prev, [cameraId]: connection };
      });
    },
    [],
  );

  return { effectiveConnectionByCameraId, handleEffectiveConnectionChange };
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
