import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useThemeMode } from '@/context/ThemeModeProvider';
import { useNewsletterPreference } from '@/hooks/profile/useNewsletterPreference';
import { useOAuthAssociations } from '@/hooks/profile/useOAuthAssociations';
import { useOwnProfileStats } from '@/hooks/profile/useOwnProfileStats';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useStopYouTubeStreamMutation } from '@/hooks/useRpiCameras';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
import { logout, unlinkOAuth, updateUser, verify } from '@/services/api/authentication';
import type { ThemeMode } from '@/types/User';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useProfileScreen() {
  const router = useRouter();
  const { user: profile, refetch } = useAuth();
  const feedback = useAppFeedback();
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editUsernameVisible, setEditUsernameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [providerToUnlink, setProviderToUnlink] = useState('');
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
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const closeDeleteDialog = () => setDeleteDialogVisible(false);
  const openDeleteDialog = () => setDeleteDialogVisible(true);
  const closeLogoutDialog = () => setLogoutDialogVisible(false);
  const openLogoutDialog = () => setLogoutDialogVisible(true);
  const closeEditUsername = () => setEditUsernameVisible(false);
  const closeUnlinkDialog = () => setUnlinkDialogVisible(false);
  const requestUnlink = (provider: string) => {
    setProviderToUnlink(provider);
    setUnlinkDialogVisible(true);
  };

  useEffect(() => {
    if (!profile && !isLoggingOut) {
      router.replace({ pathname: '/login', params: { redirectTo: '/profile' } });
    }
  }, [profile, router, isLoggingOut]);

  const onLogout = () => {
    if (activeStream) {
      feedback.alert({
        title: 'Stream still active',
        message: `You're live for "${activeStream.productName}". Logging out will stop the stream and save the recording.`,
        buttons: [{ text: 'Cancel' }, { text: 'Stop & log out', onPress: openLogoutDialog }],
      });
      return;
    }
    openLogoutDialog();
  };

  const confirmLogout = () => {
    closeLogoutDialog();
    setIsLoggingOut(true);

    const performLogout = () => {
      setActiveStream(null);
      logout()
        .then(() => {
          void refetch(false);
          router.replace('/products');
        })
        .finally(() => setIsLoggingOut(false));
    };

    if (activeStream) {
      stopStreamMutation.mutate(undefined, {
        onSuccess: performLogout,
        onError: () => {
          feedback.error(
            'Failed to stop the stream. Please stop it manually before logging out.',
            'Stream error',
          );
          setIsLoggingOut(false);
        },
      });
    } else {
      performLogout();
    }
  };

  const onVerifyAccount = () => {
    if (!profile) return;
    verify(profile.email)
      .then((ok) => {
        if (ok) {
          feedback.toast('Verification email sent. Please check your inbox.');
        } else {
          feedback.error(
            'Failed to send verification email. Please try again later.',
            'Verification failed',
          );
        }
      })
      .catch(() =>
        feedback.error(
          'Failed to send verification email. Please try again later.',
          'Verification failed',
        ),
      );
  };

  const handleUpdateUsername = async () => {
    try {
      if (newUsername.length < 2) {
        feedback.error('Username must be at least 2 characters.', 'Invalid username');
        return;
      }
      await updateUser({ username: newUsername });
      await refetch(false);
      closeEditUsername();
      feedback.toast('Username updated.');
    } catch (error: unknown) {
      feedback.error(
        `Failed to update username: ${getErrorMessage(error, 'Unknown error')}`,
        'Update failed',
      );
    }
  };

  const handleUnlinkOAuthConfirm = async () => {
    try {
      await unlinkOAuth(providerToUnlink);
      if (providerToUnlink === 'google' && youtubeEnabled) {
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
  };

  const newsletter = useNewsletterPreference(!!profile);
  const ownProfileStats = useOwnProfileStats(profile?.username);
  const oauthAssociations = useOAuthAssociations({
    feedback,
    refetch,
    setYoutubeEnabled,
  });

  const handleVisibilityChange = async (visibility: 'public' | 'community' | 'private') => {
    if (!profile || visibilitySaving) return;
    setVisibilitySaving(true);
    try {
      const nextPreferences = {
        ...(profile.preferences || {}),
        profile_visibility: visibility,
      };
      await updateUser({ preferences: nextPreferences });
      await refetch(false);
      feedback.toast('Profile visibility updated.');
    } catch (error) {
      feedback.error(
        `Failed to update visibility: ${getErrorMessage(error, 'Unknown error')}`,
        'Visibility update failed',
      );
    } finally {
      setVisibilitySaving(false);
    }
  };

  const openEditUsername = () => {
    if (!profile) return;
    setNewUsername(profile.username);
    setEditUsernameVisible(true);
  };

  const isGoogleLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false;
  const isGithubLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'github') ?? false;
  const googleAccount = profile?.oauth_accounts?.find((account) => account.oauth_name === 'google');
  const githubAccount = profile?.oauth_accounts?.find((account) => account.oauth_name === 'github');

  return {
    profile: {
      profile,
      themeMode,
      setThemeMode: setThemeMode as (mode: ThemeMode) => Promise<void>,
      ownStats: ownProfileStats.state.stats,
      statsLoading: ownProfileStats.state.loading,
      visibilitySaving,
      openEditUsername,
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
      isGoogleLinked,
      isGithubLinked,
      googleAccount,
      githubAccount,
      handleYouTubeToggle: oauthAssociations.youtube.toggle,
      handleLinkOAuth: oauthAssociations.actions.linkOAuth,
      linkGoogle: oauthAssociations.actions.linkGoogle,
      linkGithub: oauthAssociations.actions.linkGithub,
      handleUnlinkOAuthConfirm,
    },
    newsletter: {
      newsletterSubscribed: newsletter.state.subscribed,
      newsletterLoading: newsletter.state.loading,
      newsletterSaving: newsletter.state.saving,
      newsletterError: newsletter.state.error,
      handleNewsletterToggle: newsletter.actions.toggle,
      loadNewsletterPreference: newsletter.actions.reload,
    },
    dialogs: {
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
    },
    actions: {
      onLogout,
      confirmLogout,
      onVerifyAccount,
      handleUpdateUsername,
    },
  };
}
