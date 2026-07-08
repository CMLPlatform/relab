import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/context/auth';
import {
  useCameraCaptureActions,
  useCameraConnectionSnapshots,
} from '@/features/cameras/rpi/captureActions';
import { useCamerasQuery, useCaptureAllMutation } from '@/features/cameras/rpi/hooks';
import { useCameraStreamActions } from '@/features/cameras/youtube/streamActions';
import { useBaseProductQuery } from '@/features/products/queries';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { setCamerasHeaderOptions, useCameraScreenData } from './helpers';
import { useCameraRouteModes } from './routeModes';
import {
  useCameraSelectionActions,
  useCameraSelectionController,
  useCameraStreamingController,
} from './state';
import { resolveEffectiveCameraConnection } from './useEffectiveCameraConnection';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cameras-screen orchestration is intentionally exposed through one screen hook.
export function useCamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const isDesktop = useIsDesktop();
  const { captureAllProductId, captureModeEnabled, streamProductId, streamModeEnabled } =
    useCameraRouteModes();
  const streaming = useCameraStreamingController();
  const {
    effectiveConnectionByCameraId,
    connectionInfoByCameraId,
    handleEffectiveConnectionChange,
  } = useCameraConnectionSnapshots();
  const selection = useCameraSelectionController();
  const { data: streamProduct } = useBaseProductQuery(streamProductId ?? undefined);
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
  const captureAll = useCaptureAllMutation(connectionInfoByCameraId);

  useRequireAuth('/cameras');
  useEffect(() => {
    setCamerasHeaderOptions({
      navigation,
      router,
      captureAllProductId,
      streamProductId,
      streamModeEnabled,
    });
  }, [navigation, router, captureAllProductId, streamProductId, streamModeEnabled]);

  const isCameraReachable = useCallback(
    (camera: CameraReadWithStatus) =>
      effectiveConnectionByCameraId[camera.id]?.isReachable ??
      resolveEffectiveCameraConnection(camera).isReachable,
    [effectiveConnectionByCameraId],
  );
  const screenData = useCameraScreenData<CameraReadWithStatus>({
    cameras,
    isDesktop,
    isCameraReachable,
    captureModeEnabled,
    streamModeEnabled,
  });
  const { handleSelectAll } = useCameraSelectionActions({
    onlineCameraIds: screenData.onlineCameras.map((camera) => camera.id),
    selectAll: selection.selectAll,
  });
  const { retainSelected } = selection;
  useEffect(() => {
    retainSelected(new Set(screenData.rows.map((camera) => camera.id)));
  }, [screenData.rows, retainSelected]);
  const { handleCaptureSelected, handleCardLongPress } = useCameraCaptureActions({
    captureAll,
    captureAllProductId,
    clearSelection: selection.clearSelection,
    selectedIds: selection.selectedIds,
    captureModeEnabled,
    selectionMode: selection.selectionMode,
    enterSelectionMode: selection.enterSelectionMode,
    toggleSelected: selection.toggleSelected,
    isCameraReachable,
    setSnackbar: streaming.setSnackbarMessage,
  });
  const { handleCardTap, handleStartStream } = useCameraStreamActions({
    streamModeEnabled,
    selectionMode: selection.selectionMode,
    isCameraReachable,
    openStreamDialog: streaming.openStreamDialog,
    streamProductName: streamProduct?.name ?? '',
    toggleSelected: selection.toggleSelected,
    setSnackbar: streaming.setSnackbarMessage,
    streamDialog: streaming.streamDialog,
    streamProductId,
    streamProductNameForSession: streamProduct?.name,
    closeStreamDialog: streaming.closeStreamDialog,
    setIsStartingStream: streaming.setIsStartingStream,
    feedback,
  });
  const openAddCamera = useCallback(() => {
    router.push('/cameras/add');
  }, [router]);

  return {
    screen: {
      user,
      rows: screenData.rows,
      isLoading,
      isFetching,
      isError,
      error,
      refetch,
      numColumns: screenData.numColumns,
      onlineCount: screenData.onlineCount,
      captureModeEnabled: screenData.captureModeEnabled,
      streamModeEnabled: screenData.streamModeEnabled,
    },
    selection: {
      selectionMode: selection.selectionMode,
      selectedIds: selection.selectedIds,
      selectedCount: selection.selectedCount,
      captureAllPending: captureAll.isPending,
      handleSelectAll,
      clearSelection: selection.clearSelection,
      handleCaptureSelected,
    },
    streaming: {
      streamDialog: streaming.streamDialog,
      isStartingStream: streaming.isStartingStream,
      snackbarMessage: streaming.snackbarMessage,
      dismissSnackbar: streaming.dismissSnackbar,
      closeStreamDialog: streaming.closeStreamDialog,
      setStreamTitle: streaming.setStreamTitle,
      setStreamPrivacy: streaming.setStreamPrivacy,
      handleStartStream,
    },
    actions: {
      handleCardTap,
      handleCardLongPress,
      handleEffectiveConnectionChange,
      openAddCamera,
    },
  };
}
