import { useGlobalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ApiError } from '@/services/api/errors';
import { getErrorMessage } from '@/utils/errors';
import { usePublicProfileQuery } from './publicProfileQuery';

export function usePublicProfileScreen() {
  const { username } = useGlobalSearchParams();
  const usernameValue = typeof username === 'string' ? username : null;

  const { profile, loading, error: queryError, refetch } = usePublicProfileQuery(usernameValue);

  const errorMessage = queryError
    ? queryError instanceof ApiError && queryError.status === 404
      ? 'This profile is private or does not exist.'
      : getErrorMessage(queryError, String(queryError))
    : null;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { profile, loading, hasError: Boolean(queryError), errorMessage, onRetry };
}
