import { Platform } from 'react-native';
import { API_URL } from '@/config';
import { fetchWithAuth, getCachedUser, getUser } from '@/services/api/auth/authentication';
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
import { throwFromResponse } from './errors';
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

// Fields mapped identically for base products and components.
function commonProductFields(data: ProductMapperPayload) {
  const components =
    'components' in data ? (data.components?.map((component) => toComponent(component)) ?? []) : [];
  return {
    id: Number(data.id),
    name: data.name,
    brand: data.brand ?? undefined,
    model: data.model ?? undefined,
    description: data.description ?? undefined,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    productTypeID: data.product_type_id ?? undefined,
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
        url: resolveApiMediaUrl(img.image_url) ?? '',
        thumbnailUrl: resolveApiMediaUrl(img.thumbnail_url),
        description: img.description ?? '',
      })) ?? [],
    thumbnailUrl: resolveApiMediaUrl(data.thumbnail_url),
    ...('product_type' in data && data.product_type?.name
      ? { productTypeName: data.product_type.name }
      : {}),
  };
}

function toBaseProduct(
  data: ApiBaseProductDetail | ApiBaseProductPageItem,
  meId?: string,
): Product {
  const ownerId = data.owner_id;
  return {
    ...commonProductFields(data),
    role: 'product',
    ownedBy: ownerId && ownerId === meId ? 'me' : (ownerId ?? ''),
    amountInParent: undefined,
    videos:
      ('videos' in data ? data.videos : undefined)?.map((vid: ApiVideoRead) => ({
        id: Number(vid.id),
        url: vid.url,
        description: vid.description ?? '',
        title: vid.title ?? '',
      })) ?? [],
  };
}

function toComponent(data: ApiComponentChildItem | ApiComponentDetail): Product {
  return {
    ...commonProductFields(data),
    role: 'component',
    parentID: data.parent_id,
    ownedBy: '',
    amountInParent: data.amount_in_parent,
    videos: [],
  };
}

async function fetchOne<T extends ProductMapperPayload>(url: URL): Promise<T | null> {
  const response = await apiFetch(url, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) await throwFromResponse(response, 'Failed to fetch product');
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

export type ProductsQuery = {
  page?: number;
  size?: number;
  search?: string;
  orderBy?: string[];
  brands?: string[];
  createdAfter?: Date;
  productTypeNames?: string[];
  /** 'me' scopes the query to the signed-in user's own products (authenticated). */
  owner?: 'me';
};

function buildProductsUrl(query: ProductsQuery): URL {
  const url = new URL(`${baseUrl}/products`);
  url.searchParams.append('page', String(query.page ?? 1));
  url.searchParams.append('size', String(query.size ?? 50));
  if (query.search) url.searchParams.append('search', query.search);
  if (query.brands?.length) url.searchParams.append('brand[in]', query.brands.join(','));
  if (query.createdAfter)
    url.searchParams.append('created_at[ge]', query.createdAfter.toISOString());
  if (query.productTypeNames?.length)
    url.searchParams.append('product_type_name[in]', query.productTypeNames.join(','));
  if (query.orderBy?.length) url.searchParams.append('order_by', query.orderBy.join(','));
  if (query.owner) url.searchParams.append('owner', query.owner);
  return url;
}

async function parseProductsResponse(data: {
  items: ApiBaseProductPageItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}): Promise<PaginatedResponse<Product>> {
  const meId = await resolveMeId();
  const items = data.items.map((item) => toBaseProduct(item, meId));
  return { items, total: data.total, page: data.page, size: data.size, pages: data.pages };
}

export async function products(query: ProductsQuery = {}): Promise<PaginatedResponse<Product>> {
  const authenticated = query.owner === 'me';
  const emptyPage: PaginatedResponse<Product> = {
    items: [],
    total: 0,
    page: 1,
    size: 50,
    pages: 0,
  };

  // fetchWithAuth attaches the bearer token (native) / session cookie (web)
  // and transparently refreshes once on 401 before we see the response.
  const fetchProducts = authenticated ? fetchWithAuth : apiFetch;
  const response = await fetchProducts(buildProductsUrl(query), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  // A 401 that survived the refresh retry means there is no session: the
  // signed-out view of "my products" is an empty page, not an error.
  if (authenticated && response.status === 401) return emptyPage;
  if (!response.ok) await throwFromResponse(response, 'Failed to fetch products');

  return parseProductsResponse(await response.json());
}

export async function addProductVideo(
  productId: number,
  video: { url: string; title: string; description: string },
): Promise<void> {
  const resp = await fetchWithAuth(new URL(`${baseUrl}/products/${productId}/videos`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(video),
  });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to add video');
}
