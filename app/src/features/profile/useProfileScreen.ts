import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useThemeMode } from '@/context/themeMode';
import { useStopYouTubeStreamMutation } from '@/features/cameras/rpi/hooks';
import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import type { ThemeMode } from '@/types/User';
import { useProfileActions } from './actions';
import { useProfilePreferences } from './mutations';
import { usePublicProfileQuery } from './publicProfileQuery';
import { useProfileDialogs, useProfileLinkedAccounts } from './state';
import { useOAuthAssociations } from './useOAuthAssociations';

export function useProfileScreen() {
  const router = useRouter();
  const { user: profile, refetch } = useAuth();
  const feedback = useAppFeedback();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dialog = useDialog();
  const dialogs = useProfileDialogs();
  const {
    enabled: rpiEnabled,
    loading: rpiLoading,
    setEnabled: setRpiEnabled,
  } = useServerPreferenceToggle('rpi_camera_enabled');
  // NOTE: this flag, not the OAuth link, decides YouTube Live: base and YouTube-scoped Google OAuth
  // share one oauth_name = "google" row.
  const {
    enabled: youtubeEnabled,
    loading: youtubeLoading,
    setEnabled: setYoutubeEnabled,
  } = useServerPreferenceToggle('youtube_streaming_enabled');
  const { themeMode, setThemeMode } = useThemeMode();
  const { activeStream, setActiveStream } = useStreamSession();
  const stopStreamMutation = useStopYouTubeStreamMutation(activeStream?.cameraId ?? '');

  useRequireAuth('/account', { isLoggingOut });
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

  const { profile: ownStats, loading: statsLoading } = usePublicProfileQuery(profile?.username);
  const oauthAssociations = useOAuthAssociations({
    feedback,
    refetch,
    setYoutubeEnabled,
    dialog,
  });

  const { emailUpdatesSaving, visibilitySaving, handleVisibilityChange, handleEmailUpdatesChange } =
    useProfilePreferences({ profile, feedback, refetch });

  const linkedAccounts = useProfileLinkedAccounts(profile);

  return {
    profile: {
      profile,
      themeMode,
      setThemeMode: setThemeMode as (mode: ThemeMode) => Promise<void>,
      ownStats,
      statsLoading,
      emailUpdatesEnabled: profile?.preferences?.email_updates_enabled === true,
      emailUpdatesSaving,
      visibilitySaving,
      openEditUsername: actions.promptEditUsername,
      usernameEditTriggerRef: actions.usernameEditTriggerRef,
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
      isLastLinkedProvider: linkedAccounts.isLastLinkedProvider,
      handleYouTubeToggle: oauthAssociations.youtube.toggle,
      handleLinkOAuth: oauthAssociations.actions.linkOAuth,
      handleUnlinkOAuthConfirm: actions.handleUnlinkOAuthConfirm,
    },
    dialogs,
    actions,
  };
}
