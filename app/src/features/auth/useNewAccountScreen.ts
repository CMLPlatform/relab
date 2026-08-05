import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { register } from '@/services/api/auth/authentication';
import { type NewAccountFormValues, newAccountSchema } from '@/services/api/validation/userSchema';
import { useAppTheme } from '@/theme';

export type NewAccountSection = 'username' | 'email' | 'password';

export function useNewAccountScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
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

  const validatedCreateAccount = form.handleSubmit(async (data: NewAccountFormValues) => {
    const result = await register(data.username, data.email, data.password);

    if (!result.success) {
      dialog.alert({
        title: 'Registration failed',
        message: result.error || 'Account creation failed. Please try again.',
      });
      return;
    }

    // Do not auto-login. The account still needs email verification, and a login
    // attempt here would reveal — via success vs failure — whether the email was
    // already registered, defeating the server's non-enumerable registration.
    dialog.alert({
      title: 'Check your email',
      message:
        'If the email address is available, we sent a verification link. Verify your email, then sign in.',
    });
    router.replace('/login');
  });

  // The "Create Account" button only shows a spinner while submitting — it stays
  // pressable — so a double-tap would fire register twice and stack two dialogs.
  // Guarded at this boundary, not inside the validated handler, which the
  // compiler's ref rule forbids.
  const createAccount = useSingleFlight(validatedCreateAccount);

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
