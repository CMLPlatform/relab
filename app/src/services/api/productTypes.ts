import { API_URL } from '@/config';
import { apiFetch } from './client';

const baseUrl = API_URL;

export async function searchProductTypes(
  search?: string,
  page = 1,
  size = 50,
): Promise<{ id: number; name: string }[]> {
  const url = new URL(`${baseUrl}/product-types`);
  if (search) url.searchParams.set('search', search);
  url.searchParams.set('page', page.toString());
  url.searchParams.set('size', size.toString());
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  const data = await response.json();
  return (data.items ?? []) as { id: number; name: string }[];
}

export async function allProductTypes(): Promise<{ id: number; name: string }[]> {
  return searchProductTypes(undefined, 1, 100);
}
