import { API_URL } from '@/config';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import type { ApiPublicProfileView } from '@/types/api';
import { throwFromResponse } from './errors';

export type PublicProfileView = ApiPublicProfileView;

export async function getPublicProfile(username: string): Promise<PublicProfileView> {
  const response = await fetchWithAuth(`${API_URL}/profiles/${encodeURIComponent(username)}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response?.ok) {
    await throwFromResponse(response, 'Failed to load profile');
  }

  return response.json();
}
