import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { useDialog } from '@/components/common/dialogContext';
import { getUser, login } from '@/services/api/authentication';
import { type LoginFormValues, loginSchema } from '@/services/api/validation/userSchema';

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;
type DialogApi = ReturnType<typeof useDialog>;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function attemptPasswordLogin({
  email,
  password,
  dialog,
  completeSuccessfulLogin,
}: {
  email: string;
  password: string;
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: AuthenticatedUser) => Promise<void>;
}) {
  try {
    const token = await login(email, password);
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
}

export function useLoginForm({
  dialog,
  completeSuccessfulLogin,
}: {
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: AuthenticatedUser) => Promise<void>;
}) {
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  const emailRef = useRef<{ focus(): void } | null>(null);

  const submit = handleSubmit(async (data: LoginFormValues) => {
    await attemptPasswordLogin({
      email: data.email,
      password: data.password,
      dialog,
      completeSuccessfulLogin,
    });
  });

  return { control, emailRef, submit };
}
