import { API_URL } from '@/config';
import type { ApiProductTypeRead } from '@/types/api';
import { apiFetch } from './client';
import { throwFromResponse } from './errors';
import { fetchPaginatedItems } from './paginated';

export type ProductTypeOption = Pick<ApiProductTypeRead, 'id' | 'name' | 'description'>;

// CPV-imported types carry the code in `name` and the label in `description`
// ("CPV: 302132" / "Tablet computer"). Hand-authored types put the label in
// `name`. `name` is the filter value either way (`product_type_name[in]`).
const CPV_CODE_PATTERN = /^CPV:\s*\d+$/i;

/** The label to show for a product type, or undefined. A bare CPV code never reaches a screen. */
export function productTypeLabel(
  productType: { name?: string | null; description?: string | null } | null | undefined,
): string | undefined {
  const name = productType?.name?.trim();
  if (name && !CPV_CODE_PATTERN.test(name)) {
    return name;
  }
  return productType?.description?.trim() || undefined;
}

export async function searchProductTypes(
  search?: string,
  page = 1,
  size = 50,
): Promise<ProductTypeOption[]> {
  return fetchPaginatedItems<ProductTypeOption>(`${API_URL}/product-types`, search, page, size);
}

/** Mirrors the backend's MAX_QUERY_LIST_ITEMS for `[in]` filters. */
const MAX_NAME_LOOKUP = 50;

/** Look up product types by stored `name`, so chips restored from a URL get labels instead of CPV codes. */
export async function fetchProductTypesByName(names: string[]): Promise<ProductTypeOption[]> {
  if (names.length === 0) {
    return [];
  }
  // The API rejects list filters over 50 items with a 422; beyond that the
  // remaining chips keep their code rather than the whole lookup failing.
  const lookup = names.slice(0, MAX_NAME_LOOKUP);
  const url = new URL(`${API_URL}/product-types`);
  for (const name of lookup) {
    url.searchParams.append('name[in]', name);
  }
  url.searchParams.set('size', String(lookup.length));
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) {
    await throwFromResponse(response, `Failed to fetch ${url.pathname}`);
  }
  const data = await response.json();
  return (data.items ?? []) as ProductTypeOption[];
}

/** Name -> display label, for every option that resolves to one. */
export function productTypeLabelMap(options: ProductTypeOption[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const option of options) {
    const label = productTypeLabel(option);
    if (option.name && label) {
      labels[option.name] = label;
    }
  }
  return labels;
}
