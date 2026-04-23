import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { baseProduct as _base, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';
import ProductMetaData from '../ProductMetaData';

const baseProduct: Product = { ..._base, id: 42 };
const PRODUCT_ID_PATTERN = /Product ID: 42/;
const CREATED_PATTERN = /Created:/;
const LAST_UPDATED_PATTERN = /Last Updated:/;
const OWNER_PATTERN = /Owner:/;
const ANONYMOUS_PATTERN = /Anonymous/;
const TESTUSER_PATTERN = /testuser/;

describe('ProductMetaData', () => {
  it('shows the product ID', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.getByText(PRODUCT_ID_PATTERN)).toBeOnTheScreen();
  });

  it('shows creation date when createdAt is present', () => {
    const product = { ...baseProduct, createdAt: '2024-01-15T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(CREATED_PATTERN)).toBeOnTheScreen();
  });

  it('shows updated date when updatedAt is present', () => {
    const product = { ...baseProduct, updatedAt: '2024-06-01T00:00:00Z' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(LAST_UPDATED_PATTERN)).toBeOnTheScreen();
  });

  it('does not show creation date when createdAt is absent', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.queryByText(CREATED_PATTERN)).toBeNull();
  });

  it('does not show updated date when updatedAt is absent', () => {
    renderWithProviders(<ProductMetaData product={baseProduct} />);
    expect(screen.queryByText(LAST_UPDATED_PATTERN)).toBeNull();
  });

  it('shows Anonymous when ownerUsername is null', () => {
    const product = { ...baseProduct, ownerUsername: undefined };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(OWNER_PATTERN)).toBeOnTheScreen();
    expect(screen.getByText(ANONYMOUS_PATTERN)).toBeOnTheScreen();
  });

  it('shows username and link when ownerUsername is present', () => {
    const product = { ...baseProduct, ownerUsername: 'testuser' };
    renderWithProviders(<ProductMetaData product={product} />);
    expect(screen.getByText(OWNER_PATTERN)).toBeOnTheScreen();
    expect(screen.getByText(TESTUSER_PATTERN)).toBeOnTheScreen();
  });
});
