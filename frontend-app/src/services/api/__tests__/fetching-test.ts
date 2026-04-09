import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { mockUser, server } from '@/test-utils';
import * as auth from '../authentication';
import { allBrands, searchBrands } from '../brands';
import { allProducts, getProduct, myProducts, newProduct, productComponents } from '../products';
import { allProductTypes, searchProductTypes } from '../productTypes';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

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

// Minimal ProductData as returned by the API
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
  recyclability_comment: null,
  recyclability_observation: 'low',
  recyclability_reference: null,
  remanufacturability_comment: null,
  remanufacturability_observation: 'medium',
  remanufacturability_reference: null,
  repairability_comment: null,
  repairability_observation: 'high',
  repairability_reference: null,
  components: [{ id: 1, name: 'Part A', description: '' }],
  images: [{ id: 10, image_url: '/media/img.jpg', description: 'Main image' }],
  videos: [{ id: 20, url: 'https://example.com/vid', description: '', title: 'Demo' }],
};

describe('Fetching API Service logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(auth, 'getUser').mockResolvedValue(mockUser({ id: 'me-user-id', username: 'me' }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── newProduct ─────────────────────────────────────────

  describe('newProduct', () => {
    it('returns an exact clean product template', () => {
      const p = newProduct('Fresh Product');
      expect(p.id).toBe('new');
      expect(p.name).toBe('Fresh Product');
      expect(p.componentIDs).toEqual([]);
      expect(p.ownedBy).toBe('me');
    });

    it('defaults name to empty string', () => {
      const p = newProduct();
      expect(p.name).toBe('');
    });

    it('includes parentID when provided', () => {
      const p = newProduct('Sub', 5);
      expect(p.parentID).toBe(5);
    });

    it('leaves parentID undefined when NaN', () => {
      const p = newProduct('Sub', NaN);
      expect(p.parentID).toBeUndefined();
    });

    it('includes brand and model when provided', () => {
      const p = newProduct('Product', NaN, 'CircularTech', 'X1');
      expect(p.brand).toBe('CircularTech');
      expect(p.model).toBe('X1');
    });
  });

  // ─── allBrands / searchBrands ───────────────────────────

  describe('allBrands', () => {
    it('performs fetch and returns array of strings', async () => {
      server.use(
        http.get(`${API_URL}/brands`, () =>
          HttpResponse.json({
            items: ['Samsung', 'Apple', 'Nokia'],
            total: 3,
            page: 1,
            size: 50,
            pages: 1,
          }),
        ),
      );

      const brands = await allBrands();

      expect(brands).toContain('Apple');
      expect(brands.length).toBe(3);
    });

    it('returns empty array when items is absent', async () => {
      server.use(http.get(`${API_URL}/brands`, () => HttpResponse.json({})));

      const brands = await allBrands();

      expect(brands).toEqual([]);
    });

    it('throws on HTTP error', async () => {
      server.use(http.get(`${API_URL}/brands`, () => HttpResponse.json({}, { status: 500 })));

      await expect(allBrands()).rejects.toThrow('HTTP error');
    });

    it('sends search param when searching brands', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/brands`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: ['Samsung'] });
        }),
      );

      await searchBrands('Samsung');

      expect(capturedUrl?.searchParams.get('search')).toBe('Samsung');
    });
  });

  // ─── getProduct ─────────────────────────────────────────

  describe('getProduct', () => {
    it("returns a clean product template for id='new'", async () => {
      const p = await getProduct('new');
      expect(p.id).toBe('new');
      expect(p.componentIDs).toEqual([]);
    });

    it('fetches and maps a product by id', async () => {
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(rawProductData)));

      const p = await getProduct(42);

      expect(p.id).toBe(42);
      expect(p.name).toBe('Recycled Aluminum Laptop Stand');
      expect(p.brand).toBe('CircularTech');
      expect(p.physicalProperties.weight).toBe(100);
      expect(p.physicalProperties.height).toBe(10);
      expect(p.componentIDs).toEqual([1]);
      expect(p.images[0].description).toBe('Main image');
      expect(p.videos[0].title).toBe('Demo');
      expect(p.ownedBy).toBe('me');
    });

    it('maps ownership to owner_id string when not current user', async () => {
      const otherUserProduct = { ...rawProductData, owner_id: 'other-user-id' };
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(otherUserProduct)));

      const p = await getProduct(42);

      expect(p.ownedBy).toBe('other-user-id');
    });

    it('uses empty circularity defaults when circularity fields are null', async () => {
      const noCircularity = {
        ...rawProductData,
        recyclability_observation: null,
        recyclability_comment: null,
        recyclability_reference: null,
        remanufacturability_observation: null,
        remanufacturability_comment: null,
        remanufacturability_reference: null,
        repairability_observation: null,
        repairability_comment: null,
        repairability_reference: null,
      };
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(noCircularity)));

      const p = await getProduct(42);

      expect(p.circularityProperties.recyclabilityObservation).toBe('');
    });

    it('still supports the legacy nested property shape while codegen catches up', async () => {
      const legacyShape = {
        ...rawProductData,
        weight_g: undefined,
        height_cm: undefined,
        width_cm: undefined,
        depth_cm: undefined,
        recyclability_comment: undefined,
        recyclability_observation: undefined,
        recyclability_reference: undefined,
        remanufacturability_comment: undefined,
        remanufacturability_observation: undefined,
        remanufacturability_reference: undefined,
        repairability_comment: undefined,
        repairability_observation: undefined,
        repairability_reference: undefined,
        physical_properties: {
          weight_g: 100,
          height_cm: 10,
          width_cm: 5,
          depth_cm: 3,
        },
        circularity_properties: {
          recyclability_comment: null,
          recyclability_observation: 'low',
          recyclability_reference: null,
          remanufacturability_comment: null,
          remanufacturability_observation: 'medium',
          remanufacturability_reference: null,
          repairability_comment: null,
          repairability_observation: 'high',
          repairability_reference: null,
        },
      };
      server.use(http.get(`${API_URL}/products/42`, () => HttpResponse.json(legacyShape)));

      const p = await getProduct(42);

      expect(p.physicalProperties.weight).toBe(100);
      expect(p.circularityProperties.recyclabilityObservation).toBe('low');
    });

    it('throws on HTTP error', async () => {
      server.use(http.get(`${API_URL}/products/99`, () => HttpResponse.json({}, { status: 404 })));

      await expect(getProduct(99)).rejects.toThrow('HTTP error');
    });
  });

  // ─── allProducts ────────────────────────────────────────

  describe('allProducts', () => {
    it('fetches and returns mapped products in a paginated response', async () => {
      server.use(
        http.get(`${API_URL}/products`, () => HttpResponse.json(makePage([rawProductData]))),
      );

      const products = await allProducts();

      expect(products.items).toHaveLength(1);
      expect(products.items[0].name).toBe('Recycled Aluminum Laptop Stand');
      expect(products.total).toBe(1);
      expect(products.page).toBe(1);
      expect(products.size).toBe(50);
      expect(products.pages).toBe(1);
    });

    it('returns an empty paginated response when items is empty', async () => {
      server.use(
        http.get(`${API_URL}/products`, () => HttpResponse.json(makePage([], { pages: 0 }))),
      );

      const products = await allProducts();

      expect(products.items).toHaveLength(0);
      expect(products.total).toBe(0);
      expect(products.pages).toBe(0);
    });

    it('sends multiple brands as a single comma-separated brand__in param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await allProducts(['product_type'], 1, 50, undefined, undefined, ['Dell', 'Apple']);

      expect(capturedUrl?.searchParams.get('brand__in')).toBe('Dell,Apple');
      expect(capturedUrl?.searchParams.getAll('brand__in')).toHaveLength(1);
    });

    it('sends multiple orderBy values as a single comma-separated order_by param', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await allProducts(['product_type'], 1, 50, undefined, ['-created_at', 'name']);

      expect(capturedUrl?.searchParams.get('order_by')).toBe('-created_at,name');
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

      await allProducts(['product_type'], 1, 50, undefined, undefined, undefined, undefined, [
        'Electronics',
        'Furniture',
      ]);

      expect(capturedUrl?.searchParams.get('product_type__name__in')).toBe('Electronics,Furniture');
      expect(capturedUrl?.searchParams.getAll('product_type__name__in')).toHaveLength(1);
    });

    it('omits brand__in, order_by, and product_type__name__in when arrays are empty', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await allProducts(['product_type'], 1, 50, undefined, [], [], undefined, []);

      expect(capturedUrl?.searchParams.has('brand__in')).toBe(false);
      expect(capturedUrl?.searchParams.has('order_by')).toBe(false);
      expect(capturedUrl?.searchParams.has('product_type__name__in')).toBe(false);
    });

    it('throws on HTTP error', async () => {
      server.use(http.get(`${API_URL}/products`, () => HttpResponse.json({}, { status: 500 })));

      await expect(allProducts()).rejects.toThrow('HTTP error');
    });
  });

  // ─── myProducts ─────────────────────────────────────────

  describe('myProducts', () => {
    it('returns an empty paginated response when no token is available', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce(undefined);

      const products = await myProducts();

      expect(products).toEqual({
        items: [],
        total: 0,
        page: 1,
        size: 50,
        pages: 0,
      });
    });

    it('returns an empty paginated response on 401 response', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      server.use(
        http.get(`${API_URL}/users/me/products`, () =>
          HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
        ),
      );

      const products = await myProducts();

      expect(products).toEqual({
        items: [],
        total: 0,
        page: 1,
        size: 50,
        pages: 0,
      });
    });

    it('fetches and returns mapped products in a paginated response', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      server.use(
        http.get(`${API_URL}/users/me/products`, () =>
          HttpResponse.json(makePage([rawProductData])),
        ),
      );

      const products = await myProducts();

      expect(products.items).toHaveLength(1);
      expect(products.items[0].name).toBe('Recycled Aluminum Laptop Stand');
      expect(products.total).toBe(1);
      expect(products.page).toBe(1);
      expect(products.size).toBe(50);
      expect(products.pages).toBe(1);
    });

    it('sends multiple brands as a single comma-separated brand__in param', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/users/me/products`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(makePage([]));
        }),
      );

      await myProducts(['product_type'], 1, 50, undefined, undefined, ['Dell', 'Apple']);

      expect(capturedUrl?.searchParams.get('brand__in')).toBe('Dell,Apple');
      expect(capturedUrl?.searchParams.getAll('brand__in')).toHaveLength(1);
    });

    it('throws on non-401 HTTP error', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      server.use(
        http.get(`${API_URL}/users/me/products`, () => HttpResponse.json({}, { status: 500 })),
      );

      await expect(myProducts()).rejects.toThrow('HTTP error');
    });
  });

  // ─── searchProductTypes / allProductTypes ───────────────

  describe('searchProductTypes / allProductTypes', () => {
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

    it('allProductTypes requests size=100', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get(`${API_URL}/product-types`, ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json({ items: [] });
        }),
      );

      await allProductTypes();

      expect(capturedUrl?.searchParams.get('size')).toBe('100');
    });
  });

  // ─── productComponents ──────────────────────────────────

  describe('productComponents', () => {
    it('returns empty array for product with no components', async () => {
      const product = { ...newProduct(), componentIDs: [] };

      const result = await productComponents(product);

      expect(result).toEqual([]);
    });

    it('fetches each component by id', async () => {
      const componentData = { ...rawProductData, id: 1, name: 'Component A' };
      server.use(http.get(`${API_URL}/products/1`, () => HttpResponse.json(componentData)));

      const product = { ...newProduct(), componentIDs: [1] };
      const result = await productComponents(product);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Component A');
    });
  });
});
