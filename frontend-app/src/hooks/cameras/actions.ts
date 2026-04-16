import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  type FeedbackApi,
  showGoogleAccountRequired,
  showStreamStartFailed,
} from '@/components/cameras/streamingFeedback';
import { useStreamSession } from '@/context/StreamSessionContext';
import type { StreamDialogState } from '@/hooks/cameras/helpers';
import type { EffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import { addProductVideo } from '@/services/api/products';
import { type CameraReadWithStatus, startYouTubeStream } from '@/services/api/rpiCamera';

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

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

  const handleSelectAll = useCallback(() => {
    // selectAll lives in the parent hook because it is a state controller concern.
  }, []);

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
    handleSelectAll,
    handleCaptureSelected,
    handleCardLongPress,
    runCapture,
  };
}

export function useCameraStreamActions({
  streamModeEnabled,
  selectionMode,
  isCameraReachable,
  openStreamDialog,
  streamProductName,
  toggleSelected,
  setSnackbar,
  streamDialog,
  streamProductId,
  streamProductNameForSession,
  closeStreamDialog,
  setIsStartingStream,
  feedback,
}: {
  streamModeEnabled: boolean;
  selectionMode: boolean;
  isCameraReachable: (camera: CameraReadWithStatus) => boolean;
  openStreamDialog: (cameraId: string, cameraName: string, defaultTitle: string) => void;
  streamProductName: string;
  toggleSelected: (cameraId: string) => void;
  setSnackbar: (message: string | null) => void;
  streamDialog: StreamDialogState;
  streamProductId: number | null;
  streamProductNameForSession?: string;
  closeStreamDialog: () => void;
  setIsStartingStream: (value: boolean) => void;
  feedback: FeedbackApi;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();

  const handleCardTap = useCallback(
    (camera: CameraReadWithStatus) => {
      if (streamModeEnabled) {
        if (!isCameraReachable(camera)) {
          setSnackbar(`${camera.name} is offline — can't stream.`);
          return;
        }
        openStreamDialog(camera.id, camera.name, streamProductName);
        return;
      }

      if (selectionMode) {
        if (isCameraReachable(camera)) {
          toggleSelected(camera.id);
        } else {
          setSnackbar(`${camera.name} is offline — can't capture.`);
        }
        return;
      }

      router.push({ pathname: '/cameras/[id]', params: { id: camera.id } });
    },
    [
      isCameraReachable,
      openStreamDialog,
      router,
      selectionMode,
      setSnackbar,
      streamModeEnabled,
      streamProductName,
      toggleSelected,
    ],
  );

  const handleStartStream = useCallback(async () => {
    if (!streamDialog.cameraId || !streamProductId) return;
    setIsStartingStream(true);
    try {
      const result = await startYouTubeStream(streamDialog.cameraId, {
        product_id: streamProductId,
        title: streamDialog.title.trim() || undefined,
        privacy_status: streamDialog.privacy,
      });
      setActiveStream({
        cameraId: streamDialog.cameraId,
        cameraName: streamDialog.cameraName,
        productId: streamProductId,
        productName:
          streamProductNameForSession ?? (streamDialog.title || `Product ${streamProductId}`),
        startedAt: result.started_at,
        youtubeUrl: result.url,
      });
      closeStreamDialog();
      addProductVideo(streamProductId, {
        url: result.url,
        title: streamDialog.title.trim() || 'Live stream',
        description: '',
      }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['product', streamProductId] });
      setSnackbar(`Now live: ${streamDialog.cameraName}`);
      await new Promise((resolve) => setTimeout(resolve, 800));
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'GOOGLE_OAUTH_REQUIRED') {
        showGoogleAccountRequired(feedback);
      } else {
        showStreamStartFailed(feedback, err);
      }
    } finally {
      setIsStartingStream(false);
    }
  }, [
    closeStreamDialog,
    feedback,
    queryClient,
    router,
    setActiveStream,
    setIsStartingStream,
    setSnackbar,
    streamDialog,
    streamProductId,
    streamProductNameForSession,
  ]);

  return { handleCardTap, handleStartStream };
}
