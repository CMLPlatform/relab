import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Icon, Portal, Text } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import {
  resolveEffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import { useCamerasQuery } from '@/hooks/useRpiCameras';
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

  const sorted = [...(cameras ?? [])].sort((a, b) => {
    const aReachable = resolveEffectiveCameraConnection(a).isReachable ? 0 : 1;
    const bReachable = resolveEffectiveCameraConnection(b).isReachable ? 0 : 1;
    return aReachable - bReachable;
  });

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          {isLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : sorted.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon source="camera-off" size={32} color={theme.tokens.text.muted} />
              <MutedText style={styles.emptyText}>No cameras registered</MutedText>
            </View>
          ) : (
            sorted.map((cam) => <CameraPickerRow key={cam.id} camera={cam} onSelect={onSelect} />)
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={() => {
              onDismiss();
              router.push('/cameras');
            }}
            icon="cog"
            compact
          >
            Manage
          </Button>
          <View style={styles.spacer} />
          <Button onPress={onDismiss}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
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

  return (
    <Pressable
      onPress={() => {
        if (!isReachable) return;
        onSelect(camera);
      }}
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
      <Icon source="access-point" size={20} />
      <Text style={styles.rowTitle}>{camera.name}</Text>
      {effectiveConnection.detailLabel ? (
        <Text variant="labelSmall" style={{ color: theme.tokens.status.success }}>
          Direct
        </Text>
      ) : null}
      {!isReachable && (
        <Text variant="labelSmall" style={{ color: theme.tokens.text.muted }}>
          Offline
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  spacer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
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
