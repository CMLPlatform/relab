import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithAuth } from '@/services/api/auth/authentication';
import { getBaseProduct } from '@/services/api/products';
import { deleteProduct, MediaSyncError, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';

// Mock dependencies
jest.mock('@/services/api/auth/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));
jest.mock('@/services/api/products', () => ({
  getBaseProduct: jest.fn(),
}));

const mockFetchWithAuth = jest.mocked(fetchWithAuth);
const mockGetProduct = jest.mocked(getBaseProduct);
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Minimal valid product
const baseProduct: Product = {
  id: undefined,
  role: 'product',
  name: 'Test Widget',
  brand: 'CircularTech',
  model: 'X1',
  description: 'A test product',
  componentIDs: [],
  components: [],
  physicalProperties: { weight: 500, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclability: 'low',
    remanufacturability: 'medium',
    disassemblability: 'high',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

// Helper: mock fetchWithAuth with a simple ok response
function mockFetchOk(body: unknown = {}) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}
function mockFetchError(status = 400, body: unknown = { detail: 'Error' }) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => body,
  } as Response);
}

describe('Saving API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: getBaseProduct returns a product with no images or videos
    mockGetProduct.mockResolvedValue({
      ...baseProduct,
      id: 1,
      images: [],
      videos: [],
    });
  });

  // ─── saveProduct (new) ───────────────────────────────────

  describe('saveProduct (new product)', () => {
    it('POSTs to /products and returns the new id', async () => {
      mockFetchOk({ id: 99 }); // POST /products
      // updateProductImages: getBaseProduct → no images to manage
      // updateProductVideos: getBaseProduct → no videos to manage

      const id = await saveProduct({ ...baseProduct });

      expect(id).toBe(99);
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/products') }),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('POSTs to /products/:parentID/components when parent is a base product', async () => {
      const componentProduct = {
        ...baseProduct,
        role: 'component' as const,
        parentID: 5,
        parentRole: 'product' as const,
        amountInParent: 2,
      };
      mockFetchOk({ id: 100 });

      await saveProduct(componentProduct);

      const calledUrl = (mockFetchWithAuth.mock.calls[0][0] as URL).href;
      expect(calledUrl).toContain('/products/5/components');
    });

    it('POSTs to /components/:parentID/components when parent is a component', async () => {
      const componentProduct = {
        ...baseProduct,
        role: 'component' as const,
        parentID: 7,
        parentRole: 'component' as const,
        amountInParent: 2,
      };
      mockFetchOk({ id: 100 });

      await saveProduct(componentProduct);

      const calledUrl = (mockFetchWithAuth.mock.calls[0][0] as URL).href;
      expect(calledUrl).toContain('/components/7/components');
    });

    it('throws before POSTing when a new component has no parent', async () => {
      const componentProduct = {
        ...baseProduct,
        role: 'component' as const,
        parentID: undefined,
      };

      await expect(saveProduct(componentProduct)).rejects.toThrow(
        'Cannot create a component without a parent.',
      );
      expect(mockFetchWithAuth).not.toHaveBeenCalled();
    });

    it('includes amount_in_parent in body when product is a component', async () => {
      const componentProduct = {
        ...baseProduct,
        role: 'component' as const,
        parentID: 5,
        amountInParent: 3,
      };
      mockFetchOk({ id: 101 });

      await saveProduct(componentProduct);

      const body = JSON.parse(mockFetchWithAuth.mock.calls[0]?.[1]?.body as string);
      expect(body.amount_in_parent).toBe(3);
    });

    it('does not include amount_in_parent for root products', async () => {
      mockFetchOk({ id: 102 });

      await saveProduct({ ...baseProduct });

      const body = JSON.parse(mockFetchWithAuth.mock.calls[0]?.[1]?.body as string);
      expect(body.amount_in_parent).toBeUndefined();
    });

    it('throws on non-ok POST response', async () => {
      mockFetchError(400, { detail: [{ msg: 'Name too short' }] });

      await expect(saveProduct({ ...baseProduct })).rejects.toThrow('Name too short');
    });

    it('throws on 404 instead of treating it as success', async () => {
      mockFetchError(404, { detail: 'Parent not found' });

      await expect(
        saveProduct({
          ...baseProduct,
          role: 'component' as const,
          parentID: 999,
          parentRole: 'product' as const,
        }),
      ).rejects.toThrow('Parent not found');
    });

    it('creates each new video exactly once (via the videos endpoint, not the create body)', async () => {
      const newVideo = { url: 'https://youtube.com/watch?v=1', description: '', title: 'New' };
      mockFetchOk({ id: 99 }); // POST /products
      mockFetchOk({}); // POST /products/99/videos

      await saveProduct({ ...baseProduct, videos: [newVideo] });

      const createBody = JSON.parse(mockFetchWithAuth.mock.calls[0]?.[1]?.body as string);
      expect(createBody.videos).toBeUndefined();
      const videoPosts = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos') && c[1]?.method === 'POST',
      );
      expect(videoPosts).toHaveLength(1);
    });
  });

  // ─── saveProduct (existing) ──────────────────────────────

  describe('saveProduct (existing product)', () => {
    const existingProduct = { ...baseProduct, id: 42 };

    it('PATCHes product with properties in a single request', async () => {
      mockFetchOk({ id: 42 }); // PATCH /products/42

      await saveProduct(existingProduct);

      const calls = mockFetchWithAuth.mock.calls;
      const patchCall = calls.find(
        (c) => (c[0] as URL).href.includes('/products/42') && c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall?.[1]?.body as string);
      expect(body.weight_g).toBe(500);
      expect(body.height_cm).toBe(5);
      expect(body.circularity_properties).toEqual({
        recyclability: 'low',
        remanufacturability: 'medium',
        disassemblability: 'high',
      });
    });

    it('sends null circularity_properties when notes are empty', async () => {
      mockFetchOk({ id: 42 });

      await saveProduct({
        ...existingProduct,
        circularityProperties: {
          recyclability: '',
          remanufacturability: null,
          disassemblability: '   ',
        },
      });

      const patchCall = mockFetchWithAuth.mock.calls.find(
        (c) => (c[0] as URL).href.includes('/products/42') && c[1]?.method === 'PATCH',
      );
      const body = JSON.parse(patchCall?.[1]?.body as string);
      expect(body.circularity_properties).toBeNull();
    });

    it('throws when product PATCH fails', async () => {
      mockFetchError(400, { detail: 'Validation failed' });

      await expect(saveProduct(existingProduct)).rejects.toThrow('Validation failed');
    });
  });

  // ─── image diff logic ───────────────────────────────────

  describe('image management during save', () => {
    it("deletes images that are not in the new product's image list", async () => {
      const originalImages = [{ id: '10', url: 'http://example.com/img.jpg', description: 'old' }];
      const productWithExistingImage = {
        ...baseProduct,
        id: 42,
        images: [], // no images in new version
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchOk({}); // DELETE image/10

      await saveProduct(productWithExistingImage, originalImages);

      const deleteCalls = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/images/') && c[1]?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('treats a 404 on image delete as already-deleted instead of throwing', async () => {
      const originalImages = [{ id: '10', url: 'http://example.com/img.jpg', description: 'old' }];
      const productWithExistingImage = {
        ...baseProduct,
        id: 42,
        images: [], // no images in new version
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchError(404, { detail: 'Not found' }); // DELETE image/10 — already gone

      await expect(saveProduct(productWithExistingImage, originalImages)).resolves.toBe(42);
    });

    it('adds images that have no id', async () => {
      // Mock fetch for the blob download path
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['data'], { type: 'image/png' }),
      } as Response);
      global.fetch = mockFetch;

      const productWithNewImage = {
        ...baseProduct,
        id: 42,
        images: [{ url: 'https://example.com/new.jpg', description: 'new' }],
      };
      mockGetProduct.mockResolvedValue({
        ...baseProduct,
        id: 42,
        images: [],
        videos: [],
      });
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchOk({}); // POST image

      await saveProduct(productWithNewImage);

      const addCalls = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/images') && c[1]?.method === 'POST',
      );
      expect(addCalls).toHaveLength(1);
    });
  });

  // ─── video management ───────────────────────────────────

  describe('video management during save', () => {
    it('adds new videos (no id) during save', async () => {
      const newVideo = {
        url: 'https://youtube.com/watch?v=1',
        description: '',
        title: 'New',
      };
      const product = {
        ...baseProduct,
        id: 42,
        videos: [newVideo],
      };
      mockGetProduct.mockResolvedValue({
        ...baseProduct,
        id: 42,
        images: [],
        videos: [],
      });

      mockFetchOk({ id: 42 }); // product PATCH
      mockFetchOk({}); // POST video

      await saveProduct(product);

      const videoCalls = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos') && c[1]?.method === 'POST',
      );
      expect(videoCalls).toHaveLength(1);
    });

    it('deletes removed videos', async () => {
      const originalVideos = [{ id: 5, url: 'https://old.com', description: '', title: 'Old' }];
      const product = { ...baseProduct, id: 42, videos: [] };

      mockFetchOk({ id: 42 }); // product PATCH
      mockFetchOk({}); // DELETE video

      await saveProduct(product, [], originalVideos);

      const delCalls = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos/5') && c[1]?.method === 'DELETE',
      );
      expect(delCalls).toHaveLength(1);
    });

    it('updates changed videos', async () => {
      const originalVideos = [
        { id: 5, url: 'https://old.com', description: '', title: 'Old Title' },
      ];
      const updated = {
        id: 5,
        url: 'https://new.com',
        description: 'updated',
        title: 'New Title',
      };
      const product = {
        ...baseProduct,
        id: 42,
        videos: [updated],
      };

      mockFetchOk({ id: 42 }); // product PATCH
      mockFetchOk({}); // PATCH video

      await saveProduct(product, [], originalVideos);

      const updateCalls = mockFetchWithAuth.mock.calls.filter(
        (c) => (c[0] as URL).href.includes('/videos/5') && c[1]?.method === 'PATCH',
      );
      expect(updateCalls).toHaveLength(1);
    });
  });

  // ─── addImage edge cases ────────────────────────────────

  describe('addImage edge cases', () => {
    it('throws when image upload returns a non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['data'], { type: 'image/png' }),
      } as Response);
      global.fetch = mockFetch;

      const product = {
        ...baseProduct,
        id: 42,
        images: [{ url: 'https://example.com/new.jpg', description: 'test' }],
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchWithAuth.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ detail: 'File too large' }),
      } as Response);

      // The PATCH already landed, so this surfaces as a partial failure carrying
      // the original upload error as its cause.
      const error = await saveProduct(product, [], []).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(MediaSyncError);
      expect((error as MediaSyncError).productId).toBe(42);
      expect((error as MediaSyncError).cause).toMatchObject({ message: 'File too large' });
    });

    it('reports a failed upload on a new product as a partial save, not a failed create', async () => {
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['data'], { type: 'image/png' }),
      } as Response);
      global.fetch = mockFetch;

      mockFetchOk({ id: 77 }); // POST /products
      mockFetchWithAuth.mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        json: async () => ({ detail: 'Too large' }),
      } as Response);

      const error = await saveProduct({
        ...baseProduct,
        images: [{ url: 'https://example.com/new.jpg', description: '' }],
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(MediaSyncError);
      expect((error as MediaSyncError).productId).toBe(77);
    });

    it('mutates image with server-assigned id and url after successful upload', async () => {
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['data'], { type: 'image/png' }),
      } as Response);
      global.fetch = mockFetch;

      const image: { url: string; description: string; id?: string } = {
        url: 'https://example.com/new.jpg',
        description: 'test',
      };
      const product = {
        ...baseProduct,
        id: 42,
        images: [image],
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchOk({ id: 'abc-123', image_url: 'http://cdn.example.com/stored.jpg' }); // POST image

      await saveProduct(product, [], []);

      expect(image.id).toBe('abc-123');
      expect(image.url).toBe('http://cdn.example.com/stored.jpg');
    });

    it('uploads a data: URI image via FormData', async () => {
      // Minimal 1×1 PNG as a base64 data URI
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const product = {
        ...baseProduct,
        id: 42,
        images: [{ url: dataUri, description: 'tiny png' }],
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchOk({ id: 77 }); // POST image

      await saveProduct(product, [], []);

      const uploadCall = mockFetchWithAuth.mock.calls.find(
        (c) => (c[0] as URL).href.includes('/images') && c[1]?.method === 'POST',
      );
      expect(uploadCall).toBeDefined();
      expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    });

    it('names the uploaded file to match the image MIME type', async () => {
      // A JPEG data URI — filename must be .jpg, not .png, or the backend
      // rejects the MIME/extension mismatch. Byte content is irrelevant here;
      // only the declared MIME type drives the filename.
      const dataUri = 'data:image/jpeg;base64,AAAA';

      const product = {
        ...baseProduct,
        id: 42,
        images: [{ url: dataUri, description: 'tiny jpeg' }],
      };
      mockFetchOk({ id: 42 }); // PATCH product
      mockFetchOk({ id: 77 }); // POST image

      await saveProduct(product, [], []);

      const uploadCall = mockFetchWithAuth.mock.calls.find(
        (c) => (c[0] as URL).href.includes('/images') && c[1]?.method === 'POST',
      );
      expect(uploadCall).toBeDefined();
      const file = (uploadCall?.[1]?.body as FormData | undefined)?.get('file') as File;
      expect(file.name).toBe('image.jpg');
      expect(file.type).toBe('image/jpeg');
    });
  });

  // ─── deleteProduct ───────────────────────────────────────

  describe('deleteProduct', () => {
    it('returns immediately for a new product without calling the API', async () => {
      await deleteProduct({ ...baseProduct, id: undefined });

      expect(mockFetchWithAuth).not.toHaveBeenCalled();
    });

    it('calls DELETE /products/:id for an existing product', async () => {
      mockFetchOk({});

      await deleteProduct({ ...baseProduct, id: 42 });

      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining('/products/42'),
        }),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws when the DELETE fails instead of reporting success', async () => {
      mockFetchError(403, { detail: 'Not your product' });

      await expect(deleteProduct({ ...baseProduct, id: 42 })).rejects.toThrow('Not your product');
    });
  });
});
