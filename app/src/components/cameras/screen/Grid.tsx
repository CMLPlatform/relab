import { memo, type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { IosAnnouncement } from '@/components/base/IosAnnouncement';
import { MutedText } from '@/components/base/MutedText';
import { PressOverlay } from '@/components/base/PressOverlay';
import type { PressState } from '@/components/base/pressFeedback';
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
  /** Multi-select is active: cells become toggles with a pressed state. */
  selectionMode: boolean;
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
  selectionMode,
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
        selectionMode={selectionMode}
        onPress={onCardPress}
        onLongPress={onCardLongPress}
        onEffectiveConnectionChange={onEffectiveConnectionChange}
        streamTriggerRef={streamTriggerRef}
      />
    ),
    [
      onCardLongPress,
      onCardPress,
      onEffectiveConnectionChange,
      selectedIds,
      selectionMode,
      streamTriggerRef,
    ],
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
        // Mounted even without a hint: a live region only announces changes
        // to content it has already seen.
        <View accessibilityLiveRegion="polite">
          <IosAnnouncement text={hint} skipInitial />
          {hint ? <MutedText className="pb-1">{hint}</MutedText> : null}
        </View>
      }
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center p-8" testID="cameras-empty-state">
          <StaticBackground scrim={theme.tokens.overlay.hero} />
          <View className="opacity-40">
            <Icon name="camera-off" size={64} color={theme.colors.mutedForeground} />
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
  selectionMode,
  onPress,
  onLongPress,
  onEffectiveConnectionChange,
  streamTriggerRef,
}: {
  camera: CameraReadWithStatus;
  selected: boolean;
  /** Multi-select is active (even with nothing selected yet): only then is a cell a toggle with a pressed state to read out. */
  selectionMode: boolean;
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
  const cellStyle = useMemo(
    () => [styles.cellPressable, selected ? styles.cellSelected : null],
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
        // Outside selection mode a cell is a plain button, not a toggle reading "not pressed".
        accessibilityState={selectionMode ? { selected } : undefined}
        // aria-selected is invalid on role=button; the toggle state goes out as aria-pressed.
        aria-pressed={selectionMode ? selected : undefined}
        style={cellStyle}
      >
        {/* The card's own fill hides a background, so the press tint lies over it. */}
        {(state: PressState) => (
          <>
            <CameraCard camera={camera} effectiveConnection={effectiveConnection} />
            <PressOverlay {...state} className="rounded-lg" />
          </>
        )}
      </Pressable>
    </View>
  );
});
