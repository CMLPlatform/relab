import * as Google from 'expo-auth-session/providers/google';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Platform, useColorScheme, View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDialog } from '@/components/common/DialogProvider';
import { API_URL, GOOGLE_WEB_CLIENT_ID } from '@/config';
import { useAuth } from '@/context/AuthProvider';
import {
  getUser,
  login,
  markWebSessionActive,
  oauthLoginWithGoogleToken,
} from '@/services/api/authentication';
import { apiFetch } from '@/services/api/client';
import { loginSchema, type LoginFormValues } from '@/services/api/validation/userSchema';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_ACCOUNT_NOT_LINKED_ERROR = 'OAUTH_USER_ALREADY_EXISTS';
const OAUTH_BROWSER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
type AuthSessionResult = Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
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
    // Resolve against a dummy origin; if the result leaves that origin, the
    // input contained an absolute URL or protocol-relative trick (e.g. encoded slashes).
    const resolved = new URL(redirectTo, 'https://placeholder.invalid');
    if (resolved.origin !== 'https://placeholder.invalid') {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return redirectTo as SafeRedirectTarget;
}

const ALLOWED_OAUTH_HOSTNAMES = new Set(['accounts.google.com', 'github.com']);

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
  // OAuth provider errors (standard OAuth error codes)
  if (error === 'access_denied' || error === 'user_denied') {
    return 'You denied access. Please try again and grant permission.';
  }
  if (error === 'invalid_scope') {
    return 'Invalid scope requested. Please contact support.';
  }
  if (error === 'server_error' || error === 'temporarily_unavailable') {
    return `The ${detail || 'provider'} is temporarily unavailable. Please try again in a moment.`;
  }

  // Backend errors
  if (detail) {
    return detail;
  }

  // Platform-specific guidance
  if (platform !== 'web') {
    return "OAuth login failed. Please ensure your device has internet and try again. If the browser didn't open, check your internet connection.";
  }

  return 'OAuth login failed. Please try again.';
}

function extractErrorDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = (payload as { detail?: unknown }).detail;
  if (typeof candidate === 'string') {
    return candidate;
  }

  if (candidate && typeof candidate === 'object') {
    const nested = candidate as { reason?: unknown; message?: unknown };
    if (typeof nested.reason === 'string') {
      return nested.reason;
    }
    if (typeof nested.message === 'string') {
      return nested.message;
    }
  }

  return undefined;
}

function isAccountNotLinkedError(detail: string | undefined): boolean {
  return detail === OAUTH_ACCOUNT_NOT_LINKED_ERROR;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function Login() {
  // Hooks
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
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const postLoginRedirect = getSafeRedirectTarget(redirectTo);

  // expo-auth-session Google PKCE hook (web only — native uses backend-mediated flow)
  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  // Form
  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  // Refs
  const emailRef = useRef<{ focus(): void } | null>(null);
  const handledOAuthCallbackRef = useRef(false);

  // States
  const [keyboardShown, setKeyBoardShown] = useState(false);

  // Effects
  // Redirect already-authenticated users away from the login page
  useEffect(() => {
    if (authLoading || !user) return;

    if (!user.username || user.username === 'Username not defined') {
      router.replace('/(auth)/onboarding');
    } else if (postLoginRedirect) {
      // postLoginRedirect is validated by getSafeRedirectTarget to start with "/"
      router.replace(postLoginRedirect);
    } else {
      router.replace({ pathname: '/products' });
    }
  }, [user, authLoading, router, postLoginRedirect]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyBoardShown(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyBoardShown(false);
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

  const finalizeOAuthLogin = useCallback(
    async ({ success, error, detail }: { success: boolean; error?: string; detail?: string }) => {
      if (isAccountNotLinkedError(detail)) {
        dialog.alert({
          title: 'Email Already Registered',
          message:
            'An account with this email already exists. Sign in with your email and password below, then link your account from your profile settings.',
          buttons: [
            { text: 'Cancel' },
            { text: 'Sign in with password', onPress: () => emailRef.current?.focus() },
          ],
        });
        return;
      }

      if (!success) {
        const errorPlatform =
          Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
        const errorMsg = getOAuthErrorMessage(error, detail, errorPlatform);
        throw new Error(errorMsg);
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
          retryCount++;
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
    [completeSuccessfulLogin, dialog],
  );

  // Handle Google PKCE response on web (set by expo-auth-session after popup/redirect completes)
  useEffect(() => {
    if (Platform.OS !== 'web' || !googleResponse) return;

    if (googleResponse.type === 'error') {
      dialog.alert({
        title: 'Login Failed',
        message: googleResponse.error?.message || 'Google login failed. Please try again.',
      });
      return;
    }

    if (googleResponse.type !== 'success') return;

    const { authentication } = googleResponse;
    if (!authentication?.idToken) {
      dialog.alert({ title: 'Login Failed', message: 'Google login failed. Please try again.' });
      return;
    }

    oauthLoginWithGoogleToken(authentication.idToken, authentication.accessToken ?? null)
      .then(() => finalizeOAuthLogin({ success: true }))
      .catch((error: unknown) => {
        dialog.alert({
          title: 'Login Failed',
          message: getErrorMessage(error, 'Google login failed.'),
        });
      });
  }, [googleResponse, finalizeOAuthLogin, dialog]);

  useEffect(() => {
    if (handledOAuthCallbackRef.current) {
      return;
    }

    const successParam = typeof oauthSuccess === 'string' ? oauthSuccess : undefined;
    const errorParam = typeof oauthError === 'string' ? oauthError : undefined;
    const detailParam = typeof oauthDetail === 'string' ? oauthDetail : undefined;
    const hasOAuthCallbackParams =
      successParam !== undefined || errorParam !== undefined || detailParam !== undefined;

    if (!hasOAuthCallbackParams) {
      return;
    }

    handledOAuthCallbackRef.current = true;

    // Remove OAuth callback params from the URL so they don't linger in
    // browser history (tokens/error codes shouldn't sit in the address bar).
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

  // Callbacks
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

      const u = await getUser(true);
      if (!u) {
        dialog.alert({
          title: 'Login Failed',
          message: 'Unable to retrieve user information. Please try again.',
        });
        return;
      }

      if (!u.isActive) {
        dialog.alert({
          title: 'Account Suspended',
          message: 'Your account has been suspended. Please contact support for assistance.',
        });
        return;
      }

      await completeSuccessfulLogin(u);
    } catch (error: unknown) {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'Unable to reach server. Please try again later.'),
      });
    }
  });

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      // On web, Google uses client-side PKCE via expo-auth-session.
      // The googleResponse effect above handles the result.
      if (Platform.OS === 'web' && provider === 'google') {
        await promptGoogleAsync();
        return;
      }

      const transport = 'session';
      const redirectUri = Linking.createURL('/login');
      const authUrl = `${API_URL}/auth/oauth/${provider}/${transport}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      // The backend returns a JSON payload containing the actual authorization URL
      const response = await apiFetch(authUrl);
      if (!response.ok) {
        let detail: string | undefined;
        try {
          detail = extractErrorDetail(await response.json());
        } catch {
          detail = undefined;
        }

        if (isAccountNotLinkedError(detail)) {
          dialog.alert({
            title: 'Email Already Registered',
            message:
              'An account with this email already exists. Sign in with your email and password below, then link your account from your profile settings.',
            buttons: [
              { text: 'Cancel' },
              { text: 'Sign in with password', onPress: () => emailRef.current?.focus() },
            ],
          });
          return;
        }

        throw new Error(detail || 'Failed to reach authorization endpoint.');
      }
      const data = await response.json();

      if (Platform.OS === 'web') {
        // On web, use a full-page redirect to the OAuth provider.
        // Popups are unreliable on mobile Safari (often blocked or opener is
        // nullified), so we redirect the page and let the existing
        // useLocalSearchParams effect handle the callback when the provider
        // redirects back to /login?success=true.
        if (!isAllowedOAuthRedirectUrl(data.authorization_url)) {
          throw new Error('Unexpected authorization URL received. Please try again.');
        }
        window.location.href = data.authorization_url;
        return;
      }

      // Open browser with timeout
      let result: AuthSessionResult | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('OAuth browser session timed out. Please try again.')),
          OAUTH_BROWSER_TIMEOUT_MS,
        );
      });

      const browserPromise = WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri);

      try {
        result = (await Promise.race([browserPromise, timeoutPromise])) as AuthSessionResult;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      if (!result || result.type !== 'success' || !result.url) {
        // User cancelled the browser session
        return;
      }

      const { success, error, detail } = parseOAuthCallbackUrl(result.url);

      await finalizeOAuthLogin({ success, error, detail });
    } catch (error: unknown) {
      dialog.alert({
        title: 'Login Failed',
        message: getErrorMessage(error, 'OAuth login failed.'),
      });
    }
  };

  // Render
  return (
    <View style={{ flex: 1 }}>
      {/* Back button — top left */}
      <Button
        mode="text"
        icon="arrow-left"
        onPress={() => router.replace('/products')}
        style={{ position: 'absolute', top: 16, left: 8, zIndex: 10 }}
        compact
      >
        Browse
      </Button>

      <View
        style={{
          padding: 20,
          gap: 10,
          position: 'absolute',
          bottom: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
        }}
      >
        <LinearGradient
          colors={['transparent', colorScheme === 'light' ? 'white' : 'black']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <Text
          style={{
            fontSize: 48,
            fontWeight: 'bold',
            textAlign: 'left',
            textShadowColor: colorScheme === 'light' ? 'white' : 'black',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          {'RELab'}
        </Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              ref={(instance: { focus(): void } | null) => {
                emailRef.current = instance;
              }}
              mode="outlined"
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Email or username"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password"
              onSubmitEditing={attemptLogin}
            />
          )}
        />
        <Button mode="contained" style={{ width: '100%', padding: 5 }} onPress={attemptLogin}>
          Login
        </Button>
        <Button
          mode="text"
          compact
          onPress={() => router.push('/forgot-password')}
          style={{ alignSelf: 'flex-end' }}
        >
          Forgot password?
        </Button>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
          <Text style={{ marginHorizontal: 10, opacity: 0.5 }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'grey', opacity: 0.3 }} />
        </View>

        <Button
          mode="outlined"
          icon="google"
          style={{ width: '100%' }}
          onPress={() => handleOAuthLogin('google')}
        >
          Continue with Google
        </Button>
        <Button
          mode="outlined"
          icon="github"
          style={{ width: '100%' }}
          onPress={() => handleOAuthLogin('github')}
        >
          Continue with GitHub
        </Button>

        <Button
          mode="contained-tonal"
          buttonColor={theme.colors.secondaryContainer}
          textColor={theme.colors.onSecondaryContainer}
          onPress={() => router.push('/new-account')}
          style={{ width: '100%', marginTop: 4 }}
        >
          Create a new account
        </Button>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          height: keyboardShown && Keyboard.metrics() ? Keyboard.metrics()?.height : 0,
          width: '100%',
          backgroundColor: colorScheme === 'light' ? 'white' : 'black',
        }}
      />
    </View>
  );
}
