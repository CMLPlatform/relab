import { memo, type RefObject, useCallback, useEffect, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  FlatList,
  Pressable,
  type PressableStateCallbackType,
  RefreshControl,
  View,
} from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { StaticBackground } from '@/components/base/StaticBackground';
import { CameraCard } from '@/components/cameras/CameraCard';
import {
  type EffectiveConnectionSnapshot,
  useEffectiveCameraConnection,
} from '@/features/cameras/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera/shared';
import { useAppTheme } from '@/theme/appThemeContext';
import { createCameraScreenStyles } from './styles';

type CamerasGridProps = {
  rows: CameraReadWithStatus[];
  numColumns: number;
  selectedIds: Set<string>;
  isFetching: boolean;
  onRefresh: () => void;
  onCardPress: (camera: CameraReadWithStatus) => void;
  onCardLongPress: (camera: CameraReadWithStatus) => void;
  /** One-line cue above the grid, e.g. how to enter multi-select. */
  hint?: string;
  onEffectiveConnectionChange: (cameraId: string, connection: EffectiveConnectionSnapshot) => void;
  /** Return-focus target for GoLiveDialog: the tapped cell (see AppDialog's `triggerRef`). */
  streamTriggerRef?: RefObject<View | null>;
};

const LONG_PRESS_ACTION = { name: 'longpress', label: 'Select' } as const;
const CELL_ACTIONS = [LONG_PRESS_ACTION];

export function CamerasGrid({
  rows,
  numColumns,
  selectedIds,
  isFetching,
  onRefresh,
  onCardPress,
  onCardLongPress,
  hint,
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
      contentContainerClassName={`gap-2.5 p-3 pb-[88px]${rows.length === 0 ? ' flex-1' : ''}`}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ListHeaderComponent={
        hint ? (
          <MutedText className="pb-1" accessibilityLiveRegion="polite">
            {hint}
          </MutedText>
        ) : null
      }
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center p-8" testID="cameras-empty-state">
          <StaticBackground scrim={theme.tokens.overlay.hero} />
          <View className="opacity-40">
            <Icon name="camera-off" size={64} color={theme.colors.onSurfaceVariant} />
          </View>
          <AppText variant="title" className="mt-4 text-muted-foreground">
            No cameras yet
          </AppText>
          <MutedText className="mt-2 text-center">
            Tap Add camera to register your first RPi camera.
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
  // A long press has no screen-reader gesture; this exposes it as a rotor action.
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === LONG_PRESS_ACTION.name) onLongPress(camera);
    },
    [onLongPress, camera],
  );
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
    <View className="flex-1">
      <Pressable
        ref={cellRef}
        testID={`camera-cell-${camera.id}`}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        // The name comes from CameraCard's own label inside.
        accessibilityRole="button"
        accessibilityActions={CELL_ACTIONS}
        onAccessibilityAction={handleAccessibilityAction}
        accessibilityState={{ selected }}
        // aria-selected is invalid on role=button; the toggle state goes out as aria-pressed.
        aria-pressed={selected}
        style={cellStyle}
      >
        <CameraCard camera={camera} effectiveConnection={effectiveConnection} />
      </Pressable>
    </View>
  );
});
