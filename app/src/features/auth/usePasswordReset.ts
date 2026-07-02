import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { API_URL } from '@/config';
import { apiFetch } from '@/services/api/client';
import {
  type ForgotPasswordFormValues,
  forgotPasswordSchema,
  type ResetPasswordFormValues,
  resetPasswordSchema,
} from '@/services/api/validation/userSchema';
import { logError } from '@/utils/logging';

/** Redirect to /login `ms` after `active` flips true (success screens auto-return). */
function useDelayedLoginRedirect(active: boolean, ms: number) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => router.replace('/login'), ms);
    return () => clearTimeout(timer);
  }, [active, ms, router]);
}

async function postAuth(path: string, body: unknown, fallbackError: string) {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const data = await response.json().catch(() => null);
  return (data?.detail as string) || fallbackError;
}

export function useForgotPassword() {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDelayedLoginRedirect(success, 5000);

  const submit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      const message = await postAuth(
        '/auth/forgot-password',
        { email },
        'Failed to send reset email',
      );
      message ? setError(message) : setSuccess(true);
    } catch (err) {
      logError('Forgot password error:', err);
      setError('An error occurred. Please try again later.');
    }
  });

  return {
    control,
    fieldError: errors.email?.message,
    isValid,
    isSubmitting,
    success,
    error,
    submit,
  };
}

export function useResetPassword(token: string | undefined) {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDelayedLoginRedirect(success, 3000);

  const submit = handleSubmit(async ({ password }) => {
    if (!token) {
      setError('No reset token provided');
      return;
    }
    setError(null);
    try {
      const message = await postAuth(
        '/auth/reset-password',
        { token, password },
        'Password reset failed',
      );
      message ? setError(message) : setSuccess(true);
    } catch (err) {
      logError('Password reset error:', err);
      setError('An error occurred during password reset');
    }
  });

  return {
    control,
    fieldError: errors.password?.message ?? errors.confirmPassword?.message,
    isValid,
    isSubmitting,
    success,
    error,
    submit,
  };
}
