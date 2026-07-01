import type { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { useAuth } from '@/context/auth';

export function useProfileDialogs(profile: { username: string | null } | null | undefined) {
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [editUsernameVisible, setEditUsernameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');

  const openDeleteDialog = useCallback(() => setDeleteDialogVisible(true), []);
  const closeDeleteDialog = useCallback(() => setDeleteDialogVisible(false), []);
  const openLogoutDialog = useCallback(() => setLogoutDialogVisible(true), []);
  const closeLogoutDialog = useCallback(() => setLogoutDialogVisible(false), []);
  const closeEditUsername = useCallback(() => setEditUsernameVisible(false), []);
  const closeUnlinkDialog = useCallback(() => setUnlinkDialogVisible(false), []);
  const requestUnlink = useCallback((provider: string) => {
    setProviderToUnlink(provider);
    setUnlinkDialogVisible(true);
  }, []);
  const openEditUsername = useCallback(() => {
    if (!profile) return;
    setNewUsername(profile.username ?? '');
    setEditUsernameVisible(true);
  }, [profile]);

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
    editUsername: {
      visible: editUsernameVisible,
      open: openEditUsername,
      close: closeEditUsername,
      value: newUsername,
      setValue: setNewUsername,
    },
    unlinkDialog: {
      visible: unlinkDialogVisible,
      provider: providerToUnlink,
      request: requestUnlink,
      close: closeUnlinkDialog,
    },
  };
}

export function useProfileAuthRedirect({
  profile,
  router,
  isLoggingOut,
}: {
  profile: ReturnType<typeof useAuth>['user'];
  router: ReturnType<typeof useRouter>;
  isLoggingOut: boolean;
}) {
  useEffect(() => {
    if (!(profile || isLoggingOut)) {
      router.replace({ pathname: '/login', params: { redirectTo: '/account' } });
    }
  }, [profile, router, isLoggingOut]);
}

export function useProfileLinkedAccounts(profile: ReturnType<typeof useAuth>['user']) {
  const isGoogleLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false;
  const isGithubLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'github') ?? false;
  const googleAccount = profile?.oauth_accounts?.find((account) => account.oauth_name === 'google');
  const githubAccount = profile?.oauth_accounts?.find((account) => account.oauth_name === 'github');

  return {
    isGoogleLinked,
    isGithubLinked,
    googleAccount,
    githubAccount,
  };
}
