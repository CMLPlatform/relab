import { Link } from 'expo-router';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import LogoutConfirm from '@/components/common/LogoutConfirm';
import { profileSectionStyles as styles } from './shared';

type ProfileDialogsProps = {
  editUsernameVisible: boolean;
  onDismissEditUsername: () => void;
  newUsername: string;
  onChangeUsername: (value: string) => void;
  onSaveUsername: () => void;
  unlinkDialogVisible: boolean;
  onDismissUnlink: () => void;
  providerToUnlink: string;
  onConfirmUnlink: () => void;
  logoutDialogVisible: boolean;
  onDismissLogout: () => void;
  onConfirmLogout: () => void;
  deleteDialogVisible: boolean;
  onDismissDeleteDialog: () => void;
};

export function ProfileDialogs({
  editUsernameVisible,
  onDismissEditUsername,
  newUsername,
  onChangeUsername,
  onSaveUsername,
  unlinkDialogVisible,
  onDismissUnlink,
  providerToUnlink,
  onConfirmUnlink,
  logoutDialogVisible,
  onDismissLogout,
  onConfirmLogout,
  deleteDialogVisible,
  onDismissDeleteDialog,
}: ProfileDialogsProps) {
  return (
    <Portal>
      <Dialog visible={editUsernameVisible} onDismiss={onDismissEditUsername}>
        <Dialog.Title>Edit Username</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label="Username"
            value={newUsername}
            onChangeText={onChangeUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismissEditUsername}>Cancel</Button>
          <Button onPress={onSaveUsername}>Save</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={unlinkDialogVisible} onDismiss={onDismissUnlink}>
        <Dialog.Title>Unlink Account</Dialog.Title>
        <Dialog.Content>
          <Text>Are you sure you want to disconnect this {providerToUnlink} account?</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismissUnlink}>Cancel</Button>
          <Button onPress={onConfirmUnlink} textColor="#d32f2f">
            Unlink
          </Button>
        </Dialog.Actions>
      </Dialog>

      <LogoutConfirm
        visible={logoutDialogVisible}
        onDismiss={onDismissLogout}
        onConfirm={onConfirmLogout}
      />

      <Dialog visible={deleteDialogVisible} onDismiss={onDismissDeleteDialog}>
        <Dialog.Title>Delete Account</Dialog.Title>
        <Dialog.Content>
          <Text>
            To delete your account and all associated data, please send an email request to:
          </Text>
          <Link href="mailto:relab@cml.leidenuniv.nl">
            <Text style={styles.deleteEmail}>relab@cml.leidenuniv.nl</Text>
          </Link>
          <Text style={styles.deleteMessage}>
            We&apos;ll process your request and confirm the deletion via email.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismissDeleteDialog}>OK</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
