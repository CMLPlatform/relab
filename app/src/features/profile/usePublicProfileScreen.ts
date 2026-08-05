import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ApiError } from '@/services/api/errors';
import { getErrorMessage } from '@/utils/errors';
import { usePublicProfileQuery } from './publicProfileQuery';

export function usePublicProfileScreen() {
  const { username } = useGlobalSearchParams();
  const router = useRouter();
  const usernameValue = typeof username === 'string' ? username : null;

  const { profile, loading, error: queryError } = usePublicProfileQuery(usernameValue);

  const errorMessage = queryError
    ? queryError instanceof ApiError && queryError.status === 404
      ? 'This profile is private or does not exist.'
      : getErrorMessage(queryError, String(queryError))
    : null;
  const goToProducts = useCallback(() => router.replace('/products'), [router]);

  return { profile, loading, hasError: Boolean(queryError), errorMessage, goToProducts };
}
