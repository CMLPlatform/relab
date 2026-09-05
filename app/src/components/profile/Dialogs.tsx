import { Link } from 'expo-router';
import type { RefObject } from 'react';
import { View } from 'react-native';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { TextInput } from '@/components/base/TextInput';
import { useAppTheme } from '@/theme';
import { createProfileSectionStyles } from './styles';

type ProfileDialogsProps = {
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
  unlinkTriggerRef?: RefObject<View | null>;
  logoutTriggerRef?: RefObject<View | null>;
  deleteAccountTriggerRef?: RefObject<View | null>;
};

export function ProfileDialogs({
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
  unlinkTriggerRef,
  logoutTriggerRef,
  deleteAccountTriggerRef,
}: ProfileDialogsProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  return (
    <>
      <AppDialog
        visible={unlinkDialogVisible}
        onDismiss={onDismissUnlink}
        triggerRef={unlinkTriggerRef}
      >
        <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
          Unlink account
        </AppText>
        <AppText>Are you sure you want to disconnect this {providerToUnlink} account?</AppText>
        {isLastLinkedProvider ? (
          <AppText className="mt-2.5" style={styles.unlinkWarning}>
            This is your only linked account. If you never set a password, you will have to reset it
            by email to sign in again.
          </AppText>
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
            className="border px-2 py-2 mt-2"
            style={{ borderColor: theme.colors.outline }}
          />
        ) : null}
        <View style={dialogActionsStyle}>
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
        triggerRef={logoutTriggerRef}
      />

      <AppDialog
        visible={deleteDialogVisible}
        onDismiss={onDismissDeleteDialog}
        triggerRef={deleteAccountTriggerRef}
      >
        <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
          Delete account
        </AppText>
        <AppText>To delete your account and all its data, email us at:</AppText>
        <Link href="mailto:relab@cml.leidenuniv.nl">
          <AppText className="mt-2.5 font-bold">relab@cml.leidenuniv.nl</AppText>
        </Link>
        <AppText className="mt-2.5">We&apos;ll confirm the deletion by email.</AppText>
        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={onDismissDeleteDialog}>
            OK
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}
