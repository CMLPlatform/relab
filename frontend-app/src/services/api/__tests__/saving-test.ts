import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { saveProduct, deleteProduct } from '../saving';
import * as auth from '../authentication';
import * as fetching from '../fetching';
import type { Product } from '@/types/Product';

// Mock dependencies
jest.mock('@/services/api/authentication', () => ({
  getToken: jest.fn(),
}));
jest.mock('@/services/api/fetching', () => ({
  getProduct: jest.fn(),
  apiFetch: jest.fn(),
}));

const mockGetToken = jest.mocked(auth.getToken);
const mockApiFetch = jest.mocked(fetching.apiFetch);
const mockGetProduct = jest.mocked(fetching.getProduct);
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Minimal valid product
const baseProduct: Product = {
  id: 'new',
  name: 'Test Widget',
  brand: 'Acme',
  model: 'X1',
  description: 'A test product',
  componentIDs: [],
  physicalProperties: { weight: 500, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityComment: null,
    recyclabilityObservation: 'low',
    recyclabilityReference: null,
    remanufacturabilityComment: null,
    remanufacturabilityObservation: 'medium',
    remanufacturabilityReference: null,
    repairabilityComment: null,
    repairabilityObservation: 'high',
    repairabilityReference: null,
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

// Helper: mock apiFetch with a simple ok response
function mockApiFetchOk(body: unknown = {}) {
  mockApiFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}
function mockApiFetchError(status = 400, body: unknown = { detail: 'Error' }) {
  mockApiFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => body,
  } as Response);
}

describe('Saving API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('test-token');
    // Default: getProduct returns a product with no images or videos
    mockGetProduct.mockResolvedValue({ ...baseProduct, id: 1, images: [], videos: [] });
  });

  // ─── saveProduct (new) ───────────────────────────────────

  describe('saveProduct (new product)', () => {
    it('POSTs to /products and returns the new id', async () => {
      mockApiFetchOk({ id: 99 }); // POST /products
      // updateProductImages: getProduct → no images to manage
      // updateProductVideos: getProduct → no videos to manage

      const id = await saveProduct({ ...baseProduct });

      expect(id).toBe(99);
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/products') }),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('POSTs to /products/:parentID/components when product has parentID', async () => {
      const componentProduct = { ...baseProduct, parentID: 5, amountInParent: 2 };
      mockApiFetchOk({ id: 100 });

      await saveProduct(componentProduct);

      const calledUrl = (mockApiFetch.mock.calls[0]?.[0] as URL).href;
      expect(calledUrl).toContain('/products/5/components');
    });

    it('includes amount_in_parent in body when product is a component', async () => {
      const componentProduct = { ...baseProduct, parentID: 5, amountInParent: 3 };
      mockApiFetchOk({ id: 101 });

      await saveProduct(componentProduct);

      const body = JSON.parse(mockApiFetch.mock.calls[0]?.[1]?.body as string);
      expect(body.amount_in_parent).toBe(3);
    });

    it('does not include amount_in_parent for root products', async () => {
      mockApiFetchOk({ id: 102 });

      await saveProduct({ ...baseProduct });

      const body = JSON.parse(mockApiFetch.mock.calls[0]?.[1]?.body as string);
      expect(body.amount_in_parent).toBeUndefined();
    });

    it('throws on non-ok POST response', async () => {
      mockApiFetchError(400, { detail: [{ msg: 'Name too short' }] });

      await expect(saveProduct({ ...baseProduct })).rejects.toThrow('Name too short');
    });
  });

  // ─── saveProduct (existing) ──────────────────────────────

  describe('saveProduct (existing product)', () => {
    const existingProduct = { ...baseProduct, id: 42 as number | 'new' };

    it('PATCHes product, physical_properties and circularity_properties', async () => {
      mockApiFetchOk({ id: 42 }); // PATCH /products/42
      mockApiFetchOk({}); // PATCH /products/42/physical_properties
      mockApiFetchOk({ id: 42 }); // PATCH /products/42/circularity_properties

      await saveProduct(existingProduct);

      const calls = mockApiFetch.mock.calls;
      expect(calls.some((c) => (c[0] as URL).href.includes('/products/42') && c[1]?.method === 'PATCH')).toBe(true);
      expect(calls.some((c) => (c[0] as URL).href.includes('physical_properties'))).toBe(true);
      expect(calls.some((c) => (c[0] as URL).href.includes('circularity_properties'))).toBe(true);
    });

    it('tolerates 404 on physical_properties PATCH', async () => {
      mockApiFetchOk({ id: 42 }); // PATCH product
      mockApiFetchError(404); // PATCH physical_properties → 404 is ok
      mockApiFetchOk({ id: 42 }); // PATCH circularity_properties

      await expect(saveProduct(existingProduct)).resolves.not.toThrow();
    });

    it('tolerates 404 on circularity_properties PATCH', async () => {
      mockApiFetchOk({ id: 42 });
      mockApiFetchOk({});
      mockApiFetchError(404); // circularity 404 is ok

      await expect(saveProduct(existingProduct)).resolves.not.toThrow();
    });

    it('throws when product PATCH fails', async () => {
      mockApiFetchError(400, { detail: 'Validation failed' });
      mockApiFetchOk({}); // physical_properties (parallel)
      mockApiFetchOk({}); // circularity_properties (parallel)

      await expect(saveProduct(existingProduct)).rejects.toThrow('Validation failed');
    });

    it('throws when physical_properties PATCH fails with non-404', async () => {
      mockApiFetchOk({ id: 42 }); // product
      mockApiFetchError(500, { detail: 'Server error' }); // physical_properties
      mockApiFetchOk({ id: 42 }); // circularity_properties

      await expect(saveProduct(existingProduct)).rejects.toThrow('Failed to update physical properties');
    });
  });

  // ─── image diff logic ───────────────────────────────────

  describe('image management during save', () => {
    it("deletes images that are not in the new product's image list", async () => {
      const originalImages = [{ id: 10, url: 'http://example.com/img.jpg', description: 'old' }];
      const productWithExistingImage = {
        ...baseProduct,
        id: 42 as number | 'new',
        images: [], // no images in new version
      };
      mockApiFetchOk({ id: 42 }); // PATCH product
      mockApiFetchOk({}); // PATCH physical
      mockApiFetchOk({ id: 42 }); // PATCH circularity
      mockApiFetchOk({}); // DELETE image/10

      await saveProduct(productWithExistingImage, originalImages);

      const deleteCalls = mockApiFetch.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/images/') && c[1]?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('adds images that have no id', async () => {
      // Mock fetch for the blob download path
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['data'], { type: 'image/png' }),
      } as Response);
      global.fetch = mockFetch;

      const productWithNewImage = {
        ...baseProduct,
        id: 42 as number | 'new',
        images: [{ url: 'https://example.com/new.jpg', description: 'new' }],
      };
      mockGetProduct.mockResolvedValue({ ...baseProduct, id: 42, images: [], videos: [] });
      mockApiFetchOk({ id: 42 }); // PATCH product
      mockApiFetchOk({}); // PATCH physical
      mockApiFetchOk({ id: 42 }); // PATCH circularity
      mockApiFetchOk({}); // POST image

      await saveProduct(productWithNewImage);

      const addCalls = mockApiFetch.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/images') && c[1]?.method === 'POST',
      );
      expect(addCalls).toHaveLength(1);
    });
  });

  // ─── video management ───────────────────────────────────

  describe('video management during save', () => {
    it('adds new videos (no id) during save', async () => {
      const newVideo = { url: 'https://youtube.com/watch?v=1', description: '', title: 'New' };
      const product = { ...baseProduct, id: 42 as number | 'new', videos: [newVideo] };
      mockGetProduct.mockResolvedValue({ ...baseProduct, id: 42, images: [], videos: [] });

      mockApiFetchOk({ id: 42 }); // product PATCH
      mockApiFetchOk({}); // physical PATCH
      mockApiFetchOk({ id: 42 }); // circularity PATCH
      mockApiFetchOk({}); // POST video

      await saveProduct(product);

      const videoCalls = mockApiFetch.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos') && c[1]?.method === 'POST',
      );
      expect(videoCalls).toHaveLength(1);
    });

    it('deletes removed videos', async () => {
      const originalVideos = [{ id: 5, url: 'https://old.com', description: '', title: 'Old' }];
      const product = { ...baseProduct, id: 42 as number | 'new', videos: [] };

      mockApiFetchOk({ id: 42 }); // product PATCH
      mockApiFetchOk({}); // physical PATCH
      mockApiFetchOk({ id: 42 }); // circularity PATCH
      mockApiFetchOk({}); // DELETE video

      await saveProduct(product, [], originalVideos);

      const delCalls = mockApiFetch.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos/5') && c[1]?.method === 'DELETE',
      );
      expect(delCalls).toHaveLength(1);
    });

    it('updates changed videos', async () => {
      const originalVideos = [{ id: 5, url: 'https://old.com', description: '', title: 'Old Title' }];
      const updated = { id: 5, url: 'https://new.com', description: 'updated', title: 'New Title' };
      const product = { ...baseProduct, id: 42 as number | 'new', videos: [updated] };

      mockApiFetchOk({ id: 42 }); // product PATCH
      mockApiFetchOk({}); // physical PATCH
      mockApiFetchOk({ id: 42 }); // circularity PATCH
      mockApiFetchOk({}); // PATCH video

      await saveProduct(product, [], originalVideos);

      const updateCalls = mockApiFetch.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos/5') && c[1]?.method === 'PATCH',
      );
      expect(updateCalls).toHaveLength(1);
    });
  });

  // ─── deleteProduct ───────────────────────────────────────

  describe('deleteProduct', () => {
    it('returns immediately for a new product without calling apiFetch', async () => {
      await deleteProduct({ ...baseProduct, id: 'new' });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('calls DELETE /products/:id for an existing product', async () => {
      mockApiFetchOk({});

      await deleteProduct({ ...baseProduct, id: 42 });

      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/products/42') }),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
