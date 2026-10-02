import { useRouter } from 'expo-router';
import { type RefObject, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { dialogTitleStyle } from '@/components/base/dialogStyles';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import { useCamerasQuery } from '@/features/cameras/rpi/hooks';
import {
  resolveEffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/features/cameras/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera/shared';
import { useAppTheme } from '@/theme/appThemeContext';
import { palette } from '@/theme/palette.generated';
import { heading } from '@/utils/a11y';
import { cn } from '@/utils/cn';

interface CameraPickerDialogProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called with the selected camera (only online cameras are selectable). */
  onSelect: (camera: CameraReadWithStatus) => void;
  title?: string;
  triggerRef?: RefObject<View | null>;
}

/** Camera picker dialog: online cameras first, offline ones dimmed and non-interactive. */
export function CameraPickerDialog({
  visible,
  onDismiss,
  onSelect,
  title = 'Select camera',
  triggerRef,
}: CameraPickerDialogProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const { data: cameras, isLoading } = useCamerasQuery(true, { enabled: visible });

  const handleManage = useCallback(() => {
    onDismiss();
    router.navigate('/cameras');
  }, [onDismiss, router]);

  const sorted = useMemo(
    () =>
      [...(cameras ?? [])].sort((a, b) => {
        const aReachable = resolveEffectiveCameraConnection(a).isReachable ? 0 : 1;
        const bReachable = resolveEffectiveCameraConnection(b).isReachable ? 0 : 1;
        return aReachable - bReachable;
      }),
    [cameras],
  );

  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      triggerRef={triggerRef}
      accessibilityLabel={title}
    >
      <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
        {title}
      </AppText>
      <View className="gap-2">
        {isLoading ? (
          <CenteredSpinner />
        ) : sorted.length === 0 ? (
          <View className="items-center gap-2 p-4">
            <Icon name="camera-off" size={32} color={palette[theme.scheme].mutedForeground} />
            <MutedText className="text-center">No cameras registered</MutedText>
          </View>
        ) : (
          sorted.map((cam) => <CameraPickerRow key={cam.id} camera={cam} onSelect={onSelect} />)
        )}
      </View>
      <View className="mt-4 flex-row items-center justify-end gap-1">
        <AppButton variant="ghost" onPress={handleManage}>
          <Icon name="settings" size={16} color={theme.colors.onSurface} />
          Manage
        </AppButton>
        <View className="flex-1" />
        <AppButton variant="ghost" onPress={onDismiss}>
          Cancel
        </AppButton>
      </View>
    </AppDialog>
  );
}

function CameraPickerRow({
  camera,
  onSelect,
}: {
  camera: CameraReadWithStatus;
  onSelect: (camera: CameraReadWithStatus) => void;
}) {
  const theme = useAppTheme();
  const effectiveConnection = useEffectiveCameraConnection(camera);
  const isReachable = effectiveConnection.isReachable;
  const handleSelect = useCallback(() => {
    if (!isReachable) {
      return;
    }
    onSelect(camera);
  }, [isReachable, onSelect, camera]);

  return (
    <Pressable
      onPress={handleSelect}
      disabled={!isReachable}
      accessibilityRole="button"
      // A disabled (offline) row must not tint on web hover.
      className={cn(
        'flex-row items-center gap-3 rounded-lg border border-border p-3',
        isReachable && PRESS_TINT,
      )}
      style={{ opacity: isReachable ? 1 : 0.4 }}
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: isReachable
            ? theme.tokens.status.success
            : palette[theme.scheme].mutedForeground,
        }}
      />
      <Icon name="radio-tower" size="md" color={theme.colors.onSurface} />
      <AppText className="flex-1">{camera.name}</AppText>
      {effectiveConnection.detailLabel ? (
        <AppText variant="label" style={{ color: theme.tokens.status.success }}>
          Direct
        </AppText>
      ) : null}
      {!isReachable && (
        <AppText variant="label" className="text-muted-foreground">
          Offline
        </AppText>
      )}
    </Pressable>
  );
}
