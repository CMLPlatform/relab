import { describe, it, expect } from '@jest/globals';
import {
  validateProductName,
  validateProductDimension,
  validateProductWeight,
  validateProductVideos,
  validateProduct,
  isValidUrl,
  getProductNameHelperText,
  PRODUCT_NAME_MIN_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
} from '../product';
import type { Product } from '@/types/Product';

// Minimal valid product for use in validateProduct tests
const validProduct: Product = {
  id: 'new',
  name: 'Test Product',
  componentIDs: [],
  physicalProperties: { weight: 1.5, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: 'low',
    remanufacturabilityObservation: 'medium',
    repairabilityObservation: 'high',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

describe('validateProductName', () => {
  it('returns invalid for undefined', () => {
    const result = validateProductName(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Product name is required');
  });

  it('returns invalid for empty string', () => {
    const result = validateProductName('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Product name is required');
  });

  it('returns invalid for whitespace-only string', () => {
    const result = validateProductName('   ');
    expect(result.isValid).toBe(false);
  });

  it('returns invalid for name shorter than minimum length', () => {
    const result = validateProductName('a');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at least ${PRODUCT_NAME_MIN_LENGTH}`);
  });

  it('returns valid for name at minimum length', () => {
    const result = validateProductName('ab');
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for name longer than maximum length', () => {
    const result = validateProductName('a'.repeat(PRODUCT_NAME_MAX_LENGTH + 1));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`at most ${PRODUCT_NAME_MAX_LENGTH}`);
  });

  it('returns valid for name at maximum length', () => {
    const result = validateProductName('a'.repeat(PRODUCT_NAME_MAX_LENGTH));
    expect(result.isValid).toBe(true);
  });

  it('returns valid for a normal product name', () => {
    expect(validateProductName('My Product').isValid).toBe(true);
  });
});

describe('isValidUrl', () => {
  it('returns false for undefined', () => {
    expect(isValidUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidUrl('   ')).toBe(false);
  });

  it('returns false for a non-URL string', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('returns false for ftp:// protocol', () => {
    expect(isValidUrl('ftp://example.com/file')).toBe(false);
  });

  it('returns true for http:// URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('returns true for https:// URL', () => {
    expect(isValidUrl('https://example.com/video')).toBe(true);
  });
});

describe('validateProductWeight', () => {
  it('returns invalid for undefined', () => {
    const result = validateProductWeight(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Weight is required');
  });

  it('returns invalid for NaN', () => {
    const result = validateProductWeight(NaN);
    expect(result.isValid).toBe(false);
  });

  it('returns invalid for zero', () => {
    const result = validateProductWeight(0);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Weight must be a positive number');
  });

  it('returns invalid for negative number', () => {
    const result = validateProductWeight(-5);
    expect(result.isValid).toBe(false);
  });

  it('returns valid for a positive number', () => {
    const result = validateProductWeight(1.5);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('validateProductDimension', () => {
  it('returns valid for undefined (optional field)', () => {
    const result = validateProductDimension(undefined, 'Width');
    expect(result.isValid).toBe(true);
  });

  it('returns valid for NaN (treated as not provided)', () => {
    const result = validateProductDimension(NaN, 'Height');
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for zero', () => {
    const result = validateProductDimension(0, 'Depth');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Depth');
  });

  it('returns invalid for a negative number', () => {
    const result = validateProductDimension(-10, 'Width');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Width');
  });

  it('returns valid for a positive number', () => {
    const result = validateProductDimension(25, 'Width');
    expect(result.isValid).toBe(true);
  });
});

describe('validateProductVideos', () => {
  it('returns valid for empty array', () => {
    const result = validateProductVideos([]);
    expect(result.isValid).toBe(true);
  });

  it('returns valid for a video with a title and valid URL', () => {
    const result = validateProductVideos([{ title: 'Demo video', url: 'https://example.com/video' }]);
    expect(result.isValid).toBe(true);
  });

  it('returns invalid for a video with an empty title', () => {
    const result = validateProductVideos([{ title: '   ', url: 'https://example.com/video' }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('title');
  });

  it('returns invalid for a video with an invalid URL', () => {
    const result = validateProductVideos([{ title: 'Demo', url: 'not-a-url' }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('catches the first invalid video in a list', () => {
    const result = validateProductVideos([
      { title: 'Good video', url: 'https://example.com' },
      { title: 'Bad video', url: 'bad-url' },
    ]);
    expect(result.isValid).toBe(false);
  });
});

describe('validateProduct', () => {
  it('returns invalid for null', () => {
    const result = validateProduct(null as unknown as Product);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid product data');
  });

  it('returns invalid for non-object', () => {
    const result = validateProduct('string' as unknown as Product);
    expect(result.isValid).toBe(false);
  });

  it('returns invalid when product name is missing', () => {
    const product = { ...validProduct, name: '' };
    const result = validateProduct(product);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Product name is required');
  });

  it('returns invalid when weight is missing', () => {
    const product = {
      ...validProduct,
      physicalProperties: { ...validProduct.physicalProperties, weight: undefined as unknown as number },
    };
    const result = validateProduct(product);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Weight is required');
  });

  it('returns invalid when a dimension is negative', () => {
    const product = {
      ...validProduct,
      physicalProperties: { ...validProduct.physicalProperties, width: -1 },
    };
    const result = validateProduct(product);
    expect(result.isValid).toBe(false);
  });

  it('returns invalid when a video URL is invalid', () => {
    const product = {
      ...validProduct,
      videos: [{ id: 1, title: 'Demo', url: 'bad-url', description: '' }],
    };
    const result = validateProduct(product);
    expect(result.isValid).toBe(false);
  });

  it('returns valid for a complete, correct product', () => {
    const result = validateProduct(validProduct);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid when physicalProperties is absent (uses fallback)', () => {
    const product = {
      ...validProduct,
      physicalProperties: undefined as unknown as Product['physicalProperties'],
    };
    const result = validateProduct(product);
    // weight is undefined → invalid
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Weight is required');
  });
});

describe('getProductNameHelperText', () => {
  it('returns a non-empty string', () => {
    const text = getProductNameHelperText();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});
