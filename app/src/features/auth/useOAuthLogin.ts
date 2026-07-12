import { createURL } from 'expo-linking';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { useDialog } from '@/components/base/dialogContext';
import { API_URL } from '@/config';
import { getUser, markWebSessionActive } from '@/services/api/auth/authentication';
import { claimOAuthMfaHandoff, type MfaLoginPending } from '@/services/api/auth/authMfa';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  type OAuthCallbackResult,
  openOAuthBrowserSession,
  parseOAuthCallbackUrl,
} from '@/services/api/oauthFlow';
import type { User } from '@/types/User';
import { getErrorMessage } from '@/utils/errors';
import type { SafeRedirectTarget } from './useLoginRedirect';

const OAUTH_ACCOUNT_NOT_LINKED_ERROR = 'OAUTH_USER_ALREADY_EXISTS';
type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };
type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;
type DialogApi = ReturnType<typeof useDialog>;

function maybeUnrefTimer(timer: unknown): void {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as TimerWithUnref).unref();
  }
}

function getOAuthErrorMessage(error?: string, platform: 'ios' | 'android' | 'web' = 'web'): string {
  if (error === 'access_denied' || error === 'user_denied') {
    return 'Access was declined. Try again and allow access to sign in.';
  }
  if (error === 'invalid_scope') {
    return 'Invalid scope requested. Please contact support.';
  }
  if (error === 'server_error' || error === 'temporarily_unavailable') {
    return 'The provider is temporarily unavailable. Please try again in a moment.';
  }
  if (error) return error;
  if (platform !== 'web') {
    return 'Sign-in failed. Check your internet connection and try again.';
  }
  return 'Sign-in failed. Please try again.';
}

function isAccountNotLinkedError(error: string | undefined): boolean {
  return error === OAUTH_ACCOUNT_NOT_LINKED_ERROR;
}

async function getAuthenticatedUserWithRetry(
  retryCount = 0,
  maxRetries = 2,
): Promise<AuthenticatedUser | null> {
  try {
    const authenticatedUser = await getUser(true);
    if (authenticatedUser) {
      return authenticatedUser;
    }
    if (retryCount >= maxRetries) {
      return null;
    }
  } catch {
    if (retryCount >= maxRetries) {
      throw new Error(
        "Signed in, but we couldn't start your session. " +
          (Platform.OS !== 'web'
            ? 'Check your internet connection and try again.'
            : 'Please try again.'),
      );
    }
  }

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 300 * (retryCount + 1));
    maybeUnrefTimer(timer);
  });

  return getAuthenticatedUserWithRetry(retryCount + 1, maxRetries);
}

async function finalizeOAuthSession({
  status,
  error,
  mfaHandoff,
  dialog,
  completeSuccessfulLogin,
  handleMfaPending,
  showAccountAlreadyRegisteredDialog,
}: OAuthCallbackResult & {
  mfaHandoff?: string;
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  handleMfaPending: (pending: MfaLoginPending) => void;
  showAccountAlreadyRegisteredDialog: () => void;
}) {
  if (status === 'mfa_required' && mfaHandoff) {
    handleMfaPending(await claimOAuthMfaHandoff(mfaHandoff));
    return;
  }

  if (isAccountNotLinkedError(error)) {
    showAccountAlreadyRegisteredDialog();
    return;
  }

  if (status !== 'success') {
    const errorPlatform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
    throw new Error(getOAuthErrorMessage(error, errorPlatform));
  }

  if (Platform.OS === 'web') {
    markWebSessionActive();
  }

  const authenticatedUser = await getAuthenticatedUserWithRetry();

  if (!authenticatedUser) {
    throw new Error("Signed in, but we couldn't start your session. Please try again.");
  }

  if (!authenticatedUser.isActive) {
    dialog.alert({
      title: 'Account suspended',
      message: 'Your account has been suspended. Please contact support.',
    });
    return;
  }

  await completeSuccessfulLogin(authenticatedUser);
}

async function startOAuthLogin({
  provider,
  dialog,
  finalizeOAuthLogin,
  showAccountAlreadyRegisteredDialog,
}: {
  provider: 'google' | 'github';
  dialog: DialogApi;
  finalizeOAuthLogin: (args: OAuthCallbackResult) => Promise<void>;
  showAccountAlreadyRegisteredDialog: () => void;
}) {
  try {
    const transport = 'session';
    const redirectUri = createURL('/login');
    const authUrl = buildOAuthAuthorizeUrl(
      `${API_URL}/oauth/${provider}/${transport}/authorize`,
      redirectUri,
    );
    const authorization = await fetchOAuthAuthorizationUrl(authUrl);

    if (!(authorization.ok && authorization.authorizationUrl)) {
      const detail = authorization.detail;

      if (isAccountNotLinkedError(detail)) {
        showAccountAlreadyRegisteredDialog();
        return;
      }

      throw new Error(detail || "Couldn't reach the sign-in service. Please try again.");
    }

    if (!isAllowedOAuthRedirectUrl(authorization.authorizationUrl)) {
      throw new Error('Unexpected authorization URL received. Please try again.');
    }

    if (Platform.OS === 'web') {
      window.location.href = authorization.authorizationUrl;
      return;
    }

    const result = await openOAuthBrowserSession(authorization.authorizationUrl, redirectUri);

    if (result?.type !== 'success' || !result.url) return;

    if (!isExpectedOAuthCallbackUrl(result.url, redirectUri)) {
      throw new Error('Unexpected OAuth callback URL received. Please try again.');
    }

    const callback = parseOAuthCallbackUrl(result.url);
    if (callback) await finalizeOAuthLogin(callback);
  } catch (error: unknown) {
    dialog.alert({
      title: "Couldn't sign in",
      message: getErrorMessage(error, 'Please try again.'),
    });
  }
}

function useOAuthCallbackEffect({
  handledOAuthCallbackRef,
  postLoginRedirect,
  finalizeOAuthLogin,
  dialog,
}: {
  handledOAuthCallbackRef: MutableRefObject<boolean>;
  postLoginRedirect?: SafeRedirectTarget;
  finalizeOAuthLogin: (args: OAuthCallbackResult) => Promise<void>;
  dialog: DialogApi;
}) {
  useEffect(() => {
    if (handledOAuthCallbackRef.current) return;

    const fragmentCallback =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash
        ? parseOAuthCallbackUrl(window.location.href)
        : undefined;

    if (!fragmentCallback) return;

    handledOAuthCallbackRef.current = true;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanSearch = postLoginRedirect
        ? `?redirectTo=${encodeURIComponent(postLoginRedirect)}`
        : '';
      window.history.replaceState({}, '', window.location.pathname + cleanSearch);
    }

    finalizeOAuthLogin(fragmentCallback).catch((error: unknown) => {
      dialog.alert({
        title: "Couldn't sign in",
        message: getErrorMessage(error, 'Please try again.'),
      });
    });
  }, [dialog, finalizeOAuthLogin, handledOAuthCallbackRef, postLoginRedirect]);
}

export function useOAuthLogin({
  dialog,
  completeSuccessfulLogin,
  showAccountAlreadyRegisteredDialog,
  postLoginRedirect,
  handleMfaPending,
}: {
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  showAccountAlreadyRegisteredDialog: () => void;
  postLoginRedirect?: SafeRedirectTarget;
  handleMfaPending: (pending: MfaLoginPending) => void;
}) {
  const handledOAuthCallbackRef = useRef(false);

  const finalizeOAuthLogin = useCallback(
    async ({ status, error, mfaHandoff }: OAuthCallbackResult) => {
      await finalizeOAuthSession({
        status,
        error,
        mfaHandoff,
        dialog,
        completeSuccessfulLogin,
        handleMfaPending,
        showAccountAlreadyRegisteredDialog,
      });
    },
    [dialog, showAccountAlreadyRegisteredDialog, completeSuccessfulLogin, handleMfaPending],
  );

  useOAuthCallbackEffect({
    handledOAuthCallbackRef,
    postLoginRedirect,
    finalizeOAuthLogin,
    dialog,
  });

  const handleOAuthLogin = useCallback(
    (provider: 'google' | 'github') =>
      startOAuthLogin({
        provider,
        dialog,
        finalizeOAuthLogin,
        showAccountAlreadyRegisteredDialog,
      }),
    [dialog, finalizeOAuthLogin, showAccountAlreadyRegisteredDialog],
  );

  return { handleOAuthLogin };
}
