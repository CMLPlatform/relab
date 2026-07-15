import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { TextInput } from '@/components/base/TextInput';
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
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <AppText accessibilityRole="header" style={styles.title}>
        Go Live on {cameraName}
      </AppText>
      <View style={styles.content}>
        <TextInput
          value={title}
          onChangeText={onChangeTitle}
          maxLength={100}
          placeholder="Stream title (optional)"
          accessibilityLabel="Stream title (optional)"
          style={[styles.input, { borderColor: theme.colors.outline }]}
        />
        <AppText variant="label" style={styles.label}>
          Visibility
        </AppText>
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
      </View>
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onSecondary} disabled={loading}>
          {secondaryLabel}
        </AppButton>
        {showSpacer ? <View style={styles.spacer} /> : null}
        <AppButton variant="primary" onPress={onStart} loading={loading} disabled={loading}>
          Go Live
        </AppButton>
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  content: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 16,
  },
  spacer: {
    flex: 1,
  },
});
