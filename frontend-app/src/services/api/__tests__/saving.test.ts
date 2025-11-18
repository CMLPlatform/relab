import { deleteProduct } from '../saving';
import * as auth from '../authentication';
import { Product } from '@/types/Product';

// Mock dependencies
jest.mock('../authentication');
jest.mock('../fetching');
global.fetch = jest.fn();

describe('Saving Service', () => {
  const mockProduct: Product = {
    id: 1,
    name: 'Test Product',
    brand: 'Test Brand',
    model: 'Test Model',
    description: 'Test description',
    componentIDs: [],
    physicalProperties: {
      weight: 100,
      width: 10,
      height: 20,
      depth: 30,
    },
    images: [],
    ownedBy: 'me',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth.getToken as jest.Mock).mockResolvedValue('test-token');
  });

  describe('deleteProduct', () => {
    it('should delete an existing product', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await deleteProduct(mockProduct);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should not delete a new product', async () => {
      const newProduct = { ...mockProduct, id: 'new' as const };

      await deleteProduct(newProduct);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
