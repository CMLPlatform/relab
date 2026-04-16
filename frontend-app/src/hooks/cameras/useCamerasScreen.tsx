import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  useCameraCaptureActions,
  useCameraConnectionSnapshots,
  useCameraStreamActions,
} from '@/hooks/cameras/actions';
import {
  getCameraGridColumns,
  useCameraRouteModes,
  useCameraSelectionActions,
  useCameraSelectionController,
  useCameraSnackbar,
  useCamerasHeader,
  useStreamDialogController,
} from '@/hooks/cameras/helpers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { resolveEffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

export function useCamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const isDesktop = useIsDesktop();
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
  const { snackbarMessage, setSnackbarMessage, dismissSnackbar } = useCameraSnackbar();
  const { effectiveConnectionByCameraId, handleEffectiveConnectionChange } =
    useCameraConnectionSnapshots();
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

  const { handleSelectAll } = useCameraSelectionActions({
    onlineCameraIds: onlineCameras.map((camera) => camera.id),
    selectAll,
  });

  const { handleCaptureSelected, handleCardLongPress } = useCameraCaptureActions({
    captureAll,
    captureAllProductId,
    clearSelection,
    selectedIds,
    captureModeEnabled,
    selectionMode,
    enterSelectionMode,
    toggleSelected,
    isCameraReachable,
    setSnackbar: setSnackbarMessage,
  });

  const { handleCardTap, handleStartStream } = useCameraStreamActions({
    streamModeEnabled,
    selectionMode,
    isCameraReachable,
    openStreamDialog,
    streamProductName: streamProduct?.name ?? '',
    toggleSelected,
    setSnackbar: setSnackbarMessage,
    streamDialog,
    streamProductId,
    streamProductNameForSession: streamProduct?.name,
    closeStreamDialog,
    setIsStartingStream,
    feedback,
  });

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
      snackbarMessage,
      dismissSnackbar,
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
