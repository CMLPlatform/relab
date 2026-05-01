import { API_URL } from '@/config';
import { getToken } from './authentication';
import { apiFetch } from './client';

export type PublicProfileView = {
  username: string;
  created_at: string;
  product_count: number;
  total_weight_kg: number;
  image_count: number;
  top_category: string;
};

export async function getPublicProfile(username: string): Promise<PublicProfileView> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await apiFetch(`${API_URL}/profiles/${encodeURIComponent(username)}`, {
    headers,
  });

  if (!response?.ok) {
    throw new Error('Profile not found');
  }

  return response.json();
}
