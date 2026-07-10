import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import { verifyEmail } from '@/services/api/auth/accountRecovery';
import { ApiError } from '@/services/api/errors';
import { logError } from '@/utils/logging';
import { useSensitiveAuthToken } from './useSensitiveAuthToken';

const GENERIC_ERROR = 'An error occurred during verification. Please try again later.';

export function useVerifyEmail() {
  const router = useRouter();
  const { user, refetch } = useAuth();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = useSensitiveAuthToken(typeof tokenParam === 'string' ? tokenParam : undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        setError('No verification token provided. Please check your verification email.');
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

  // The token in the link authorizes verification on its own — no session needed.
  // If this client already has a session, refetch so it reflects the verified
  // status and continue into the app. If it doesn't (e.g. the link opened in a
  // browser separate from the app you signed up in), leave the success screen up
  // rather than forcing a login — you're still signed in where you registered.
  useEffect(() => {
    if (!success || !user) return;
    const timer = setTimeout(async () => {
      // Navigate regardless of the refetch outcome — a transient refetch failure
      // must not strand the user on the success screen. The app refetches on the
      // next screen anyway.
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
    error,
    success,
    isLoggedIn: Boolean(user),
    goToLogin: () => router.replace('/login?redirectTo=/products'),
    goHome: () => router.replace('/'),
  };
}
