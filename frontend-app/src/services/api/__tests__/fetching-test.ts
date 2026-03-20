import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newProduct, allBrands, getProduct, allProducts, myProducts, productComponents } from '../fetching';
import * as auth from '../authentication';
import { setupFetchMock } from '@/test-utils';

setupFetchMock();

const mockUser = {
  id: 'me-user-id',
  email: 'test@test.com',
  isActive: true,
  isSuperuser: false,
  isVerified: true,
  username: 'me',
  oauth_accounts: [],
};

// Minimal ProductData as returned by the API
const rawProductData = {
  id: 42,
  name: 'Test Product',
  brand: 'Acme',
  model: 'X100',
  description: 'A test product',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  product_type_id: 1,
  owner_id: 'me-user-id',
  parent_id: undefined,
  amount_in_parent: undefined,
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
  components: [{ id: 1, name: 'Part A', description: '' }],
  images: [{ id: 10, image_url: '/media/img.jpg', description: 'Main image' }],
  videos: [{ id: 20, url: 'https://example.com/vid', description: '', title: 'Demo' }],
};

describe('Fetching API Service logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getUser to prevent ownership crash issues
    jest.spyOn(auth, 'getUser').mockResolvedValue(mockUser);
  });

  afterAll(() => {
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
      const p = newProduct('Product', NaN, 'Acme', 'X1');
      expect(p.brand).toBe('Acme');
      expect(p.model).toBe('X1');
    });
  });

  // ─── allBrands ──────────────────────────────────────────

  describe('allBrands', () => {
    it('performs fetch and returns array of strings', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ['Samsung', 'Apple', 'Nokia'],
      });

      const brands = await allBrands();

      expect(brands).toContain('Apple');
      expect(brands.length).toBe(3);
      const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0].toString();
      expect(fetchUrl).toMatch(/\/brands$/);
    });

    it('throws on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(allBrands()).rejects.toThrow('HTTP error');
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => rawProductData,
      });

      const p = await getProduct(42);

      expect(p.id).toBe(42);
      expect(p.name).toBe('Test Product');
      expect(p.brand).toBe('Acme');
      expect(p.physicalProperties.weight).toBe(100);
      expect(p.physicalProperties.height).toBe(10);
      expect(p.componentIDs).toEqual([1]);
      expect(p.images[0].description).toBe('Main image');
      expect(p.videos[0].title).toBe('Demo');
      expect(p.ownedBy).toBe('me');
    });

    it('maps ownership to owner_id string when not current user', async () => {
      const otherUserProduct = { ...rawProductData, owner_id: 'other-user-id' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => otherUserProduct,
      });

      const p = await getProduct(42);

      expect(p.ownedBy).toBe('other-user-id');
    });

    it('uses empty circularity defaults when circularity_properties is null', async () => {
      const noCircularity = { ...rawProductData, circularity_properties: null };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => noCircularity,
      });

      const p = await getProduct(42);

      expect(p.circularityProperties.recyclabilityObservation).toBe('');
    });

    it('throws on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(getProduct(99)).rejects.toThrow('HTTP error');
    });
  });

  // ─── allProducts ────────────────────────────────────────

  describe('allProducts', () => {
    it('fetches and returns an array of mapped products', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [rawProductData] }),
      });

      const products = await allProducts();

      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Test Product');
    });

    it('returns empty array when items is empty', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const products = await allProducts();

      expect(products).toHaveLength(0);
    });

    it('throws on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(allProducts()).rejects.toThrow('HTTP error');
    });
  });

  // ─── myProducts ─────────────────────────────────────────

  describe('myProducts', () => {
    it('returns empty array when no token available', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce(undefined);

      const products = await myProducts();

      expect(products).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns empty array on 401 response', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

      const products = await myProducts();

      expect(products).toEqual([]);
    });

    it('fetches and returns mapped products', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [rawProductData] }),
      });

      const products = await myProducts();

      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Test Product');
    });

    it('throws on non-401 HTTP error', async () => {
      jest.spyOn(auth, 'getToken').mockResolvedValueOnce('test-token');
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(myProducts()).rejects.toThrow('HTTP error');
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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => componentData,
      });

      const product = { ...newProduct(), componentIDs: [1] };
      const result = await productComponents(product);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Component A');
    });
  });
});
