import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { radius } from '@/constants';
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
    // NOTE: no triggerRef — this reusable dialog is opened from callers (the
    // "Go Live" button, RPi capture buttons), not from a trigger in this file.
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="camera-off" size={32} color={theme.tokens.text.muted} />
            <MutedText style={styles.emptyText}>No cameras registered</MutedText>
          </View>
        ) : (
          sorted.map((cam) => <CameraPickerRow key={cam.id} camera={cam} onSelect={onSelect} />)
        )}
      </View>
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={handleManage}>
          <Icon name="cog" size={16} color={theme.colors.onSurface} />
          <AppText style={{ color: theme.colors.onSurface }}>Manage</AppText>
        </AppButton>
        <View style={styles.spacer} />
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
      style={[
        styles.row,
        { borderColor: theme.colors.outlineVariant, opacity: isReachable ? 1 : 0.4 },
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: isReachable ? theme.tokens.status.success : theme.tokens.text.muted },
        ]}
      />
      <Icon name="access-point" size="md" color={theme.colors.onSurface} />
      <AppText style={styles.rowTitle}>{camera.name}</AppText>
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

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  content: {
    gap: 8,
  },
  loading: {
    padding: 16,
  },
  emptyState: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  spacer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowTitle: {
    flex: 1,
  },
});
