import { Platform } from 'react-native';
import { API_URL } from '@/config';
import { getCachedUser, getToken, getUser } from '@/services/api/authentication';
import type { ApiImageRead, ApiProductRead, ApiVideoRead } from '@/types/api';
import type { Product } from '@/types/Product';
import { apiFetch } from './client';
import { resolveApiMediaUrl } from './media';

const baseUrl = API_URL;

/** @deprecated Use ApiProductRead from @/types/api instead */
export type ProductData = ApiProductRead;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

async function toProduct(data: ApiProductRead, meId?: string): Promise<Product> {
  const legacyPhysical = data.physical_properties;
  const legacyCircularity = data.circularity_properties;

  return {
    id: Number(data.id),
    parentID: data.parent_id ?? undefined,
    name: data.name,
    brand: data.brand ?? undefined,
    model: data.model ?? undefined,
    description: data.description ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    productTypeID: data.product_type_id ?? undefined,
    productTypeName: data.product_type?.name,
    ownedBy: data.owner_id === meId ? 'me' : data.owner_id,
    amountInParent: data.amount_in_parent ?? undefined,
    physicalProperties: {
      weight: data.weight_g ?? legacyPhysical?.weight_g ?? NaN,
      height: data.height_cm ?? legacyPhysical?.height_cm ?? NaN,
      width: data.width_cm ?? legacyPhysical?.width_cm ?? NaN,
      depth: data.depth_cm ?? legacyPhysical?.depth_cm ?? NaN,
    },
    circularityProperties: {
      recyclabilityComment: data.recyclability_comment ?? legacyCircularity?.recyclability_comment ?? null,
      recyclabilityObservation:
        data.recyclability_observation ?? legacyCircularity?.recyclability_observation ?? '',
      recyclabilityReference:
        data.recyclability_reference ?? legacyCircularity?.recyclability_reference ?? null,
      remanufacturabilityComment:
        data.remanufacturability_comment ??
        legacyCircularity?.remanufacturability_comment ??
        null,
      remanufacturabilityObservation:
        data.remanufacturability_observation ??
        legacyCircularity?.remanufacturability_observation ??
        '',
      remanufacturabilityReference:
        data.remanufacturability_reference ??
        legacyCircularity?.remanufacturability_reference ??
        null,
      repairabilityComment: data.repairability_comment ?? legacyCircularity?.repairability_comment ?? null,
      repairabilityObservation:
        data.repairability_observation ?? legacyCircularity?.repairability_observation ?? '',
      repairabilityReference:
        data.repairability_reference ?? legacyCircularity?.repairability_reference ?? null,
    },
    ownerUsername: data.owner_username ?? undefined,
    componentIDs: data.components?.map(({ id }) => Number(id)) ?? [],
    images:
      data.images?.map((img: ApiImageRead) => ({
        id: String(img.id),
        url: resolveApiMediaUrl(img.image_url) ?? img.image_url ?? '',
        thumbnailUrl: resolveApiMediaUrl(img.thumbnail_url),
        description: img.description ?? '',
      })) ?? [],
    thumbnailUrl: resolveApiMediaUrl(data.thumbnail_url),
    videos:
      data.videos?.map((vid: ApiVideoRead) => ({
        id: Number(vid.id),
        url: vid.url,
        description: vid.description ?? '',
        title: vid.title ?? '',
      })) ?? [],
  };
}

export const FULL_PRODUCT_INCLUDES = ['images', 'product_type', 'components', 'videos'];

export async function getProduct(
  id: number | 'new',
  includes: string[] = FULL_PRODUCT_INCLUDES,
): Promise<Product> {
  if (id === 'new') {
    return newProduct();
  }
  const url = new URL(`${baseUrl}/products/${id}`);
  for (const inc of includes) {
    url.searchParams.append('include', inc);
  }

  const response = await apiFetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  // Prefer the in-memory cached user on web to avoid triggering cookie-based
  // auth requests for unauthenticated visitors. If no cached user exists and
  // we're on native, fall back to a network fetch.
  let meId: string | undefined;
  if (Platform.OS === 'web') {
    meId = getCachedUser()?.id;
  } else {
    meId = await getUser().then((u) => u?.id);
  }
  return toProduct(data as ApiProductRead, meId);
}

export function newProduct(
  name: string = '',
  parentID: number = NaN,
  brand: string | undefined = undefined,
  model: string | undefined = undefined,
): Product {
  return {
    id: 'new',
    parentID: Number.isNaN(parentID) ? undefined : parentID,
    name: name,
    brand: brand,
    model: model,
    physicalProperties: {
      weight: NaN,
      height: NaN,
      width: NaN,
      depth: NaN,
    },
    circularityProperties: {
      recyclabilityComment: '',
      recyclabilityObservation: '',
      recyclabilityReference: '',
      remanufacturabilityComment: '',
      remanufacturabilityObservation: '',
      remanufacturabilityReference: '',
      repairabilityComment: '',
      repairabilityObservation: '',
      repairabilityReference: '',
    },
    componentIDs: [],
    images: [],
    videos: [],
    ownedBy: 'me',
  };
}

function buildProductsUrl(
  path: string,
  include: string[],
  page: number,
  size: number,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
): URL {
  const url = new URL(baseUrl + path);
  for (const inc of include) {
    url.searchParams.append('include', inc);
  }
  url.searchParams.append('page', page.toString());
  url.searchParams.append('size', size.toString());
  if (search) url.searchParams.append('search', search);
  if (brands?.length) url.searchParams.append('brand__in', brands.join(','));
  if (createdAfter) url.searchParams.append('created_at__gte', createdAfter.toISOString());
  if (productTypeNames?.length)
    url.searchParams.append('product_type__name__in', productTypeNames.join(','));
  if (orderBy?.length) url.searchParams.append('order_by', orderBy.join(','));
  return url;
}

async function parseProductsResponse(data: {
  items: ApiProductRead[];
  total: number;
  page: number;
  size: number;
  pages: number;
}): Promise<PaginatedResponse<Product>> {
  let meId: string | undefined;
  if (Platform.OS === 'web') {
    meId = getCachedUser()?.id;
  } else {
    meId = await getUser().then((u) => u?.id);
  }
  const items = await Promise.all(data.items.map((item) => toProduct(item, meId)));
  return { items, total: data.total, page: data.page, size: data.size, pages: data.pages };
}

async function fetchProducts(
  path: string,
  include = ['product_type'],
  page = 1,
  size = 50,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
  options?: { authenticated?: boolean },
): Promise<PaginatedResponse<Product>> {
  const url = buildProductsUrl(
    path,
    include,
    page,
    size,
    search,
    orderBy,
    brands,
    createdAfter,
    productTypeNames,
  );
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options?.authenticated && Platform.OS !== 'web') {
    const authToken = await getToken();
    if (!authToken) {
      return { items: [], total: 0, page: 1, size: 50, pages: 0 };
    }
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await apiFetch(url, { method: 'GET', headers });

  if (options?.authenticated && response.status === 401) {
    return { items: [], total: 0, page: 1, size: 50, pages: 0 };
  }

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  return parseProductsResponse(await response.json());
}

export async function allProducts(
  include = ['product_type'],
  page = 1,
  size = 50,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
): Promise<PaginatedResponse<Product>> {
  return fetchProducts(
    '/products',
    include,
    page,
    size,
    search,
    orderBy,
    brands,
    createdAfter,
    productTypeNames,
  );
}

export async function myProducts(
  include = ['product_type'],
  page = 1,
  size = 50,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
): Promise<PaginatedResponse<Product>> {
  return fetchProducts(
    '/users/me/products',
    include,
    page,
    size,
    search,
    orderBy,
    brands,
    createdAfter,
    productTypeNames,
    {
      authenticated: true,
    },
  );
}

// ProductCard only needs product_type (for productTypeName) and thumbnail_url
// (computed from first_image_id, available without include=images)
export async function productComponents(product: Product): Promise<Product[]> {
  return Promise.all(product.componentIDs.map((id) => getProduct(id, ['product_type'])));
}
