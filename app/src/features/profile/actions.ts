import type { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { useAuth } from '@/context/auth';
import type { useStreamSession } from '@/context/streamSession';
import type { useStopYouTubeStreamMutation } from '@/features/cameras/rpi/hooks';
import type { useAppFeedback } from '@/hooks/useAppFeedback';
import { logout, revokeAllSessions } from '@/services/api/auth/authentication';
import { confirmOAuthUnlink, sendVerificationEmail, updateProfileUsername } from './mutations';
import type { useProfileDialogs } from './state';

export function useProfileActions({
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

  // Confirm first: this is the most destructive action on the screen, and every
  // milder sibling (logout, unlink) already asks.
  const onRevokeAllSessions = useCallback(() => {
    feedback.alert({
      title: 'Sign out everywhere?',
      message:
        'This ends your session on every device, including this one. You’ll need to sign in again.',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'Sign out everywhere',
          onPress: () => exitSession({ endSession: revokeAllSessions, redirectTo: '/login' }),
        },
      ],
    });
  }, [exitSession, feedback]);

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
