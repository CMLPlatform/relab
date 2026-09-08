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

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

async function attemptPasswordLogin({
  email,
  password,
  dialog,
  completeSuccessfulLogin,
  handleMfaPending,
  rejectPassword,
}: {
  email: string;
  password: string;
  dialog: DialogApi;
  completeSuccessfulLogin: (authenticatedUser: User) => Promise<void>;
  handleMfaPending: (pending: MfaLoginPending) => void;
  rejectPassword: () => void;
}) {
  try {
    const token = await login(email, password);
    if (token.status === 'mfa_required') {
      handleMfaPending(token);
      return;
    }
    // A wrong password is a field error, not a dialog: the user corrects it
    // in place. Lockouts and other server refusals (429, 5xx) throw an
    // ApiError and still land in the catch below.
    if (token.status === 'invalid_credentials') {
      rejectPassword();
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
  const { control, handleSubmit, setError } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  const emailRef = useRef<{ focus(): void } | null>(null);
  const passwordRef = useRef<{ focus(): void } | null>(null);

  // Built at press time, not render time: the compiler's ref rule only lets
  // an event handler read passwordRef.
  const validatedSubmit = () =>
    handleSubmit(async (data: LoginFormValues) => {
      await attemptPasswordLogin({
        email: data.email,
        password: data.password,
        dialog,
        completeSuccessfulLogin,
        handleMfaPending,
        // Inline field error; focus stays put so the retry is one keystroke away.
        rejectPassword: () => {
          setError('password', { type: 'server', message: INVALID_CREDENTIALS_MESSAGE });
          passwordRef.current?.focus();
        },
      });
    })();

  // onSubmitEditing and the button can race (two /mfa screens, double
  // navigate). Guarded here; the compiler's ref rule forbids it inside the handler.
  const submit = useSingleFlight(validatedSubmit);

  return { control, emailRef, passwordRef, submit };
}
