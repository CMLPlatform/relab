import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/context/auth';
import {
  useCameraCaptureActions,
  useCameraConnectionSnapshots,
  useCameraStreamActions,
} from '@/hooks/cameras/actions';
import { useCameraScreenData, useCamerasHeader } from '@/hooks/cameras/helpers';
import { useCameraRouteModes } from '@/hooks/cameras/routeModes';
import {
  useCameraSelectionActions,
  useCameraSelectionController,
  useCameraStreamingController,
} from '@/hooks/cameras/stateControllers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { resolveEffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useBaseProductQuery } from '@/hooks/useProductQueries';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

function useCamerasAuthRedirect(
  user: ReturnType<typeof useAuth>['user'],
  router: ReturnType<typeof useRouter>,
) {
  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);
}

function buildCamerasScreenState({
  user,
  screenData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
  selectionMode,
  selectedIds,
  selectedCount,
  captureAllPending,
  handleSelectAll,
  clearSelection,
  handleCaptureSelected,
  streamDialog,
  isStartingStream,
  snackbarMessage,
  dismissSnackbar,
  closeStreamDialog,
  setStreamTitle,
  setStreamPrivacy,
  handleStartStream,
  handleCardTap,
  handleCardLongPress,
  handleEffectiveConnectionChange,
  openAddCamera,
}: {
  user: ReturnType<typeof useAuth>['user'];
  screenData: {
    rows: CameraReadWithStatus[];
    onlineCount: number;
    numColumns: number;
    captureModeEnabled: boolean;
    streamModeEnabled: boolean;
  };
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof useCamerasQuery>['refetch'];
  selectionMode: ReturnType<typeof useCameraSelectionController>['selectionMode'];
  selectedIds: ReturnType<typeof useCameraSelectionController>['selectedIds'];
  selectedCount: number;
  captureAllPending: boolean;
  handleSelectAll: ReturnType<typeof useCameraSelectionActions>['handleSelectAll'];
  clearSelection: ReturnType<typeof useCameraSelectionController>['clearSelection'];
  handleCaptureSelected: ReturnType<typeof useCameraCaptureActions>['handleCaptureSelected'];
  streamDialog: ReturnType<typeof useCameraStreamingController>['streamDialog'];
  isStartingStream: boolean;
  snackbarMessage: string | null;
  dismissSnackbar: () => void;
  closeStreamDialog: ReturnType<typeof useCameraStreamingController>['closeStreamDialog'];
  setStreamTitle: ReturnType<typeof useCameraStreamingController>['setStreamTitle'];
  setStreamPrivacy: ReturnType<typeof useCameraStreamingController>['setStreamPrivacy'];
  handleStartStream: ReturnType<typeof useCameraStreamActions>['handleStartStream'];
  handleCardTap: ReturnType<typeof useCameraStreamActions>['handleCardTap'];
  handleCardLongPress: ReturnType<typeof useCameraCaptureActions>['handleCardLongPress'];
  handleEffectiveConnectionChange: ReturnType<
    typeof useCameraConnectionSnapshots
  >['handleEffectiveConnectionChange'];
  openAddCamera: () => void;
}) {
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
      selectionMode,
      selectedIds,
      selectedCount,
      captureAllPending,
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
      openAddCamera,
    },
  };
}

export function useCamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const isDesktop = useIsDesktop();
  const { captureAllProductId, captureModeEnabled, streamProductId, streamModeEnabled } =
    useCameraRouteModes();
  const streaming = useCameraStreamingController();
  const { effectiveConnectionByCameraId, handleEffectiveConnectionChange } =
    useCameraConnectionSnapshots();
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
  const captureAll = useCaptureAllMutation();

  useCamerasAuthRedirect(user, router);
  useCamerasHeader({
    navigation,
    router,
    captureAllProductId,
    streamProductId,
    streamModeEnabled,
  });

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

  return buildCamerasScreenState({
    user,
    screenData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    selectionMode: selection.selectionMode,
    selectedIds: selection.selectedIds,
    selectedCount: selection.selectedCount,
    captureAllPending: captureAll.isPending,
    handleSelectAll,
    clearSelection: selection.clearSelection,
    handleCaptureSelected,
    streamDialog: streaming.streamDialog,
    isStartingStream: streaming.isStartingStream,
    snackbarMessage: streaming.snackbarMessage,
    dismissSnackbar: streaming.dismissSnackbar,
    closeStreamDialog: streaming.closeStreamDialog,
    setStreamTitle: streaming.setStreamTitle,
    setStreamPrivacy: streaming.setStreamPrivacy,
    handleStartStream,
    handleCardTap,
    handleCardLongPress,
    handleEffectiveConnectionChange,
    openAddCamera,
  });
}
