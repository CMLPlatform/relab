import { useCallback, useState } from 'react';
import type { useAuth } from '@/context/auth';

/** A failed deletion, shown under the field it concerns, or at the dialog level ('form'). */
export type DeleteAccountError = { field: 'password' | 'mfa' | 'form'; message: string };

export function useProfileDialogs() {
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMfaCode, setDeleteMfaCode] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteAccountError | null>(null);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');
  const [unlinkPassword, setUnlinkPassword] = useState('');

  const openDeleteDialog = useCallback(() => setDeleteDialogVisible(true), []);
  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogVisible(false);
    setDeletePassword('');
    setDeleteMfaCode('');
    setDeleteError(null);
  }, []);
  const openLogoutDialog = useCallback(() => setLogoutDialogVisible(true), []);
  const closeLogoutDialog = useCallback(() => setLogoutDialogVisible(false), []);
  const closeUnlinkDialog = useCallback(() => {
    setUnlinkDialogVisible(false);
    setUnlinkPassword('');
  }, []);
  const requestUnlink = useCallback((provider: string) => {
    setProviderToUnlink(provider);
    setUnlinkPassword('');
    setUnlinkDialogVisible(true);
  }, []);

  return {
    deleteDialog: {
      visible: deleteDialogVisible,
      open: openDeleteDialog,
      close: closeDeleteDialog,
      password: deletePassword,
      setPassword: setDeletePassword,
      mfaCode: deleteMfaCode,
      setMfaCode: setDeleteMfaCode,
      pending: deletePending,
      setPending: setDeletePending,
      error: deleteError,
      setError: setDeleteError,
    },
    logoutDialog: {
      visible: logoutDialogVisible,
      open: openLogoutDialog,
      close: closeLogoutDialog,
    },
    unlinkDialog: {
      visible: unlinkDialogVisible,
      provider: providerToUnlink,
      request: requestUnlink,
      close: closeUnlinkDialog,
      password: unlinkPassword,
      setPassword: setUnlinkPassword,
    },
  };
}

export function useProfileLinkedAccounts(profile: ReturnType<typeof useAuth>['user']) {
  const accounts = profile?.oauth_accounts ?? [];
  const googleAccount = accounts.find((account) => account.oauth_name === 'google');
  const githubAccount = accounts.find((account) => account.oauth_name === 'github');

  return {
    isGoogleLinked: Boolean(googleAccount),
    isGithubLinked: Boolean(githubAccount),
    googleAccount,
    githubAccount,
    // Unlinking the only linked provider leaves an OAuth-only account reachable
    // solely through an email password reset; warn before it happens.
    isLastLinkedProvider: accounts.length === 1,
  };
}
