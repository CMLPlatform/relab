import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useThemeMode } from '@/context/themeMode';
import { useOAuthAssociations } from '@/hooks/profile/useOAuthAssociations';
import { useOwnProfileStats } from '@/hooks/profile/useOwnProfileStats';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useStopYouTubeStreamMutation } from '@/hooks/useRpiCameras';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
import {
  logout,
  revokeAllSessions,
  unlinkOAuth,
  updateUser,
  verify,
} from '@/services/api/authentication';
import type { ThemeMode } from '@/types/User';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type ProfileVisibility = 'public' | 'community' | 'private';

function useProfileDialogs(profile: { username: string | null } | null | undefined) {
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

async function sendVerificationEmail({
  email,
  feedback,
}: {
  email: string;
  feedback: ReturnType<typeof useAppFeedback>;
}) {
  try {
    const ok = await verify(email);
    if (ok) {
      feedback.toast('Verification email sent. Please check your inbox.');
      return;
    }
  } catch {
    // Fall through to the shared error feedback below.
  }

  feedback.error(
    'Failed to send verification email. Please try again later.',
    'Verification failed',
  );
}

async function updateProfileUsername({
  username,
  feedback,
  refetch,
  closeEditUsername,
}: {
  username: string;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  closeEditUsername: () => void;
}) {
  if (username.length < 2) {
    feedback.error('Username must be at least 2 characters.', 'Invalid username');
    return;
  }

  try {
    await updateUser({ username });
    await refetch(false);
    closeEditUsername();
    feedback.toast('Username updated.');
  } catch (error: unknown) {
    feedback.error(
      `Failed to update username: ${getErrorMessage(error, 'Unknown error')}`,
      'Update failed',
    );
  }
}

async function updateProfileVisibility({
  profile,
  visibility,
  feedback,
  refetch,
}: {
  profile: { preferences?: Record<string, unknown> | null };
  visibility: ProfileVisibility;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
}) {
  try {
    await updateUser({
      preferences: {
        ...(profile.preferences ?? {}),
        profile_visibility: visibility,
      },
    });
    await refetch(false);
    feedback.toast('Profile visibility updated.');
  } catch (error) {
    feedback.error(
      `Failed to update visibility: ${getErrorMessage(error, 'Unknown error')}`,
      'Visibility update failed',
    );
  }
}

async function updateProfileEmailUpdates({
  profile,
  enabled,
  feedback,
  refetch,
}: {
  profile: { preferences?: Record<string, unknown> | null };
  enabled: boolean;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
}) {
  try {
    await updateUser({
      preferences: {
        ...(profile.preferences ?? {}),
        email_updates_enabled: enabled,
      },
    });
    await refetch(false);
    feedback.toast(enabled ? 'Email updates enabled.' : 'Email updates disabled.');
  } catch (error) {
    feedback.error(
      `Failed to update email preferences: ${getErrorMessage(error, 'Unknown error')}`,
      'Email preference update failed',
    );
  }
}

async function confirmOAuthUnlink({
  provider,
  youtubeEnabled,
  setYoutubeEnabled,
  closeUnlinkDialog,
  refetch,
  feedback,
}: {
  provider: string;
  youtubeEnabled: boolean;
  setYoutubeEnabled: (enabled: boolean) => Promise<void>;
  closeUnlinkDialog: () => void;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  feedback: ReturnType<typeof useAppFeedback>;
}) {
  try {
    await unlinkOAuth(provider);
    if (provider === 'google' && youtubeEnabled) {
      await setYoutubeEnabled(false);
    }
    closeUnlinkDialog();
    void refetch();
  } catch (error: unknown) {
    closeUnlinkDialog();
    feedback.error(
      `Failed to disconnect: ${getErrorMessage(error, 'Unknown error')}`,
      'Disconnect failed',
    );
  }
}

function useProfileAuthRedirect({
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
      router.replace({ pathname: '/login', params: { redirectTo: '/profile' } });
    }
  }, [profile, router, isLoggingOut]);
}

function useProfileLinkedAccounts(profile: ReturnType<typeof useAuth>['user']) {
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

function useProfileActions({
  profile,
  feedback,
  dialogs,
  activeStream,
  stopStreamMutation,
  setIsLoggingOut,
  setActiveStream,
  refetch,
  router,
  youtubeEnabled,
  setYoutubeEnabled,
}: {
  profile: ReturnType<typeof useAuth>['user'];
  feedback: ReturnType<typeof useAppFeedback>;
  dialogs: ReturnType<typeof useProfileDialogs>;
  activeStream: ReturnType<typeof useStreamSession>['activeStream'];
  stopStreamMutation: ReturnType<typeof useStopYouTubeStreamMutation>;
  setIsLoggingOut: (value: boolean) => void;
  setActiveStream: ReturnType<typeof useStreamSession>['setActiveStream'];
  refetch: ReturnType<typeof useAuth>['refetch'];
  router: ReturnType<typeof useRouter>;
  youtubeEnabled: boolean;
  setYoutubeEnabled: (enabled: boolean) => Promise<void>;
}) {
  const exitSession = useCallback(
    ({
      endSession,
      redirectTo,
      closeDialog,
    }: {
      endSession: () => Promise<void>;
      redirectTo: '/login' | '/products';
      closeDialog?: () => void;
    }) => {
      closeDialog?.();
      setIsLoggingOut(true);

      const proceed = () => {
        setActiveStream(null);
        void endSession()
          .then(() => {
            void refetch(false);
            router.replace(redirectTo);
          })
          .finally(() => setIsLoggingOut(false));
      };

      if (!activeStream) {
        proceed();
        return;
      }

      stopStreamMutation.mutate(undefined, {
        onSuccess: proceed,
        onError: () => {
          feedback.error(
            'Failed to stop the stream. Please stop it manually before logging out.',
            'Stream error',
          );
          setIsLoggingOut(false);
        },
      });
    },
    [activeStream, feedback, refetch, router, setActiveStream, setIsLoggingOut, stopStreamMutation],
  );

  const onLogout = useCallback(() => {
    if (activeStream) {
      feedback.alert({
        title: 'Stream still active',
        message: `You're live for "${activeStream.productName}". Logging out will stop the stream and save the recording.`,
        buttons: [
          { text: 'Cancel' },
          { text: 'Stop & log out', onPress: dialogs.logoutDialog.open },
        ],
      });
      return;
    }
    dialogs.logoutDialog.open();
  }, [activeStream, dialogs.logoutDialog, feedback]);

  const confirmLogout = useCallback(() => {
    exitSession({
      closeDialog: dialogs.logoutDialog.close,
      endSession: logout,
      redirectTo: '/products',
    });
  }, [dialogs.logoutDialog.close, exitSession]);

  const onVerifyAccount = useCallback(() => {
    if (!profile) return;
    void sendVerificationEmail({ email: profile.email, feedback });
  }, [feedback, profile]);

  const onRevokeAllSessions = useCallback(() => {
    exitSession({
      endSession: revokeAllSessions,
      redirectTo: '/login',
    });
  }, [exitSession]);

  const handleUpdateUsername = useCallback(async () => {
    await updateProfileUsername({
      username: dialogs.editUsername.value,
      feedback,
      refetch,
      closeEditUsername: dialogs.editUsername.close,
    });
  }, [dialogs.editUsername.close, dialogs.editUsername.value, feedback, refetch]);

  const handleUnlinkOAuthConfirm = useCallback(async () => {
    await confirmOAuthUnlink({
      provider: dialogs.unlinkDialog.provider,
      youtubeEnabled,
      setYoutubeEnabled,
      closeUnlinkDialog: dialogs.unlinkDialog.close,
      refetch,
      feedback,
    });
  }, [
    dialogs.unlinkDialog.close,
    dialogs.unlinkDialog.provider,
    feedback,
    refetch,
    setYoutubeEnabled,
    youtubeEnabled,
  ]);

  return {
    onLogout,
    confirmLogout,
    onRevokeAllSessions,
    onVerifyAccount,
    handleUpdateUsername,
    handleUnlinkOAuthConfirm,
  };
}

export function useProfileScreen() {
  const router = useRouter();
  const { user: profile, refetch } = useAuth();
  const feedback = useAppFeedback();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dialogs = useProfileDialogs(profile);
  const {
    enabled: rpiEnabled,
    loading: rpiLoading,
    setEnabled: setRpiEnabled,
  } = useRpiIntegration();
  const {
    enabled: youtubeEnabled,
    loading: youtubeLoading,
    setEnabled: setYoutubeEnabled,
  } = useYouTubeIntegration();
  const { themeMode, setThemeMode } = useThemeMode();
  const { activeStream, setActiveStream } = useStreamSession();
  const stopStreamMutation = useStopYouTubeStreamMutation(activeStream?.cameraId ?? '');
  const [emailUpdatesSaving, setEmailUpdatesSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  useProfileAuthRedirect({ profile, router, isLoggingOut });
  const actions = useProfileActions({
    profile,
    feedback,
    dialogs,
    activeStream,
    stopStreamMutation,
    setIsLoggingOut,
    setActiveStream,
    refetch,
    router,
    youtubeEnabled,
    setYoutubeEnabled,
  });

  const ownProfileStats = useOwnProfileStats(profile?.username ?? undefined);
  const oauthAssociations = useOAuthAssociations({
    feedback,
    refetch,
    setYoutubeEnabled,
  });

  const handleVisibilityChange = useCallback(
    async (visibility: ProfileVisibility) => {
      if (!profile || visibilitySaving) return;
      setVisibilitySaving(true);
      try {
        await updateProfileVisibility({ profile, visibility, feedback, refetch });
      } finally {
        setVisibilitySaving(false);
      }
    },
    [feedback, profile, refetch, visibilitySaving],
  );

  const handleEmailUpdatesChange = useCallback(
    async (enabled: boolean) => {
      if (!profile || emailUpdatesSaving) return;
      setEmailUpdatesSaving(true);
      try {
        await updateProfileEmailUpdates({ profile, enabled, feedback, refetch });
      } finally {
        setEmailUpdatesSaving(false);
      }
    },
    [emailUpdatesSaving, feedback, profile, refetch],
  );

  const linkedAccounts = useProfileLinkedAccounts(profile);

  return {
    profile: {
      profile,
      themeMode,
      setThemeMode: setThemeMode as (mode: ThemeMode) => Promise<void>,
      ownStats: ownProfileStats.state.stats,
      statsLoading: ownProfileStats.state.loading,
      emailUpdatesEnabled: profile?.preferences?.email_updates_enabled === true,
      emailUpdatesSaving,
      visibilitySaving,
      openEditUsername: dialogs.editUsername.open,
      handleEmailUpdatesChange,
      handleVisibilityChange,
    },
    integrations: {
      rpiEnabled,
      rpiLoading,
      setRpiEnabled,
      youtubeEnabled,
      youtubeLoading,
      setYoutubeEnabled,
      youtubeAuthPending: oauthAssociations.youtube.authPending,
      isGoogleLinked: linkedAccounts.isGoogleLinked,
      isGithubLinked: linkedAccounts.isGithubLinked,
      googleAccount: linkedAccounts.googleAccount,
      githubAccount: linkedAccounts.githubAccount,
      handleYouTubeToggle: oauthAssociations.youtube.toggle,
      handleLinkOAuth: oauthAssociations.actions.linkOAuth,
      linkGoogle: oauthAssociations.actions.linkGoogle,
      linkGithub: oauthAssociations.actions.linkGithub,
      handleUnlinkOAuthConfirm: actions.handleUnlinkOAuthConfirm,
    },
    dialogs,
    actions,
  };
}
