import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  AnimatedFAB,
  Button,
  Dialog,
  Portal,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { CameraCard } from '@/components/cameras/CameraCard';
import { SelectionBar } from '@/components/cameras/SelectionBar';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import {
  type EffectiveCameraConnection,
  resolveEffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import { addProductVideo } from '@/services/api/products';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { startYouTubeStream } from '@/services/api/rpiCamera';

// ─── Stream dialog state ──────────────────────────────────────────────────────

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

const DESKTOP_COLUMNS = 3;
const MOBILE_COLUMNS = 2;

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

export default function CamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();

  // ``/cameras?product=42`` puts the mosaic into "capture flow" mode — tapping
  // a single card captures immediately, long-pressing enters multi-select.
  // ``/cameras?stream=42`` puts the mosaic into "stream mode" — tapping a card
  // opens a config dialog then starts a YouTube stream for that product.
  // Without params the mosaic is a read-only dashboard.
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

  const { data: streamProduct } = useProductQuery(streamProductId ?? 'new');

  // Telemetry polling is always on when the mosaic is open — the backend
  // serves from a Redis cache so fan-out is a single query regardless of how
  // many cameras are paired.
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
  const { setActiveStream } = useStreamSession();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [effectiveConnectionByCameraId, setEffectiveConnectionByCameraId] = useState<
    Record<string, EffectiveConnectionSnapshot>
  >({});

  // ── Multi-select state ─────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true);
    if (initialId) {
      setSelectedIds(new Set([initialId]));
    }
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

  // ── Capture flows ──────────────────────────────────────────────────────────

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
    const ids = new Set(onlineCameras.map((c) => c.id));
    setSelectedIds(ids);
  }, [onlineCameras]);

  const handleCaptureSelected = useCallback(() => {
    runCapture([...selectedIds]);
  }, [runCapture, selectedIds]);

  // Single-camera tap handler — when NOT in selection mode.
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
        // Tap toggles selection while in selection mode; offline cameras
        // can't be selected because the capture fan-out would just fail.
        if (isCameraReachable(camera)) {
          toggleSelected(camera.id);
        } else {
          setSnackbar(`${camera.name} is offline — can't capture.`);
        }
        return;
      }
      // Default: navigate to the detail screen.
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
      await new Promise((r) => setTimeout(r, 800));
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GOOGLE_OAUTH_REQUIRED') {
        alert('Connect your Google account in Profile > Linked Accounts to stream to YouTube.');
      } else {
        alert(`Failed to start stream: ${msg}`);
      }
    } finally {
      setIsStartingStream(false);
    }
  }, [streamDialog, streamProductId, streamProduct?.name, setActiveStream, queryClient, router]);

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

  if (!user) return null;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={{ marginTop: 12, textAlign: 'center' }}>
          {String(error) || 'Failed to load cameras.'}
        </Text>
        <Button mode="contained" onPress={() => refetch()} style={{ marginTop: 16 }}>
          Retry
        </Button>
      </View>
    );
  }

  const numColumns = isDesktop ? DESKTOP_COLUMNS : MOBILE_COLUMNS;

  return (
    <>
      {selectionMode && (
        <SelectionBar
          selectedCount={selectedIds.size}
          onlineCount={onlineCount}
          onSelectAll={handleSelectAll}
          onClear={clearSelection}
          onCaptureAll={handleCaptureSelected}
          isCapturing={captureAll.isPending}
        />
      )}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CameraGridCell
            camera={item}
            selected={selectedIds.has(item.id)}
            onPress={handleCardTap}
            onLongPress={handleCardLongPress}
            onEffectiveConnectionChange={handleEffectiveConnectionChange}
          />
        )}
        numColumns={numColumns}
        // Changing numColumns at runtime requires a fresh key so RN re-mounts
        // the list with the new column layout.
        key={`grid-${numColumns}`}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
        contentContainerStyle={[styles.list, rows.length === 0 && { flex: 1 }]}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="camera-off"
              size={64}
              color={theme.colors.onSurfaceVariant}
              style={{ opacity: 0.4 }}
            />
            <Text variant="titleMedium" style={{ marginTop: 16, opacity: 0.6 }}>
              No cameras yet
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.5, textAlign: 'center' }}>
              Tap the + button to register your first RPi camera.
            </Text>
          </View>
        }
      />

      {!streamModeEnabled && (
        <AnimatedFAB
          icon="plus"
          label="Add Camera"
          extended
          onPress={() => router.push('/cameras/add')}
          style={{
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
            right: 16,
            bottom: 16,
          }}
          accessibilityLabel="Add camera"
        />
      )}

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>

      <Portal>
        <Dialog
          visible={streamDialog.cameraId !== null}
          onDismiss={() => dispatchStreamDialog({ type: 'close' })}
        >
          <Dialog.Title>Go Live on {streamDialog.cameraName}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              mode="outlined"
              label="Stream title (optional)"
              value={streamDialog.title}
              onChangeText={(v) => dispatchStreamDialog({ type: 'set_title', value: v })}
              maxLength={100}
            />
            <Text variant="labelMedium" style={{ marginTop: 4 }}>
              Visibility
            </Text>
            <SegmentedButtons
              value={streamDialog.privacy}
              onValueChange={(v) =>
                dispatchStreamDialog({ type: 'set_privacy', value: v as YouTubePrivacyStatus })
              }
              buttons={[
                { value: 'private', label: 'Private', icon: 'lock' },
                { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
                { value: 'public', label: 'Public', icon: 'earth' },
              ]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => dispatchStreamDialog({ type: 'close' })}
              disabled={isStartingStream}
            >
              Cancel
            </Button>
            <Button
              onPress={() => void handleStartStream()}
              loading={isStartingStream}
              disabled={isStartingStream}
            >
              Go Live
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function CameraGridCell({
  camera,
  selected,
  onPress,
  onLongPress,
  onEffectiveConnectionChange,
}: {
  camera: CameraReadWithStatus;
  selected: boolean;
  onPress: (camera: CameraReadWithStatus) => void;
  onLongPress: (camera: CameraReadWithStatus) => void;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
}) {
  const effectiveConnection = useEffectiveCameraConnection(camera);

  useEffect(() => {
    onEffectiveConnectionChange(camera.id, {
      isReachable: effectiveConnection.isReachable,
      transport: effectiveConnection.transport,
    });
  }, [
    camera.id,
    effectiveConnection.isReachable,
    effectiveConnection.transport,
    onEffectiveConnectionChange,
  ]);

  return (
    <View style={styles.cell}>
      <Pressable
        onPress={() => onPress(camera)}
        onLongPress={() => onLongPress(camera)}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.cellPressable,
          pressed && styles.cellPressed,
          selected && styles.cellSelected,
        ]}
      >
        <CameraCard camera={camera} effectiveConnection={effectiveConnection} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 12,
    paddingBottom: 88,
    gap: 10,
  },
  row: {
    gap: 10,
  },
  cell: {
    flex: 1,
  },
  cellPressable: {
    borderRadius: 14,
  },
  cellPressed: {
    opacity: 0.9,
  },
  cellSelected: {
    // 3px inset ring so the selected card is obviously picked without
    // changing its outer bounding box (which would shift neighbours).
    borderWidth: 3,
    borderColor: '#1976d2',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
});
