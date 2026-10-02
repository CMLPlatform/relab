import { Link } from 'expo-router';
import type { RefObject } from 'react';
import { View } from 'react-native';
import LogoutConfirm from '@/components/auth/LogoutConfirm';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { FormFieldError } from '@/components/base/FormField';
import { TextInput } from '@/components/base/TextInput';
import { SUPPORT_EMAIL } from '@/constants';
import type { useProfileDialogs } from '@/features/profile/state';
import { useAppTheme } from '@/theme/appThemeContext';
import { describedBy, heading } from '@/utils/a11y';
import { createProfileSectionStyles } from './styles';

type DeleteDialogState = Pick<
  ReturnType<typeof useProfileDialogs>['deleteDialog'],
  'visible' | 'close' | 'password' | 'setPassword' | 'mfaCode' | 'setMfaCode' | 'pending' | 'error'
>;

type ProfileDialogsProps = {
  unlinkDialogVisible: boolean;
  onDismissUnlink: () => void;
  providerToUnlink: string;
  onConfirmUnlink: () => void;
  isLastLinkedProvider: boolean;
  unlinkRequiresPassword: boolean;
  unlinkPassword: string;
  onChangeUnlinkPassword: (value: string) => void;
  unlinkRequiresMfa?: boolean;
  unlinkMfaCode?: string;
  onChangeUnlinkMfaCode?: (value: string) => void;
  logoutDialogVisible: boolean;
  onDismissLogout: () => void;
  onConfirmLogout: () => void;
  deleteDialog: DeleteDialogState;
  onConfirmDelete: () => void;
  deleteRequiresPassword: boolean;
  deleteRequiresMfa: boolean;
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
  unlinkRequiresMfa = false,
  unlinkMfaCode = '',
  onChangeUnlinkMfaCode,
  logoutDialogVisible,
  onDismissLogout,
  onConfirmLogout,
  deleteDialog,
  onConfirmDelete,
  deleteRequiresPassword,
  deleteRequiresMfa,
  unlinkTriggerRef,
  logoutTriggerRef,
  deleteAccountTriggerRef,
}: ProfileDialogsProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  const deleteErrorProps = describedBy('delete-account-error', Boolean(deleteDialog.error));
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
        {unlinkRequiresMfa ? (
          <TextInput
            value={unlinkMfaCode}
            onChangeText={onChangeUnlinkMfaCode}
            placeholder="Authenticator or recovery code"
            accessibilityLabel="Authentication code"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
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
            disabled={
              (unlinkRequiresPassword && unlinkPassword.length === 0) ||
              (unlinkRequiresMfa && unlinkMfaCode.trim().length === 0)
            }
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
        visible={deleteDialog.visible}
        onDismiss={deleteDialog.close}
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
            value={deleteDialog.password}
            onChangeText={deleteDialog.setPassword}
            placeholder="Current password"
            accessibilityLabel="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            {...deleteErrorProps}
            className="border px-2 py-2 mt-2.5"
            style={{ borderColor: theme.colors.outline }}
          />
        ) : null}
        {deleteRequiresMfa ? (
          <TextInput
            value={deleteDialog.mfaCode}
            onChangeText={deleteDialog.setMfaCode}
            placeholder="Authenticator or recovery code"
            accessibilityLabel="Authentication code"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            {...deleteErrorProps}
            className="border px-2 py-2 mt-2.5"
            style={{ borderColor: theme.colors.outline }}
          />
        ) : null}
        <FormFieldError errorId="delete-account-error" message={deleteDialog.error ?? undefined} />
        <AppText className="mt-2.5">
          To have your uploads removed as well, email{' '}
          <Link href={`mailto:${SUPPORT_EMAIL}`}>
            <AppText className="font-bold">{SUPPORT_EMAIL}</AppText>
          </Link>
          .
        </AppText>
        <View style={dialogActionsStyle}>
          <AppButton variant="ghost" onPress={deleteDialog.close}>
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            onPress={onConfirmDelete}
            loading={deleteDialog.pending}
            disabled={
              (deleteRequiresPassword && deleteDialog.password.length === 0) ||
              (deleteRequiresMfa && deleteDialog.mfaCode.trim().length === 0)
            }
          >
            Delete account
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}
