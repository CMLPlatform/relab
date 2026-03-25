import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import ProductTags from '../ProductTags';
import { renderWithProviders, baseProduct as _base } from '@/test-utils';
import type { Product } from '@/types/Product';

jest.mock('@/hooks/useProductQueries', () => ({
  useSearchBrandsQuery: jest.fn(() => ({ data: ['Apple', 'Samsung', 'Sony'], isLoading: false })),
}));

const baseProduct: Product = { ..._base, brand: 'Acme', model: 'X100' };

describe('ProductTags', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders brand and model chip values', () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={false} />, { withDialog: true });
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('X100')).toBeTruthy();
  });

  it("renders 'Unknown' when brand is missing", () => {
    const product = { ...baseProduct, brand: undefined };
    renderWithProviders(<ProductTags product={product} editMode={false} />, { withDialog: true });
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it("renders 'Unknown' when model is missing", () => {
    const product = { ...baseProduct, model: undefined };
    renderWithProviders(<ProductTags product={product} editMode={false} />, { withDialog: true });
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('opens brand selection modal on brand chip press in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, { withDialog: true });
    fireEvent.press(screen.getByText('Acme'));
    expect(screen.getByText('Select Brand')).toBeTruthy();
  });

  it('does not open brand modal when not in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={false} />, { withDialog: true });
    fireEvent.press(screen.getByText('Acme'));
    expect(screen.queryByText('Select Brand')).toBeNull();
  });

  it('calls onBrandChange when a brand chip is pressed in the modal', async () => {
    const onBrandChange = jest.fn();
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} onBrandChange={onBrandChange} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('Acme'));
    await screen.findByText('Select Brand');
    fireEvent.press(screen.getByText('Samsung'));
    expect(onBrandChange).toHaveBeenCalledWith('Samsung');
  });

  it('shows a "+ new brand" chip when search text is not in the list', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, { withDialog: true });
    fireEvent.press(screen.getByText('Acme'));
    await screen.findByText('Select Brand');
    fireEvent.changeText(screen.getByPlaceholderText('Search or type a brand…'), 'MyNewBrand');
    await screen.findByText('MyNewBrand');
  });

  it('calls onBrandChange with custom typed brand when new-brand chip is pressed', async () => {
    const onBrandChange = jest.fn();
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} onBrandChange={onBrandChange} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('Acme'));
    await screen.findByText('Select Brand');
    fireEvent.changeText(screen.getByPlaceholderText('Search or type a brand…'), 'MyNewBrand');
    await screen.findByText('MyNewBrand');
    fireEvent.press(screen.getByText('MyNewBrand'));
    expect(onBrandChange).toHaveBeenCalledWith('MyNewBrand');
  });

  it('opens model input dialog on model chip press in editMode', async () => {
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} />, { withDialog: true });
    fireEvent.press(screen.getByText('X100'));
    expect(screen.getByText('Set Model')).toBeTruthy();
  });

  it('calls onModelChange with the new name when OK is pressed in the model dialog', async () => {
    const onModelChange = jest.fn();
    renderWithProviders(<ProductTags product={baseProduct} editMode={true} onModelChange={onModelChange} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('X100'));
    fireEvent.changeText(screen.getByPlaceholderText('Model Name'), 'NewModel');
    fireEvent.press(screen.getByText('OK'));
    expect(onModelChange).toHaveBeenCalledWith('NewModel');
  });

  it('renders without error chips when product is a component (isComponent=true)', () => {
    const componentProduct = { ...baseProduct, brand: undefined, model: undefined };
    renderWithProviders(<ProductTags product={componentProduct} editMode={true} isComponent={true} />, {
      withDialog: true,
    });
    expect(screen.toJSON()).toBeTruthy();
  });
});
