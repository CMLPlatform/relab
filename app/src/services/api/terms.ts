import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import { throwFromResponse } from './errors';

/**
 * Record that this account accepts the contributor terms.
 *
 * Sends no body on purpose: the version is stamped server-side from its own
 * constant. The column is evidence of what the person was shown, so a client that
 * could name the version could claim a grant under terms that did not exist.
 */
export async function acceptContributorTerms(): Promise<void> {
  const response = await fetchWithAuth(new URL(`${API_URL}/users/me/accept-terms`), {
    method: 'POST',
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to record terms acceptance');
}
