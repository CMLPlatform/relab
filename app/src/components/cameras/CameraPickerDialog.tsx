import { useRouter } from 'expo-router';
import { type RefObject, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogTitleStyle } from '@/components/base/dialogStyles';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { useCamerasQuery } from '@/features/cameras/rpi/hooks';
import {
  resolveEffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/features/cameras/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

interface CameraPickerDialogProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called with the selected camera (only online cameras are selectable). */
  onSelect: (camera: CameraReadWithStatus) => void;
  title?: string;
  triggerRef?: RefObject<View | null>;
}

/**
 * Reusable camera picker dialog — lists all registered cameras sorted online
 * first. Offline cameras are shown dimmed and non-interactive. A "Manage"
 * button navigates to the camera management screen.
 */
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
    router.push('/cameras');
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
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
      <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
        {title}
      </AppText>
      <View className="gap-2">
        {isLoading ? (
          <ActivityIndicator className="p-4" />
        ) : sorted.length === 0 ? (
          <View className="items-center gap-2 p-4">
            <Icon name="camera-off" size={32} color={theme.tokens.text.muted} />
            <MutedText className="text-center">No cameras registered</MutedText>
          </View>
        ) : (
          sorted.map((cam) => <CameraPickerRow key={cam.id} camera={cam} onSelect={onSelect} />)
        )}
      </View>
      <View className="mt-4 flex-row items-center justify-end gap-1">
        <AppButton variant="ghost" onPress={handleManage}>
          <Icon name="cog" size={16} color={theme.colors.onSurface} />
          <AppText style={{ color: theme.colors.onSurface }}>Manage</AppText>
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
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-lg border border-border p-3"
      style={{ opacity: isReachable ? 1 : 0.4 }}
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: isReachable ? theme.tokens.status.success : theme.tokens.text.muted,
        }}
      />
      <Icon name="access-point" size="md" color={theme.colors.onSurface} />
      <AppText className="flex-1">{camera.name}</AppText>
      {effectiveConnection.detailLabel ? (
        <AppText variant="label" style={{ color: theme.tokens.status.success }}>
          Direct
        </AppText>
      ) : null}
      {!isReachable && (
        <AppText variant="label" style={{ color: theme.tokens.text.muted }}>
          Offline
        </AppText>
      )}
    </Pressable>
  );
}
