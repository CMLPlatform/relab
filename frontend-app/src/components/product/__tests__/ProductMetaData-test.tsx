import { describe, it, expect } from '@jest/globals';
import React from 'react';
import { screen } from '@testing-library/react-native';
import ProductMetaData from '../ProductMetaData';
import { renderWithProviders, baseProduct as _base } from '@/test-utils';
import type { Product } from '@/types/Product';

const baseProduct: Product = { ..._base, id: 42 };

describe('ProductMetaData', () => {
  it('shows the product ID', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.getByText(/Product ID: 42/)).toBeTruthy();
  });

  it('shows creation date when createdAt is present', () => {
    const product = { ...baseProduct, createdAt: '2024-01-15T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(/Created:/)).toBeTruthy();
  });

  it('shows updated date when updatedAt is present', () => {
    const product = { ...baseProduct, updatedAt: '2024-06-01T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(/Last Updated:/)).toBeTruthy();
  });

  it('does not show creation date when createdAt is absent', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.queryByText(/Created:/)).toBeNull();
  });

  it('does not show updated date when updatedAt is absent', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.queryByText(/Last Updated:/)).toBeNull();
  });
});
