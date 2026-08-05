import { type RefObject, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { TextInput } from '@/components/base/TextInput';
import { Text as UiText } from '@/components/base/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/base/ui/toggle-group';
import { radius } from '@/constants';
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
  triggerRef?: RefObject<View | null>;
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
  triggerRef,
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
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
      <AppText accessibilityRole="header" className="mb-2 font-semibold" style={styles.title}>
        Go Live on {cameraName}
      </AppText>
      <View className="gap-3">
        <TextInput
          value={title}
          onChangeText={onChangeTitle}
          maxLength={100}
          placeholder="Stream title (optional)"
          accessibilityLabel="Stream title (optional)"
          // TextInput is not cssInterop-wrapped for `className` in this app; styling stays JS-side.
          style={[styles.input, { borderColor: theme.colors.outline }]}
        />
        <AppText variant="label" className="mt-1">
          Visibility
        </AppText>
        <ToggleGroup type="single" value={privacy} onValueChange={handleValueChange}>
          <ToggleGroupItem value="private" isFirst>
            <Icon name="lock" size={16} color={theme.colors.onSurface} />
            <UiText>Private</UiText>
          </ToggleGroupItem>
          <ToggleGroupItem value="unlisted">
            <Icon name="eye-off" size={16} color={theme.colors.onSurface} />
            <UiText>Unlisted</UiText>
          </ToggleGroupItem>
          <ToggleGroupItem value="public" isLast>
            <Icon name="earth" size={16} color={theme.colors.onSurface} />
            <UiText>Public</UiText>
          </ToggleGroupItem>
        </ToggleGroup>
      </View>
      <View className="mt-4 flex-row justify-end gap-1">
        <AppButton variant="ghost" onPress={onSecondary} disabled={loading}>
          {secondaryLabel}
        </AppButton>
        {showSpacer ? <View className="flex-1" /> : null}
        <AppButton variant="primary" onPress={onStart} loading={loading} disabled={loading}>
          Go Live
        </AppButton>
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  title: {
    // fontSize 18 has no exact Tailwind step without also changing lineHeight.
    fontSize: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
