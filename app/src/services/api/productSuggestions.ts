import { API_URL } from '@/config';
import { fetchPaginatedItems } from './paginated';

export async function searchProductBrands(search?: string, page = 1, size = 50): Promise<string[]> {
  return fetchPaginatedItems<string>(`${API_URL}/products/suggestions/brands`, search, page, size);
}

export async function allProductBrands(): Promise<string[]> {
  return searchProductBrands(undefined, 1, 50);
}
