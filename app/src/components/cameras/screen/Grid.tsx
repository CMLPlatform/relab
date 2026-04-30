import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useCallback, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import { CameraCard } from '@/components/cameras/CameraCard';
import { createCameraScreenStyles } from '@/components/cameras/screen/styles';
import {
  type EffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

type EffectiveConnectionSnapshot = Pick<EffectiveCameraConnection, 'isReachable' | 'transport'>;

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
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  const renderCameraCell = useCallback(
    ({ item }: { item: CameraReadWithStatus }) => (
      <CameraGridCell
        camera={item}
        selected={selectedIds.has(item.id)}
        onPress={onCardPress}
        onLongPress={onCardLongPress}
        onEffectiveConnectionChange={onEffectiveConnectionChange}
      />
    ),
    [onCardLongPress, onCardPress, onEffectiveConnectionChange, selectedIds],
  );

  return (
    <FlatList
      data={rows}
      extraData={selectedIds}
      keyExtractor={(item) => item.id}
      renderItem={renderCameraCell}
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
}: {
  camera: CameraReadWithStatus;
  selected: boolean;
  onPress: (camera: CameraReadWithStatus) => void;
  onLongPress: (camera: CameraReadWithStatus) => void;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
}) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
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
});
