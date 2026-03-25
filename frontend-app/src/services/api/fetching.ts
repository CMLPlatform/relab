import { Platform } from 'react-native';
import { resolveApiMediaUrl } from './media';
import { fetchWithTimeout, TimedRequestInit } from './request';
import { Product } from '@/types/Product';
import { getCachedUser, getToken, getUser } from '@/services/api/authentication';

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;

// Wrapper for fetch to automatically include credentials on Web
export async function apiFetch(url: string | URL, options: TimedRequestInit = {}): Promise<Response> {
  const fetchOptions = { ...options };

  if (Platform.OS === 'web') {
    fetchOptions.credentials = 'include';
  }

  return fetchWithTimeout(url, fetchOptions);
}

// TODO: Break up the fetching logic into smaller files
// TODO: Refactor the types to build on the generated API client from OpenAPI spec

type ProductData = {
  id: number;
  name: string;
  brand: string;
  model: string;
  description: string;
  created_at: string;
  updated_at: string;
  product_type_id: number;
  product_type?: { id: number; name: string } | null;
  physical_properties: { weight_g: number; height_cm: number; width_cm: number; depth_cm: number } | null;
  circularity_properties: {
    recyclability_comment: string | null;
    recyclability_observation: string;
    recyclability_reference: string | null;
    remanufacturability_comment: string | null;
    remanufacturability_observation: string;
    remanufacturability_reference: string | null;
    repairability_comment: string | null;
    repairability_observation: string;
    repairability_reference: string | null;
  } | null;
  owner_username: string | null;
  components: { id: number; name: string; description: string }[] | null;
  images: ImageData[] | null;
  thumbnail_url: string | null;
  videos: VideoData[];
  owner_id: string;
  parent_id?: number;
  amount_in_parent?: number;
};

type ImageData = {
  id: number;
  image_url: string;
  description: string;
};

type VideoData = {
  id: number;
  url: string;
  description: string;
  title: string;
};

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

async function toProduct(data: ProductData, meId?: string): Promise<Product> {
  return {
    id: data.id,
    parentID: data.parent_id ?? undefined,
    name: data.name,
    brand: data.brand,
    model: data.model,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    productTypeID: data.product_type_id,
    productTypeName: data.product_type?.name,
    ownedBy: data.owner_id === meId ? 'me' : data.owner_id,
    amountInParent: data.amount_in_parent ?? undefined,
    physicalProperties: {
      weight: data.physical_properties?.weight_g ?? NaN,
      height: data.physical_properties?.height_cm ?? NaN,
      width: data.physical_properties?.width_cm ?? NaN,
      depth: data.physical_properties?.depth_cm ?? NaN,
    },
    circularityProperties: data.circularity_properties
      ? {
          recyclabilityComment: data.circularity_properties.recyclability_comment,
          recyclabilityObservation: data.circularity_properties.recyclability_observation,
          recyclabilityReference: data.circularity_properties.recyclability_reference,
          remanufacturabilityComment: data.circularity_properties.remanufacturability_comment,
          remanufacturabilityObservation: data.circularity_properties.remanufacturability_observation,
          remanufacturabilityReference: data.circularity_properties.remanufacturability_reference,
          repairabilityComment: data.circularity_properties.repairability_comment,
          repairabilityObservation: data.circularity_properties.repairability_observation,
          repairabilityReference: data.circularity_properties.repairability_reference,
        }
      : {
          recyclabilityComment: null,
          recyclabilityObservation: '',
          recyclabilityReference: null,
          remanufacturabilityComment: null,
          remanufacturabilityObservation: '',
          remanufacturabilityReference: null,
          repairabilityComment: null,
          repairabilityObservation: '',
          repairabilityReference: null,
        },
    ownerUsername: data.owner_username ?? undefined,
    componentIDs: data.components?.map(({ id }) => id) ?? [],
    images: data.images?.map((img) => ({ ...img, url: resolveApiMediaUrl(img.image_url) ?? img.image_url })) ?? [],
    thumbnailUrl: resolveApiMediaUrl(data.thumbnail_url),
    videos: data.videos || [],
  };
}

export async function getProduct(id: number | 'new'): Promise<Product> {
  if (id === 'new') {
    return newProduct();
  }
  const url = new URL(baseUrl + `/products/${id}`);
  ['physical_properties', 'circularity_properties', 'images', 'product_type', 'components', 'videos'].forEach((inc) =>
    url.searchParams.append('include', inc),
  );

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
  return toProduct(data as ProductData, meId);
}

export function newProduct(
  name: string = '',
  parentID: number = NaN,
  brand: string | undefined = undefined,
  model: string | undefined = undefined,
): Product {
  return {
    id: 'new',
    parentID: isNaN(parentID) ? undefined : parentID,
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

export async function searchBrands(search?: string, page = 1, size = 50): Promise<string[]> {
  const url = new URL(baseUrl + '/brands');
  if (search) url.searchParams.set('search', search);
  url.searchParams.set('page', page.toString());
  url.searchParams.set('size', size.toString());
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  const data = await response.json();
  return (data.items ?? []) as string[];
}

export async function searchProductTypes(
  search?: string,
  page = 1,
  size = 50,
): Promise<{ id: number; name: string }[]> {
  const url = new URL(baseUrl + '/product-types');
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
  include.forEach((inc) => url.searchParams.append('include', inc));
  url.searchParams.append('page', page.toString());
  url.searchParams.append('size', size.toString());
  if (search) url.searchParams.append('search', search);
  if (brands?.length) url.searchParams.append('brand__in', brands.join(','));
  if (createdAfter) url.searchParams.append('created_at__gte', createdAfter.toISOString());
  if (productTypeNames?.length) url.searchParams.append('product_type__name__in', productTypeNames.join(','));
  if (orderBy?.length) url.searchParams.append('order_by', orderBy.join(','));
  return url;
}

async function parseProductsResponse(data: {
  items: ProductData[];
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
  const url = buildProductsUrl(
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
  const response = await apiFetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  return parseProductsResponse(await response.json());
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
  const url = buildProductsUrl(
    '/users/me/products',
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

  if (Platform.OS !== 'web') {
    const authToken = await getToken();
    if (!authToken) {
      return { items: [], total: 0, page: 1, size: 50, pages: 0 };
    }
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await apiFetch(url, { method: 'GET', headers });

  if (response.status === 401) {
    return { items: [], total: 0, page: 1, size: 50, pages: 0 };
  }

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  return parseProductsResponse(await response.json());
}

export async function allBrands(): Promise<string[]> {
  return searchBrands(undefined, 1, 50);
}

export async function productComponents(product: Product): Promise<Product[]> {
  return Promise.all(product.componentIDs.map((id) => getProduct(id)));
}
