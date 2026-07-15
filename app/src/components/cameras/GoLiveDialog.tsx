import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { Text as UiText } from '@/components/base/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/base/ui/toggle-group';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

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
  const theme = useAppTheme();
  const handleValueChange = useCallback(
    // Single-select toggle groups can report `undefined` (pressing the
    // already-active item) — visibility must always have a value, so that's
    // treated as a no-op rather than clearing the selection.
    (value: string | undefined) => {
      if (value) onChangePrivacy(value as YouTubePrivacyStatus);
    },
    [onChangePrivacy],
  );

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
          <ToggleGroup type="single" value={privacy} onValueChange={handleValueChange}>
            <ToggleGroupItem value="private" isFirst>
              <MaterialCommunityIcons name="lock" size={16} color={theme.colors.onSurface} />
              <UiText>Private</UiText>
            </ToggleGroupItem>
            <ToggleGroupItem value="unlisted">
              <MaterialCommunityIcons name="eye-off" size={16} color={theme.colors.onSurface} />
              <UiText>Unlisted</UiText>
            </ToggleGroupItem>
            <ToggleGroupItem value="public" isLast>
              <MaterialCommunityIcons name="earth" size={16} color={theme.colors.onSurface} />
              <UiText>Public</UiText>
            </ToggleGroupItem>
          </ToggleGroup>
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
