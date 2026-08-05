import { memo, type RefObject, useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  type PressableStateCallbackType,
  RefreshControl,
  View,
} from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { CameraCard } from '@/components/cameras/CameraCard';
import {
  type EffectiveConnectionSnapshot,
  useEffectiveCameraConnection,
} from '@/features/cameras/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';
import { createCameraScreenStyles } from './styles';

type CamerasGridProps = {
  rows: CameraReadWithStatus[];
  numColumns: number;
  selectedIds: Set<string>;
  isFetching: boolean;
  onRefresh: () => void;
  onCardPress: (camera: CameraReadWithStatus) => void;
  onCardLongPress: (camera: CameraReadWithStatus) => void;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
  /**
   * Return-focus target for the stream (GoLiveDialog) flow — whichever cell was
   * tapped becomes the "current" trigger; see AppDialog's `triggerRef`.
   */
  streamTriggerRef?: RefObject<View | null>;
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
  streamTriggerRef,
}: CamerasGridProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  const keyExtractor = useCallback((item: CameraReadWithStatus) => item.id, []);
  const renderCameraCell = useCallback(
    ({ item }: { item: CameraReadWithStatus }) => (
      <CameraGridCell
        camera={item}
        selected={selectedIds.has(item.id)}
        onPress={onCardPress}
        onLongPress={onCardLongPress}
        onEffectiveConnectionChange={onEffectiveConnectionChange}
        streamTriggerRef={streamTriggerRef}
      />
    ),
    [onCardLongPress, onCardPress, onEffectiveConnectionChange, selectedIds, streamTriggerRef],
  );

  return (
    <FlatList
      data={rows}
      extraData={selectedIds}
      keyExtractor={keyExtractor}
      renderItem={renderCameraCell}
      numColumns={numColumns}
      key={`grid-${numColumns}`}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
      contentContainerStyle={[styles.list, rows.length === 0 && styles.emptyList]}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="camera-off" size={64} color={theme.colors.onSurfaceVariant} />
          </View>
          <AppText variant="title" style={styles.emptyTitle}>
            No cameras yet
          </AppText>
          <MutedText style={styles.emptyBody}>
            Tap the + button to register your first RPi camera.
          </MutedText>
        </View>
      }
    />
  );
}

const CameraGridCell = memo(function CameraGridCell({
  camera,
  selected,
  onPress,
  onLongPress,
  onEffectiveConnectionChange,
  streamTriggerRef,
}: {
  camera: CameraReadWithStatus;
  selected: boolean;
  onPress: (camera: CameraReadWithStatus) => void;
  onLongPress: (camera: CameraReadWithStatus) => void;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
  streamTriggerRef?: RefObject<View | null>;
}) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  const effectiveConnection = useEffectiveCameraConnection(camera);
  const cellRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    if (streamTriggerRef) streamTriggerRef.current = cellRef.current;
    onPress(camera);
  }, [onPress, camera, streamTriggerRef]);
  const handleLongPress = useCallback(() => onLongPress(camera), [onLongPress, camera]);
  const cellStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.cellPressable,
      pressed ? styles.cellPressed : null,
      selected ? styles.cellSelected : null,
    ],
    [styles, selected],
  );

  useEffect(() => {
    onEffectiveConnectionChange(camera.id, {
      isReachable: effectiveConnection.isReachable,
      transport: effectiveConnection.transport,
      localConnection: effectiveConnection.localConnection,
    });
  }, [
    camera.id,
    effectiveConnection.isReachable,
    effectiveConnection.transport,
    effectiveConnection.localConnection,
    onEffectiveConnectionChange,
  ]);

  return (
    <View style={styles.cell}>
      <Pressable
        ref={cellRef}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={cellStyle}
      >
        <CameraCard camera={camera} effectiveConnection={effectiveConnection} />
      </Pressable>
    </View>
  );
});
