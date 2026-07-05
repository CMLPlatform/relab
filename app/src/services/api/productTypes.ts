import { API_URL } from '@/config';
import { fetchPaginatedItems } from './paginated';

export async function searchProductTypes(
  search?: string,
  page = 1,
  size = 50,
): Promise<{ id: number; name: string }[]> {
  return fetchPaginatedItems<{ id: number; name: string }>(
    `${API_URL}/product-types`,
    search,
    page,
    size,
  );
}
