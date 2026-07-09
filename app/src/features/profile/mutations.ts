import type { useAppFeedback } from '@/hooks/useAppFeedback';
import { unlinkOAuth, updateUser, verify } from '@/services/api/auth/authentication';
import { getErrorMessage } from '@/utils/errors';

export type ProfileVisibility = 'public' | 'community' | 'private';

export async function sendVerificationEmail({
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

export async function updateProfileUsername({
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

export async function updateProfileVisibility({
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

export async function updateProfileEmailUpdates({
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

export async function confirmOAuthUnlink({
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
  } catch (error: unknown) {
    closeUnlinkDialog();
    feedback.error(
      `Failed to disconnect: ${getErrorMessage(error, 'Unknown error')}`,
      'Disconnect failed',
    );
    return;
  }

  // The account is unlinked from here on. A failure below must not be reported as
  // a failed disconnect — that would contradict the server.
  if (provider === 'google' && youtubeEnabled) {
    try {
      await setYoutubeEnabled(false);
    } catch (error: unknown) {
      feedback.error(
        `Google was disconnected, but YouTube streaming could not be turned off: ${getErrorMessage(error, 'Unknown error')}`,
        'YouTube still enabled',
      );
    }
  }

  closeUnlinkDialog();
  void refetch();
}
