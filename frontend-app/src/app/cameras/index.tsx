import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  AnimatedFAB,
  Button,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { CameraCard } from '@/components/cameras/CameraCard';
import { SelectionBar } from '@/components/cameras/SelectionBar';
import { useAuth } from '@/context/AuthProvider';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useCamerasQuery, useCaptureAllMutation } from '@/hooks/useRpiCameras';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

const DESKTOP_COLUMNS = 3;
const MOBILE_COLUMNS = 2;

export default function CamerasScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();

  // ``/cameras?product=42`` puts the mosaic into "capture flow" mode — tapping
  // a single card captures immediately, long-pressing enters multi-select.
  // Without the param the mosaic is a read-only dashboard (tap navigates to
  // the detail screen, long-press does nothing).
  const { product: productParam } = useLocalSearchParams<{ product?: string }>();
  const captureAllProductId = useMemo(() => {
    if (!productParam) return null;
    const id = Number(Array.isArray(productParam) ? productParam[0] : productParam);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [productParam]);
  const captureModeEnabled = captureAllProductId !== null;

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
  const [snackbar, setSnackbar] = useState<string | null>(null);

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
    navigation.setOptions({
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          onPress={() => {
            if (captureAllProductId) {
              router.replace({
                pathname: '/products/[id]',
                params: { id: captureAllProductId.toString() },
              });
            } else {
              router.replace('/products');
            }
          }}
        />
      ),
    });
  }, [navigation, router, captureAllProductId]);

  const rows = cameras ?? [];
  const onlineCameras = rows.filter((c) => c.status?.connection === 'online');
  const onlineCount = onlineCameras.length;

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
      if (selectionMode) {
        // Tap toggles selection while in selection mode; offline cameras
        // can't be selected because the capture fan-out would just fail.
        if (camera.status?.connection === 'online') {
          toggleSelected(camera.id);
        } else {
          setSnackbar(`${camera.name} is offline — can't capture.`);
        }
        return;
      }
      // Default: navigate to the detail screen.
      router.push({ pathname: '/cameras/[id]', params: { id: camera.id } });
    },
    [router, selectionMode, toggleSelected],
  );

  const handleCardLongPress = useCallback(
    (camera: CameraReadWithStatus) => {
      if (!captureModeEnabled) return;
      if (camera.status?.connection !== 'online') {
        setSnackbar(`${camera.name} is offline — can't capture.`);
        return;
      }
      if (!selectionMode) {
        enterSelectionMode(camera.id);
      } else {
        toggleSelected(camera.id);
      }
    },
    [captureModeEnabled, enterSelectionMode, selectionMode, toggleSelected],
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
          <View style={styles.cell}>
            <Pressable
              onPress={() => handleCardTap(item)}
              onLongPress={() => handleCardLongPress(item)}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.cellPressable,
                pressed && styles.cellPressed,
                selectedIds.has(item.id) && styles.cellSelected,
              ]}
            >
              <CameraCard camera={item} />
            </Pressable>
          </View>
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

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </>
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
