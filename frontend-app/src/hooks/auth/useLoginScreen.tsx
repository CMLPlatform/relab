import { useLocalSearchParams, useRouter } from 'expo-router';
import { maybeCompleteAuthSession } from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import { useEffectiveColorScheme } from '@/context/themeMode';
import type { getUser } from '@/services/api/authentication';
import { useLoginForm } from './useLoginForm';
import {
  getSafeRedirectTarget,
  routeAuthenticatedUser,
  useAuthenticatedUserRedirect,
} from './useLoginRedirect';
import { useOAuthLogin } from './useOAuthLogin';

maybeCompleteAuthSession();

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

function useKeyboardShownState() {
  const [keyboardShown, setKeyboardShown] = useState(false);

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

  return keyboardShown;
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
  const keyboardShown = useKeyboardShownState();

  useAuthenticatedUserRedirect({
    authLoading,
    user,
    router,
    postLoginRedirect,
  });

  const completeSuccessfulLogin = useCallback(
    async (authenticatedUser: AuthenticatedUser) => {
      await refetch(false);
      routeAuthenticatedUser({
        authenticatedUser,
        router,
        postLoginRedirect,
      });
    },
    [postLoginRedirect, refetch, router],
  );

  const { control, emailRef, submit } = useLoginForm({
    dialog,
    completeSuccessfulLogin,
  });

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
  }, [dialog, emailRef]);

  const { handleOAuthLogin } = useOAuthLogin({
    dialog,
    completeSuccessfulLogin,
    showAccountAlreadyRegisteredDialog,
    postLoginRedirect,
    oauthSuccess,
    oauthError,
    oauthDetail,
  });

  return {
    ui: {
      keyboardShown,
      colorScheme,
    },
    form: {
      control,
      emailRef,
      submit,
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
