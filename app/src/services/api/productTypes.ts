import { API_URL } from '@/config';
import type { ApiProductTypeRead } from '@/types/api';
import { apiFetch } from './client';
import { throwFromResponse } from './errors';
import { fetchPaginatedItems } from './paginated';

export type ProductTypeOption = Pick<ApiProductTypeRead, 'id' | 'name' | 'description'>;

// Product types imported from the CPV taxonomy carry the code in `name` and the
// human label in `description` — prod type 1967 is "CPV: 302132" / "Tablet
// computer". Hand-authored types put the label in `name` and may have no
// description. `name` stays the filter value either way, because
// `product_type_name[in]` matches the stored column.
const CPV_CODE_PATTERN = /^CPV:\s*\d+$/i;

/**
 * The label to show a user for a product type, or undefined when there is none.
 *
 * A bare CPV code tells a user nothing, so it never reaches a screen: the
 * imported description takes its place, and a coded type with no description
 * shows nothing rather than the code.
 */
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

/**
 * Look up specific product types by their stored `name`.
 *
 * Filter selections travel as names — in state, in the URL, and in
 * `product_type_name[in]` — so a screen restored from a link holds codes with no
 * rows behind them and would print `CPV: 302132` at the user until they happened
 * to search for it. This resolves exactly the selected names so the chips can
 * carry labels immediately.
 */
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
