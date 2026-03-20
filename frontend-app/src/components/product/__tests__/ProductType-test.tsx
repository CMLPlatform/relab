import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import ProductType from '../ProductType';
import type { Product } from '@/types/Product';

const mockPush = jest.fn();

// Mock the CPV json data
jest.mock('@/assets/data/cpv.json', () => ({
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
}));

const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 100, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <PaperProvider>{children}</PaperProvider>;
}

describe('ProductType', () => {
  beforeEach(() => {
    mockPush.mockReset();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it("renders 'Type or Material' heading", () => {
    render(
      <Wrapper>
        <ProductType product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText(/Type or Material/)).toBeTruthy();
  });

  it('renders the root category when productTypeID is undefined', () => {
    render(
      <Wrapper>
        <ProductType product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('All categories')).toBeTruthy();
  });

  it('renders the correct category description when productTypeID is set', () => {
    const product = { ...baseProduct, productTypeID: 1 };
    render(
      <Wrapper>
        <ProductType product={product} editMode={false} />
      </Wrapper>,
    );
    expect(screen.getByText('Agricultural products')).toBeTruthy();
  });

  it('navigates to category selection on press in editMode', () => {
    render(
      <Wrapper>
        <ProductType product={baseProduct} editMode={true} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('All categories'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products/[id]/category_selection' }));
  });

  it('does not navigate when not in editMode', () => {
    render(
      <Wrapper>
        <ProductType product={baseProduct} editMode={false} />
      </Wrapper>,
    );
    fireEvent.press(screen.getByText('All categories'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
