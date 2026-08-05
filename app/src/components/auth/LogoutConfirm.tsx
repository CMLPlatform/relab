import type { RefObject } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';

export default function LogoutConfirm({
  visible,
  onDismiss,
  onConfirm,
  triggerRef,
}: {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<View | null>;
}) {
  return (
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
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
