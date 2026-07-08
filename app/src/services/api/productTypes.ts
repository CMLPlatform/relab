import { API_URL } from '@/config';
import type { ApiProductTypeRead } from '@/types/api';
import { fetchPaginatedItems } from './paginated';

type ProductTypeOption = Pick<ApiProductTypeRead, 'id' | 'name'>;

export async function searchProductTypes(
  search?: string,
  page = 1,
  size = 50,
): Promise<ProductTypeOption[]> {
  return fetchPaginatedItems<ProductTypeOption>(`${API_URL}/product-types`, search, page, size);
}
