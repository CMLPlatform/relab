import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';
import { radius, spacing } from '@/constants';
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
    <>
      <AppDialog visible={editUsernameVisible} onDismiss={onDismissEditUsername}>
        <Text accessibilityRole="header" style={dialogStyles.title}>
          Edit username
        </Text>
        <TextInput
          value={newUsername}
          onChangeText={onChangeUsername}
          placeholder="Username"
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          style={[dialogStyles.input, { borderColor: theme.colors.outline }]}
        />
        <View style={dialogStyles.actions}>
          <AppButton variant="ghost" onPress={onDismissEditUsername}>
            Cancel
          </AppButton>
          <AppButton variant="ghost" onPress={onSaveUsername}>
            Save
          </AppButton>
        </View>
      </AppDialog>

      <AppDialog visible={unlinkDialogVisible} onDismiss={onDismissUnlink}>
        <Text accessibilityRole="header" style={dialogStyles.title}>
          Unlink account
        </Text>
        <Text>Are you sure you want to disconnect this {providerToUnlink} account?</Text>
        {isLastLinkedProvider ? (
          <Text style={styles.unlinkWarning}>
            This is your only linked account. If you never set a password, you will have to reset it
            by email to sign in again.
          </Text>
        ) : null}
        {unlinkRequiresPassword ? (
          <TextInput
            value={unlinkPassword}
            onChangeText={onChangeUnlinkPassword}
            placeholder="Current password"
            accessibilityLabel="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            style={[dialogStyles.input, { borderColor: theme.colors.outline }]}
          />
        ) : null}
        <View style={dialogStyles.actions}>
          <AppButton variant="ghost" onPress={onDismissUnlink}>
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            onPress={onConfirmUnlink}
            disabled={unlinkRequiresPassword && unlinkPassword.length === 0}
          >
            Unlink
          </AppButton>
        </View>
      </AppDialog>

      <LogoutConfirm
        visible={logoutDialogVisible}
        onDismiss={onDismissLogout}
        onConfirm={onConfirmLogout}
      />

      <AppDialog visible={deleteDialogVisible} onDismiss={onDismissDeleteDialog}>
        <Text accessibilityRole="header" style={dialogStyles.title}>
          Delete account
        </Text>
        <Text>To delete your account and all its data, email us at:</Text>
        <Link href="mailto:relab@cml.leidenuniv.nl">
          <Text style={styles.deleteEmail}>relab@cml.leidenuniv.nl</Text>
        </Link>
        <Text style={styles.deleteMessage}>We&apos;ll confirm the deletion by email.</Text>
        <View style={dialogStyles.actions}>
          <AppButton variant="ghost" onPress={onDismissDeleteDialog}>
            OK
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}

const dialogStyles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
