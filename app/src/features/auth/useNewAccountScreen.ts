import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { login, register } from '@/services/api/auth/authentication';
import { type NewAccountFormValues, newAccountSchema } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';
import { logError } from '@/utils/logging';

export type NewAccountSection = 'username' | 'email' | 'password';

export function useNewAccountScreen() {
  const router = useRouter();
  const { refetch, user, isLoading: authLoading } = useAuth();
  const dialog = useDialog();
  const theme = useAppTheme();
  const [section, setSection] = useState<NewAccountSection>('username');

  useEffect(() => {
    if (authLoading || !user) return;
    router.replace('/products');
  }, [user, authLoading, router]);

  const form = useForm<NewAccountFormValues>({
    resolver: zodResolver(newAccountSchema),
    mode: 'onChange',
    defaultValues: { username: '', email: '', password: '' },
  });

  const username = useWatch({
    control: form.control,
    name: 'username',
    defaultValue: '',
  });

  const advanceFromUsername = async () => {
    const isValid = await form.trigger('username');
    if (isValid) setSection('email');
  };

  const advanceFromEmail = async () => {
    const isValid = await form.trigger('email');
    if (isValid) setSection('password');
  };

  const inFlight = useRef(false);

  const validatedCreateAccount = form.handleSubmit(async (data: NewAccountFormValues) => {
    const result = await register(data.username, data.email, data.password);

    if (!result.success) {
      dialog.alert({
        title: 'Registration Failed',
        message: result.error || 'Account creation failed. Please try again.',
      });
      return;
    }

    const loginSuccess = await login(data.email, data.password);

    if (loginSuccess.status === 'invalid_credentials') {
      dialog.alert({
        title: 'Account Created',
        message: 'Your account was created! Please log in.',
      });
      router.replace('/login');
      return;
    }
    try {
      await refetch(true);
    } catch (error) {
      logError('[NewAccount] Failed to refetch user after signup:', error);
    }

    router.replace('/products');
  });

  // The "Create Account" button only shows a spinner while submitting — it stays
  // pressable — so a double-tap fired register twice: the second returned "email
  // already exists" and popped a spurious "Registration Failed" dialog over the
  // successful signup. Single-flight at this boundary (not inside the validated
  // handler, which the compiler's ref rule forbids).
  const createAccount = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await validatedCreateAccount();
    } finally {
      inFlight.current = false;
    }
  }, [validatedCreateAccount]);

  return {
    ui: {
      colorScheme: theme.scheme,
      headlineColor: theme.colors.onBackground,
      mutedColor: theme.tokens.text.muted,
    },
    flow: {
      section,
      username,
    },
    form: {
      control: form.control,
      errors: form.formState.errors,
      isSubmitting: form.formState.isSubmitting,
    },
    actions: {
      goToLogin: () => router.dismissTo('/login'),
      advanceFromUsername,
      advanceFromEmail,
      goBackToUsername: () => setSection('username'),
      goBackToEmail: () => setSection('email'),
      createAccount,
    },
  };
}
