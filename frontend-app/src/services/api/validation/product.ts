/**
 * Product validation utilities
 */

import { Product } from '@/types/Product';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 100;

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export function validateProductName(value: string | undefined): ValidationResult {
  const name = typeof value === 'string' ? value.trim() : '';

  if (!name) {
    return { isValid: false, error: 'Product name is required' };
  }

  if (name.length < PRODUCT_NAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Product name must be at least ${PRODUCT_NAME_MIN_LENGTH} characters`,
    };
  }

  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Product name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    };
  }

  return { isValid: true };
}

export function getProductNameHelperText(): string {
  return `Enter a descriptive name between ${PRODUCT_NAME_MIN_LENGTH} and ${PRODUCT_NAME_MAX_LENGTH} characters`;
}

export function validateProductDimension(value: number | undefined, dimensionName: string): ValidationResult {
  if (value == null || Number.isNaN(value)) {
    return { isValid: true }; // Optional field
  }

  if (typeof value !== 'number' || value <= 0) {
    return {
      isValid: false,
      error: `${dimensionName} must be a positive number`,
    };
  }

  return { isValid: true };
}

export function validateProductWeight(value: number | undefined): ValidationResult {
  if (value == null || Number.isNaN(value)) {
    return { isValid: false, error: 'Weight is required' };
  }

  if (typeof value !== 'number' || value <= 0) {
    return { isValid: false, error: 'Weight must be a positive number' };
  }

  return { isValid: true };
}

export function validateProduct(product: Product): ValidationResult {
  const { weight, width, height, depth } = product.physicalProperties;

  // Validate product name
  const nameResult = validateProductName(product.name);
  if (!nameResult.isValid) {
    return nameResult;
  }

  // Validate weight
  const weightResult = validateProductWeight(weight);
  if (!weightResult.isValid) {
    return weightResult;
  }

  // Validate dimensions
  const widthResult = validateProductDimension(width, 'Width');
  if (!widthResult.isValid) {
    return widthResult;
  }

  const heightResult = validateProductDimension(height, 'Height');
  if (!heightResult.isValid) {
    return heightResult;
  }

  const depthResult = validateProductDimension(depth, 'Depth');
  if (!depthResult.isValid) {
    return depthResult;
  }

  return { isValid: true };
}

export function isProductValid(product: Product): boolean {
  return validateProduct(product).isValid;
}
