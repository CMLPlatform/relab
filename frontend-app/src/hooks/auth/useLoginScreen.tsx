import { zodResolver } from '@hookform/resolvers/zod';
import * as Linking from 'expo-linking';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Keyboard, Platform } from 'react-native';
import { useDialog } from '@/components/common/DialogProvider';
import { API_URL } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import { useEffectiveColorScheme } from '@/context/ThemeModeProvider';
import { getUser, login, markWebSessionActive } from '@/services/api/authentication';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  openOAuthBrowserSession,
} from '@/services/api/oauthFlow';
import { type LoginFormValues, loginSchema } from '@/services/api/validation/userSchema';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_ACCOUNT_NOT_LINKED_ERROR = 'OAUTH_USER_ALREADY_EXISTS';
const ALLOWED_OAUTH_HOSTNAMES = new Set(['accounts.google.com', 'github.com']);
type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };
type SafeRedirectTarget = Extract<Href, string>;

function maybeUnrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as TimerWithUnref).unref();
  }
}

function getSafeRedirectTarget(
  redirectTo: string | string[] | undefined,
): SafeRedirectTarget | undefined {
  if (
    typeof redirectTo !== 'string' ||
    !redirectTo.startsWith('/') ||
    redirectTo.startsWith('//')
  ) {
    return undefined;
  }

  try {
    const resolved = new URL(redirectTo, 'https://placeholder.invalid');
    if (resolved.origin !== 'https://placeholder.invalid') {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return redirectTo as SafeRedirectTarget;
}

function isAllowedOAuthRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_OAUTH_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

function parseOAuthCallbackUrl(url: string): {
  success: boolean;
  error?: string;
  detail?: string;
} {
  const callbackUrl = new URL(url.replace('#', '?'));
  const success = callbackUrl.searchParams.get('success') === 'true';
  const error = callbackUrl.searchParams.get('error') ?? undefined;
  const detail = callbackUrl.searchParams.get('detail') ?? undefined;
  return { success, error, detail };
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
    return `The ${detail || 'provider'} is temporarily unavailable. Please try again in a moment.`;
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

export function useLoginScreen() {
  const router = useRouter();
  const {
    redirectTo,
    success: oauthSuccess,
    error: oauthError,
    detail: oauthDetail,
  } = useLocalSearchParams<{
    redirectTo?: string | string[];
    success?: string | string[];
    error?: string | string[];
    detail?: string | string[];
  }>();
  const dialog = useDialog();
  const { user, isLoading: authLoading, refetch } = useAuth();
  const colorScheme = useEffectiveColorScheme();
  const postLoginRedirect = getSafeRedirectTarget(redirectTo);

  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const emailRef = useRef<{ focus(): void } | null>(null);
  const handledOAuthCallbackRef = useRef(false);
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    if (!user.username || user.username === 'Username not defined') {
      router.replace('/(auth)/onboarding');
    } else if (postLoginRedirect) {
      router.replace(postLoginRedirect);
    } else {
      router.replace({ pathname: '/products' });
    }
  }, [authLoading, postLoginRedirect, router, user]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardShown(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardShown(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const completeSuccessfulLogin = useCallback(
    async (authenticatedUser: NonNullable<Awaited<ReturnType<typeof getUser>>>) => {
      await refetch(false);

      if (!authenticatedUser.username || authenticatedUser.username === 'Username not defined') {
        router.replace('/(auth)/onboarding');
      } else if (postLoginRedirect) {
        router.replace(postLoginRedirect);
      } else {
        router.replace({ pathname: '/products' });
      }
    },
    [postLoginRedirect, refetch, router],
  );

  const showAccountAlreadyRegisteredDialog = useCallback(() => {
    dialog.alert({
      title: 'Email Already Registered',
      message:
        'An account with this email already exists. Sign in with your email and password below, then link your account from your profile settings.',
      buttons: [
        { text: 'Cancel' },
        { text: 'Sign in with password', onPress: () => emailRef.current?.focus() },
      ],
    });
  }, [dialog]);

  const finalizeOAuthLogin = useCallback(
    async ({ success, error, detail }: { success: boolean; error?: string; detail?: string }) => {
      if (isAccountNotLinkedError(detail)) {
        showAccountAlreadyRegisteredDialog();
        return;
      }

      if (!success) {
        const errorPlatform =
          Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
        throw new Error(getOAuthErrorMessage(error, detail, errorPlatform));
      }

      if (Platform.OS === 'web') {
        markWebSessionActive();
      }

      let authenticatedUser = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries && !authenticatedUser) {
        try {
          authenticatedUser = await getUser(true);
        } catch {
          retryCount += 1;
          if (retryCount > maxRetries) {
            throw new Error(
              "OAuth succeeded but we couldn't establish your session. " +
                (Platform.OS !== 'web'
                  ? 'Please try logging in again, or check your internet connection.'
                  : 'Please try again.'),
            );
          }
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 300 * retryCount);
            maybeUnrefTimer(timer);
          });
        }
      }

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
    },
    [completeSuccessfulLogin, dialog, showAccountAlreadyRegisteredDialog],
  );

  useEffect(() => {
    if (handledOAuthCallbackRef.current) return;

    const successParam = typeof oauthSuccess === 'string' ? oauthSuccess : undefined;
    const errorParam = typeof oauthError === 'string' ? oauthError : undefined;
    const detailParam = typeof oauthDetail === 'string' ? oauthDetail : undefined;
    const hasOAuthCallbackParams =
      successParam !== undefined || errorParam !== undefined || detailParam !== undefined;

    if (!hasOAuthCallbackParams) return;

    handledOAuthCallbackRef.current = true;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanSearch = postLoginRedirect
        ? `?redirectTo=${encodeURIComponent(postLoginRedirect)}`
        : '';
      window.history.replaceState({}, '', window.location.pathname + cleanSearch);
    }

    finalizeOAuthLogin({
      success: successParam === 'true',
      error: errorParam,
      detail: detailParam,
    }).catch((error: unknown) => {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'OAuth login failed.'),
      });
    });
  }, [dialog, finalizeOAuthLogin, oauthDetail, oauthError, oauthSuccess, postLoginRedirect]);

  const attemptLogin = handleSubmit(async (data: LoginFormValues) => {
    try {
      const token = await login(data.email, data.password);
      if (!token) {
        dialog.alert({
          title: 'Login Failed',
          message: 'Invalid email or password.',
        });
        return;
      }

      const authenticatedUser = await getUser(true);
      if (!authenticatedUser) {
        dialog.alert({
          title: 'Login Failed',
          message: 'Unable to retrieve user information. Please try again.',
        });
        return;
      }

      if (!authenticatedUser.isActive) {
        dialog.alert({
          title: 'Account Suspended',
          message: 'Your account has been suspended. Please contact support for assistance.',
        });
        return;
      }

      await completeSuccessfulLogin(authenticatedUser);
    } catch (error: unknown) {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'Unable to reach server. Please try again later.'),
      });
    }
  });

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      const transport = 'session';
      const redirectUri = Linking.createURL('/login');
      const authUrl = buildOAuthAuthorizeUrl(
        `${API_URL}/auth/oauth/${provider}/${transport}/authorize`,
        redirectUri,
      );
      const authorization = await fetchOAuthAuthorizationUrl(authUrl);

      if (!authorization.ok || !authorization.authorizationUrl) {
        const detail = authorization.detail;

        if (isAccountNotLinkedError(detail)) {
          showAccountAlreadyRegisteredDialog();
          return;
        }

        throw new Error(detail || 'Failed to reach authorization endpoint.');
      }

      if (Platform.OS === 'web') {
        if (!isAllowedOAuthRedirectUrl(authorization.authorizationUrl)) {
          throw new Error('Unexpected authorization URL received. Please try again.');
        }
        window.location.href = authorization.authorizationUrl;
        return;
      }

      const result = await openOAuthBrowserSession(authorization.authorizationUrl, redirectUri);

      if (!result || result.type !== 'success' || !result.url) return;

      const parsed = parseOAuthCallbackUrl(result.url);
      await finalizeOAuthLogin(parsed);
    } catch (error: unknown) {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'OAuth login failed.'),
      });
    }
  };

  return {
    ui: {
      keyboardShown,
      colorScheme,
    },
    form: {
      control,
      emailRef,
      submit: attemptLogin,
    },
    actions: {
      browseProducts: () => router.replace('/products'),
      goToForgotPassword: () => router.push('/forgot-password'),
      goToCreateAccount: () => router.push('/new-account'),
      loginWithGoogle: () => handleOAuthLogin('google'),
      loginWithGithub: () => handleOAuthLogin('github'),
    },
  };
}
