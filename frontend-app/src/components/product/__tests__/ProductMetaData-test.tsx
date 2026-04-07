import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { baseProduct as _base, renderWithProviders } from '@/test-utils';
import type { Product } from '@/types/Product';
import ProductMetaData from '../ProductMetaData';

const baseProduct: Product = { ..._base, id: 42 };

describe('ProductMetaData', () => {
  it('shows the product ID', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.getByText(/Product ID: 42/)).toBeOnTheScreen();
  });

  it('shows creation date when createdAt is present', () => {
    const product = { ...baseProduct, createdAt: '2024-01-15T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(/Created:/)).toBeOnTheScreen();
  });

  it('shows updated date when updatedAt is present', () => {
    const product = { ...baseProduct, updatedAt: '2024-06-01T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(/Last Updated:/)).toBeOnTheScreen();
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
