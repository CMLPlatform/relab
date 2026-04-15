import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useThemeMode } from '@/context/ThemeModeProvider';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
import { getToken, logout, unlinkOAuth, updateUser, verify } from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';
import { getNewsletterPreference, setNewsletterPreference } from '@/services/api/newsletter';
import { getPublicProfile, type PublicProfileView } from '@/services/api/profiles';
import type { ThemeMode } from '@/types/User';
import { logError } from '@/utils/logging';

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
  const [youtubeAuthPending, setYoutubeAuthPending] = useState(false);
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
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(true);
  const [newsletterSaving, setNewsletterSaving] = useState(false);
  const [newsletterError, setNewsletterError] = useState('');
  const [ownStats, setOwnStats] = useState<PublicProfileView | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  useEffect(() => {
    if (!profile && !isLoggingOut) {
      router.replace({ pathname: '/login', params: { redirectTo: '/profile' } });
    }
  }, [profile, router, isLoggingOut]);

  const onLogout = () => {
    if (activeStream) {
      feedback.alert({
        title: 'Stream still active',
        message: `You're live for "${activeStream.productName}". Logging out won't stop the stream.`,
        buttons: [
          { text: 'Cancel' },
          { text: 'Log out anyway', onPress: () => setLogoutDialogVisible(true) },
        ],
      });
      return;
    }
    setLogoutDialogVisible(true);
  };

  const confirmLogout = () => {
    setLogoutDialogVisible(false);
    setIsLoggingOut(true);
    setActiveStream(null);
    logout()
      .then(() => {
        void refetch(false);
        router.replace('/products');
      })
      .finally(() => setIsLoggingOut(false));
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
      setEditUsernameVisible(false);
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
      setUnlinkDialogVisible(false);
      void refetch();
    } catch (error: unknown) {
      setUnlinkDialogVisible(false);
      feedback.error(
        `Failed to disconnect: ${getErrorMessage(error, 'Unknown error')}`,
        'Disconnect failed',
      );
    }
  };

  const handleYouTubeToggle = async (next: boolean) => {
    if (!next) {
      await setYoutubeEnabled(false);
      return;
    }
    setYoutubeAuthPending(true);
    try {
      const redirectUri = Linking.createURL('/profile');
      const associateUrl = `${API_URL}/auth/oauth/google-youtube/associate/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await apiFetch(associateUrl, { headers });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Server error ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      if (result.type === 'success' && result.url.includes('success=true')) {
        await setYoutubeEnabled(true);
        await refetch(false);
      } else if (result.type === 'success') {
        const detail = result.url.match(/[?&]detail=([^&]*)/)?.[1];
        feedback.error(
          detail ? decodeURIComponent(detail) : 'Access was denied.',
          'YouTube authorization failed',
        );
      }
    } catch (error: unknown) {
      feedback.error(
        `Failed to start YouTube authorization: ${getErrorMessage(error, 'Unknown error')}`,
        'Authorization failed',
      );
    } finally {
      setYoutubeAuthPending(false);
    }
  };

  const handleLinkOAuth = async (provider: 'google' | 'github') => {
    try {
      const redirectUri = Linking.createURL('/profile');
      const associateUrl = `${API_URL}/auth/oauth/${provider}/associate/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await apiFetch(associateUrl, { headers });
      if (!response.ok) throw new Error('Failed to reach association endpoint.');
      const data = await response.json();

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);
      if (result.type === 'success') {
        await refetch();
      }
    } catch (error: unknown) {
      feedback.error(
        `Failed to start link flow: ${getErrorMessage(error, 'Unknown error')}`,
        'Link failed',
      );
    }
  };

  const handleNewsletterToggle = async (nextSubscribed: boolean) => {
    if (!profile || newsletterSaving) return;
    setNewsletterSaving(true);
    setNewsletterError('');

    try {
      const preference = await setNewsletterPreference(nextSubscribed);
      setNewsletterSubscribed(preference.subscribed);
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to update email updates.'));
    } finally {
      setNewsletterSaving(false);
    }
  };

  const loadNewsletterPreference = useCallback(async () => {
    if (!profile) return;
    setNewsletterLoading(true);
    setNewsletterError('');

    try {
      const preference = await getNewsletterPreference();
      setNewsletterSubscribed(preference.subscribed);
      setNewsletterError('');
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to load email updates.'));
    } finally {
      setNewsletterLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadNewsletterPreference();
  }, [loadNewsletterPreference]);

  const loadOwnStats = useCallback(async () => {
    if (!profile?.username) return;
    setStatsLoading(true);
    try {
      const stats = await getPublicProfile(profile.username);
      setOwnStats(stats);
    } catch (error) {
      logError('Failed to load own stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [profile?.username]);

  useEffect(() => {
    void loadOwnStats();
  }, [loadOwnStats]);

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

  const isGoogleLinked = profile?.oauth_accounts?.some((a) => a.oauth_name === 'google') ?? false;
  const isGithubLinked = profile?.oauth_accounts?.some((a) => a.oauth_name === 'github') ?? false;
  const googleAccount = profile?.oauth_accounts?.find((a) => a.oauth_name === 'google');
  const githubAccount = profile?.oauth_accounts?.find((a) => a.oauth_name === 'github');

  return {
    profile,
    themeMode,
    setThemeMode: setThemeMode as (mode: ThemeMode) => Promise<void>,
    rpiEnabled,
    rpiLoading,
    setRpiEnabled,
    youtubeEnabled,
    youtubeLoading,
    setYoutubeEnabled,
    youtubeAuthPending,
    newsletterSubscribed,
    newsletterLoading,
    newsletterSaving,
    newsletterError,
    ownStats,
    statsLoading,
    visibilitySaving,
    isGoogleLinked,
    isGithubLinked,
    googleAccount,
    githubAccount,
    deleteDialogVisible,
    setDeleteDialogVisible,
    logoutDialogVisible,
    setLogoutDialogVisible,
    editUsernameVisible,
    setEditUsernameVisible,
    newUsername,
    setNewUsername,
    unlinkDialogVisible,
    setUnlinkDialogVisible,
    providerToUnlink,
    setProviderToUnlink,
    onLogout,
    confirmLogout,
    onVerifyAccount,
    handleUpdateUsername,
    handleUnlinkOAuthConfirm,
    handleYouTubeToggle,
    handleLinkOAuth,
    handleNewsletterToggle,
    loadNewsletterPreference,
    handleVisibilityChange,
    openEditUsername,
  };
}
