import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { type Router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';

export type StreamDialogState = {
  cameraId: string | null;
  cameraName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
};

type StreamDialogAction =
  | { type: 'open'; cameraId: string; cameraName: string; defaultTitle: string }
  | { type: 'close' }
  | { type: 'set_title'; value: string }
  | { type: 'set_privacy'; value: YouTubePrivacyStatus };

const STREAM_DIALOG_INITIAL: StreamDialogState = {
  cameraId: null,
  cameraName: '',
  title: '',
  privacy: 'private',
};

const DESKTOP_COLUMNS = 3;
const MOBILE_COLUMNS = 2;

function streamDialogReducer(
  state: StreamDialogState,
  action: StreamDialogAction,
): StreamDialogState {
  switch (action.type) {
    case 'open':
      return {
        cameraId: action.cameraId,
        cameraName: action.cameraName,
        title: action.defaultTitle,
        privacy: 'private',
      };
    case 'close':
      return STREAM_DIALOG_INITIAL;
    case 'set_title':
      return { ...state, title: action.value };
    case 'set_privacy':
      return { ...state, privacy: action.value };
  }
}

export function useCameraRouteModes() {
  const { product: productParam, stream: streamParam } = useLocalSearchParams<{
    product?: string;
    stream?: string;
  }>();

  const captureAllProductId = useMemo(() => {
    if (!productParam) return null;
    const id = Number(Array.isArray(productParam) ? productParam[0] : productParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [productParam]);

  const streamProductId = useMemo(() => {
    if (!streamParam) return null;
    const id = Number(Array.isArray(streamParam) ? streamParam[0] : streamParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [streamParam]);

  return {
    captureAllProductId,
    captureModeEnabled: captureAllProductId !== null,
    streamProductId,
    streamModeEnabled: streamProductId !== null,
  };
}

export function useStreamDialogController() {
  const [streamDialog, dispatchStreamDialog] = useReducer(
    streamDialogReducer,
    STREAM_DIALOG_INITIAL,
  );
  const [isStartingStream, setIsStartingStream] = useState(false);

  return {
    streamDialog,
    isStartingStream,
    setIsStartingStream,
    openStreamDialog: (cameraId: string, cameraName: string, defaultTitle: string) =>
      dispatchStreamDialog({ type: 'open', cameraId, cameraName, defaultTitle }),
    closeStreamDialog: () => dispatchStreamDialog({ type: 'close' }),
    setStreamTitle: (value: string) => dispatchStreamDialog({ type: 'set_title', value }),
    setStreamPrivacy: (value: YouTubePrivacyStatus) =>
      dispatchStreamDialog({ type: 'set_privacy', value }),
  };
}

export function useCameraStreamingController() {
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

  return {
    streamDialog,
    isStartingStream,
    setIsStartingStream,
    openStreamDialog,
    closeStreamDialog,
    setStreamTitle,
    setStreamPrivacy,
    snackbarMessage,
    setSnackbarMessage,
    dismissSnackbar,
  };
}

export function useCameraSelectionController() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true);
    if (initialId) setSelectedIds(new Set([initialId]));
  }, []);

  const toggleSelected = useCallback((cameraId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) {
        next.delete(cameraId);
      } else {
        next.add(cameraId);
      }
      return next;
    });
  }, []);

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    clearSelection,
    enterSelectionMode,
    toggleSelected,
    selectAll: (ids: string[]) => setSelectedIds(new Set(ids)),
  };
}

export function useCameraSnackbar() {
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  return {
    snackbarMessage,
    setSnackbarMessage,
    dismissSnackbar: useCallback(() => setSnackbarMessage(null), []),
  };
}

export function useCameraSelectionActions({
  onlineCameraIds,
  selectAll,
}: {
  onlineCameraIds: string[];
  selectAll: (ids: string[]) => void;
}) {
  const handleSelectAll = useCallback(() => {
    selectAll(onlineCameraIds);
  }, [onlineCameraIds, selectAll]);

  return { handleSelectAll };
}

export function useCameraScreenData<T extends { id: string }>({
  cameras,
  isDesktop,
  isCameraReachable,
  captureModeEnabled,
  streamModeEnabled,
}: {
  cameras: T[] | undefined;
  isDesktop: boolean;
  isCameraReachable: (camera: T) => boolean;
  captureModeEnabled: boolean;
  streamModeEnabled: boolean;
}) {
  const rows = cameras ?? [];
  const onlineCameras = rows.filter(isCameraReachable);

  return {
    rows,
    onlineCameras,
    onlineCount: onlineCameras.length,
    numColumns: getCameraGridColumns(isDesktop),
    captureModeEnabled,
    streamModeEnabled,
  };
}

export function getCameraGridColumns(isDesktop: boolean) {
  return isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS;
}

export function setCamerasHeaderOptions({
  navigation,
  router,
  captureAllProductId,
  streamProductId,
  streamModeEnabled,
}: {
  navigation: { setOptions: (options: object) => void };
  router: Pick<Router, 'replace'>;
  captureAllProductId: number | null;
  streamProductId: number | null;
  streamModeEnabled: boolean;
}) {
  const backProductId = captureAllProductId ?? streamProductId;

  navigation.setOptions({
    title: streamModeEnabled ? 'Select camera to stream' : 'My Cameras',
    headerLeft: (props: HeaderBackButtonProps) => (
      <HeaderBackButton
        {...props}
        onPress={() => {
          if (backProductId) {
            router.replace({
              pathname: '/products/[id]',
              params: { id: backProductId.toString() },
            });
          } else {
            router.replace('/products');
          }
        }}
      />
    ),
  });
}

export function useCamerasHeader(args: Parameters<typeof setCamerasHeaderOptions>[0]) {
  useEffect(() => {
    setCamerasHeaderOptions(args);
  }, [args]);
}
