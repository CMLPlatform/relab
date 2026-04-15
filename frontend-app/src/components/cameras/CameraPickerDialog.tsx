import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Icon, Portal, Text } from 'react-native-paper';
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
    const aOnline = a.status?.connection === 'online' ? 0 : 1;
    const bOnline = b.status?.connection === 'online' ? 0 : 1;
    return aOnline - bOnline;
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
            sorted.map((cam) => {
              const isOnline = cam.status?.connection === 'online';
              return (
                <Pressable
                  key={cam.id}
                  onPress={() => {
                    if (!isOnline) return;
                    onSelect(cam);
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
                    opacity: isOnline ? 1 : 0.4,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: isOnline ? '#2e7d32' : '#999',
                    }}
                  />
                  <Icon source="access-point" size={20} />
                  <Text style={{ flex: 1 }}>{cam.name}</Text>
                  {!isOnline && (
                    <Text variant="labelSmall" style={{ color: '#999' }}>
                      Offline
                    </Text>
                  )}
                </Pressable>
              );
            })
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
