import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useThemeMode } from '@/context/themeMode';
import { useStopYouTubeStreamMutation } from '@/features/cameras/hooks';
import { useRpiIntegration } from '@/features/cameras/useRpiIntegration';
import { useYouTubeIntegration } from '@/features/cameras/useYouTubeIntegration';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import type { ThemeMode } from '@/types/User';
import { useProfileActions } from './profileActions';
import {
  type ProfileVisibility,
  updateProfileEmailUpdates,
  updateProfileVisibility,
} from './profileMutations';
import {
  useProfileAuthRedirect,
  useProfileDialogs,
  useProfileLinkedAccounts,
} from './profileState';
import { useOAuthAssociations } from './useOAuthAssociations';
import { useOwnProfileStats } from './useOwnProfileStats';

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
