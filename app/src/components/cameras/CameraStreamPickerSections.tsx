import { View } from 'react-native';
import { Button, Dialog, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { CameraPickerDialog } from './CameraPickerDialog';

type ConfigState = {
  camera: CameraReadWithStatus;
  title: string;
  privacy: YouTubePrivacyStatus;
};

type CameraSelectionStepProps = {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (camera: CameraReadWithStatus) => void;
};

export function CameraSelectionStep({ visible, onDismiss, onSelect }: CameraSelectionStepProps) {
  return (
    <CameraPickerDialog
      visible={visible}
      onDismiss={onDismiss}
      onSelect={onSelect}
      title="Select camera to stream"
    />
  );
}

type CameraStreamConfigDialogProps = {
  config: ConfigState | null;
  loading: boolean;
  onBack: () => void;
  onDismiss: () => void;
  onChangeTitle: (value: string) => void;
  onChangePrivacy: (value: YouTubePrivacyStatus) => void;
  onStart: () => void;
};

export function CameraStreamConfigDialog({
  config,
  loading,
  onBack,
  onDismiss,
  onChangeTitle,
  onChangePrivacy,
  onStart,
}: CameraStreamConfigDialogProps) {
  return (
    <Portal>
      <Dialog visible={config !== null} onDismiss={onDismiss}>
        <Dialog.Title>Go Live on {config?.camera.name}</Dialog.Title>
        <Dialog.Content style={{ gap: 12 }}>
          <TextInput
            mode="outlined"
            label="Stream title (optional)"
            value={config?.title ?? ''}
            onChangeText={onChangeTitle}
            maxLength={100}
          />
          <Text variant="labelMedium" style={{ marginTop: 4 }}>
            Visibility
          </Text>
          <SegmentedButtons
            value={config?.privacy ?? 'private'}
            onValueChange={(value) => onChangePrivacy(value as YouTubePrivacyStatus)}
            buttons={[
              { value: 'private', label: 'Private', icon: 'lock' },
              { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
              { value: 'public', label: 'Public', icon: 'earth' },
            ]}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onBack} disabled={loading}>
            Back
          </Button>
          <View style={{ flex: 1 }} />
          <Button onPress={onStart} loading={loading} disabled={loading}>
            Go Live
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
