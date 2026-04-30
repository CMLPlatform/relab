import { Platform } from 'react-native';
import { API_URL } from '@/config';
import { getCachedUser, getToken, getUser } from '@/services/api/authentication';
import type {
  ApiBaseProductDetail,
  ApiBaseProductPageItem,
  ApiComponentChildItem,
  ApiComponentDetail,
  ApiImageRead,
  ApiVideoRead,
} from '@/types/api';
import type { Product } from '@/types/Product';
import { apiFetch } from './client';
import { resolveApiMediaUrl } from './media';

const baseUrl = API_URL;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export class ProductNotFoundError extends Error {
  readonly productId: number;
  readonly status = 404;

  constructor(productId: number) {
    super(`Product ${productId} was not found.`);
    this.name = 'ProductNotFoundError';
    this.productId = productId;
  }
}

export function isProductNotFoundError(error: unknown): error is ProductNotFoundError {
  return error instanceof ProductNotFoundError;
}

type ProductMapperPayload =
  | ApiBaseProductDetail
  | ApiBaseProductPageItem
  | ApiComponentChildItem
  | ApiComponentDetail;

function toBaseProduct(
  data: ApiBaseProductDetail | ApiBaseProductPageItem,
  meId?: string,
): Product {
  const ownerId = data.owner_id;
  const components =
    'components' in data ? (data.components?.map((component) => toComponent(component)) ?? []) : [];
  return {
    id: Number(data.id),
    role: 'product',
    name: data.name,
    brand: data.brand ?? undefined,
    model: data.model ?? undefined,
    description: data.description ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    productTypeID: data.product_type_id ?? undefined,
    ownedBy: ownerId && ownerId === meId ? 'me' : (ownerId ?? ''),
    amountInParent: undefined,
    physicalProperties: {
      weight: data.weight_g ?? NaN,
      height: data.height_cm ?? NaN,
      width: data.width_cm ?? NaN,
      depth: data.depth_cm ?? NaN,
    },
    circularityProperties: {
      recyclability: data.circularity_properties?.recyclability ?? null,
      disassemblability: data.circularity_properties?.disassemblability ?? null,
      remanufacturability: data.circularity_properties?.remanufacturability ?? null,
    },
    ownerUsername: data.owner_username ?? undefined,
    componentIDs: components.map(({ id }) => Number(id)).filter((id) => Number.isFinite(id)),
    components,
    images:
      ('images' in data ? data.images : undefined)?.map((img: ApiImageRead) => ({
        id: String(img.id),
        url: resolveApiMediaUrl(img.image_url) ?? img.image_url ?? '',
        thumbnailUrl: resolveApiMediaUrl(img.thumbnail_url),
        description: img.description ?? '',
      })) ?? [],
    thumbnailUrl: resolveApiMediaUrl(data.thumbnail_url),
    videos:
      ('videos' in data ? data.videos : undefined)?.map((vid: ApiVideoRead) => ({
        id: Number(vid.id),
        url: vid.url,
        description: vid.description ?? '',
        title: vid.title ?? '',
      })) ?? [],
    ...('product_type' in data && data.product_type?.name
      ? { productTypeName: data.product_type.name }
      : {}),
  };
}

function toComponent(data: ApiComponentChildItem | ApiComponentDetail): Product {
  const components =
    'components' in data ? (data.components?.map((component) => toComponent(component)) ?? []) : [];
  return {
    id: Number(data.id),
    role: 'component',
    parentID: data.parent_id,
    name: data.name,
    brand: data.brand ?? undefined,
    model: data.model ?? undefined,
    description: data.description ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    productTypeID: data.product_type_id ?? undefined,
    ownedBy: '',
    amountInParent: data.amount_in_parent,
    physicalProperties: {
      weight: data.weight_g ?? NaN,
      height: data.height_cm ?? NaN,
      width: data.width_cm ?? NaN,
      depth: data.depth_cm ?? NaN,
    },
    circularityProperties: {
      recyclability: data.circularity_properties?.recyclability ?? null,
      disassemblability: data.circularity_properties?.disassemblability ?? null,
      remanufacturability: data.circularity_properties?.remanufacturability ?? null,
    },
    ownerUsername: data.owner_username ?? undefined,
    componentIDs: components.map(({ id }) => Number(id)).filter((id) => Number.isFinite(id)),
    components,
    images:
      ('images' in data ? data.images : undefined)?.map((img: ApiImageRead) => ({
        id: String(img.id),
        url: resolveApiMediaUrl(img.image_url) ?? img.image_url ?? '',
        thumbnailUrl: resolveApiMediaUrl(img.thumbnail_url),
        description: img.description ?? '',
      })) ?? [],
    thumbnailUrl: resolveApiMediaUrl(data.thumbnail_url),
    videos: [],
    ...('product_type' in data && data.product_type?.name
      ? { productTypeName: data.product_type.name }
      : {}),
  };
}

async function fetchOne<T extends ProductMapperPayload>(url: URL): Promise<T | null> {
  const response = await apiFetch(url, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return (await response.json()) as T;
}

async function resolveMeId(): Promise<string | undefined> {
  // Prefer the in-memory cached user on web to avoid triggering cookie-based
  // auth requests for unauthenticated visitors. If no cached user exists and
  // we're on native, fall back to a network fetch.
  if (Platform.OS === 'web') return getCachedUser()?.id;
  return (await getUser())?.id;
}

/** Fetch a base product by id. 404s on component ids. */
export async function getBaseProduct(id: number) {
  const data = await fetchOne<ApiBaseProductDetail>(new URL(`${baseUrl}/products/${id}`));
  if (!data) throw new ProductNotFoundError(id);
  return toBaseProduct(data, await resolveMeId());
}

/** Fetch a component by id. 404s on base-product ids. */
export async function getComponent(id: number) {
  const data = await fetchOne<ApiComponentDetail>(new URL(`${baseUrl}/components/${id}`));
  if (!data) throw new ProductNotFoundError(id);
  return toComponent(data);
}

export function newProduct(
  seed: {
    name?: string;
    parentID?: number;
    parentRole?: 'product' | 'component';
    brand?: string;
    model?: string;
  } = {},
): Product {
  return {
    id: undefined,
    role: typeof seed.parentID === 'number' ? 'component' : 'product',
    parentID: seed.parentID,
    parentRole: seed.parentRole,
    name: seed.name ?? '',
    brand: seed.brand,
    model: seed.model,
    physicalProperties: {
      weight: NaN,
      height: NaN,
      width: NaN,
      depth: NaN,
    },
    circularityProperties: {
      recyclability: null,
      disassemblability: null,
      remanufacturability: null,
    },
    componentIDs: [],
    components: [],
    images: [],
    videos: [],
    ownedBy: 'me',
  };
}

function buildProductsUrl(
  path: string,
  page: number,
  size: number,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
  owner?: 'me',
): URL {
  const url = new URL(baseUrl + path);
  url.searchParams.append('page', page.toString());
  url.searchParams.append('size', size.toString());
  if (search) url.searchParams.append('search', search);
  if (brands?.length) url.searchParams.append('brand__in', brands.join(','));
  if (createdAfter) url.searchParams.append('created_at__gte', createdAfter.toISOString());
  if (productTypeNames?.length)
    url.searchParams.append('product_type__name__in', productTypeNames.join(','));
  if (orderBy?.length) url.searchParams.append('order_by', orderBy.join(','));
  if (owner) url.searchParams.append('owner', owner);
  return url;
}

async function parseProductsResponse(data: {
  items: ApiBaseProductPageItem[];
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
  const items = data.items.map((item) => toBaseProduct(item, meId));
  return { items, total: data.total, page: data.page, size: data.size, pages: data.pages };
}

async function fetchProducts(
  path: string,
  page = 1,
  size = 50,
  search?: string,
  orderBy?: string[],
  brands?: string[],
  createdAfter?: Date,
  productTypeNames?: string[],
  options?: { authenticated?: boolean; owner?: 'me' },
): Promise<PaginatedResponse<Product>> {
  const url = buildProductsUrl(
    path,
    page,
    size,
    search,
    orderBy,
    brands,
    createdAfter,
    productTypeNames,
    options?.owner,
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
    page,
    size,
    search,
    orderBy,
    brands,
    createdAfter,
    productTypeNames,
    {
      authenticated: true,
      owner: 'me',
    },
  );
}

export async function addProductVideo(
  productId: number,
  video: { url: string; title: string; description: string },
): Promise<void> {
  const resp = await apiFetch(new URL(`${baseUrl}/products/${productId}/videos`), {
    method: 'POST',
    body: JSON.stringify(video),
  });
  if (!resp.ok) throw new Error(`Failed to add video (${resp.status})`);
}
