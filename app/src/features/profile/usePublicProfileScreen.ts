import { useQuery } from '@tanstack/react-query';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from '@/context/auth';
import { ApiError } from '@/services/api/errors';
import { getPublicProfile } from '@/services/api/profiles';
import { getErrorMessage } from '@/utils/errors';

export function usePublicProfileScreen() {
  const { username } = useGlobalSearchParams();
  const router = useRouter();
  const usernameValue = typeof username === 'string' ? username : null;
  const { user: viewer } = useAuth();
  const viewerId = viewer?.id ?? null;

  // viewerId is part of the query key so the profile refetches when the viewer
  // logs in or out — visibility rules change with auth state.
  const {
    data: profile = null,
    isPending,
    error: queryError,
  } = useQuery({
    queryKey: ['publicProfile', usernameValue, viewerId],
    queryFn: () => getPublicProfile(usernameValue as string),
    enabled: Boolean(usernameValue),
  });

  const loading = Boolean(usernameValue) && isPending;
  const errorMessage = queryError
    ? queryError instanceof ApiError && queryError.status === 404
      ? 'This profile is private or does not exist.'
      : getErrorMessage(queryError, String(queryError))
    : null;
  const goToProducts = useCallback(() => router.replace('/products'), [router]);

  return { profile, loading, hasError: Boolean(queryError), errorMessage, goToProducts };
}
