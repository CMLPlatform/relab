import { Link } from 'expo-router';
import type { RefObject } from 'react';
import { View } from 'react-native';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { TextInput } from '@/components/base/TextInput';
import { SUPPORT_EMAIL } from '@/constants';
import { useAppTheme } from '@/theme/appThemeContext';
import { heading } from '@/utils/a11y';
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
  onConfirmDelete: () => void;
  deleteRequiresPassword: boolean;
  deletePassword: string;
  onChangeDeletePassword: (value: string) => void;
  deleteRequiresMfa: boolean;
  deleteMfaCode: string;
  onChangeDeleteMfaCode: (value: string) => void;
  deletePending: boolean;
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
  onConfirmDelete,
  deleteRequiresPassword,
  deletePassword,
  onChangeDeletePassword,
  deleteRequiresMfa,
  deleteMfaCode,
  onChangeDeleteMfaCode,
  deletePending,
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
        accessibilityLabel="Unlink account"
      >
        <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
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
        accessibilityLabel="Delete account"
      >
        <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
          Delete account
        </AppText>
        <AppText>
          This deletes your account and signs you out on every device. It cannot be undone.
        </AppText>
        <AppText className="mt-2.5">
          Products and photos you added stay on the platform, without your name.
        </AppText>
        {deleteRequiresPassword ? (
          <TextInput
            value={deletePassword}
            onChangeText={onChangeDeletePassword}
            placeholder="Current password"
            accessibilityLabel="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            className="border px-2 py-2 mt-2.5"
            style={{ borderColor: theme.colors.outline }}
          />
        ) : null}
        {deleteRequiresMfa ? (
          <TextInput
            value={deleteMfaCode}
            onChangeText={onChangeDeleteMfaCode}
            placeholder="Authenticator or recovery code"
            accessibilityLabel="Authentication code"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            className="border px-2 py-2 mt-2.5"
            style={{ borderColor: theme.colors.outline }}
          />
        ) : null}
        <AppText className="mt-2.5">
          To have your uploads removed as well, email{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`}>
            <AppText className="font-bold">{SUPPORT_EMAIL}</AppText>
          </Link>
          .
        </AppText>
        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={onDismissDeleteDialog}>
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            onPress={onConfirmDelete}
            disabled={
              deletePending ||
              (deleteRequiresPassword && deletePassword.length === 0) ||
              (deleteRequiresMfa && deleteMfaCode.trim().length === 0)
            }
          >
            Delete account
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}
