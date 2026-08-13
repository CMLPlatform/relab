import { type RefObject, useCallback, useState } from 'react';
import type { View } from 'react-native';
import type { useAppFeedback } from '@/hooks/useAppFeedback';
import { unlinkOAuth, updateUser, verify } from '@/services/api/auth/authentication';
import type { User } from '@/types/User';
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
}: {
  username: string;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
}) {
  if (username.length < 2) {
    feedback.error('Username must be at least 2 characters.', 'Invalid username');
    return;
  }

  try {
    await updateUser({ username });
    await refetch(false);
    feedback.toast('Username updated.');
  } catch (error: unknown) {
    feedback.error(
      `Failed to update username: ${getErrorMessage(error, 'Unknown error')}`,
      'Update failed',
    );
  }
}

export function promptUsernameEdit({
  profile,
  feedback,
  refetch,
  triggerRef,
}: {
  profile: { username: string | null } | null | undefined;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  /** Return-focus target for the edit dialog; see AppDialog's `triggerRef`. */
  triggerRef?: RefObject<View | null>;
}) {
  if (!profile) return;
  feedback.input({
    title: 'Edit username',
    defaultValue: profile.username ?? '',
    placeholder: 'Username',
    triggerRef,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: (value) => {
          void updateProfileUsername({ username: (value ?? '').trim(), feedback, refetch });
        },
      },
    ],
  });
}

export type ProfilePreferenceUpdate =
  | { field: 'profile_visibility'; value: ProfileVisibility }
  | { field: 'email_updates_enabled'; value: boolean }
  | { field: 'credit_in_releases'; value: boolean };

const PREFERENCE_COPY = {
  profile_visibility: {
    success: () => 'Profile visibility updated.',
    errorPrefix: 'Failed to update visibility',
    errorTitle: 'Visibility update failed',
  },
  email_updates_enabled: {
    success: (value: unknown) => (value ? 'Email updates enabled.' : 'Email updates disabled.'),
    errorPrefix: 'Failed to update email preferences',
    errorTitle: 'Email preference update failed',
  },
  credit_in_releases: {
    success: (value: unknown) =>
      value
        ? 'You will be named in future dataset releases.'
        : 'You will not be named in future dataset releases. Published releases are unchanged.',
    errorPrefix: 'Failed to update release credit',
    errorTitle: 'Release credit update failed',
  },
} as const;

/**
 * Write a single preference field.
 *
 * Only the changed key is sent: the server merges with `exclude_unset`, so replaying a
 * stale local snapshot of the whole preferences object would revert whatever another
 * in-flight toggle just wrote.
 */
export async function updateProfilePreferenceField({
  field,
  value,
  feedback,
  refetch,
}: ProfilePreferenceUpdate & {
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
}) {
  const copy = PREFERENCE_COPY[field];
  try {
    // credit_in_releases is a top-level consent column, not a preferences key.
    await updateUser(
      field === 'credit_in_releases'
        ? { credit_in_releases: value }
        : { preferences: { [field]: value } },
    );
    await refetch(false);
    feedback.toast(copy.success(value));
  } catch (error) {
    feedback.error(
      `${copy.errorPrefix}: ${getErrorMessage(error, 'Unknown error')}`,
      copy.errorTitle,
    );
  }
}

/**
 * Bundles the two profile-preference toggles (visibility, email updates) so
 * useProfileScreen doesn't have to carry their saving-state and handlers inline.
 */
export function useProfilePreferences({
  profile,
  feedback,
  refetch,
}: {
  profile: User | undefined;
  feedback: ReturnType<typeof useAppFeedback>;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
}) {
  const [emailUpdatesSaving, setEmailUpdatesSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [creditInReleasesSaving, setCreditInReleasesSaving] = useState(false);

  const savePreference = useCallback(
    async (
      update: ProfilePreferenceUpdate,
      saving: boolean,
      setSaving: (next: boolean) => void,
    ) => {
      if (!profile || saving) return;
      setSaving(true);
      try {
        await updateProfilePreferenceField({ ...update, feedback, refetch });
      } finally {
        setSaving(false);
      }
    },
    [feedback, profile, refetch],
  );

  const handleVisibilityChange = useCallback(
    (visibility: ProfileVisibility) =>
      savePreference(
        { field: 'profile_visibility', value: visibility },
        visibilitySaving,
        setVisibilitySaving,
      ),
    [savePreference, visibilitySaving],
  );

  const handleEmailUpdatesChange = useCallback(
    (enabled: boolean) =>
      savePreference(
        { field: 'email_updates_enabled', value: enabled },
        emailUpdatesSaving,
        setEmailUpdatesSaving,
      ),
    [savePreference, emailUpdatesSaving],
  );

  const handleCreditInReleasesChange = useCallback(
    (credit: boolean) =>
      savePreference(
        { field: 'credit_in_releases', value: credit },
        creditInReleasesSaving,
        setCreditInReleasesSaving,
      ),
    [savePreference, creditInReleasesSaving],
  );

  return {
    emailUpdatesSaving,
    visibilitySaving,
    creditInReleasesSaving,
    handleVisibilityChange,
    handleEmailUpdatesChange,
    handleCreditInReleasesChange,
  };
}

export async function confirmOAuthUnlink({
  provider,
  currentPassword,
  youtubeEnabled,
  setYoutubeEnabled,
  closeUnlinkDialog,
  refetch,
  feedback,
}: {
  provider: string;
  currentPassword?: string;
  youtubeEnabled: boolean;
  setYoutubeEnabled: (enabled: boolean) => Promise<void>;
  closeUnlinkDialog: () => void;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  feedback: ReturnType<typeof useAppFeedback>;
}) {
  try {
    await unlinkOAuth(provider, currentPassword);
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
