import { useCallback, useState } from 'react';
import type { useAuth } from '@/context/auth';

export function useProfileDialogs() {
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');
  const [unlinkPassword, setUnlinkPassword] = useState('');

  const openDeleteDialog = useCallback(() => setDeleteDialogVisible(true), []);
  const closeDeleteDialog = useCallback(() => setDeleteDialogVisible(false), []);
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
    // solely through an email password reset — warn before it happens.
    isLastLinkedProvider: accounts.length === 1,
  };
}
