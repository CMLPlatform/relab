import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
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
import {
  type EffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

export function CamerasLoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

type CamerasErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function CamerasErrorState({ message, onRetry }: CamerasErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.center}>
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.error} />
      <Text style={styles.errorText}>{message}</Text>
      <Button mode="contained" onPress={onRetry} style={styles.retryButton}>
        Retry
      </Button>
    </View>
  );
}

type CamerasSelectionOverlayProps = {
  visible: boolean;
  selectedCount: number;
  onlineCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCaptureAll: () => void;
  isCapturing: boolean;
};

export function CamerasSelectionOverlay({
  visible,
  selectedCount,
  onlineCount,
  onSelectAll,
  onClear,
  onCaptureAll,
  isCapturing,
}: CamerasSelectionOverlayProps) {
  if (!visible) return null;

  return (
    <SelectionBar
      selectedCount={selectedCount}
      onlineCount={onlineCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
      onCaptureAll={onCaptureAll}
      isCapturing={isCapturing}
    />
  );
}

type CamerasGridProps = {
  rows: CameraReadWithStatus[];
  numColumns: number;
  selectedIds: Set<string>;
  isFetching: boolean;
  onRefresh: () => void;
  onCardPress: (camera: CameraReadWithStatus) => void;
  onCardLongPress: (camera: CameraReadWithStatus) => void;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
};

export function CamerasGrid({
  rows,
  numColumns,
  selectedIds,
  isFetching,
  onRefresh,
  onCardPress,
  onCardLongPress,
  onEffectiveConnectionChange,
}: CamerasGridProps) {
  const theme = useTheme();

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <CameraGridCell
          camera={item}
          selected={selectedIds.has(item.id)}
          onPress={onCardPress}
          onLongPress={onCardLongPress}
          onEffectiveConnectionChange={onEffectiveConnectionChange}
        />
      )}
      numColumns={numColumns}
      key={`grid-${numColumns}`}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
      contentContainerStyle={[styles.list, rows.length === 0 && styles.emptyList]}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ListEmptyComponent={
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name="camera-off"
            size={64}
            color={theme.colors.onSurfaceVariant}
            style={styles.emptyIcon}
          />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            No cameras yet
          </Text>
          <Text variant="bodySmall" style={styles.emptyBody}>
            Tap the + button to register your first RPi camera.
          </Text>
        </View>
      }
    />
  );
}

type CamerasFabProps = {
  visible: boolean;
  onPress: () => void;
};

export function CamerasFab({ visible, onPress }: CamerasFabProps) {
  if (!visible) return null;

  return (
    <AnimatedFAB
      icon="plus"
      label="Add Camera"
      extended
      onPress={onPress}
      style={styles.fab}
      accessibilityLabel="Add camera"
    />
  );
}

type CamerasSnackbarProps = {
  message: string | null;
  onDismiss: () => void;
};

export function CamerasSnackbar({ message, onDismiss }: CamerasSnackbarProps) {
  return (
    <Snackbar visible={message !== null} onDismiss={onDismiss} duration={4000}>
      {message ?? ''}
    </Snackbar>
  );
}

type StreamDialogState = {
  cameraId: string | null;
  cameraName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
};

type CamerasStreamDialogProps = {
  state: StreamDialogState;
  loading: boolean;
  onDismiss: () => void;
  onChangeTitle: (value: string) => void;
  onChangePrivacy: (value: YouTubePrivacyStatus) => void;
  onStart: () => void;
};

export function CamerasStreamDialog({
  state,
  loading,
  onDismiss,
  onChangeTitle,
  onChangePrivacy,
  onStart,
}: CamerasStreamDialogProps) {
  return (
    <Portal>
      <Dialog visible={state.cameraId !== null} onDismiss={onDismiss}>
        <Dialog.Title>Go Live on {state.cameraName}</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <TextInput
            mode="outlined"
            label="Stream title (optional)"
            value={state.title}
            onChangeText={onChangeTitle}
            maxLength={100}
          />
          <Text variant="labelMedium" style={styles.dialogLabel}>
            Visibility
          </Text>
          <SegmentedButtons
            value={state.privacy}
            onValueChange={(value) => onChangePrivacy(value as YouTubePrivacyStatus)}
            buttons={[
              { value: 'private', label: 'Private', icon: 'lock' },
              { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
              { value: 'public', label: 'Public', icon: 'earth' },
            ]}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>
            Cancel
          </Button>
          <Button onPress={onStart} loading={loading} disabled={loading}>
            Go Live
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
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
          pressed ? styles.cellPressed : null,
          selected ? styles.cellSelected : null,
        ]}
      >
        <CameraCard camera={camera} effectiveConnection={effectiveConnection} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
  },
  list: {
    padding: 12,
    paddingBottom: 88,
    gap: 10,
  },
  emptyList: {
    flex: 1,
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
    borderWidth: 3,
    borderColor: '#1976d2',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    opacity: 0.4,
  },
  emptyTitle: {
    marginTop: 16,
    opacity: 0.6,
  },
  emptyBody: {
    marginTop: 8,
    opacity: 0.5,
    textAlign: 'center',
  },
  fab: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogContent: {
    gap: 12,
  },
  dialogLabel: {
    marginTop: 4,
  },
});
