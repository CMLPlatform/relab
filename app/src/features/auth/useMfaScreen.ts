import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuth } from '@/context/auth';
import {
  clearPendingMfaLogin,
  completeMfaChallenge,
  getPendingMfaLogin,
} from '@/services/api/auth/authMfa';
import { getErrorMessage } from '@/utils/errors';
import { getSafeRedirectTarget, routeAuthenticatedUser } from './useLoginRedirect';

function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function useMfaScreen() {
  const router = useRouter();
  const { refetch } = useAuth();
  const pending = getPendingMfaLogin();
  const token = pending?.mfaToken;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(token) && code.length === 6;
  const visibleError = error ?? (pending ? null : 'MFA session expired. Please log in again.');
  const handleCodeChange = useCallback((value: string) => setCode(normalizeTotpCode(value)), []);

  const submit = useCallback(async () => {
    if (!token) {
      setError('MFA session expired. Please log in again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await completeMfaChallenge(token, code);
      clearPendingMfaLogin();
      // Update the auth context (not just the API cache) so useAuth() consumers
      // see the signed-in user; otherwise the post-login route's auth guard
      // bounces straight back to /login.
      const authenticatedUser = await refetch();
      if (authenticatedUser) {
        routeAuthenticatedUser({
          authenticatedUser,
          router,
          postLoginRedirect: getSafeRedirectTarget(pending?.redirectTo),
        });
        return;
      }
      router.replace('/products');
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid MFA code.'));
    } finally {
      setSubmitting(false);
    }
  }, [code, pending?.redirectTo, refetch, router, token]);

  return {
    code,
    isSubmitting,
    canSubmit,
    tokenPresent: Boolean(token),
    visibleError,
    handleCodeChange,
    submit,
  };
}
