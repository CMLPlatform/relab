import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  showGoogleAccountRequired,
  showStreamStartFailed,
} from '@/components/cameras/streamingFeedback';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import {
  type EffectiveCameraConnection,
  resolveEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import { addProductVideo } from '@/services/api/products';
import {
  type CameraReadWithStatus,
  startYouTubeStream,
  type YouTubePrivacyStatus,
} from '@/services/api/rpiCamera';

type StreamDialogState = {
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

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

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

export function useCamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();
  const { product: productParam, stream: streamParam } = useLocalSearchParams<{
    product?: string;
    stream?: string;
  }>();

  const captureAllProductId = useMemo(() => {
    if (!productParam) return null;
    const id = Number(Array.isArray(productParam) ? productParam[0] : productParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [productParam]);
  const captureModeEnabled = captureAllProductId !== null;

  const streamProductId = useMemo(() => {
    if (!streamParam) return null;
    const id = Number(Array.isArray(streamParam) ? streamParam[0] : streamParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [streamParam]);
  const streamModeEnabled = streamProductId !== null;

  const [streamDialog, dispatchStreamDialog] = useReducer(
    streamDialogReducer,
    STREAM_DIALOG_INITIAL,
  );
  const [isStartingStream, setIsStartingStream] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [effectiveConnectionByCameraId, setEffectiveConnectionByCameraId] = useState<
    Record<string, EffectiveConnectionSnapshot>
  >({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: '/login', params: { redirectTo: '/cameras' } });
    }
  }, [user, router]);

  useEffect(() => {
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
  }, [navigation, router, captureAllProductId, streamProductId, streamModeEnabled]);

  const rows = cameras ?? [];
  const isCameraReachable = useCallback(
    (camera: CameraReadWithStatus) =>
      effectiveConnectionByCameraId[camera.id]?.isReachable ??
      resolveEffectiveCameraConnection(camera).isReachable,
    [effectiveConnectionByCameraId],
  );
  const onlineCameras = rows.filter(isCameraReachable);
  const onlineCount = onlineCameras.length;
  const numColumns = isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS;

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
    setSelectedIds(new Set(onlineCameras.map((camera) => camera.id)));
  }, [onlineCameras]);

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
        dispatchStreamDialog({
          type: 'open',
          cameraId: camera.id,
          cameraName: camera.name,
          defaultTitle: streamProduct?.name ?? '',
        });
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
      dispatchStreamDialog({ type: 'close' });
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
    feedback,
    queryClient,
    router,
    setActiveStream,
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
      selectedCount: selectedIds.size,
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
      closeStreamDialog: () => dispatchStreamDialog({ type: 'close' }),
      setStreamTitle: (value: string) => dispatchStreamDialog({ type: 'set_title', value }),
      setStreamPrivacy: (value: YouTubePrivacyStatus) =>
        dispatchStreamDialog({ type: 'set_privacy', value }),
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
