import type { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { useAuth } from '@/context/auth';
import { useAuthRedirectGuard } from '@/hooks/useRequireAuth';

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

export function useProfileAuthRedirect({
  profile,
  router,
  isLoggingOut,
}: {
  profile: ReturnType<typeof useAuth>['user'];
  router: ReturnType<typeof useRouter>;
  isLoggingOut: boolean;
}) {
  // The account tab stays mounted (tab groups preserve per-tab state), so a
  // logout's `refetch(false)` can clear `profile` after `isLoggingOut` has
  // already flipped back to false and after logout's own navigate to
  // /products has landed. `useAuthRedirectGuard`'s focus gate stops that
  // stale effect from clobbering the /products navigation with a /login
  // redirect; a session that actually expires while the tab is focused still
  // redirects. No initial-auth-check gate here (unlike `useRequireAuth`):
  // the account tab is unreachable before that check resolves.
  useAuthRedirectGuard({
    user: profile,
    isLoading: false,
    isLoggingOut,
    router,
    redirectTo: '/account',
  });
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
