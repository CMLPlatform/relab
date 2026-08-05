import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';

export default function LogoutConfirm({
  visible,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    // NOTE: no triggerRef — opened from the "Sign out" ProfileAction in
    // AccountSections.tsx, not in this file.
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <AppText variant="plain" accessibilityRole="header" style={dialogTitleStyle}>
        Sign out
      </AppText>
      <AppText variant="plain">Are you sure you want to sign out?</AppText>
      <View style={dialogActionsStyle}>
        <AppButton variant="ghost" onPress={onDismiss}>
          Cancel
        </AppButton>
        <AppButton variant="destructive" onPress={onConfirm}>
          Sign out
        </AppButton>
      </View>
    </AppDialog>
  );
}
