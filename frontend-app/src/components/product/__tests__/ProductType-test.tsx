import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import ProductType from '../ProductType';
import * as cpv from '@/services/cpv';
import { renderWithProviders, baseProduct as _base } from '@/test-utils';
import type { Product } from '@/types/Product';

const mockPush = jest.fn();
const mockedLoadCPV = jest.mocked(cpv.loadCPV);

jest.mock('@/services/cpv', () => ({
  loadCPV: jest.fn(),
}));

const baseProduct: Product = { ..._base, productTypeID: undefined };

describe('ProductType', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockedLoadCPV.mockResolvedValue({
      root: {
        id: 0,
        name: 'root',
        description: 'All categories',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
      '1': {
        id: 1,
        name: '03000000-1',
        description: 'Agricultural products',
        allChildren: [],
        directChildren: [],
        updatedAt: '',
        createdAt: '',
      },
    });
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it("renders 'Type or Material' heading", () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    expect(screen.getByText(/Type or Material/)).toBeTruthy();
  });

  it('renders the root category when productTypeID is undefined', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    expect(await screen.findByText('All categories')).toBeTruthy();
  });

  it('renders the correct category description when productTypeID is set', async () => {
    const product = { ...baseProduct, productTypeID: 1 };
    renderWithProviders(<ProductType product={product} editMode={false} />);
    expect(await screen.findByText('Agricultural products')).toBeTruthy();
  });

  it('navigates to category selection on press in editMode', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={true} />);
    fireEvent.press(await screen.findByText('All categories'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products/[id]/category_selection' }));
  });

  it('does not navigate when not in editMode', async () => {
    renderWithProviders(<ProductType product={baseProduct} editMode={false} />);
    fireEvent.press(await screen.findByText('All categories'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
