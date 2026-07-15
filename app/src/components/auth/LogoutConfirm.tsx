import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { Text } from '@/components/base/Text';

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
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <Text accessibilityRole="header" style={dialogTitleStyle}>
        Sign out
      </Text>
      <Text>Are you sure you want to sign out?</Text>
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
