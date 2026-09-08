import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { useDialog } from '@/components/base/dialogContext';
import { SUPPORT_EMAIL } from '@/constants';
import { useSingleFlight } from '@/hooks/useSingleFlight';
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
        title: "Couldn't sign in",
        message: 'Invalid email or password.',
      });
      return;
    }

    const authenticatedUser = await getUser(true);
    if (!authenticatedUser) {
      dialog.alert({
        title: "Couldn't sign in",
        message: "Couldn't load your account. Please try again.",
      });
      return;
    }

    if (!authenticatedUser.isActive) {
      dialog.alert({
        title: 'Account suspended',
        message: `Your account has been suspended. Email ${SUPPORT_EMAIL} if you think this is a mistake.`,
      });
      return;
    }

    await completeSuccessfulLogin(authenticatedUser);
  } catch (error: unknown) {
    dialog.alert({
      title: "Couldn't sign in",
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

  const validatedSubmit = handleSubmit(async (data: LoginFormValues) => {
    await attemptPasswordLogin({
      email: data.email,
      password: data.password,
      dialog,
      completeSuccessfulLogin,
      handleMfaPending,
    });
  });

  // onSubmitEditing and the button can race (two /mfa screens, double
  // navigate). Guarded here; the compiler's ref rule forbids it inside the handler.
  const submit = useSingleFlight(validatedSubmit);

  return { control, emailRef, submit };
}
