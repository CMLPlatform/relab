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
  /** The account has MFA on, so linking also needs an authenticator or recovery code. */
  mfaEnabled?: boolean;
};

type OAuthProvider = 'google' | 'github';

/** The API asks for the account password before a link; 400 is that ask, not a failure. */
const STEP_UP_REQUIRED_STATUS = 400;

export class OAuthStepUpRequiredError extends Error {}
type OAuthAssociationResult = { type: string; url?: string };
type StepUp = { currentPassword?: string; mfaCode?: string };

/**
 * Run *action*; on a step-up 400, collect the password and retry once. With MFA on,
 * the code is collected first, since the API always asks for it. Never throws: the
 * retries run detached from the dialog's onPress, so every attempt reports through
 * *onError*.
 */
async function withStepUp(
  dialog: Pick<DialogContextType, 'input'>,
  action: (stepUp: StepUp) => Promise<void>,
  message: string,
  onError: (error: unknown) => void,
  mfaEnabled: boolean,
): Promise<void> {
  const ask = (title: string, placeholder: string, onValue: (value: string) => void) =>
    dialog.input({
      title,
      message,
      placeholder,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          disabled: (value) => !value?.trim(),
          onPress: (value) => {
            // Passwords keep their spaces; only an all-blank value is refused.
            if (value?.trim()) onValue(value);
          },
        },
      ],
    });

  const run = async (stepUp: StepUp) => {
    try {
      await action(stepUp);
    } catch (error: unknown) {
      if (!(error instanceof OAuthStepUpRequiredError)) {
        onError(error);
        return;
      }
      ask('Confirm your password', 'Current password', (currentPassword) => {
        void action({ ...stepUp, currentPassword }).catch(onError);
      });
    }
  };

  if (!mfaEnabled) {
    await run({});
    return;
  }
  ask('Enter your authentication code', 'Authenticator or recovery code', (mfaCode) => {
    void run({ mfaCode: mfaCode.trim() });
  });
}

export function useOAuthAssociations({
  feedback,
  refetch,
  setYoutubeEnabled,
  dialog,
  mfaEnabled = false,
}: UseOAuthAssociationsParams) {
  const [youtubeAuthPending, setYoutubeAuthPending] = useState(false);

  const startAssociationFlow = async (
    path: string,
    { currentPassword, mfaCode }: StepUp,
  ): Promise<OAuthAssociationResult> => {
    const redirectUri = createURL('/account');
    const associateUrl = buildOAuthAuthorizeUrl(`${API_URL}${path}`, redirectUri);
    // Step-up POST: the server requires the password for any account that has one,
    // and the MFA code for any account with MFA on.
    const authorization = await fetchOAuthAuthorizationUrl(associateUrl, {
      currentPassword,
      mfaCode,
    });

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
        async (stepUp) => {
          const result = await startAssociationFlow(
            '/oauth/google-youtube/associate/authorize',
            stepUp,
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
        mfaEnabled,
      );
    } finally {
      setYoutubeAuthPending(false);
    }
  };

  const linkOAuth = async (provider: OAuthProvider) => {
    await withStepUp(
      dialog,
      async (stepUp) => {
        const result = await startAssociationFlow(`/oauth/${provider}/associate/authorize`, stepUp);
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
      mfaEnabled,
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
