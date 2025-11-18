import { newProduct, allBrands } from '../fetching';

// Mock fetch
global.fetch = jest.fn();

describe('Fetching Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('newProduct', () => {
    it('should create a new product with default values', () => {
      const product = newProduct();

      expect(product).toEqual({
        id: 'new',
        parentID: NaN,
        name: '',
        brand: undefined,
        model: undefined,
        physicalProperties: {
          weight: NaN,
          height: NaN,
          width: NaN,
          depth: NaN,
        },
        componentIDs: [],
        images: [],
        ownedBy: 'me',
      });
    });

    it('should create a new product with provided values', () => {
      const product = newProduct('Test Product', 123, 'Test Brand', 'Test Model');

      expect(product.name).toBe('Test Product');
      expect(product.parentID).toBe(123);
      expect(product.brand).toBe('Test Brand');
      expect(product.model).toBe('Test Model');
    });
  });

  describe('allBrands', () => {
    it('should fetch and return all brands', async () => {
      const mockBrands = ['Brand A', 'Brand B', 'Brand C'];
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBrands,
      });

      const brands = await allBrands();

      expect(brands).toEqual(mockBrands);
      expect(global.fetch).toHaveBeenCalledWith(expect.any(URL), { method: 'GET' });
    });

    it('should throw error when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(allBrands()).rejects.toThrow('HTTP error! Status: 500');
    });
  });
});
