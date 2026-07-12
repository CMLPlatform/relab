import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  // `isSubmitting` is state, so two submits in the same tick both read the stale
  // `false` from their closure — and OtpInput auto-submits on its sixth digit while
  // the button stays pressable. A ref is the only guard that single-flights this.
  // A TOTP code and a recovery code are both single-use: a second submit burns it.
  const inFlight = useRef(false);

  const activeCode = useRecoveryCode ? recoveryCode.trim() : code;
  const canSubmit =
    Boolean(token) && (useRecoveryCode ? activeCode.length >= 6 : code.length === 6);
  const visibleError = error ?? (pending ? null : 'MFA session expired. Please sign in again.');
  const handleCodeChange = useCallback((value: string) => setCode(normalizeTotpCode(value)), []);
  const handleRecoveryCodeChange = useCallback((value: string) => setRecoveryCode(value), []);
  const toggleRecoveryMode = useCallback(() => {
    setUseRecoveryCode((prev) => !prev);
    setError(null);
  }, []);

  const submit = useCallback(
    async (submitCode: string = activeCode) => {
      if (!token) {
        setError('MFA session expired. Please sign in again.');
        return;
      }
      if (submitCode.length < 6 || inFlight.current) return;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await completeMfaChallenge(token, submitCode);
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
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [activeCode, pending?.redirectTo, refetch, router, token],
  );

  return {
    code,
    recoveryCode,
    useRecoveryCode,
    isSubmitting,
    canSubmit,
    tokenPresent: Boolean(token),
    visibleError,
    handleCodeChange,
    handleRecoveryCodeChange,
    toggleRecoveryMode,
    submit,
  };
}
