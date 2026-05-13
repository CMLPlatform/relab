import { createURL } from 'expo-linking';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { useDialog } from '@/components/common/dialogContext';
import { API_URL } from '@/config';
import { getUser, markWebSessionActive } from '@/services/api/authentication';
import { claimOAuthMfaHandoff, type MfaLoginPending } from '@/services/api/authMfa';
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

function getOAuthErrorMessage(
  error?: string,
  detail?: string,
  platform: 'ios' | 'android' | 'web' = 'web',
): string {
  if (error === 'access_denied' || error === 'user_denied') {
    return 'You denied access. Please try again and grant permission.';
  }
  if (error === 'invalid_scope') {
    return 'Invalid scope requested. Please contact support.';
  }
  if (error === 'server_error' || error === 'temporarily_unavailable') {
    return `The ${detail ?? 'provider'} is temporarily unavailable. Please try again in a moment.`;
  }
  if (detail) return detail;
  if (platform !== 'web') {
    return "OAuth login failed. Please ensure your device has internet and try again. If the browser didn't open, check your internet connection.";
  }
  return 'OAuth login failed. Please try again.';
}

function isAccountNotLinkedError(detail: string | undefined): boolean {
  return detail === OAUTH_ACCOUNT_NOT_LINKED_ERROR;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeOAuthParams({
  oauthSuccess,
  oauthError,
  oauthDetail,
}: {
  oauthSuccess?: string | string[];
  oauthError?: string | string[];
  oauthDetail?: string | string[];
}) {
  return {
    successParam: typeof oauthSuccess === 'string' ? oauthSuccess : undefined,
    errorParam: typeof oauthError === 'string' ? oauthError : undefined,
    detailParam: typeof oauthDetail === 'string' ? oauthDetail : undefined,
  };
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
        "OAuth succeeded but we couldn't establish your session. " +
          (Platform.OS !== 'web'
            ? 'Please try logging in again, or check your internet connection.'
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
  success,
  error,
  detail,
  mfaHandoff,
  dialog,
  completeSuccessfulLogin,
  handleMfaPending,
  showAccountAlreadyRegisteredDialog,
}: OAuthCallbackResult & {
  success: boolean;
  error?: string;
  detail?: string;
  mfaHandoff?: string;
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  handleMfaPending: (pending: MfaLoginPending) => void;
  showAccountAlreadyRegisteredDialog: () => void;
}) {
  if (mfaHandoff) {
    handleMfaPending(await claimOAuthMfaHandoff(mfaHandoff));
    return;
  }

  if (isAccountNotLinkedError(detail)) {
    showAccountAlreadyRegisteredDialog();
    return;
  }

  if (!success) {
    const errorPlatform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
    throw new Error(getOAuthErrorMessage(error, detail, errorPlatform));
  }

  if (Platform.OS === 'web') {
    markWebSessionActive();
  }

  const authenticatedUser = await getAuthenticatedUserWithRetry();

  if (!authenticatedUser) {
    throw new Error('OAuth succeeded but session validation failed. Please try again.');
  }

  if (!authenticatedUser.isActive) {
    dialog.alert({
      title: 'Account Suspended',
      message: 'Your account has been suspended. Please contact support for assistance.',
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

      throw new Error(detail || 'Failed to reach authorization endpoint.');
    }

    if (!isAllowedOAuthRedirectUrl(authorization.authorizationUrl)) {
      throw new Error('Unexpected authorization URL received. Please try again.');
    }

    if (Platform.OS === 'web') {
      window.location.href = authorization.authorizationUrl;
      return;
    }

    const result = await openOAuthBrowserSession(authorization.authorizationUrl, redirectUri);

    if (!result || result.type !== 'success' || !result.url) return;

    if (!isExpectedOAuthCallbackUrl(result.url, redirectUri)) {
      throw new Error('Unexpected OAuth callback URL received. Please try again.');
    }

    await finalizeOAuthLogin(parseOAuthCallbackUrl(result.url));
  } catch (error: unknown) {
    dialog.alert({
      title: 'Login Failed',
      message: getErrorMessage(error, 'OAuth login failed.'),
    });
  }
}

function useOAuthCallbackEffect({
  handledOAuthCallbackRef,
  oauthSuccess,
  oauthError,
  oauthDetail,
  postLoginRedirect,
  finalizeOAuthLogin,
  dialog,
}: {
  handledOAuthCallbackRef: MutableRefObject<boolean>;
  oauthSuccess?: string | string[];
  oauthError?: string | string[];
  oauthDetail?: string | string[];
  postLoginRedirect?: SafeRedirectTarget;
  finalizeOAuthLogin: (args: OAuthCallbackResult) => Promise<void>;
  dialog: DialogApi;
}) {
  useEffect(() => {
    if (handledOAuthCallbackRef.current) return;

    const { successParam, errorParam, detailParam } = normalizeOAuthParams({
      oauthSuccess,
      oauthError,
      oauthDetail,
    });
    const fragmentCallback =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash
        ? parseOAuthCallbackUrl(window.location.href)
        : undefined;
    const hasOAuthCallbackParams =
      successParam !== undefined ||
      errorParam !== undefined ||
      detailParam !== undefined ||
      fragmentCallback !== undefined;

    if (!hasOAuthCallbackParams) return;

    handledOAuthCallbackRef.current = true;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanSearch = postLoginRedirect
        ? `?redirectTo=${encodeURIComponent(postLoginRedirect)}`
        : '';
      window.history.replaceState({}, '', window.location.pathname + cleanSearch);
    }

    finalizeOAuthLogin(
      fragmentCallback ?? {
        success: successParam === 'true',
        error: errorParam,
        detail: detailParam,
      },
    ).catch((error: unknown) => {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'OAuth login failed.'),
      });
    });
  }, [
    dialog,
    finalizeOAuthLogin,
    handledOAuthCallbackRef,
    oauthDetail,
    oauthError,
    oauthSuccess,
    postLoginRedirect,
  ]);
}

export function useOAuthLogin({
  dialog,
  completeSuccessfulLogin,
  showAccountAlreadyRegisteredDialog,
  postLoginRedirect,
  oauthSuccess,
  oauthError,
  oauthDetail,
  handleMfaPending,
}: {
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  showAccountAlreadyRegisteredDialog: () => void;
  postLoginRedirect?: SafeRedirectTarget;
  oauthSuccess?: string | string[];
  oauthError?: string | string[];
  oauthDetail?: string | string[];
  handleMfaPending: (pending: MfaLoginPending) => void;
}) {
  const handledOAuthCallbackRef = useRef(false);

  const finalizeOAuthLogin = useCallback(
    async ({ success, error, detail, mfaHandoff }: OAuthCallbackResult) => {
      await finalizeOAuthSession({
        success,
        error,
        detail,
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
    oauthSuccess,
    oauthError,
    oauthDetail,
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
