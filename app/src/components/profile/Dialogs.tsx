import { Link } from 'expo-router';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { Text } from '@/components/base/Text';
import { useAppTheme } from '@/theme';
import { createProfileSectionStyles } from './styles';

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
  isLastLinkedProvider: boolean;
  unlinkRequiresPassword: boolean;
  unlinkPassword: string;
  onChangeUnlinkPassword: (value: string) => void;
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
  isLastLinkedProvider,
  unlinkRequiresPassword,
  unlinkPassword,
  onChangeUnlinkPassword,
  logoutDialogVisible,
  onDismissLogout,
  onConfirmLogout,
  deleteDialogVisible,
  onDismissDeleteDialog,
}: ProfileDialogsProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
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
          {isLastLinkedProvider ? (
            <Text style={styles.unlinkWarning}>
              This is your only linked account. If you never set a password, you will have to reset
              it by email to sign in again.
            </Text>
          ) : null}
          {unlinkRequiresPassword ? (
            <TextInput
              mode="outlined"
              label="Current password"
              value={unlinkPassword}
              onChangeText={onChangeUnlinkPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
            />
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismissUnlink}>Cancel</Button>
          <Button
            onPress={onConfirmUnlink}
            disabled={unlinkRequiresPassword && unlinkPassword.length === 0}
            textColor={theme.tokens.status.danger}
          >
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
