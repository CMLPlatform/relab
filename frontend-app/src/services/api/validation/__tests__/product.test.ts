import {
  isValidProductName,
  getProductNameHelperText,
  isProductValid,
  PRODUCT_NAME_MIN_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
} from '../product';
import { Product } from '@/types/Product';

describe('Product Validation', () => {
  describe('isValidProductName', () => {
    it('should return true for valid product names', () => {
      expect(isValidProductName('Valid Product')).toBe(true);
      expect(isValidProductName('AB')).toBe(true);
      expect(isValidProductName('A'.repeat(100))).toBe(true);
    });

    it('should return false for names that are too short', () => {
      expect(isValidProductName('A')).toBe(false);
      expect(isValidProductName('')).toBe(false);
      expect(isValidProductName('   ')).toBe(false);
    });

    it('should return false for names that are too long', () => {
      expect(isValidProductName('A'.repeat(101))).toBe(false);
    });

    it('should handle undefined values', () => {
      expect(isValidProductName(undefined)).toBe(false);
    });

    it('should trim whitespace before validation', () => {
      expect(isValidProductName('  Valid  ')).toBe(true);
      expect(isValidProductName('  A  ')).toBe(false);
    });
  });

  describe('getProductNameHelperText', () => {
    it('should return helper text with correct length requirements', () => {
      const helperText = getProductNameHelperText();
      expect(helperText).toContain(PRODUCT_NAME_MIN_LENGTH.toString());
      expect(helperText).toContain(PRODUCT_NAME_MAX_LENGTH.toString());
    });
  });

  describe('isProductValid', () => {
    const createValidProduct = (): Product => ({
      id: 1,
      name: 'Valid Product',
      componentIDs: [],
      physicalProperties: {
        weight: 100,
        width: 10,
        height: 10,
        depth: 10,
      },
      images: [],
      ownedBy: 'me',
    });

    it('should return true for valid products', () => {
      const product = createValidProduct();
      expect(isProductValid(product)).toBe(true);
    });

    it('should return false for invalid product names', () => {
      const product = createValidProduct();
      product.name = 'A';
      expect(isProductValid(product)).toBe(false);
    });

    it('should return false for invalid weight', () => {
      const product = createValidProduct();
      product.physicalProperties.weight = 0;
      expect(isProductValid(product)).toBe(false);

      product.physicalProperties.weight = -1;
      expect(isProductValid(product)).toBe(false);
    });

    it('should return false for NaN weight', () => {
      const product = createValidProduct();
      product.physicalProperties.weight = NaN;
      expect(isProductValid(product)).toBe(false);
    });

    it('should allow undefined dimensions', () => {
      const product = createValidProduct();
      product.physicalProperties.width = undefined as any;
      product.physicalProperties.height = undefined as any;
      product.physicalProperties.depth = undefined as any;
      expect(isProductValid(product)).toBe(true);
    });

    it('should return false for zero or negative dimensions', () => {
      const product = createValidProduct();
      product.physicalProperties.width = 0;
      expect(isProductValid(product)).toBe(false);

      product.physicalProperties.width = 10;
      product.physicalProperties.height = -1;
      expect(isProductValid(product)).toBe(false);
    });

    it('should allow NaN dimensions', () => {
      const product = createValidProduct();
      product.physicalProperties.width = NaN;
      expect(isProductValid(product)).toBe(true);
    });
  });
});
