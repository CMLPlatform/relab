import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { API_URL } from '@/config';
import { fetchWithAuth, getUser } from '@/services/api/auth/authentication';
import { allProductBrands, searchProductBrands } from '@/services/api/productSuggestions';
import {
  getBaseProduct,
  getComponent,
  isProductNotFoundError,
  newProduct,
  ProductNotFoundError,
  products,
} from '@/services/api/products';
import { searchProductTypes } from '@/services/api/productTypes';
import { mockUser, server } from '@/test-utils/index';

jest.mock('@/services/api/auth/authentication', () => {
  const actual = jest.requireActual<typeof import('@/services/api/auth/authentication')>(
    '@/services/api/auth/authentication',
  );
  return {
    ...actual,
    fetchWithAuth: jest.fn(),
    getUser: jest.fn(),
  };
});

function makePage<T>(
  items: T[],
  overrides: Partial<{
    total: number;
    page: number;
    size: number;
    pages: number;
  }> = {},
) {
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    size: overrides.size ?? 50,
    pages: overrides.pages ?? 1,
  };
}

// Minimal raw API product payload as returned by the API
const rawProductData = {
  id: 42,
  name: 'Recycled Aluminum Laptop Stand',
  brand: 'CircularTech',
  model: 'EcoStand Pro',
  description: 'Laptop stand made from 95% post-consumer recycled aluminum',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  product_type_id: 1,
  owner_id: 'me-user-id',
  parent_id: undefined,
  amount_in_parent: undefined,
  weight_g: 100,
  height_cm: 10,
  width_cm: 5,
  depth_cm: 3,
  circularity_properties: {
    recyclability: 'low',
    remanufacturability: 'medium',
    disassemblability: 'high',
  },
  components: [{ id: 1, name: 'Part A', parent_id: 42, amount_in_parent: 2, description: '' }],
  images: [{ id: 10, image_url: '/media/img.jpg', description: 'Main image' }],
  videos: [{ id: 20, url: 'https://example.com/vid', description: '', title: 'Demo' }],
};

describe('Fetching API Service logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getUser).mockResolvedValue(mockUser({ id: 'me-user-id', username: 'me' }));
    // Route authenticated requests through MSW like plain fetch; the 401→refresh
    // retry behavior of the real fetchWithAuth is covered by its own unit tests.
    jest
      .mocked(fetchWithAuth)
      .mockImplementation((url, options) => fetch(url, options as RequestInit));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── newProduct ─────────────────────────────────────────

  describe('newProduct', () => {
    it('returns a clean draft template', () => {
      const p = newProduct({ name: 'Fresh Product' });
      expect(p.id).toBeUndefined();
      expect(p.name).toBe('Fresh Product');
      expect(p.role).toBe('product');
      expect(p.componentIDs).toEqual([]);
      expect(p.components).toEqual([]);
      expect(p.ownedBy).toBe('me');
    });

    it('defaults name to empty string', () => {
      const p = newProduct();
      expect(p.name).toBe('');
    });

    it('includes parentID when provided', () => {
      const p = newProduct({ name: 'Sub', parentID: 5 });
      expect(p.parentID).toBe(5);
      expect(p.role).toBe('component');
    });

    it('leaves parentID undefined by default', () => {
      const p = newProduct({ name: 'Sub' });
      expect(p.parentID).toBeUndefined();
    });

    it('includes brand and model when provided', () => {
      const p = newProduct({ name: 'Product', brand: 'CircularTech', model: 'X1' });
      expect(p.brand).toBe('CircularTech');
      expect(p.model).toBe('X1');
    });
  });

  // ─── allProductBrands / searchProductBrands ───────────────────────────

  describe('allProductBrands', () => {
    it('performs fetch and returns array of strings', async () => {
      server.use(
        http.get(`${API_URL}/products/suggestions/brands`, () =>
          HttpResponse.json({
            items: ['Samsung', 'Apple', 'Nokia'],
            total: 3,
            page: 1,
            size: 50,
            pages: 1,
          }),
        ),
      );

      const brands = await allProductBrands();

      expect(brands).toContain('Apple');
      expect(brands.length).toBe(3);
    });

    it('returns empty array when items is absent', async () => {
      server.use(http.get(`${API_URL}/products/suggestions/brands`, () => HttpResponse.json({})));

      const brands = await allProductBrands();

      expect(brands).toEqual([]);
    });

    it('throws on HTTP error', async () => {
      server.use(
        http.get(`${API_URL}/products/suggestions/brands`, () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );

      await expect(allProductBrands()).rejects.toThrow('Failed to fetch');
    });

    it('sends search param when searching brands', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products/suggestions/brands`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: ['Samsung'] });
        }),
      );

      await searchProductBrands('Samsung');

      expect(capturedUrl?.searchParams.get('search')).toBe('Samsung');
    });
  });

  // ─── getBaseProduct / getComponent ──────────────────────

  describe('getBaseProduct', () => {
    it('fetches and maps a base product by id', async () => {
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(rawProductData)));

      const p = await getBaseProduct(42);

      expect(p.id).toBe(42);
      expect(p.name).toBe('Recycled Aluminum Laptop Stand');
      expect(p.brand).toBe('CircularTech');
      expect(p.physicalProperties.weight).toBe(100);
      expect(p.physicalProperties.height).toBe(10);
      expect(p.componentIDs).toEqual([1]);
      expect(p.components ?? []).toHaveLength(1);
      expect(p.components?.[0]).toMatchObject({
        id: 1,
        name: 'Part A',
        role: 'component',
        parentID: 42,
        amountInParent: 2,
      });
      expect(p.images?.[0]?.description).toBe('Main image');
      expect(p.videos?.[0]?.title).toBe('Demo');
      expect(p.ownedBy).toBe('me');
    });

    it('maps ownership to owner_id string when not current user', async () => {
      const otherUserProduct = { ...rawProductData, owner_id: 'other-user-id' };
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(otherUserProduct)));

      const p = await getBaseProduct(42);

      expect(p.ownedBy).toBe('other-user-id');
    });

    it('uses empty circularity defaults when circularity properties are null', async () => {
      const noCircularity = {
        ...rawProductData,
        circularity_properties: null,
      };
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(noCircularity)));

      const p = await getBaseProduct(42);

      expect(p.circularityProperties.recyclability).toBeNull();
    });

    it('throws ProductNotFoundError when the base product is missing', async () => {
      server.use(http.get(`${API_URL}/products/99`, () => HttpResponse.json({}, { status: 404 })));

      await expect(getBaseProduct(99)).rejects.toBeInstanceOf(ProductNotFoundError);

      try {
        await getBaseProduct(99);
      } catch (error) {
        expect(isProductNotFoundError(error)).toBe(true);
      }
    });

    it('throws a generic HTTP error for non-404 failures', async () => {
      server.use(http.get(`${API_URL}/products/99`, () => HttpResponse.json({}, { status: 500 })));

      await expect(getBaseProduct(99)).rejects.toThrow('Failed to fetch product (500)');
    });
  });

  describe('getComponent', () => {
    it('fetches and maps a component by id', async () => {
      server.use(
        http.get(`${API_URL}/components/77`, () =>
          HttpResponse.json({
            id: 77,
            name: 'Component Seven',
            parent_id: 10,
            amount_in_parent: 1,
            components: [],
            images: [],
            circularity_properties: null,
          }),
        ),
      );

      const product = await getComponent(77);
      expect(product.id).toBe(77);
      expect(product.role).toBe('component');
      expect(product.parentID).toBe(10);
      expect(product.videos).toEqual([]);
    });

    it('marks a component owned by the current user as "me"', async () => {
      server.use(
        http.get(`${API_URL}/components/77`, () =>
          HttpResponse.json({
            id: 77,
            name: 'Mine',
            parent_id: 10,
            amount_in_parent: 1,
            owner_id: 'me-user-id',
            components: [],
            images: [],
            circularity_properties: null,
          }),
        ),
      );

      const product = await getComponent(77);
      expect(product.ownedBy).toBe('me');
    });

    it('does not mark a component owned by someone else as "me"', async () => {
      server.use(
        http.get(`${API_URL}/components/77`, () =>
          HttpResponse.json({
            id: 77,
            name: 'Theirs',
            parent_id: 10,
            amount_in_parent: 1,
            owner_id: 'other-user-id',
            components: [],
            images: [],
            circularity_properties: null,
          }),
        ),
      );

      const product = await getComponent(77);
      expect(product.ownedBy).not.toBe('me');
    });

    it('throws ProductNotFoundError when the component is missing', async () => {
      server.use(
        http.get(`${API_URL}/components/99`, () => HttpResponse.json({}, { status: 404 })),
      );

      await expect(getComponent(99)).rejects.toBeInstanceOf(ProductNotFoundError);
    });
  });

  // ─── products (all) ─────────────────────────────────────

  describe('products', () => {
    it('fetches and returns mapped products in a paginated response', async () => {
      server.use(
        http.get(`${API_URL}/products`, () => HttpResponse.json(makePage([rawProductData]))),
      );

      const result = await products();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Recycled Aluminum Laptop Stand');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.size).toBe(50);
      expect(result.pages).toBe(1);
    });

    it('returns an empty paginated response when items is empty', async () => {
      server.use(
        http.get(`${API_URL}/products`, () => HttpResponse.json(makePage([], { pages: 0 }))),
      );

      const result = await products();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.pages).toBe(0);
    });

    it('sends multiple brands as a single comma-separated brand[in] param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await products({ brands: ['Dell', 'Apple'] });

      expect(capturedUrl?.searchParams.get('brand[in]')).toBe('Dell\x1fApple');
      expect(capturedUrl?.searchParams.getAll('brand[in]')).toHaveLength(1);
    });

    it('sends multiple orderBy values as a single comma-separated order_by param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await products({ orderBy: ['-created_at', '+name'] });

      expect(capturedUrl?.searchParams.get('order_by')).toBe('-created_at\x1f+name');
      expect(capturedUrl?.searchParams.getAll('order_by')).toHaveLength(1);
    });

    it('sends multiple product type names as a single comma-separated param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await products({ productTypeNames: ['Electronics', 'Furniture'] });

      expect(capturedUrl?.searchParams.get('product_type_name[in]')).toBe(
        'Electronics\x1fFurniture',
      );
      expect(capturedUrl?.searchParams.getAll('product_type_name[in]')).toHaveLength(1);
    });

    it('omits brand[in], order_by, and product_type_name[in] when arrays are empty', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await products({ orderBy: [], brands: [], productTypeNames: [] });

      expect(capturedUrl?.searchParams.has('brand[in]')).toBe(false);
      expect(capturedUrl?.searchParams.has('order_by')).toBe(false);
      expect(capturedUrl?.searchParams.has('product_type_name[in]')).toBe(false);
    });

    it('throws on HTTP error', async () => {
      server.use(http.get(`${API_URL}/products`, () => HttpResponse.json({}, { status: 500 })));

      await expect(products()).rejects.toThrow('Failed to fetch products');
    });
  });

  // ─── products (owner: 'me') ─────────────────────────────

  describe("products (owner: 'me')", () => {
    it('returns an empty paginated response on 401 response', async () => {
      server.use(
        http.get(`${API_URL}/products`, () =>
          HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
        ),
      );

      const result = await products({ owner: 'me' });

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        size: 50,
        pages: 0,
      });
    });

    it('fetches and returns mapped products in a paginated response', async () => {
      server.use(
        http.get(`${API_URL}/products`, () => HttpResponse.json(makePage([rawProductData]))),
      );

      const result = await products({ owner: 'me' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Recycled Aluminum Laptop Stand');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.size).toBe(50);
      expect(result.pages).toBe(1);
    });

    it('sends multiple brands as a single comma-separated brand[in] param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await products({ owner: 'me', brands: ['Dell', 'Apple'] });

      expect(capturedUrl?.searchParams.get('owner')).toBe('me');
      expect(capturedUrl?.searchParams.get('brand[in]')).toBe('Dell\x1fApple');
      expect(capturedUrl?.searchParams.getAll('brand[in]')).toHaveLength(1);
    });

    it('throws on non-401 HTTP error', async () => {
      server.use(http.get(`${API_URL}/products`, () => HttpResponse.json({}, { status: 500 })));

      await expect(products({ owner: 'me' })).rejects.toThrow('Failed to fetch products');
    });
  });

  // ─── searchProductTypes ───────────────

  describe('searchProductTypes', () => {
    it('returns product types from the API', async () => {
      server.use(
        http.get(`${API_URL}/product-types`, () =>
          HttpResponse.json({ items: [{ id: 1, name: 'Electronics' }] }),
        ),
      );

      const result = await searchProductTypes();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Electronics');
    });
  });

  it('uses the versioned API base URL', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${API_URL}/products`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(makePage([]));
      }),
    );

    await products();

    expect(capturedUrl?.pathname).toBe('/v1/products');
  });
});
