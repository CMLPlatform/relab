import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Icon, Portal, Text } from 'react-native-paper';
import {
  resolveEffectiveCameraConnection,
  useEffectiveCameraConnection,
} from '@/hooks/useEffectiveCameraConnection';
import { useCamerasQuery } from '@/hooks/useRpiCameras';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

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
        <Dialog.Content style={{ gap: 8 }}>
          {isLoading ? (
            <ActivityIndicator style={{ padding: 16 }} />
          ) : sorted.length === 0 ? (
            <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
              <Icon source="camera-off" size={32} color="#999" />
              <Text style={{ color: '#999', textAlign: 'center' }}>No cameras registered</Text>
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
          <View style={{ flex: 1 }} />
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
  const effectiveConnection = useEffectiveCameraConnection(camera);
  const isReachable = effectiveConnection.isReachable;

  return (
    <Pressable
      onPress={() => {
        if (!isReachable) return;
        onSelect(camera);
      }}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        opacity: isReachable ? 1 : 0.4,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: isReachable ? '#2e7d32' : '#999',
        }}
      />
      <Icon source="access-point" size={20} />
      <Text style={{ flex: 1 }}>{camera.name}</Text>
      {effectiveConnection.detailLabel ? (
        <Text variant="labelSmall" style={{ color: '#2e7d32' }}>
          Direct
        </Text>
      ) : null}
      {!isReachable && (
        <Text variant="labelSmall" style={{ color: '#999' }}>
          Offline
        </Text>
      )}
    </Pressable>
  );
}
