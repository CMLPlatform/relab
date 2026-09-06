import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import { throwFromResponse } from './errors';

/** Record that this account accepts the contributor terms. No body: the server stamps the version. */
export async function acceptContributorTerms(): Promise<void> {
  const response = await fetchWithAuth(new URL(`${API_URL}/users/me/accept-terms`), {
    method: 'POST',
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to record terms acceptance');
}
