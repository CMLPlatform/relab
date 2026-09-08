import { createURL } from 'expo-linking';
import { useState } from 'react';
import type { DialogContextType } from '@/components/base/dialogContext';
import { API_URL } from '@/config';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  OAUTH_BLOCKED_URL_MESSAGE,
  openOAuthBrowserSession,
  parseOAuthCallbackUrl,
} from '@/services/api/oauthFlow';
import { getErrorMessage } from '@/utils/errors';

type Feedback = {
  error: (message: string, title?: string) => void;
};

type UseOAuthAssociationsParams = {
  feedback: Feedback;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  setYoutubeEnabled: (enabled: boolean) => Promise<void>;
  /** Used to collect the account password when the API asks for step-up re-auth. */
  dialog: Pick<DialogContextType, 'input'>;
};

type OAuthProvider = 'google' | 'github';

/** The API asks for the account password before a link; 400 is that ask, not a failure. */
const STEP_UP_REQUIRED_STATUS = 400;

export class OAuthStepUpRequiredError extends Error {}
type OAuthAssociationResult = { type: string; url?: string };

/**
 * Run *action*; on a step-up 400, collect the password and retry once. Never
 * throws: the retry runs detached from the dialog's onPress, so both attempts
 * report through *onError*.
 */
async function withStepUp(
  dialog: Pick<DialogContextType, 'input'>,
  action: (currentPassword?: string) => Promise<void>,
  message: string,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    if (!(error instanceof OAuthStepUpRequiredError)) {
      onError(error);
      return;
    }
    dialog.input({
      title: 'Confirm your password',
      message,
      placeholder: 'Current password',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          disabled: (value) => !value?.trim(),
          onPress: (currentPassword) => {
            if (!currentPassword?.trim()) return;
            void action(currentPassword).catch(onError);
          },
        },
      ],
    });
  }
}

export function useOAuthAssociations({
  feedback,
  refetch,
  setYoutubeEnabled,
  dialog,
}: UseOAuthAssociationsParams) {
  const [youtubeAuthPending, setYoutubeAuthPending] = useState(false);

  const startAssociationFlow = async (
    path: string,
    currentPassword?: string,
  ): Promise<OAuthAssociationResult> => {
    const redirectUri = createURL('/account');
    const associateUrl = buildOAuthAuthorizeUrl(`${API_URL}${path}`, redirectUri);
    // Step-up POST: the server requires the password for any account that has one.
    const authorization = await fetchOAuthAuthorizationUrl(associateUrl, { currentPassword });

    if (authorization.status === STEP_UP_REQUIRED_STATUS && !currentPassword) {
      throw new OAuthStepUpRequiredError(
        authorization.detail || 'Current password is required to link a social login.',
      );
    }

    if (!(authorization.ok && authorization.authorizationUrl)) {
      throw new Error(authorization.detail || 'Failed to reach association endpoint.');
    }

    if (!isAllowedOAuthRedirectUrl(authorization.authorizationUrl)) {
      throw new Error(OAUTH_BLOCKED_URL_MESSAGE);
    }

    const result = await openOAuthBrowserSession(authorization.authorizationUrl, redirectUri);
    if (result.type === 'success') {
      if (!result.url || !isExpectedOAuthCallbackUrl(result.url, redirectUri)) {
        throw new Error(OAUTH_BLOCKED_URL_MESSAGE);
      }
      return { type: 'success', url: result.url };
    }
    return { type: String(result.type) };
  };

  const handleYouTubeToggle = async (next: boolean) => {
    if (!next) {
      await setYoutubeEnabled(false);
      return;
    }

    setYoutubeAuthPending(true);
    try {
      await withStepUp(
        dialog,
        async (currentPassword) => {
          const result = await startAssociationFlow(
            '/oauth/google-youtube/associate/authorize',
            currentPassword,
          );
          const callback =
            result.type === 'success' && result.url ? parseOAuthCallbackUrl(result.url) : undefined;
          if (callback?.status === 'success') {
            await setYoutubeEnabled(true);
            await refetch(false);
            return;
          }

          if (result.type === 'success') {
            feedback.error(callback?.error ?? 'Access was denied.', 'YouTube authorization failed');
          }
        },
        'Linking a YouTube account changes how you can sign in, so confirm your password.',
        (error) =>
          feedback.error(
            `Failed to start YouTube authorization: ${getErrorMessage(error, 'Unknown error')}`,
            'Authorization failed',
          ),
      );
    } finally {
      setYoutubeAuthPending(false);
    }
  };

  const linkOAuth = async (provider: OAuthProvider) => {
    await withStepUp(
      dialog,
      async (currentPassword) => {
        const result = await startAssociationFlow(
          `/oauth/${provider}/associate/authorize`,
          currentPassword,
        );
        if (result.type !== 'success') return;

        // The outcome lives in the callback fragment, not in the session completing.
        const callback = result.url ? parseOAuthCallbackUrl(result.url) : undefined;
        if (callback && callback.status !== 'success') {
          feedback.error(callback.error ?? 'Access was denied.', 'Link failed');
          return;
        }

        await refetch();
      },
      'Linking a social login changes how you can sign in, so confirm your password.',
      (error) =>
        feedback.error(
          `Failed to start link flow: ${getErrorMessage(error, 'Unknown error')}`,
          'Link failed',
        ),
    );
  };

  return {
    youtube: {
      authPending: youtubeAuthPending,
      toggle: handleYouTubeToggle,
    },
    actions: {
      linkOAuth,
    },
  };
}
