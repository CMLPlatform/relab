import {
  AnimatedFAB,
  Button,
  Dialog,
  Portal,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { SelectionBar } from '@/components/cameras/SelectionBar';
import { createCameraScreenStyles } from '@/components/cameras/screen/styles';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

type StreamDialogState = {
  cameraId: string | null;
  cameraName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
};

type CamerasSelectionOverlayProps = {
  visible: boolean;
  selectedCount: number;
  onlineCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCaptureAll: () => void;
  isCapturing: boolean;
};

export function CamerasSelectionOverlay({
  visible,
  selectedCount,
  onlineCount,
  onSelectAll,
  onClear,
  onCaptureAll,
  isCapturing,
}: CamerasSelectionOverlayProps) {
  if (!visible) return null;

  return (
    <SelectionBar
      selectedCount={selectedCount}
      onlineCount={onlineCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
      onCaptureAll={onCaptureAll}
      isCapturing={isCapturing}
    />
  );
}

type CamerasFabProps = {
  visible: boolean;
  onPress: () => void;
};

export function CamerasFab({ visible, onPress }: CamerasFabProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  if (!visible) return null;

  return (
    <AnimatedFAB
      icon="plus"
      label="Add Camera"
      extended
      onPress={onPress}
      style={styles.fab}
      accessibilityLabel="Add camera"
    />
  );
}

type CamerasSnackbarProps = {
  message: string | null;
  onDismiss: () => void;
};

export function CamerasSnackbar({ message, onDismiss }: CamerasSnackbarProps) {
  return (
    <Snackbar visible={message !== null} onDismiss={onDismiss} duration={4000}>
      {message ?? ''}
    </Snackbar>
  );
}

type CamerasStreamDialogProps = {
  state: StreamDialogState;
  loading: boolean;
  onDismiss: () => void;
  onChangeTitle: (value: string) => void;
  onChangePrivacy: (value: YouTubePrivacyStatus) => void;
  onStart: () => void;
};

export function CamerasStreamDialog({
  state,
  loading,
  onDismiss,
  onChangeTitle,
  onChangePrivacy,
  onStart,
}: CamerasStreamDialogProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  return (
    <Portal>
      <Dialog visible={state.cameraId !== null} onDismiss={onDismiss}>
        <Dialog.Title>Go Live on {state.cameraName}</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <TextInput
            mode="outlined"
            label="Stream title (optional)"
            value={state.title}
            onChangeText={onChangeTitle}
            maxLength={100}
          />
          <Text variant="labelMedium" style={styles.dialogLabel}>
            Visibility
          </Text>
          <SegmentedButtons
            value={state.privacy}
            onValueChange={(value) => onChangePrivacy(value as YouTubePrivacyStatus)}
            buttons={[
              { value: 'private', label: 'Private', icon: 'lock' },
              { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
              { value: 'public', label: 'Public', icon: 'earth' },
            ]}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>
            Cancel
          </Button>
          <Button onPress={onStart} loading={loading} disabled={loading}>
            Go Live
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
