import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { API_URL } from '@/config';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/services/api/client';
import { logError } from '@/utils/logging';
import { useSensitiveAuthToken } from './useSensitiveAuthToken';

const GENERIC_ERROR = 'An error occurred during verification. Please try again later.';

function errorDetail(detail: unknown) {
  return typeof detail === 'string' ? detail : 'Verification failed. Please try registering again.';
}

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
        const response = await apiFetch(`${API_URL}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (response.ok) {
          setSuccess(true);
          setError(null);
        } else {
          const data = await response.json();
          if (!cancelled) setError(errorDetail(data.detail));
        }
      } catch (err) {
        logError('Verification error:', err);
        if (!cancelled) setError(GENERIC_ERROR);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Redirect once verified: refetch the (now-verified) user if logged in, else go log in.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      if (user) {
        refetch(true).then(() => router.replace('/products'));
      } else {
        router.replace('/login?redirectTo=/products');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [success, user, refetch, router]);

  return { isLoading, error, success, goHome: () => router.replace('/') };
}
