import { API_URL } from '@/config';
import type { ApiCategoryStat } from '@/types/api';
import { apiFetch } from './client';
import { throwFromResponse } from './errors';

/** Most-used product types (by stored `name`, i.e. the CPV code), count DESC. Public endpoint. */
export async function fetchTopCategories(limit = 10): Promise<ApiCategoryStat[]> {
  const url = new URL(`${API_URL}/stats/categories`);
  url.searchParams.set('scope', 'all');
  url.searchParams.set('limit', String(limit));
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) {
    await throwFromResponse(response, 'Failed to load common types');
  }
  const data = await response.json();
  return (data.categories ?? []) as ApiCategoryStat[];
}
