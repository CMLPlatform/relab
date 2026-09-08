import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import { verifyEmail } from '@/services/api/auth/accountRecovery';
import { ApiError } from '@/services/api/errors';
import { logError } from '@/utils/logging';
import { useSensitiveAuthToken } from './useSensitiveAuthToken';

const GENERIC_ERROR = "Couldn't verify your email. Try again later.";

export function useVerifyEmail() {
  const router = useRouter();
  const { user, refetch } = useAuth();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = useSensitiveAuthToken(typeof tokenParam === 'string' ? tokenParam : undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // A direct visit with no token is not a failed verification: nothing was tried.
  const missingToken = !token;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        await verifyEmail(token);
        if (!cancelled) {
          setSuccess(true);
          setError(null);
        }
      } catch (err) {
        logError('Verification error:', err);
        if (!cancelled) setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // The token authorizes verification without a session. With a session,
  // refetch and continue; without one (link opened elsewhere), leave the
  // success screen up.
  useEffect(() => {
    if (!success || !user) return;
    const timer = setTimeout(async () => {
      // Navigate regardless of the refetch outcome; the next screen refetches anyway.
      try {
        await refetch(true);
      } catch (err) {
        logError('Post-verify refetch failed:', err);
      }
      router.replace('/products');
    }, 3000);
    return () => clearTimeout(timer);
  }, [success, user, refetch, router]);

  return {
    isLoading,
    missingToken,
    error,
    success,
    isLoggedIn: Boolean(user),
    goToLogin: () => router.replace('/login?redirectTo=/products'),
    goHome: () => router.replace('/'),
  };
}
