import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useAppTheme } from '@/theme';

export default function LogoutConfirm({
  visible,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Sign out</Dialog.Title>
        <Dialog.Content>
          <Text>Are you sure you want to sign out?</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button onPress={onConfirm} textColor={theme.tokens.status.danger}>
            Sign out
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
