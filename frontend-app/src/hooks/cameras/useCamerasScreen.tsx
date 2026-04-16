import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  showGoogleAccountRequired,
  showStreamStartFailed,
} from '@/components/cameras/streamingFeedback';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import {
  getCameraGridColumns,
  useCameraRouteModes,
  useCameraSelectionController,
  useCamerasHeader,
  useStreamDialogController,
} from '@/hooks/cameras/helpers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import {
  type EffectiveCameraConnection,
  resolveEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import { addProductVideo } from '@/services/api/products';
import { type CameraReadWithStatus, startYouTubeStream } from '@/services/api/rpiCamera';

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

export function useCamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();
  const { captureAllProductId, captureModeEnabled, streamProductId, streamModeEnabled } =
    useCameraRouteModes();
  const {
    streamDialog,
    isStartingStream,
    setIsStartingStream,
    openStreamDialog,
    closeStreamDialog,
    setStreamTitle,
    setStreamPrivacy,
  } = useStreamDialogController();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [effectiveConnectionByCameraId, setEffectiveConnectionByCameraId] = useState<
    Record<string, EffectiveConnectionSnapshot>
  >({});
  const {
    selectionMode,
    selectedIds,
    selectedCount,
    clearSelection,
    enterSelectionMode,
    toggleSelected,
    selectAll,
  } = useCameraSelectionController();

  const { data: streamProduct } = useProductQuery(streamProductId ?? 'new');
  const {
    data: cameras,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useCamerasQuery(true, {
    includeTelemetry: true,
  });
  const captureAll = useCaptureAllMutation();

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  useCamerasHeader({
    navigation,
    router,
    captureAllProductId,
    streamProductId,
    streamModeEnabled,
  });

  const rows = cameras ?? [];
  const isCameraReachable = useCallback(
    (camera: CameraReadWithStatus) =>
      effectiveConnectionByCameraId[camera.id]?.isReachable ??
      resolveEffectiveCameraConnection(camera).isReachable,
    [effectiveConnectionByCameraId],
  );
  const onlineCameras = rows.filter(isCameraReachable);
  const onlineCount = onlineCameras.length;
  const numColumns = getCameraGridColumns(isDesktop);

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
    [captureAll, captureAllProductId, clearSelection],
  );

  const handleSelectAll = useCallback(() => {
    selectAll(onlineCameras.map((camera) => camera.id));
  }, [onlineCameras, selectAll]);

  const handleCaptureSelected = useCallback(() => {
    runCapture([...selectedIds]);
  }, [runCapture, selectedIds]);

  const handleCardTap = useCallback(
    (camera: CameraReadWithStatus) => {
      if (streamModeEnabled) {
        if (!isCameraReachable(camera)) {
          setSnackbar(`${camera.name} is offline — can't stream.`);
          return;
        }
        openStreamDialog(camera.id, camera.name, streamProduct?.name ?? '');
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
      streamModeEnabled,
      streamProduct?.name,
      toggleSelected,
    ],
  );

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
    [captureModeEnabled, enterSelectionMode, isCameraReachable, selectionMode, toggleSelected],
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
        productName: streamProduct?.name ?? (streamDialog.title || `Product ${streamProductId}`),
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
    streamDialog,
    streamProduct?.name,
    streamProductId,
  ]);

  return {
    screen: {
      user,
      rows,
      isLoading,
      isFetching,
      isError,
      error,
      refetch,
      numColumns,
      onlineCount,
      captureModeEnabled,
      streamModeEnabled,
    },
    selection: {
      selectionMode,
      selectedIds,
      selectedCount,
      captureAllPending: captureAll.isPending,
      handleSelectAll,
      clearSelection,
      handleCaptureSelected,
    },
    streaming: {
      streamDialog,
      isStartingStream,
      snackbarMessage: snackbar,
      dismissSnackbar: () => setSnackbar(null),
      closeStreamDialog,
      setStreamTitle,
      setStreamPrivacy,
      handleStartStream,
    },
    actions: {
      handleCardTap,
      handleCardLongPress,
      handleEffectiveConnectionChange,
      openAddCamera: () => router.push('/cameras/add'),
    },
  };
}
