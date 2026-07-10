import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { useDialog } from '@/components/base/dialogContext';
import { getUser, login } from '@/services/api/auth/authentication';
import type { MfaLoginPending } from '@/services/api/auth/authMfa';
import { type LoginFormValues, loginSchema } from '@/services/api/validation/userSchema';
import type { User } from '@/types/User';
import { getErrorMessage } from '@/utils/errors';

type DialogApi = ReturnType<typeof useDialog>;

async function attemptPasswordLogin({
  email,
  password,
  dialog,
  completeSuccessfulLogin,
  handleMfaPending,
}: {
  email: string;
  password: string;
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  handleMfaPending: (pending: MfaLoginPending) => void;
}) {
  try {
    const token = await login(email, password);
    if (token.status === 'mfa_required') {
      handleMfaPending(token);
      return;
    }
    if (token.status === 'invalid_credentials') {
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
}

export function useLoginForm({
  dialog,
  completeSuccessfulLogin,
  handleMfaPending,
}: {
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  handleMfaPending: (pending: MfaLoginPending) => void;
}) {
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  const emailRef = useRef<{ focus(): void } | null>(null);
  const inFlight = useRef(false);

  const validatedSubmit = handleSubmit(async (data: LoginFormValues) => {
    await attemptPasswordLogin({
      email: data.email,
      password: data.password,
      dialog,
      completeSuccessfulLogin,
      handleMfaPending,
    });
  });

  // The button stays pressable and the password field's onSubmitEditing fires the
  // same handler, so two submits can race before any re-render. Single-flight at
  // this boundary (not inside the validated handler, which the compiler's ref rule
  // forbids) so an mfa_required response doesn't stack two /mfa screens and a
  // success doesn't navigate twice.
  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await validatedSubmit();
    } finally {
      inFlight.current = false;
    }
  }, [validatedSubmit]);

  return { control, emailRef, submit };
}
