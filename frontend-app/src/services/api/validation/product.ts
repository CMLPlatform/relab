/**
 * Product validation utilities
 */

import { Product } from '@/types/Product';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 100;

export function isValidProductName(value: string | undefined): boolean {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length >= PRODUCT_NAME_MIN_LENGTH && name.length <= PRODUCT_NAME_MAX_LENGTH;
}

export function getProductNameHelperText(): string {
  return `Enter a descriptive name between ${PRODUCT_NAME_MIN_LENGTH} and ${PRODUCT_NAME_MAX_LENGTH} characters`;
}

export function isProductValid(product: Product): boolean {
  const { weight, width, height, depth } = product.physicalProperties;

  // Allow undefined dimensions, but if provided, they must be positive numbers
  const validWidth = typeof width === 'undefined' || (typeof width === 'number' && width > 0);
  const validHeight = typeof height === 'undefined' || (typeof height === 'number' && height > 0);
  const validDepth = typeof depth === 'undefined' || (typeof depth === 'number' && depth > 0);

  return (
    isValidProductName(product.name) &&
    typeof weight === 'number' &&
    weight > 0 &&
    validWidth &&
    validHeight &&
    validDepth
  );
}
