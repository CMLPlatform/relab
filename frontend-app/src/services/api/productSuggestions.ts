import { API_URL } from '@/config';
import { apiFetch } from './client';

const baseUrl = API_URL;

export async function searchProductBrands(search?: string, page = 1, size = 50): Promise<string[]> {
  const url = new URL(`${baseUrl}/products/suggestions/brands`);
  if (search) url.searchParams.set('search', search);
  url.searchParams.set('page', page.toString());
  url.searchParams.set('size', size.toString());
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  const data = await response.json();
  return (data.items ?? []) as string[];
}

export async function allProductBrands(): Promise<string[]> {
  return searchProductBrands(undefined, 1, 50);
}
