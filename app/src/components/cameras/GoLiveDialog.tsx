import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';

type GoLiveDialogProps = {
  visible: boolean;
  cameraName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
  loading: boolean;
  onDismiss: () => void;
  onChangeTitle: (value: string) => void;
  onChangePrivacy: (value: YouTubePrivacyStatus) => void;
  onStart: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** Pushes the secondary action to the far left, e.g. a "Back" step in a picker flow. */
  showSpacer?: boolean;
};

export function GoLiveDialog({
  visible,
  cameraName,
  title,
  privacy,
  loading,
  onDismiss,
  onChangeTitle,
  onChangePrivacy,
  onStart,
  secondaryLabel,
  onSecondary,
  showSpacer = false,
}: GoLiveDialogProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Go Live on {cameraName}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <TextInput
            mode="outlined"
            label="Stream title (optional)"
            value={title}
            onChangeText={onChangeTitle}
            maxLength={100}
          />
          <Text variant="labelMedium" style={styles.label}>
            Visibility
          </Text>
          <SegmentedButtons
            value={privacy}
            onValueChange={(value) => onChangePrivacy(value as YouTubePrivacyStatus)}
            buttons={[
              { value: 'private', label: 'Private', icon: 'lock' },
              { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
              { value: 'public', label: 'Public', icon: 'earth' },
            ]}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onSecondary} disabled={loading}>
            {secondaryLabel}
          </Button>
          {showSpacer ? <View style={styles.spacer} /> : null}
          <Button onPress={onStart} loading={loading} disabled={loading}>
            Go Live
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  label: {
    marginTop: 4,
  },
  spacer: {
    flex: 1,
  },
});
